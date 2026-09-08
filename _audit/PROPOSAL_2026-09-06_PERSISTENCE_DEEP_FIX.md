# 神意助手 项目保存逻辑深度修复方案

日期：2026-09-06
版本：v3.24.0 -> v3.25.0
状态：待审核

## 一、问题清单（10 项，全部修复）

| 编号 | 严重度 | 问题 | 客户影响 | 经验文件引用 |
|---:|---:|---|---|---|
| P0-1 | P0 | wa_lastSession 写了但从未读回 | 退出再打开找不到上次编辑位置 | 经验第 71 行 getter 同步但 IPC 异步 |
| P0-2 | P0 | 项目数据无 schemaVersion | 升级后字段静默丢失（已实际发生 volumeCount 丢失） | 经验 §7 第 7 条 旧配置兼容 |
| P1-3 | P1 | 项目切换竞态：先设 currentProjectId 再 await storageRead | 快速切换可能写脏数据 | 经验第 71 行 |
| P1-4 | P1 | 单 key 全量序列化：整个项目一个 JSON | 大小说时每次 saveProject 序列化几十 MB | 经验 §7 第 2 条 并发写 key 串行化 |
| P1-5 | P1 | 退出超时 5 秒强制关闭 | 大项目写盘超 5 秒会丢数据 | 经验 §7 第 1 条 原子写盘 |
| P2-6 | P2 | onFinalSave 双重注册 | 退出时两个异步流程并行，极端情况数据不完整 | 经验 §1 第 6 条 saveConfig 不得重新赋值 |
| P2-7 | P2 | lastProjectId 和 project_id 非原子双写 | 磁盘故障时 lastProjectId 指向旧数据 | 经验 §7 第 1 条 原子写盘四步 |
| P3-8 | P3 | 项目 store 无独立自动保存 | 崩溃时丢数据（大部分被 mutation save 缓解） | 经验 §1 第 5 条 store 是唯一事实来源 |
| P3-9 | P3 | useExitConfirm.ts 死代码 | 维护困惑，无功能影响 | 无 |
| P3-10 | P3 | toPlain 用 JSON.parse(JSON.stringify) | 当前无触发，不够健壮 | 无 |

## 二、修复方案逐项详述

### P0-1: 启动时恢复 lastSession（上次编辑位置）

**文件：** src/App.vue（onMounted 启动段，约 288 行）

**改动：**
1. 在 loadProject(lastProjectId) 完成后，读取 wa_lastSession
2. 解析 { pid, vid, cid, ts }
3. 校验 pid 等于 currentProjectId，防止跨项目错误恢复
4. 如果 vid 存在，在 ChapterTree 中选中对应卷
5. 如果 cid 存在，在 EditorPanel 中打开对应章节标签
6. 加 ts 时效检查：超过 7 天的 lastSession 不恢复（用户可能已换项目）

**新增函数：** restoreLastSession(projectId)

- 读取 wa_lastSession
- 校验 pid 和 ts 时效（7 天）
- 派发 CustomEvent('restore-session', { detail: { vid, cid } })

**联动改动：**
- EditorPanel.vue：监听 restore-session 事件，根据 cid 打开对应 tab
- ChapterTree.vue：监听 restore-session 事件，根据 vid 展开并选中对应卷

**验证方式：** 源 Electron 启动 -> 打开项目 -> 进入第 3 章编辑 -> 退出 -> 重启 -> 确认自动恢复到第 3 章

---

### P0-2: 项目数据版本号 + 系统化迁移框架

**文件：** src/stores/project.ts（persistProject + loadProject）

**改动：**
1. persistProject 的 data 对象顶层加 schemaVersion: number 字段，当前值 = 3（对应 v3.24.0 数据结构）
2. loadProject 读取后先检查 data.schemaVersion
3. 新建 migrateProjectData(data) 函数，按版本号链式迁移：
   - v0（无版本号）-> v1：加 pipelineConfig 默认值
   - v1 -> v2：加 volumes[].isBound/boundTo 默认值
   - v2 -> v3：加 memories.sourceVersions 默认值
   - 每步迁移后写盘（标记 needsMigrate = true）
4. 迁移完成后 data.schemaVersion = CURRENT_SCHEMA_VERSION

**迁移函数逻辑：**
- v < 1：补 pipelineConfig 默认值 { volumeCount: 3, volumeWords: 100000, chapterWords: 3500 }
- v < 2：补 volumes[].isBound/boundTo 默认值（复用现有 loadProject 中的兼容逻辑）
- v < 3：补 memories.sourceVersions 默认值，调 normalizeMemories
- 最终设 data.schemaVersion = 3

**验证方式：**
- 用旧版本项目 JSON（无 schemaVersion）加载 -> 确认 pipelineConfig 恢复、volumes.isBound 补全
- 确认迁移后 schemaVersion 字段写入磁盘

---

### P1-3: 消除项目切换竞态

**文件：** src/stores/project.ts（loadProject 函数，约 141 行）

**改动：**
1. loadProject 开头不再立即设 currentProjectId
2. 先 await storageRead 拿到数据
3. 数据拿到后校验目标 ID 未被其他 loadProject 覆盖
4. 校验通过才设 currentProjectId 并赋值所有 ref
5. 新增 pendingLoadId ref 跟踪正在加载的项目 ID
6. saveProject 在 persistProject 前检查 currentProjectId 是否等于 pendingLoadId；不等则跳过本次保存

**修改后的 loadProject 流程：**
- pendingLoadId.value = id（标记正在加载）
- await storageRead（等数据回来）
- if (pendingLoadId.value !== id) return（期间被切换，丢弃）
- currentProjectId.value = id
- pendingLoadId.value = null
- 赋值所有 ref

**验证方式：** 连续快速切换两个项目 -> 确认不会把 A 的数据写到 B 的 key 下

---

### P1-4: 大项目写入性能优化（dirty 标记 + 跳过无变更写盘）

**文件：** src/stores/project.ts（persistProject）

**改动：**
保持单 key 存储不变（不改架构，控制风险），但优化触发逻辑：
1. 新增 dirtyFields: Set 追踪哪些 ref 自上次 save 后被修改过
2. saveProject 只在 dirtyFields 非空时才实际写盘
3. 写盘后清空 dirtyFields
4. toPlain 改为 structuredClone 优先，fallback JSON 方式不变
5. 不拆分多 key 存储（避免破坏现有迁移和兼容逻辑）

**注意：** 不拆分多 key，不改 storage.js，只在序列化和触发层面优化

**验证方式：** 生成大量章节正文 -> 观察 saveProject 调用频率和写盘耗时

---

### P1-5: 退出超时自适应

**文件：** electron/ipc/lifecycle.js（约 25 行）

**改动：**
1. 超时从固定 5 秒改为动态：基础 5 秒 + 每 1MB 项目数据加 3 秒
2. 上限 30 秒
3. 超时前向 renderer 发送 app:saveTimeoutWarning 事件，让 UI 显示正在保存请稍候提示

**超时计算公式：** Math.min(30000, 5000 + Math.ceil(dataSize / (1024 * 1024)) * 3000)

**联动改动：** ExitConfirmModal.vue 监听 app:saveTimeoutWarning 显示等待提示

**验证方式：** 大项目退出时确认不会 5 秒强制关闭

---

### P2-6: 消除 onFinalSave 双重注册

**文件：** src/App.vue（约 288 行）+ src/components/common/ExitConfirmModal.vue（约 60 行）

**改动：**
1. 删除 App.vue 中 onFinalSave 的注册（第 288-291 行）
2. 退出保存逻辑全部收敛到 ExitConfirmModal.vue
3. ExitConfirmModal 的 onFinalSave 回调中补充 sendSaveComplete() 调用，保证主进程收到完成信号
4. 回调执行顺序：saveProject -> saveProviders -> 写 lastSession -> editor-save 事件 -> sendSaveComplete

**ExitConfirmModal onFinalSave 改造后流程：**
- await projectStore.saveProject()
- await providerStore.saveProviders()
- storageWrite(lastSession, { pid, vid, cid, ts })
- dispatchEvent('editor-save')
- sendSaveComplete()

**验证方式：** 退出时确认 saveProject 只执行一次，sendSaveComplete 被调用

---

### P2-7: lastProjectId 和 project_id 写入顺序调整

**文件：** src/stores/project.ts（persistProject，约 221 行）

**改动：**
1. 调整写入顺序：先写 project_id，成功后再写 lastProjectId
2. 如果 project_id 写失败，不写 lastProjectId，直接返回失败
3. lastProjectId 写失败不影响整体结果（lastProjectId 是辅助索引，不阻断主数据）

**修改后 persistProject 写入逻辑：**
- 先写 project_<id>（主数据）
- 成功才写 lastProjectId（辅助索引）
- project_<id> 失败 -> 不写 lastProjectId
- lastProjectId 失败 -> 记录 failedKeys 但不阻断

**验证方式：** 磁盘满场景模拟 -> 确认 lastProjectId 不会指向写入失败的项目

---

### P3-8: 项目 store 定时自动保存

**文件：** src/stores/project.ts（新增）+ src/components/editor/EditorPanel.vue

**改动：**
1. 新增 autoSaveTimer 和 startProjectAutoSave() 函数
2. 定时间隔复用 settingsStore.nInterval（默认 30 秒）
3. 定时器只在 currentProjectId 非空时触发 saveProject()
4. EditorPanel.vue 的 onMounted 中调用 projectStore.startProjectAutoSave()，onUnmounted 中调用停止
5. 如果已有编辑器自动保存定时器，项目自动保存复用同一时间点（合并触发，减少写盘次数）

**验证方式：** 编辑器无打开标签时修改项目数据 -> 30 秒后确认磁盘已更新

---

### P3-9: 删除 useExitConfirm.ts 死代码

**文件：** src/composables/useExitConfirm.ts

**改动：**
直接删除该文件。全局搜索确认无任何组件导入它。删除后不影响任何功能。

**验证方式：** 删除后构建通过，无编译错误

---

### P3-10: toPlain 健壮性提升

**文件：** src/stores/project.ts（约 22 行）

**改动：**
1. 优先使用 structuredClone（Node 18+ / Chromium 98+ 内置）
2. fallback 到 JSON.parse(JSON.stringify())
3. 添加 try-catch：如果 structuredClone 失败（如遇到函数），fallback 到 JSON 方式

**验证方式：** 正常保存/加载项目 -> 数据完整性不变

## 三、执行顺序（P0 -> P3 严格顺序）

| 步骤 | 修复项 | 涉及文件 | 前置条件 | 验证方式 |
|---:|---|---|---|---|
| 1 | P0-1 lastSession 恢复 | App.vue, EditorPanel.vue, ChapterTree.vue | 无 | 源 Electron 启动，退出再打开验证位置恢复 |
| 2 | P0-2 schemaVersion + 迁移框架 | project.ts | 无 | 加载旧项目 JSON 验证迁移 |
| 3 | P1-3 项目切换竞态 | project.ts | P0-2 完成 | 快速切换验证不写脏 |
| 4 | P1-4 序列化优化 | project.ts | P0-2 完成 | 大项目写盘耗时对比 |
| 5 | P1-5 退出超时自适应 | lifecycle.js, ExitConfirmModal.vue | 无 | 大项目退出验证不超时 |
| 6 | P2-6 onFinalSave 去重 | App.vue, ExitConfirmModal.vue | P0-1 完成 | 退出确认 saveProject 只跑一次 |
| 7 | P2-7 写入顺序调整 | project.ts | 无 | 磁盘满场景逻辑验证 |
| 8 | P3-8 项目自动保存 | project.ts, EditorPanel.vue | 无 | 无标签时修改数据验证自动写盘 |
| 9 | P3-9 删除死代码 | useExitConfirm.ts | 无 | 构建通过 |
| 10 | P3-10 toPlain 健壮化 | project.ts | 无 | 正常保存验证 |

## 四、风险边界（严格遵守）

1. 不动布局属性和 DOM（经验 §1 第 3 条 一次一个闭环）
2. store saveConfig 不得重新赋值 config.value（§1 第 6 条）—— persistProject 只写盘，不重新赋值 ref
3. loadProject 不得自动预建（§7 第 15 条）—— 迁移框架只补字段，不调 ensureVolumesFromOutline
4. 旧配置兼容（§7 第 7 条）—— 迁移后旧字段保留，不删除旧字段
5. 原子写盘四步（§7 第 1 条）—— 存储层已有原子写盘，不改 storage.js
6. IPC 三处同步（§7 第 8 条）—— 不新增 IPC 通道，复用现有 storage:read/write
7. 不动无关组件—— 只改表中列出的文件
8. 目标模式铁律：需要用户决定的节点暂停等待，不被目标模式推进绕过

## 五、验证方式总览

| 修复项 | 验证方法 | 证据要求 |
|---|---|---|
| P0-1 | 源 Electron 启动 -> 编辑第 3 章 -> 退出 -> 重启 -> 确认恢复到第 3 章 | 截图 + lastSession 磁盘 JSON |
| P0-2 | 加载无 schemaVersion 的旧项目 -> 确认迁移后字段完整 -> 确认磁盘写入 schemaVersion | 迁移前后磁盘 JSON 对比 |
| P1-3 | 快速切换两个项目 -> 确认 A 数据未写入 B key | 磁盘 JSON 检查 |
| P1-4 | 大量正文 -> saveProject 耗时对比 | console.time 输出 |
| P1-5 | 大项目退出 -> 确认不被 5 秒超时杀掉 | 退出成功，无强制关闭 |
| P2-6 | 退出 -> 确认 saveProject 只执行一次 | console.log 计数 |
| P2-7 | 模拟磁盘满 -> lastProjectId 不指向失败项目 | persistProject 返回 failedKeys |
| P3-8 | 无标签时修改项目数据 -> 30 秒后磁盘已更新 | 磁盘 JSON 时间戳 |
| P3-9 | 删除 useExitConfirm.ts -> 构建通过 | 构建输出 |
| P3-10 | 正常保存 -> 数据完整 | 加载后数据对比 |

## 六、经验文件引用对照

| 经验条款 | 引用位置 |
|---|---|
| §1 第 5 条 store 是唯一事实来源 | P3-8 项目自动保存基于 store |
| §1 第 6 条 saveConfig 不得重新赋值 | P0-2 迁移框架不重新赋值 ref |
| §7 第 1 条 原子写盘四步 | P2-7 写入顺序调整不改存储层 |
| §7 第 7 条 旧配置兼容 | P0-2 迁移保留旧字段 |
| §7 第 15 条 loadProject 不得自动预建 | P0-2 迁移不调 ensureVolumesFromOutline |
| §7 第 8 条 IPC 三处同步 | 不新增 IPC 通道 |
| 第 71 行 getter 同步但 IPC 异步 | P1-3 竞态修复 |
| 第 117 行 UI 无响应根因排查 | P1-3 排除 saveProject 竞态循环 |

## 七、版本规划

当前版本：v3.24.0
修复后版本：v3.25.0
理由：修复了 2 个 P0 + 3 个 P1 + 2 个 P2 + 3 个 P3，涉及持久化核心逻辑，属 minor 版本升级
封装要求：通过后升级版本号并封装
