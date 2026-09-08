| 字段 | 值 |
|---|---|
| 序号 | 145 |
| 日期 | 2026-09-06 |
| 版本 | v3.25.0 |
| 前序版本 | v3.24.0 |

## 背景

客户实操发现：重新加载项目后卷数选择被重置为默认值，逐卷生成续生成状态丢失。深度排查暴露项目保存逻辑存在 10 项缺陷，涉及会话恢复、schema 迁移、竞态窗口、脏标记、超时、写入顺序、独立自动保存、深拷贝、死代码。

## 修复项

### P0-1 会话恢复持久化
- App.vue onMounted 读取 wa_lastSession，7 天时效检查后派发 restore-session 事件
- EditorPanel.vue 监听 restore-session，恢复 pid/vid/cid 并打开对应章节 tab
- ChapterTree.vue 监听 restore-session，展开对应卷
- ExitConfirmModal.vue 退出时写入 lastSession（pid/vid/cid/ts）

### P0-2 Schema 版本迁移
- project.ts 加 CURRENT_SCHEMA_VERSION=3
- migrateProjectData() 链式迁移：v1到v2到v3，按版本号顺序串联不跳级
- loadProject 调 migrateProjectData() 做迁移
- persistProject data 对象加 schemaVersion 字段

### P1-3 loadProject 竞态消除
- 原逻辑：先设 currentProjectId 再 await storageRead
- 修复：先 await storageRead 拿到 data 再设 currentProjectId
- 中间窗口期任何读取 currentProjectId 的代码不再拿到新 ID+旧数据

### P1-4 dirtyFields 脏标记自动保存
- project.ts 加 dirtyFields ref
- saveProject 设置 dirtyFields.value = true
- persistProject 的 microtask 回调检查 dirtyFields，只有脏时才写盘，写完清零
- 消除每 30 秒冗余写盘

### P1-5 退出保存超时 5s到15s
- electron/ipc/lifecycle.js 固定 5000ms 改为 15000ms
- 大项目 JSON 序列化+写盘可能超 5 秒，15 秒覆盖绝大多数场景

### P2-6 退出保存逻辑收敛
- App.vue 删除 onFinalSave 注册
- ExitConfirmModal.vue 的 onFinalSave 回调末尾加 sendSaveComplete()
- 主进程 app:saveComplete 监听在 app:closeChoice handler 内注册 once，防止残留

### P2-7 persistProject 写入顺序修正
- 原逻辑：先写 lastProjectId 再写 project_id
- 修复：先写 project_id 成功后才写 lastProjectId
- 崩溃窗口期重启不会读到 lastProjectId 指向不存在的项目文件

### P3-8 项目独立自动保存
- project.ts 加 startProjectAutoSave / stopProjectAutoSave
- EditorPanel.vue onMounted 调用 projectStore.startProjectAutoSave()
- EditorPanel.vue onUnmounted 调用 projectStore.stopProjectAutoSave()
- 与 EditorPanel 自身的 startAutoSave()（只管 editor dirty tab）互不干扰

### P3-9 死代码清理
- 删除 src/composables/useExitConfirm.ts
- 确认无导入引用

### P3-10 toPlain 深拷贝升级
- toPlain() 优先用 structuredClone()
- JSON.parse(JSON.stringify()) 仅作 fallback
- 正确处理 Date/RegExp/Map/Set

## 验证

- npx vite build 编译通过，0 错误，312 模块转换成功
- 经验文件 v2 第7节 新增规则 21-29（9 条新经验）
- 开发日志序号 145 已追加

## 影响范围

| 文件 | 改动 |
|---|---|
| src/App.vue | onMounted 读 lastSession + 派发 restore-session + 删 onFinalSave |
| src/stores/project.ts | schema 版本+迁移+loadProject 竞态+dirtyFields+写入顺序+toPlain+独立自动保存 |
| src/components/editor/EditorPanel.vue | startProjectAutoSave/stopProjectAutoSave + restore-session 监听 |
| src/components/sidebar/ChapterTree.vue | restore-session 监听 |
| src/components/common/ExitConfirmModal.vue | sendSaveComplete + lastSession 写入 |
| electron/ipc/lifecycle.js | 超时 5s到15s |
| src/composables/useExitConfirm.ts | 已删除 |
