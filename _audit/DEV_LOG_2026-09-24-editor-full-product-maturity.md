# 2026-09-24 编辑器完整产品标准成熟化执行日志

## P0-A1 Markdown 折叠闭环

### 改动

- `src/services/editorFolding.ts`：新增 heading 折叠范围计算、折叠渲染与 offset 映射。
- `src/services/editorFolding.spec.ts`：新增折叠范围、嵌套折叠、offset 映射、异常输入测试。
- `src/components/editor/EditorPanel.vue`：接入折叠按钮、折叠只读横幅、textarea 折叠渲染；输入、保存、撤销、重做、diff 定位、跟随滚动、查找入口先退出折叠视图，存储与撤销栈永不使用折叠文本。
- `scripts/verify-editor-folding-electron.mjs`：真实 Electron UI 10 轮实测脚本。

### 关键修复

1. 生产构建暴露 `ReferenceError: Cannot access 'q' before initialization`：折叠相关 computed 原先声明在 `activeTab` 之前，minify 后触发 TDZ，导致 `EditorPanel` 整体挂载失败。已把折叠 computed 移到 `activeTab` 之后。单测未暴露此问题，Electron 实测暴露，证明本项必须走真实 UI 验证。
2. 实测脚本收尾删除 `_audit/tmp/editor-folding-profile` 时遇 Windows EPERM：Electron 释放句柄慢，立即重试仍失败。已改为等待重试加 `maxRetries`，不掩盖功能断言结果。
3. 折叠态输入反例初次断言错误：把“只读折叠视图”误解为“输入后仍停留折叠态”。真实产品语义是输入触发退出折叠并丢弃该字符，store 不变更。断言已按真实语义修正，并通过 10 轮验证。

### 验收证据

- `npm run build:vue`：通过，仅既有 chunk 大小 warning。
- `node scripts/verify-editor-folding-electron.mjs`：`PASS: 10/10 folding rounds`；报告 `_audit/verification-editor-folding/electron-10-rounds.json`。
- 文档规模：11,244 字（要求 >=5000）。
- 每轮断言：折叠占位可见、被折叠正文隐藏、store 原文不变、折叠态输入不进 store 且退出折叠、diff 定位自动展开、textarea 恢复原文、光标映射到原文尾部、无 pageerror / console error。
- `npm run test:services -- src/services/editorFolding.spec.ts src/stores/editor.spec.ts`：11/11 通过。
- `npm run type-check`：通过。
- `npm run verify:production-wiring`：321 modules / 1054 dependencies，0 违规。

### 回头看

- 折叠只挂 `EditorPanel`，API 直写链路未侵入；`rg editorFolding` 确认无第二消费者。
- 存储内容、undo 栈、API 上下文均消费 `activeTab.content`，不消费 `displayedContent`。
- `onInput` 折叠态保护、`save()` 前置 `unfoldAll()`、`handleDiffLocate` 前置 `unfoldAll()` 已逐项核对。
- 本轮临时 profile 已清理，`Test-Path _audit/tmp/editor-folding-profile` 为 `False`。

### 后续队列

1. P0-A2 书签系统。
2. P0-A3 大纲导航面板。
3. P0-A4 搜索高亮叠加。
4. P0-A5 选区保持保障。
5. P1-A1 至 P1-A4。
6. P2-A1 trace 字段归一；P2-A2 live 矩阵脚本落地，真实 live 等用户提供各家 Key。

## P0-A2 书签系统闭环

### 改动

- `src/services/editorBookmarks.ts`：书签创建、列表、删除、内容 hash 校验与持久化数据规整。
- `src/services/editorBookmarks.spec.ts`：书签服务正反例测试。
- `src/stores/editor.ts`：书签状态、跨 tab 隔离、内容变更后的越界淘汰；新增 `resetEditorSession()`。
- `src/stores/project.ts`：书签随项目持久化；`loadProject()` 与 `clearCurrent()` 现在按项目边界重置编辑器会话。
- `src/components/editor/EditorPanel.vue`：书签栏、当前光标添加、跳转定位、删除，并与项目持久化同步。
- `scripts/verify-editor-bookmarks-electron.mjs`：真实 Electron UI 验证脚本。

### 关键修复

1. 首轮实现只覆盖了书签本体，项目切换隔离未闭环：`loadProject(id)` 只有在目标项目存在持久化数据时才处理书签，切到无数据项目时旧项目状态会残留。
2. 修复升级为项目硬边界：`loadProject()` 在 pending 校验后无条件重置项目状态并调用 `resetEditorSession()`；`clearCurrent()` 同步走同一路径。
3. `resetEditorSession()` 一次性清理 tabs、activeTabId、书签、undo/redo 栈、查找状态与自动保存 timer，避免旧项目编辑上下文泄漏。

### 验收证据

- `npm run test:services -- src/services/editorBookmarks.spec.ts src/stores/editor.spec.ts src/stores/project.spec.ts`：19/19 通过。
- 新增 RED→GREEN 用例：`resetEditorSession` 全量清理；`loadProject` 加载无数据项目时旧项目状态归零。
- `npm run build:vue`：通过，仅既有 chunk 大小与 Vite 配置 warning。
- `node scripts/verify-editor-bookmarks-electron.mjs`：`PASS: 10/10 bookmark rounds + 10/10 project-switch rounds`。
- Electron 报告：`_audit/verification-editor-bookmarks/electron-10-rounds.json`，文档 11,244 字，20 轮记录。
- 每轮项目切换断言：tabs 2→0、activeTabId→null、书签 1→0、undo/redo 栈→空、项目书签→空、目标项目 ID 生效。
- `npm run type-check`：通过。
- `npm run verify:production-wiring`：323 modules / 1061 dependencies，0 违规。

### 回头看

- `rg resetEditorSession`：仅 `loadProject()` 与 `clearCurrent()` 两个调用点，无第二套隔离逻辑。
- `rg loadProject(`：启动恢复、多窗口初始项目、项目弹窗加载、`selectProject()` 全部经过统一边界。
- 书签恢复路径依赖 tabs 先打开：`setBookmarks()` 会按当前打开文档过滤；项目切换时 tabs 已清理，不会误恢复旧书签。
- `_audit/tmp/editor-bookmarks-profile` 已清理。

## P0-A3 大纲导航面板闭环

### 改动

- `src/services/editorOutline.ts`：纯函数解析 Markdown heading，输出标题、层级、行号、原始 offset 与稳定 ID，支持 CRLF 规范化。
- `src/services/editorOutline.spec.ts`：heading 解析、空文档、无标题文档、只有一级标题、嵌套标题、重复标题可寻址测试。
- `src/components/editor/EditorOutlinePanel.vue`：右侧可选面板，层级缩进列表、空状态、行号提示与面板自身收起；不折叠正文。
- `src/components/editor/EditorPanel.vue`：新增“大纲”工具按钮与右侧挂载；点击标题先退出折叠视图，再复用统一 viewport 定位到原始 offset，居中滚动并聚焦 textarea。
- `scripts/verify-editor-outline-electron.mjs`：生产 Electron 10 轮实测脚本。

### 验收证据

- RED：`npm run test:services -- src/services/editorOutline.spec.ts` 首次失败于 `Cannot find module './editorOutline'`。
- GREEN：同命令 4/4 通过。
- `npm run test:services`：94 个文件 / 953 个测试全部通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过，仅既有 chunk 大小与 Vite 配置 warning。
- `npm run verify:production-wiring`：326 modules / 1067 dependencies，0 违规。
- `node scripts/verify-editor-outline-electron.mjs`：`PASS: 10/10 outline rounds`。
- Electron 报告：`_audit/verification-editor-outline/electron-10-rounds.json`，文档 11,340 字，解析 30 个 heading；每轮点击不同章节标题，断言光标落点、居中滚动、内容不变，偶数轮验证折叠态跳转自动展开且原文恢复；最后验证面板收起与无 pageerror / console error。

### 回头看

- `rg computeEditorOutline|EditorOutlinePanel`：组件唯一消费点为 `EditorOutlinePanel.vue`，`EditorPanel.vue` 唯一挂载，无第二套 heading 解析进入 API 直写链路。
- `#btn-outline` 与既有 `#btn-outline-workspace` ID 不冲突；生产构建与 dependency-cruiser 均通过。
- 面板只读展示，不写 store、不写项目、不触碰 API 直写协议。
- `_audit/tmp/editor-outline-profile` 已清理。

## P0-A4 搜索高亮叠加闭环

### 改动

- `src/services/editorSearch.ts`：新增非重叠匹配计算、单行/换行匹配高亮矩形、高亮计划与非法测量防护。
- `src/services/editorSearch.spec.ts`：匹配、空查询、边界、不修改原文、矩形拆分、非法输入、active 标记测试。
- `src/components/editor/EditorPanel.vue`：查找栏开启后叠加独立搜索高亮层；关闭、空查询、无匹配、折叠态清空；`findNext/findPrev` 匹配计算收敛到单源服务，并复用 viewport 定位。
- `scripts/verify-editor-search-highlight-electron.mjs`：生产 Electron 10 轮真实 UI 实测。

### 关键修正

- RED 首次失败为 `Cannot find module './editorSearch'`；DOM 控制器测试在 node 环境不可用，按仓库既有测试策略改为纯高亮计划测试，DOM 行为由 Electron 实测覆盖。
- 中文 offset 断言按 UTF-16 code unit 修正。
- 实测脚本第 6 轮原关键词不存在，`1/0` 断言本身错误；改为 5 个关键词各 2 轮，并补“无匹配清空高亮 + 隐藏计数”反例。

### 验收证据

- `npm run test:services -- src/services/editorSearch.spec.ts`：8/8 通过。
- `npm run test:services`：95 files / 961 tests 全部通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过，仅既有 chunk 大小与 Vite 配置 warning。
- `npm run verify:production-wiring`：328 modules / 1070 dependencies，0 违规。
- `node scripts/verify-editor-search-highlight-electron.mjs`：`PASS: 10/10 search highlight rounds`。
- Electron 报告：`_audit/verification-editor-search-highlight/electron-10-rounds.json`，文档 6,646 字；每轮断言匹配数、active 数量、矩形尺寸、store/textarea 内容不变、关闭或空查询清理、无 pageerror / console error。

### 回头看

- `rg indexOf(editorStore.findQuery)` 无残留，查找匹配算法已单源化。
- `.editor-search-highlight-layer` 与既有 viewport highlight 分通道，未复用同一 DOM。
- 折叠态清空高亮，折叠输入/展开恢复不会把折叠文本写入 store。
- `_audit/tmp/editor-search-highlight-profile` 已清理。

### 后续队列

1. P0-A5 选区保持保障。
2. P1-A1 撤销服务单源化。
3. P1-A2 双入口 facade 统一。
4. P1-A3 上下文注入管道化。
5. P1-A4 长文档自动 EditTask 路由。
6. P2-A1 供应商 trace 字段归一；P2-A2 live 矩阵脚本落地，真实 live 等用户提供各家 Key。

## P0-A5 选区保持闭环

### 改动

- `src/components/editor/EditorPanel.vue`：textarea 接入 `@select`，用户手动换选区后刷新选区快照基线。
- `src/services/editorFolding.ts`：新增 `toggleFoldForSelection()`，折叠包含当前选区的最内层标题。
- `src/services/editorFolding.spec.ts`：新增 3 条 RED→GREEN 用例。
- `scripts/verify-editor-selection-restore-electron.mjs`：升级为真实用户语义验证，并修复两个验证脚本自身缺陷。

### 关键修复

1. 源码审查发现真实缺口：`captureSelectionSnapshot()` 此前没有任何调用点，导致选区恢复基线不随用户手动换选区更新。接入 `@select` 后，两次外部写入之间用户手动换选区，恢复逻辑以最新选区为准。
2. 折叠按钮语义修正：不再要求光标精确停在标题行，而是折叠“包含当前选区的最内层标题”，与真实用户行为一致。`toggleFold()` 保留为服务层基础原语并继续有测试；生产组件只消费 `toggleFoldForSelection()`，无第二套生产折叠路径。
3. Electron 验证脚本修正：两个测试 tab 使用不同 `chapterId`，避免 `openTab()` 因同 `chapterId + mode` 去重导致第二个页签打不开；DiagLogger 的预期 warning 不再算作 page error，但非 warning 错误仍要求为 0。

### 验收证据

- RED→GREEN：`npm run test:services -- src/services/editorFolding.spec.ts` 首次失败，修复后 13/13 通过。
- `npm run build:vue`：通过，仅既有 chunk 大小与 Vite 配置 warning。
- `node scripts/verify-editor-selection-restore-electron.mjs`：`PASS: 10/10 selection restore rounds`。
- Electron 报告：`_audit/verification-editor-selection-restore/electron-10-rounds.json`，文档 5,426 字。每轮覆盖写入后保持、写入前平移、重叠写入置零、折叠隐藏置零、展开恢复、tab 切换置零；runTrace 与 DiagLogger 每轮各新增 6 条对应记录。
- `npm run test:services`：96 files / 977 tests 全部通过。
- `npm run type-check`：通过。
- `npm run verify:production-wiring`：330 modules / 1075 dependencies，0 违规。

### 回头看

- `captureSelectionSnapshot` 已由 `EditorPanel.vue` 的 `@select` 唯一触发，选区基线不存在第二套来源。
- 折叠生产入口只走 `toggleFoldForSelection()`；`toggleFold()` 仍是服务层原语，测试保留，不构成生产双路径。
- 选区语义覆盖六类边界：非重叠写入保持、写入前平移、重叠写入置零、折叠隐藏置零、展开恢复、tab 切换置零。
- DiagLogger warning 是预期留痕，验证只把 `error` / `pageerror` 视为失败，不掩盖产品缺陷。
- 临时文件复核：`_audit/tmp/debug-selection-restore.mjs` 不存在，`_audit/tmp/debug-selection-profile` 不存在，`_audit/tmp` 当前为空。

### 后续队列

1. P1-A1 撤销服务单源化。
2. P1-A2 双入口 facade 统一。
3. P1-A3 上下文注入管道化。
4. P1-A4 长文档自动 EditTask 路由。
5. P2-A1 供应商 trace 字段归一；P2-A2 live 矩阵脚本落地，真实 live 等用户提供各家 Key。

## P1-A1 撤销服务单源化闭环

### 改动

- 新增 `src/services/editorUndoService.ts`：文档级撤销事务单源服务，统一手动编辑、API 批次写入、外部导入的 undo/redo 语义，支持 50 条上限、新事务清空 redo、重复栈顶去重。
- 新增 `src/services/editorUndoService.spec.ts`：覆盖统一事务栈、redo 清空、去重、文档隔离、session 重置。
- `src/stores/editor.ts`：撤销实现全部委托 `editorUndoService`，`resetEditorSession()` 同步清理全部 undo/redo 历史。
- `src/components/common/OutlineWorkspace.vue`：删除组件内自建 undo/redo 数组，撤销/重做改为消费 `editorStore.undoTab('outline')` / `redoTab('outline')`，手动输入、API 批次回滚、导入统一走事务栈。
- `src/components/chat/ChatPanel.vue`：批次回滚与 diff 定位改用 `listUndoContentsForTab()`，不再直读旧栈字段。
- `src/components/editor/EditorPanel.vue`：主页编辑器撤销/重做补齐 runTrace + DiagLogger 双通道记录。
- `scripts/verify-editor-undo-electron.mjs`：新增 10 轮真实 Electron UI 实测。
- 同步升级 5 个旧 Electron 脚本：书签、大纲、折叠、搜索、选区恢复全部改为消费 `clearUndoHistoryForTab()`，不再写入已删除的 `tabUndoStacks` / `tabRedoStacks`。

### 验收证据

- 单测：`npm run test:services -- src/stores/editor.spec.ts src/services/editorUndoService.spec.ts` 13/13 通过。
- 类型：`npm run type-check` 通过。
- 构建：`npm run build:vue` 通过，仅既有 chunk 大小 warning。
- Electron：`node scripts/verify-editor-undo-electron.mjs` 输出 `PASS: 10/10 undo rounds`。
- Electron 报告：`_audit/verification-editor-undo/electron-10-rounds.json`，每轮覆盖手动/API/导入事务、撤销、重做、DiagLogger 双通道留痕、runTrace `editor-undo` 事件、项目切换隔离、无 pageerror / console error。
- 书签回归：`node scripts/verify-editor-bookmarks-electron.mjs` 输出 `PASS: 10/10 bookmark rounds + 10/10 project-switch rounds`。
- 残留扫描：`rg "tabUndoStacks|tabRedoStacks|undoStack\\s*=|redoStack\\s*="` 于 `src` / `scripts` 均为 0 匹配。

### 回头看

- 大纲与主页编辑器不再各自维护 undo/redo 栈，撤销入口收敛为 `editorUndoService` 单源。
- 项目切换硬边界保留，`clearCurrent()` 清空 editor session 后 undo/redo 状态不可跨项目泄漏。
- API 批次回滚依赖的 `listUndoContents()` 兼容接口仍为内容数组，`findEditorBatchUndoContent()` 哈希查找链路未破坏。
- 旧 Electron 脚本全部同步到新 store API，不再依赖不存在字段造成假失败。

### 后续队列

1. P1-A2 双入口 facade 统一。
2. P1-A3 上下文注入管道化。
3. P1-A4 长文档自动 EditTask 路由。
4. P2-A1 供应商 trace 字段归一；P2-A2 live 矩阵脚本落地，真实 live 等用户提供各家 Key。

## P1-A2 双入口 facade 统一闭环

### 改动

- 新增 `src/services/editorEntryFacade.ts`：双入口单源 facade，统一 `getReadCapChars()`、`buildSnapshot()`、`buildMainSnapshot()`、`buildContextPack()` 与 context injection mode re-export。
- 大纲 ContextPack 单源收敛到 `conversationContextService.buildOutlineContextPack()`，facade 只消费，不再让 outline 组件自建 context pack 语义。
- `src/components/chat/ChatPanel.vue`：删除本地 main snapshot / inactive main snapshot / read cap / context pack 逻辑，系统提示、发送请求、插入编辑器、工具面读取上限全部改走 facade。
- `src/components/common/OutlineWorkspace.vue`：删除本地 outline read cap 与 request target snapshot 逻辑，请求目标、读取上限、outline context pack 全部改走 facade。
- 新增 `src/services/editorEntryFacade.spec.ts`：覆盖 provider/model read cap、stale selection 钳制、空目标、fallback main target、outline structure pack、短文 full 与长文 packed。

### 关键设计

- facade 保持纯计算：不读 Vue store、不访问 DOM；DOM 选区获取仍留在组件内，快照与 pack 语义单源化。
- `mode` 省略时遵循共享注入策略：main 短文全文、main 长文 packed、outline structure pack；`'full'` 只允许显式声明全文契约的调用方使用。
- `buildSnapshot(null)` 返回 `null`，`buildMainSnapshot(null, fallbackTargetId)` 返回项目级空目标，两个入口的空态语义不再混淆。

### 验收证据

- `npm run test:services`：98 files / 991 tests 全部通过。
- `npm run type-check`：通过。
- `npm run verify:production-wiring`：334 modules / 1087 dependencies，0 违规。
- `node scripts/verify-api-direct-write-electron.mjs`：`API DIRECT WRITE ELECTRON STRESS E2E PASSED`，包含 `dual-entry-equivalence` 与 `dual-entry-outline-equivalence`。
- `node scripts/verify-editor-undo-electron.mjs`：`PASS: 10/10 undo rounds`，P1-A1 回归未破坏。
- `npm run build:vue`：通过，仅既有 chunk 大小 warning。

### 回头看

- `rg "resolveOutlineReadCapChars|resolveHomeReadCapChars|buildMainEditorContextPack|conversationContextService\\.buildOutlineContextPack|parseOutlineStructure|createEditorTargetSnapshot"`：ChatPanel / OutlineWorkspace 生产入口 0 匹配；`createEditorTargetSnapshot` 的唯一生产实现仍在 `editorTarget.ts`。
- ChatPanel 内保留的 `createMainEditorTargetSnapshot` / `createInactiveMainEditorTargetSnapshot` 命名层函数已全部转发 facade，不再包含本地实现。
- 双入口等价性 Electron 场景通过，说明 homepage 与 outline 的 snapshot / read cap / context pack 接线行为一致。
- A1 撤销链路只读未改，Electron 10/10 撤销回归证明未破坏统一事务栈。

### 后续队列

1. P1-A3 上下文注入管道化。
2. P1-A4 长文档自动 EditTask 路由。
3. P2-A1 供应商 trace 字段归一；P2-A2 live 矩阵脚本落地，真实 live 等用户提供各家 Key。

## P1-A3 上下文注入管道化闭环

### 改动

- `src/services/editorContextPipeline.ts`：五阶段上下文管道（retrieve / filter / rank / assemble / validate），输出统一 ContextPack 与 pipeline 元数据。
- `src/services/editorEntryFacade.ts`：`buildContextPack()` 成为双入口唯一 ContextPack 构建入口；主页与 outline 共用同一管道语义。
- `src/components/chat/ChatPanel.vue`：主页请求构建 `mainContextPack`，不再把编辑器全文重复塞进 system prompt；trace 与 DiagLogger 记录完整 pipeline 元数据。
- `src/components/common/OutlineWorkspace.vue`：大纲请求构建 `requestContextPack`，workspace 状态与 trace 共用同一个 pack；DiagLogger 新增 `outline/editor-context-pipeline`。

### 关键修复

1. 接线过程中发现 `editorEntryFacade.ts` 主编辑器分支引用了不存在的 `result` 变量，生产运行必崩；已改为 `mainResult = buildEditorContextPipeline(...)` 并删除残留 `injectionMode`。
2. 旧主页链路存在双份注入：system prompt 一份全文 + ContextPack 一份全文。现已收敛为“长度 + 选区 + 必须用只读工具读取”的指引，全文由模型按需通过 `editor.read_range` 消费。
3. Electron 实测脚本初版试图在页面里动态 import Vite 模块，被 CSP 挡住；改为 Rolldown 把真实源码 bundle 后在 Node 侧加载，Electron 页面专注真实 Pinia 状态与 UI 稳定性验证。

### 验收证据

- 专项单测：`npm run test:services -- src/services/editorContextPipeline.spec.ts src/services/longDocumentPolicy.spec.ts src/services/editorEntryFacade.spec.ts`，25/25 通过。
- Electron 实测：`node scripts/verify-editor-context-pipeline-electron.mjs`，`PASS: 10/10 context pipeline rounds`。
- 报告：`_audit/verification-editor-context-pipeline/electron-20-rounds.json`；主文档 117,910 字，packed 后 estimatedInputTokens 499，contentRatio 约 0.0114；10 轮均包含 `editor.document_map` 与 `editor.read_range`，页面 0 pageerror / console error，编辑器内容不被探测污染。
- 回归：`npm run type-check` 通过；`npm run verify:production-wiring` 336 modules / 1096 dependencies，0 违规。

### 回头看

- `rg "buildContextPack\\(" src`：生产调用只剩 ChatPanel 两处（发送请求 + trace 元数据）与 OutlineWorkspace 一处，其余为 facade 定义与单测，无第二管道入口。
- `editorContextInjectionMode` / `shouldInjectFullEditorContent` 在 ChatPanel 与 OutlineWorkspace 无残留引用，组件只消费 facade。
- 旧重复注入段 `当前编辑内容：\n${requestTarget.content}` 已删除。

## P1-A4 长文档自动 EditTask 路由闭环

### 改动

- `src/services/longDocumentPolicy.ts`：新增 `classifyLongDocumentOperation()`，输出 `whole-document-replacement / whole-document-restructure / large-scope-edit / targeted-edit / discussion`。
- 新增 `shouldAutoRouteToEditTask({ length, operationType, availableContextTokens, estimatedDocumentTokens })`：整篇操作且长度达到阈值时直接路由 EditTask，并输出 `autoRouteReason`。
- ChatPanel 与 OutlineWorkspace 均接入自动路由决策，trace `long-document-policy` 与 DiagLogger 同步记录 `autoRouteReason / windowDeclared / availableContextTokens / estimatedDocumentTokens`。

### 关键修复

1. 旧逻辑只有 1 万字长度判定，缺少操作语义分类；用户说“全文整理排序”时可能仍走 direct 对话路径。现在整篇替换 / 整篇重排会强制进入 EditTask 分批流程。
2. `large-scope-edit` 当前为保守空档：无正则直接命中时回落 `targeted-edit`，宁可保守也不误放大范围改写；后续可由 EditTask planning 显式升级。

### 验收证据

- 单测：`longDocumentPolicy.spec.ts` 覆盖整篇替换、整篇重排、targeted edit、discussion 等分类与路由边界。
- Electron 实测：同上脚本第二组断言，10 万字文档（100,049 字符）10 轮全部识别为 `whole-document-restructure` 并自动路由 EditTask，`autoRouteReason=whole-document-operation+length>=10000`。
- 回归：专项 25/25、type-check、production-wiring 全部通过。

### 回头看

- 自动路由消费与 trace 双通道均已接线：主页 `home/long-document-policy`，大纲 `outline/long-document-policy`。
- 已知保守空档已登记：`large-scope-edit` 不做自动放大，避免把局部改写误升级成整篇任务。
- EditTask 执行链路本身沿用既有 Phase 1-8 成熟实现，本轮只负责“什么时候必须进 EditTask”的路由闭合。

### 后续队列

1. P2-A1 供应商 trace 字段归一。
2. P2-A2 live 矩阵脚本落地，真实 live 等用户提供各家 Key。

## P2-A1 供应商 trace 字段归一闭环

### 改动

- `src/services/traceFieldNormalizer.ts`：统一 usage、finishReason、toolCallId 归一。
- `src/services/aiService.ts` / `src/services/providerProtocols.ts`：Anthropic 流式 usage 支持帧级合并；trace 写入归一字段。
- `src/stores/runTrace.ts`：消费统一 usage 归一。

### 验收证据

- `npm run verify:provider-wire-electron`：四家全部 PASS，报告 `_audit/verification-api-direct-write-electron/provider-wire-matrix.json`。
- `npm run test:services -- src/services/traceFieldNormalizer.spec.ts src/services/aiService.spec.ts src/services/runTrace.spec.ts src/services/providerProtocols.spec.ts src/services/providerTools.spec.ts src/stores/runTrace.spec.ts`：`5 files / 194 tests` 全绿。

## P2-A2 live 矩阵脚本闭环

### 改动

- `scripts/verify-api-direct-write-live-v3.mjs`：支持 `SHENYI_LIVE_PROVIDER=openai|anthropic|gemini|azure`。
- Azure 额外要求 `SHENYI_LIVE_DEPLOYMENT` 与 `SHENYI_LIVE_API_VERSION`。
- 证据 JSON 记录 `liveProvider/providerType`。

### 验收证据

- `node --check scripts/verify-api-direct-write-live-v3.mjs`：通过。
- 缺 API Key、非法 provider、Azure 缺 deployment/apiVersion 三类分支：均按预期报错并退出。
- `npm run build:vue`：通过，仅既有 chunk 大小与 Vite 配置 warning。

### 待执行

- 四家真实 live Key 提供后逐家运行并保存证据。
