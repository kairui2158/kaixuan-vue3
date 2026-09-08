# 神意助手记忆板块完整交接文件 V2

> 本文件是交给新对话框的执行入口。新对话零上下文，必须先完整读本文件再动手。
> 生成日期：2026-09-06
> 项目路径：D:\codex\novel-workshop-vue3
> 技术栈：Vue 3.5 + Pinia + Vite 5 + Electron 30 + TypeScript + @antv/g6

---

## 零、施工前必读

### 0.1 项目位置与启动方式

| 项目 | 路径/命令 |
|------|----------|
| 源码根目录 | D:\codex\novel-workshop-vue3 |
| 启动器 | 根目录 start-electron.bat |
| dev server | npm run dev:vue（localhost:5173） |
| 经验文件 | _audit/神意开发经验总结_v3.md（现行版本） |
| 规则文件 | memory/rules.md（规则1-23） |
| 错误日志 | lessons/ERROR_LOG.md |
| 审计报告 | _audit/MEMORY_DEEP_AUDIT_AND_PLAN_REVIEW_2026-08-27.md |
| 缺口方案 | _audit/MEMORY_GAP_REPAIR_PLAN.md |
| 开发日志 | _audit/DEV_LOG_2026-09-06-persistence-deep-fix.md |
| 前序交接 | _audit/MEMORY_V1_HANDOFF_TO_NEW_DIALOGUE.md |
| 前序报告 | _audit/MEMORY_V1_EXECUTION_REPORT.md |

### 0.2 技术栈约束

- Vue 3.5 + Pinia + Vite 5 + Electron 30 + TypeScript
- 禁止引入新 npm 依赖（@antv/g6 已安装）
- 禁止用 PowerShell Set-Content 修改含中文源文件（规则13）
- 含中文文件用 apply_patch 或 Node.js fs 写入
- 每次改完立即 npx tsc --noEmit 验证语法
- CSS 先搜后改，禁止叠加（规则19）
- 零假数据：禁止添加默认 API Key、示例供应商数据

### 0.3 验证三铁律（规则14）

1. 外部裁判：改完不能靠读代码判断通过。必须用 Playwright/CDP 实际操作应用
2. 行为验证：验证操作->预期行为->实际结果 三元组
3. 强制执行：每个阶段有验证清单，任何一项 FAIL 禁止进入下一阶段

### 0.4 防空转协议

- 每步写 _audit/checkpoint.md + update_plan
- 同一方法连续失败2次，强制换路径
- 子Agent必须真正spawn
- 每30秒给用户一条进度更新
- 工具调用前先确认工具在可用列表中
- 网络超时给与足够耐心等待

### 0.5 核心经验教训引用表

| 编号 | 教训摘要 |
|------|---------|
| M1 | 改任何文件前先列出被谁引用 |
| M2 | 禁止重写整个文件顺手清理 |
| store循环 | 持久化函数不得重新赋值config.value |
| 教训77 | Array分支读purpose必须覆盖verify/detect |
| 教训78 | baseUrl含/vN后缀会导致路由失败 |
| 教训80 | CDP脚本写成独立.cjs文件执行 |
| 教训81 | 检查DOM不检查全局变量 |
| 记忆异步落盘 | recordMemoryChange后必须await saveProject |
| normalizeMemories风险 | 只保留已知字段，新字段静默丢失 |
| 导入覆盖风险 | 覆盖导入无备份不可撤销 |
| EditorPanel两套路径 | EditorPanel走unifiedMemoryAiCall，PipelinePanel走callMemoryApi |
| 空状态冒充 | 空状态不能冒充真实数据验证 |


---

## 一、记忆板块完整架构总览

### 1.1 文件清单（23个文件）

| 类别 | 文件 | 行数 | 职责 |
|------|------|------|------|
| 类型 | src/types/memory.ts | ~140 | 五类记忆接口+SourceVersion+FactSource+FactStatus+MemoryChangeRecord |
| 类型 | src/types/g6.ts | ~45 | G6节点/边数据适配类型 |
| 服务 | src/services/memoryExtractor.ts | ~155 | AI单阶段抽取+verifySnippet+unifiedMemoryAiCall入口 |
| 服务 | src/services/memoryMerger.ts | ~235 | 五类合并器+锁定+黑名单+冲突标记 |
| 服务 | src/services/memoryIO.ts | ~183 | 全量导出导入+合并导入+备份恢复+角色卡V3 |
| 服务 | src/services/memoryExport.ts | ~140 | 4个专用导出函数（角色档案/故事线/时间线/场景包）- 全是死代码无UI调用 |
| 服务 | src/services/memoryVersion.ts | ~95 | 快照+回滚+章节回滚 |
| 服务 | src/services/memoryRetriever.ts | ~100 | 只读记忆检索+字符串匹配+拼接 |
| Store | src/stores/project.ts | ~930 | 唯一记忆事实来源+recordMemoryChange+recordSourceVersion+normalizeMemories+schema迁移v3+CRUD五类+黑名单 |
| Composable | src/composables/useMemoryExtraction.ts | ~132 | 抽取流程+项目切换检测+factSource注入+structured logging |
| Composable | src/composables/useMemoryGraph.ts | ~115 | 图数据适配+时间线+树+Markdown树 |
| Composable | src/composables/useG6Graph.ts | ~95 | G6创建/销毁/更新+toG6Data+adaptTreeForG6+timelineToG6Data |
| 组件 | src/components/common/MemoryPanel.vue | ~850 | 五视图（列表/关系图/图谱分析/思维导图/时间线）+CRUD+导入导出 |
| 组件 | src/components/memory/RelationGraph.vue | ~120 | 关系图视图+节点选中+邻居展示 |
| 组件 | src/components/memory/GraphAnalysis.vue | ~200 | 图谱分析+中心性+孤立实体+关系类型统计+排行 |
| 组件 | src/components/memory/MindMap.vue | ~100 | 思维导图+树展开/收起+事件选中 |
| 组件 | src/components/memory/TimelineView.vue | ~120 | 时间线+类型筛选+角色筛选+章节范围 |
| 组件 | src/components/memory/CharacterCard.vue | ~115 | 角色卡片+字段展示+来源跳转 |
| 组件 | src/components/memory/G6Canvas.vue | ~45 | G6画布容器+节点点击+focusNode+生命周期管理 |
| 组件 | src/components/pipeline/PipelinePanel.vue | ~3250 | 正文确认+记忆抽取+预览+写入链路 |
| 组件 | src/components/editor/EditorPanel.vue | ~922 | 编辑器记忆抽取入口+预览+写入 |
| 组件 | src/components/chat/ChatPanel.vue | ~500 | 聊天面板记忆读取注入 |

### 1.2 写入链路（正文到记忆）

`	ext
正文保存
  -> recordSourceVersion（记录版本快照）
  -> extractMemory（AI单阶段抽取五类JSON）
  -> parseJson（JSON解析+snippet验证+evidence过滤）
  -> mergeMemory（增量合并+锁定+黑名单过滤+冲突标记）
  -> 用户预览（拒绝/锁定/确认）
  -> confirmMemoryPreview（确认写入+factStatus设confirmed）
  -> projectStore.recordMemoryChange（快照+审计+写入）
  -> await saveProject（持久化）
  -> MemoryPanel响应式自动刷新
`

两个入口：
- PipelinePanel confirmBodyWithMemory() L2807：流水线正文确认后触发，超时30000ms（缺口3：应改为300000ms）
- EditorPanel L240：编辑器手动点击提取记忆按钮触发，通过useMemoryExtraction composable，超时300000ms

### 1.3 读取链路（记忆到下游）

`	ext
projectStore.memories（唯一事实来源）
  -> retrieveContext（字符串匹配+拼接+字符限制）
  -> PipelinePanel memoryTextForPipeline() L3130
  -> ChatPanel L459
`

注意：动画/短剧板块当前不存在，无下游读取接入。memoryExport.ts有4个导出函数但无UI调用。

### 1.4 已完成的代码改动清单（不要重做）

| 编号 | 已完成 | 证据 |
|------|--------|------|
| A1 | SourceVersion+FactSource+FactStatus类型已定义 | types/memory.ts L18-45 |
| A2 | 五类接口已加factStatus/supersedesId/conflictsWithIds/factSource | types/memory.ts |
| A3 | normalizeMemories已加新字段安全处理+sourceVersions初始化 | project.ts L47-55 |
| B1 | verifySnippet函数已实现 | memoryExtractor.ts verifySnippet() |
| B2 | parseJson内evidence验证+snippet真实性检查 | memoryExtractor.ts parseJson() |
| B3 | mergeEntity/mergeRelations已字段级合并 | memoryMerger.ts |
| C1(部分) | mergeEvents/mergeWorld/mergeForeshadowing已有冲突标记和字段更新 | memoryMerger.ts |
| D1 | Electron开发模式数据目录切换 | electron/main.js |
| D2 | loadProject项目切换ID检查 | project.ts L174 |
| D3 | MemoryPanel五类CRUD+编辑弹窗 | MemoryPanel.vue |
| 持久化1 | schema版本迁移v3链式 | project.ts migrateProjectData() |
| 持久化2 | loadProject竞态消除（先读再设ID） | project.ts L170-175 |
| 持久化3 | dirtyFields脏标记自动保存 | project.ts |
| 持久化4 | 退出保存超时5s到15s | lifecycle.js |
| 持久化5 | persistProject写入顺序修正 | project.ts |
| 持久化6 | 项目独立自动保存 | project.ts + EditorPanel.vue |
| 持久化7 | toPlain深拷贝升级为structuredClone | project.ts |


---

## 二、12项缺口修复计划

### 缺口1（严重）：专用导出函数是死代码

**现状**：memoryExport.ts定义了exportCharacterProfile/exportStoryline/exportTimeline/exportScene，但没有任何组件导入调用。

**修复方案**：
1. 在MemoryPanel.vue的更多下拉菜单增加4个导出选项
2. 每个选项调用对应导出函数，生成JSON，通过electronAPI.dialogSaveFile保存文件
3. exportCharacterProfile扩展为自动查找该实体关联关系和共同出场事件，打包成完整档案

**改动文件**：MemoryPanel.vue, memoryExport.ts
**验证**：点击每个导出选项 -> 文件保存 -> 检查JSON格式和内容

### 缺口2（严重）：版本历史和回滚没有UI

**现状**：Store有rollbackMemoryTo/rollbackMemoryByChapter/getMemoryChangeHistory，MemoryPanel不调用。

**修复方案**：
1. 在更多下拉菜单增加版本历史选项，打开模态框
2. 顶部显示统计：N次变更，最早X，最近Y
3. 列表展示每条MemoryChangeRecord：时间、原因、章节
4. 每条有预览按钮：展示before/after的实体数/事件数/关系数差异
5. 每条有回滚到此版本按钮：调用projectStore.rollbackMemoryTo(record.id)
6. 底部有按章节回滚入口：调用rollbackMemoryByChapter

**改动文件**：MemoryPanel.vue
**验证**：打开历史模态 -> 看到变更记录 -> 点击回滚 -> 验证记忆数据恢复到旧版本

### 缺口3（中等）：超时时间不一致

**现状**：PipelinePanel调用extractMemory(..., 30000)用30秒，EditorPanel通过useMemoryExtraction用默认300秒。

**修复方案**：
1. PipelinePanel.vue第2865行：30000改为300000
2. 增加设置项：在设置面板增加记忆抽取超时配置（默认300秒，可调60-600秒）

**改动文件**：PipelinePanel.vue(1行), settings store + SettingsModal
**验证**：流水线确认正文后记忆抽取不再30秒超时

### 缺口4（中等）：factStatus没有UI展示

**现状**：类型有FactStatus=confirmed/pending/stale/conflicted/rejected，MemoryPanel不显示。

**修复方案**：
1. 列表视图每条记录增加状态徽章：pending黄/confirmed绿/conflicted红/stale灰/rejected灰
2. 筛选栏增加状态筛选下拉：全部/待确认/已确认/有冲突
3. 增加批量操作栏：全选/批量确认/批量拒绝

**改动文件**：MemoryPanel.vue
**验证**：抽取记忆后列表显示pending徽章 -> 确认后变green -> 制造冲突后变red

### 缺口5（中等）：冲突解决没有UI

**现状**：新抽取数据和已确认数据冲突时factStatus变conflicted，无界面处理。

**修复方案**：
1. memoryMerger.ts冲突时保存conflictsData到条目
2. types/memory.ts增加conflictsData字段
3. MemoryPanel增加冲突详情面板：左栏旧值/右栏新值/字段差异高亮
4. 操作：保留旧值/采用新值/手动编辑/标记解决
5. 增加冲突审查标签，只展示conflicted条目，用户逐条处理

**改动文件**：memoryMerger.ts, types/memory.ts, MemoryPanel.vue
**验证**：制造冲突场景 -> 看到红色徽章 -> 点击展开冲突面板 -> 选择操作 -> 状态变resolved

### 缺口6（中等）：黑名单没有UI

**现状**：Store有addToBlacklist/removeFromBlacklist/isBlacklisted，MemoryPanel不暴露。

**修复方案**：
1. 实体卡片操作按钮区增加加入黑名单按钮
2. 更多下拉菜单增加黑名单管理选项，打开模态框
3. 黑名单实体的卡片显示灰色遮罩+已屏蔽标记

**改动文件**：MemoryPanel.vue, CharacterCard.vue
**验证**：点击加入黑名单 -> 实体变灰 -> 打开黑名单管理 -> 移除 -> 恢复正常

### 缺口7（中等）：记忆统计仪表盘缺失

**现状**：MemoryMeta有extractionCount/lastExtractedAt/pendingCount/totals，MemoryPanel不展示。

**修复方案**：
1. MemoryPanel头部和列表视图之间增加统计栏
2. 展示：抽取N次/实体N/关系N/事件N/世界观N/伏笔N/待确认N/最近抽取时间
3. 每个数字可点击跳转到对应分类+状态筛选

**改动文件**：MemoryPanel.vue
**验证**：抽取后统计栏数字更新 -> 点击数字跳转筛选

### 缺口8（低）：列表视图没有文本搜索

**修复方案**：在列表内容头部增加搜索输入框，实时搜索key/content/category/实体name/aliases/description。
**改动文件**：MemoryPanel.vue
**验证**：输入关键词 -> 结果筛选 -> 高亮匹配

### 缺口9（低）：关系图不能交互编辑

**修复方案**：
1. RelationGraph.vue增加查看/编辑模式切换
2. 编辑模式：双击节点弹编辑对话框，拖拽节点A到B创建关系，点击边弹关系编辑
3. G6Canvas.vue增加node:dblclick事件emit

**改动文件**：G6Canvas.vue, RelationGraph.vue
**验证**：切换编辑模式 -> 双击节点弹出编辑 -> 拖拽创建关系

### 缺口10（低）：伏笔追踪不完整

**修复方案**：
1. foreshadowingFields增加revealChapterId/revealChapterIndex字段
2. 列表视图增加伏笔追踪快捷筛选：只显示未回收伏笔，按状态分组
3. 伏笔卡片显示埋设章节和计划回收章节

**改动文件**：MemoryPanel.vue
**验证**：编辑伏笔看到新字段 -> 筛选伏笔追踪 -> 卡片显示埋设和回收章节

### 缺口11（低）：自动抽取开关

**修复方案**：
1. settings store增加autoExtractMemory: boolean（默认true）
2. 设置面板增加开关：正文确认后自动抽取记忆
3. PipelinePanel的confirmBodyWithMemory函数开头加判断，关闭时只保存正文不抽取

**改动文件**：settings store, SettingsModal, PipelinePanel.vue
**验证**：关闭开关 -> 确认正文 -> 不弹出记忆预览 -> 开启 -> 正常抽取

### 缺口12（低）：实体去重没有手动入口

**修复方案**：
1. 更多菜单增加合并建议入口：自动计算名称相似度+别名交叉生成合并候选对
2. 实体卡片增加合并到按钮：选择目标实体后调用store.mergeEntities
3. project.ts增加mergeEntities方法：合并aliases/description/evidence，迁移关系指向，删除源实体

**改动文件**：project.ts, MemoryPanel.vue, CharacterCard.vue, memoryMerger.ts
**验证**：创建两个同名不同ID实体 -> 合并建议出现 -> 点击合并 -> 关系迁移 -> 源实体删除


---

## 三、A1-D3任务当前状态

| 任务 | 描述 | 代码状态 | 运行时验证 | 备注 |
|------|------|----------|------------|------|
| A1 | 扩展数据模型加SourceVersion/FactSource/FactStatus | DONE | 未验证 | types/memory.ts已定义 |
| A2 | 五类接口加factStatus/supersedesId/conflictsWithIds/factSource | DONE | 未验证 | 类型定义完整 |
| A3 | normalizeMemories加新字段安全处理 | DONE | 未验证 | project.ts L47-55 |
| B1 | verifySnippet函数实现 | DONE | 未验证 | memoryExtractor.ts |
| B2 | parseJson内evidence验证+snippet真实性检查 | DONE | 未验证 | memoryExtractor.ts |
| B3 | mergeEntity/mergeRelations字段级合并 | DONE | 未验证 | memoryMerger.ts |
| C1 | mergeEvents/mergeWorld/mergeForeshadowing改为字段级 | PARTIAL | 未验证 | 已有冲突标记和字段更新，但未完全避免Object.assign模式 |
| D1 | 关闭/重启持久化验证 | DONE | 未验证 | 持久化10项修复已做 |
| D2 | 项目切换隔离验证 | DONE | 未验证 | project.ts L174 ID检查 |
| D3 | MemoryPanel五类CRUD实现 | DONE | 未验证 | 编辑弹窗已实现 |

**关键说明**：A1-D3代码已写完，但全部标记为未验证。需要通过真实Electron启动+用户操作+断网+关闭重启验证。

### C1未完全修复的细节

mergeEvents函数（memoryMerger.ts约L120-140）：
- 已有字段级更新（type/characters/location/summary/consequences逐字段判断）
- 已有冲突标记（factStatus从confirmed变conflicted）
- 但新事件创建时用spread operator {...incoming, ...}，部分字段可能被覆盖

mergeWorld函数（memoryMerger.ts约L155-175）：
- 已有字段级更新（category/description/established逐字段判断）
- 已有冲突标记
- 同样新建时用spread operator

mergeForeshadowing函数（memoryMerger.ts约L180-200）：
- 已有字段级更新（description/status/resolved逐字段判断）
- 已有冲突标记
- 同样新建时用spread operator

**结论**：C1的合并函数已有字段级更新逻辑，不是纯Object.assign。但新建条目时的spread operator可能引入未验证字段。需要审查后决定是否需要进一步修复。

---

## 四、任务依赖与执行顺序

`	ext
P0紧急批次（阻塞下游）：
  缺口3（超时修复，1行改）-> 缺口1（导出UI）-> 缺口2（版本历史UI）

P1重要批次（核心体验）：
  缺口4（factStatus展示）-> 缺口7（统计仪表盘）-> 缺口6（黑名单UI）-> 缺口5（冲突解决UI）

P2增强批次（交互提升）：
  缺口8（搜索）-> 缺口10（伏笔追踪）-> 缺口9（关系图编辑）

P3完善批次（可选功能）：
  缺口11（自动抽取开关）-> 缺口12（实体合并）

每批完成后：
  1. npx tsc --noEmit 验证编译
  2. npx vite build 验证构建
  3. 启动Electron应用做行为验证
  4. 更新 _audit/checkpoint.md
  5. 更新 update_plan
`

---

## 五、V1-V16硬验收门禁

| 编号 | 验收项 | 验证方法 | 通过标准 |
|------|--------|----------|----------|
| V1 | 记忆面板五视图切换 | Playwright点击5个tab按钮 | 每个tab对应组件渲染 |
| V2 | 列表视图五类CRUD | 逐类新建/编辑/删除 | 操作成功+列表更新+store同步 |
| V3 | 记忆导入（合并模式） | 导入JSON文件 | added>0+跳过数合理+原有数据不丢 |
| V4 | 记忆导出 | 点击导出JSON | 文件生成+JSON格式正确 |
| V5 | 角色卡导出 | 点击导出角色卡 | 文件生成+V3格式正确 |
| V6 | 角色卡导入 | 导入角色卡JSON | 实体出现在列表中 |
| V7 | 正文确认后记忆抽取 | 流水线正文确认 | 预览弹出+变更列表+确认写入 |
| V8 | 编辑器记忆抽取 | 编辑器点提取记忆按钮 | 预览弹出+变更列表+确认写入 |
| V9 | 记忆写入后持久化 | 写入后关闭重启 | 重启后记忆数据完整 |
| V10 | 项目切换记忆隔离 | 切项目后查记忆 | 各项目记忆独立 |
| V11 | 记忆注入正文生成 | 正文生成请求 | 请求体包含记忆上下文 |
| V12 | 记忆注入聊天 | 发送聊天消息 | 请求体包含记忆上下文 |
| V13 | 撤销记忆变更 | 回滚到历史版本 | 记忆恢复到旧版本 |
| V14 | 导入覆盖不丢数据 | 覆盖导入 | 备份创建+新数据替换+可恢复 |
| V15 | API断网记忆抽取失败 | 断网后抽取 | 正文已保存+错误提示+不崩溃 |
| V16 | 坏JSON导入 | 导入损坏JSON | 错误提示+原有数据不丢 |


---

## 六、G1-G12缺口验收门禁

| 编号 | 验收项 | 验证方法 | 通过标准 |
|------|--------|----------|----------|
| G1 | 4个专用导出可点击 | 点击每个导出选项 | 文件保存成功+JSON格式正确 |
| G2 | 版本历史模态可用 | 打开历史模态 | 看到变更记录列表+回滚成功 |
| G3 | 超时统一300秒 | 流水线确认正文 | 不再30秒超时 |
| G4 | factStatus徽章显示 | 抽取后查看列表 | pending黄/confirmed绿正确显示 |
| G5 | 冲突解决面板 | 制造冲突场景 | 冲突面板展开+选择操作+状态更新 |
| G6 | 黑名单管理 | 加入黑名单+管理 | 实体变灰+管理模态+移除恢复 |
| G7 | 统计仪表盘 | 查看统计栏 | 数字准确+点击跳转 |
| G8 | 列表搜索 | 输入关键词 | 结果筛选+结果数显示 |
| G9 | 关系图交互编辑 | 切换编辑模式 | 双击编辑+拖拽创建关系 |
| G10 | 伏笔追踪完善 | 编辑伏笔+筛选 | 新字段显示+追踪筛选工作 |
| G11 | 自动抽取开关 | 关闭开关+确认正文 | 不弹出预览+开启后正常 |
| G12 | 实体手动合并 | 合并建议+手动合并 | 候选对出现+合并成功+关系迁移 |

---

## 七、验证矩阵

| 验证类型 | 方法 | 频率 |
|----------|------|------|
| 编译验证 | npx tsc --noEmit | 每次改完 |
| 构建验证 | npx vite build | 每批完成后 |
| 单元测试 | npx vitest run | 每次改完（如有spec文件） |
| 行为验证 | Playwright/CDP独立.cjs脚本 | 每项缺口修复后 |
| 真实用户验证 | 启动Electron+真实操作+截图 | 每批完成后 |
| 断网验证 | 断网后操作+检查不崩溃 | V15/G相关 |
| 关闭重启验证 | 写入后关闭+重启+核对 | V9/V14 |

---

## 八、禁止事项（12条铁律）

1. 禁止重写整个文件，必须用apply_patch逐行编辑
2. 禁止用PowerShell Set-Content修改含中文源文件
3. 禁止引入新npm依赖
4. 禁止添加假数据/默认API Key/示例供应商
5. 禁止批量大修，只改与当前缺口直接相关的代码
6. 禁止CSS叠加，先搜后改（规则19）
7. 禁止跳过验证直接声称完成
8. 禁止空状态冒充真实数据验证
9. 禁止用代码存在冒充行为通过
10. 禁止连续2次同一方法失败后不换路径
11. 禁止子Agent只说不派
12. 禁止在持久化函数中重新赋值config.value（store循环冻结教训）

---

## 九、每任务工作流模板

每个缺口修复必须遵循以下步骤：

`	ext
步骤1：读源码
  - 读取目标文件的当前实现
  - 用rg搜索相关引用和依赖
  - 记录影响范围清单

步骤2：改代码
  - 用apply_patch精准编辑
  - 改完立即npx tsc --noEmit
  - 如有spec文件跑vitest

步骤3：构建验证
  - npx vite build
  - 如有错误精准修复，禁止批量正则

步骤4：行为验证
  - 启动Electron应用
  - Playwright脚本做真实操作
  - 截图+JSON日志+时间戳
  - 操作->预期行为->实际结果三元组

步骤5：写盘记录
  - 更新 _audit/checkpoint.md
  - 更新 update_plan
  - 记录经验教训到经验文件
`

---

## 十、社区调研结论摘要

| 调研方向 | 关键发现 | 对应缺口 |
|----------|----------|----------|
| 知识图谱编辑器 | ontosphere双击编辑+拖拽创建边 | 缺口9 |
| 角色卡生态 | SillyTavern V3标准+character_book内嵌关联实体 | 缺口1/10 |
| 实体消歧 | Dupli-Hunt Union-Find聚类+主动学习审查队列 | 缺口12 |
| 版本历史 | OfflineNotesEngine版本树而非线性历史 | 缺口2 |
| G6 v5交互 | 原生drag-element/brush-select/click-select，缺连边交互需自定义 | 缺口9 |

详细调研内容见 _audit/MEMORY_GAP_REPAIR_PLAN.md 社区调研结论部分。

---

## 十一、执行指令

新对话框收到本文件后的执行顺序：

1. 完整读本文件
2. 读 _audit/神意开发经验总结_v3.md 的 §1（改码纪律）和 §3（验证纪律）
3. 读 _audit/MEMORY_GAP_REPAIR_PLAN.md 的社区调研结论
4. 创建 _audit/checkpoint.md（如不存在）
5. 按P0->P1->P2->P3顺序执行缺口修复
6. 每项缺口修复完执行第九节工作流模板全5步
7. 每批完成后更新checkpoint和update_plan
8. 全部完成后跑V1-V16+G1-G12验收门禁
9. 出具最终验证报告

---

## 十二、风险评估

| 风险 | 严重度 | 缓解措施 |
|------|--------|----------|
| MemoryPanel.vue膨胀（当前850行+500行脚本） | 高 | 把历史/冲突/黑名单模态拆成独立子组件 |
| types/memory.ts变更影响面广 | 中 | 改完跑tsc+vitest全量验证 |
| G6自定义交互稳定性 | 中 | 先验证registerBehavior API再写交互 |
| 搜索/合并计算量大时卡顿 | 低 | 限制搜索范围和候选对数量 |
| C1 spread operator可能引入未验证字段 | 低 | 审查mergeEvents/World/Foreshadowing新建逻辑 |
| 导入覆盖导致数据丢失 | 高 | 覆盖前强制创建备份+提供恢复入口 |

---

## 附录A：审计报告引用

| 报告 | 路径 | 核心结论 |
|------|------|----------|
| 深度审计 | _audit/MEMORY_DEEP_AUDIT_AND_PLAN_REVIEW_2026-08-27.md | 26维度审计，状态PARTIAL |
| 前序交接 | _audit/MEMORY_V1_HANDOFF_TO_NEW_DIALOGUE.md | A1-D3任务定义+经验引用 |
| 缺口方案 | _audit/MEMORY_GAP_REPAIR_PLAN.md | 12缺口+社区调研+实施方案 |
| 执行报告 | _audit/MEMORY_V1_EXECUTION_REPORT.md | D1-D3完成+A1-C3运行时验证待做 |
| 持久化修复 | _audit/DEV_LOG_2026-09-06-persistence-deep-fix.md | 10项持久化修复 |

---

## 附录B：代码位置速查表

| 功能 | 文件 | 关键行号 |
|------|------|----------|
| 记忆类型定义 | src/types/memory.ts | 全文140行 |
| G6类型定义 | src/types/g6.ts | 全文45行 |
| AI抽取 | src/services/memoryExtractor.ts | extractMemory L120 |
| 合并器 | src/services/memoryMerger.ts | mergeMemory L220 |
| 导入导出 | src/services/memoryIO.ts | 全文183行 |
| 专用导出(死代码) | src/services/memoryExport.ts | 全文140行 |
| 版本管理 | src/services/memoryVersion.ts | 全文95行 |
| 记忆检索 | src/services/memoryRetriever.ts | retrieveContext L66 |
| 项目Store | src/stores/project.ts | recordMemoryChange L691 |
| 抽取Composable | src/composables/useMemoryExtraction.ts | start() L80 |
| G6适配 | src/composables/useG6Graph.ts | 全文95行 |
| 图数据 | src/composables/useMemoryGraph.ts | 全文115行 |
| 记忆面板 | src/components/common/MemoryPanel.vue | 全文850行 |
| 关系图 | src/components/memory/RelationGraph.vue | 全文120行 |
| 图谱分析 | src/components/memory/GraphAnalysis.vue | 全文200行 |
| 思维导图 | src/components/memory/MindMap.vue | 全文100行 |
| 时间线 | src/components/memory/TimelineView.vue | 全文120行 |
| 角色卡片 | src/components/memory/CharacterCard.vue | 全文115行 |
| G6画布 | src/components/memory/G6Canvas.vue | 全文45行 |
| 流水线记忆 | src/components/pipeline/PipelinePanel.vue | confirmBodyWithMemory L2807 |
| 编辑器记忆 | src/components/editor/EditorPanel.vue | memoryExtraction L122 |
| 聊天记忆 | src/components/chat/ChatPanel.vue | retrieveContext L459 |

---

## 附录C：经验教训速查

| 教训 | 摘要 | 来源 |
|------|------|------|
| M1影响圈声明 | 改前先列引用清单 | 经验文件1节 |
| M2整文件操作禁令 | 禁止重写顺手清理 | 经验文件1节 |
| store循环冻结 | 持久化函数不得赋值config.value | 经验文件1节规则6 |
| 教训77 | Array分支读purpose覆盖verify/detect | 经验文件~L74 |
| 教训78 | baseUrl含/vN后缀路由失败 | 经验文件~L74 |
| 教训80 | CDP脚本写独立.cjs文件 | 经验文件~L488 |
| 教训81 | 检查DOM不检查全局变量 | 经验文件~L488 |
| 记忆异步落盘 | recordMemoryChange后await saveProject | 经验文件~L1832 |
| normalizeMemories | 只保留已知字段新字段丢失 | project.ts:47-55 |
| 导入覆盖 | 覆盖导入无备份不可撤销 | memoryIO.ts |
| 关闭超时 | lifecycle.js已修复为15s | lifecycle.js |
| EditorPanel两套路径 | Editor用unifiedMemoryAiCall，Pipeline用callMemoryApi | 经验文件~L514 |
| 空状态冒充 | 空状态不能冒充真实数据 | 经验文件~L1712 |
| CSS叠加 | 先搜后改禁止第二处定义 | 规则19 |
| 真实用户验证 | 不能靠读代码判断通过 | 规则14 |

---

**文件结束**

本交接文件包含：
- 23个记忆相关文件的完整架构总览
- 12项缺口修复计划
- A1-D3任务状态（代码DONE但运行时全未验证）
- V1-V16+G1-G12共28项验收门禁
- 执行顺序和每任务工作流模板
- 12条禁止铁律
- 社区调研结论摘要
- 代码位置速查表

新对话框执行时不可跳过任何验收门禁，不可用代码存在冒充行为通过，不可用空状态冒充真实数据。
