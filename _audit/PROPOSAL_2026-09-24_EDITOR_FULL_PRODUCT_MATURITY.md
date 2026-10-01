# 编辑器系统完整产品标准成熟化方案

日期：2026-09-24  
状态：执行完成（P0-A1 至 P1-A4 已闭环；P2-A1 已闭环；P2-A2 脚本已落地，四家真实 live 执行等待各家 Key）
方案成熟度：成熟（10 维度各 10 轮源码调研全部完成，830 个真实源码文件进缓存，0 空轮，0 README 充当证据）  
范围：编辑器本体、API 直写、双入口、撤销、可观测性、长文档、体验层  
非目标：本方案只做改造方案，不在本轮直接写码实现。

## 0. 调研执行情况

| 检查项 | 结果 |
| --- | --- |
| 维度数 | 10 |
| 每维度轮次 | 10 |
| 总轮次 | 100 |
| 唯一真实仓库 | 151 |
| 源码缓存文件 | 830 |
| README/License/Changelog 混入 | 0 |
| 空轮（无源码证据） | 0 |
| commit SHA 缺失 | 0 |
| 缓存目录 | `_audit/research-editor-full-product-2026-09-24/cache/` |
| 轮次记录 | `_audit/research-editor-full-product-2026-09-24/round-XX-{dimension}.json` |

代表性仓库（不是全部，只列关键证据贡献者）：`microsoft/vscode`、`zed-industries/zed`、`neovim/neovim`、`microsoft/monaco-editor`、`continuedev/continue`、`cline/cline`、`Aider-AI/aider`、`OpenHands/OpenHands`、`quilljs/quill`、`facebook/lexical`、`ueberdosis/tiptap`、`outline/outline`、`siyuan-note/siyuan`、`logseq/logseq`、`toeverything/AFFiNE`、`AppFlowy-IO/AppFlowy`、`helix-editor/helix`、`yjs/yjs`、`ajaxorg/ace`、`microsoft/playwright`。

## 1. 10 维度结论总览

| 维度 | 当前完成度 | 社区成熟度共识 | 我们最大差距 | 优先级 |
| --- | --- | --- | --- | --- |
| 编辑工具协议 | 95% | 高（单源命令注册 + 统一 dispatcher） | 已达标 | 维持 |
| 权限与安全 | 95% | 高（服务层权限门 + intent 路由） | 已达标 | 维持 |
| 长文档 / EditTask | 90% | 高（虚拟化 + 分块 + 事务化） | 自动路由到 EditTask 仍有手动边界 | P1 |
| 可观测性 / trace | 90% | 高（结构化事件 + 双通道落盘） | 供应商差异下的字段一致性 | P2 |
| 撤销体系 | 85% | 高（事务级 undo + 单源栈） | 大纲仍组件内自建栈 | P1 |
| 验证强度 | 90% | 高（多层：unit → integration → E2E → 真实 UI） | live 供应商覆盖只有单形态 | P2 |
| 入口适配 | 85% | 高（facade / adapter 单源） | 两入口各维护薄适配层 | P1 |
| 上下文注入 | 80% | 高（token budget + 分层检索） | 主页旧通道刚清完，需持续对齐 | P1 |
| 编辑器本体功能 | 70% | 极高（折叠/书签/大纲/搜索/替换/快捷键） | 缺折叠、书签、大纲导航面板 | P0 |
| 体验层 | 65% | 极高（定位/滚动/高亮/选区保持/光标动画） | 现有反馈系统缺沉浸式编辑体验 | P0 |

## 2. P0：编辑器本体功能 + 体验层

### 2.1 业界共识（源码证据）

**折叠 / 大纲 / 书签**：

- `ajaxorg/ace` `src/edit_session/fold.js`：折叠是一个独立服务，挂在 `EditSession` 上，不挂在具体视图组件上。每个 fold 是一个 `{start, end, placeholder}` 对象，可以加、解、批量渲染。
- `siyuan/siyuan` `app/src/menus/bookmark.ts`：书签是一等公民，可以列表展示、跳转、删除，不依赖光标位置。
- `microsoft/monaco-editor` `monaco-lsp-client/src/adapters/languageFeatures/LspFoldingRangeFeature.ts`：折叠范围由语言服务计算，编辑器只消费。对于纯文本/Markdown，改用正则或行首缩进。
- `outline/outline` `app/components/DocumentViews.tsx`：文档视图支持多视图共存（编辑、预览、只读），统一由一个 View 组件管理。
- `pandao/editor.md` `lib/codemirror/addon/fold/foldgutter.js`：折叠 gutter 是编辑器左侧行号旁的独立区域，不改变内容区域布局。

**搜索 / 替换**：

- `continuedev/continue` `core/edit/searchAndReplace/findSearchMatch.ts`：搜索匹配是结构化对象（range、matchType、context），不是简单的 index。支持大小写、正则、全词。
- `zed-industries/zed` `crates/search/src/text_finder.rs`：搜索有独立 crate，不挂在 buffer 上。支持 case-insensitive、regex、whole word、多文件。
- `ace` `src/search_highlight.js`：搜索高亮是一个独立 module，可以叠加在编辑器上而不改变内容。

**光标 / 滚动 / 高亮 / 选区**：

- `facebook/lexical` `packages/lexical-code-prism/src/__tests__/unit/CodeHighlighterPrismRetainSelection.test.ts`：Lexical 明确测试“语法高亮更新后选区不丢”，说明选区保持是一等产品语义。
- `microsoft/vscode` `src/vs/editor/common/cursor/cursorColumnSelection.ts`：列选（column selection）是编辑器核心能力，不是插件。
- `diffusionstudio/editor` `apps/web/src/engine/input/cursor.ts`：光标位置由引擎统一管理，视图只消费。
- `helix-editor/helix` `helix-term/src/handlers/document_highlight.rs`：文档高亮有独立 handler，与选区、搜索高亮、LSP 高亮分通道。

### 2.2 我们的差距

1. **无折叠**：几十万字大纲/正文，全部展开，用户找章节只能滚动或用侧栏树。
2. **无书签**：用户无法标记“这里要改”然后回来。
3. **无大纲导航面板**：侧栏有章节树，但编辑器内部没有 heading-level outline panel，无法快速跳到当前章节内的某个段落。
4. **搜索高亮不叠加**：搜索结果只在查找栏显示数量，编辑器内没有持久高亮。
5. **选区在视图切换后丢失**：Lexical/ProseMirror 明确测试选区保持，我们没有系统保障。

### 2.3 改造项

#### A. Markdown 折叠（P0-A1）

- 新增 `src/services/editorFolding.ts`：
  - `computeFoldRanges(content: string): FoldRange[]`，基于 Markdown heading 层级（`#` 到 `######`）计算折叠范围。
  - `applyFold(content: string, folds: FoldRange[]): string`，返回折叠后渲染文本（保留原文用于撤销）。
  - `toggleFold(folds, line)`，切换指定行的折叠状态。
- EditorPanel 渲染层：在行号旁新增折叠指示器（`▸` / `▾`），点击切换。
- 折叠不改变存储内容，只改变渲染。

验收：

- 单测：heading 层级识别、折叠/展开、折叠后选区/光标位置映射、不破坏内容。
- Electron E2E：真实 UI 折叠/展开一个 5000 字文档，验证内容不变、光标跳转正确。

执行记录（2026-09-24）：

- 已完成：`src/services/editorFolding.ts`、`src/services/editorFolding.spec.ts`、`src/components/editor/EditorPanel.vue`、`scripts/verify-editor-folding-electron.mjs`。
- 已验收：11,244 字长文档，10/10 轮真实 Electron UI 折叠/展开/store 完整性/光标映射/折叠态输入反例，报告 `_audit/verification-editor-folding/electron-10-rounds.json`。
- 已修复：生产构建后 `EditorPanel` 折叠 computed 声明在 `activeTab` 之前触发 TDZ，导致面板挂载失败；已移动声明顺序并由 Electron 实测捕获。
- 门禁结果：`npm run test:services -- src/services/editorFolding.spec.ts src/stores/editor.spec.ts` 11/11；`npm run type-check` 通过；`npm run build:vue` 通过；`npm run verify:production-wiring` 0 违规。

#### B. 书签系统（P0-A2）

- 新增 `src/services/editorBookmarks.ts`：
  - `createBookmark(documentId, line, label)` → 持久化到项目级数据。
  - `listBookmarks(documentId)` → 返回排序后列表。
  - `gotoBookmark(bookmarkId)` → 编辑器滚动到指定行并高亮。
  - `deleteBookmark(bookmarkId)`。
- UI：编辑器右侧新增书签 gutter 图标，点击添加/删除；底部或侧边显示书签列表。

验收：

- 单测：增删改查、跨文档隔离、版本号变更后书签自动失效。
- Electron E2E：添加书签 → 切换 tab → 返回 → 书签仍在且可跳转。

执行记录（2026-09-24）：

- 已完成：`src/services/editorBookmarks.ts`、`src/services/editorBookmarks.spec.ts`、`src/stores/editor.ts`、`src/stores/project.ts`、`src/components/editor/EditorPanel.vue`、`scripts/verify-editor-bookmarks-electron.mjs`。
- 已修复：项目切换硬边界。`loadProject()` 无条件重置项目状态与编辑器会话，目标项目无持久化数据时也不会继承旧项目状态。
- 已验收：11,244 字长文档，10/10 轮书签主流程 + 10/10 轮项目切换隔离，报告 `_audit/verification-editor-bookmarks/electron-10-rounds.json`。
- 门禁结果：书签相关 19/19 测试通过；`npm run type-check` 通过；`npm run build:vue` 通过；`npm run verify:production-wiring` 0 违规。

#### C. 大纲导航面板（P0-A3）

- 新增 `src/components/editor/EditorOutlinePanel.vue`：
  - 解析当前文档 heading 结构。
  - 显示层级列表，点击滚动到对应位置。
  - 支持折叠面板自身（不折叠内容）。
- EditorPanel 右侧可选挂载，不影响 API 直写。

验收：

- 单测：heading 解析、空文档、只有一级标题、嵌套标题。
- Electron E2E：5000 字文档点击第 3 章，编辑器滚动到第 3 章起始行。

#### D. 搜索高亮叠加（P0-A4）

- EditorPanel 搜索时，在编辑器内容区叠加高亮层（不修改内容）。
- 使用 `::selection` 伪类或 absolute overlay 定位。
- 搜索关闭后清除高亮。

验收：

- 单测：高亮计算、多个匹配、无匹配、高亮不改变内容。
- Electron E2E：搜索“第三章”，编辑器内所有“第三章”文本有视觉高亮。

#### E. 选区保持保障（P0-A5）

- 新增选区恢复策略：视图切换、折叠/展开、API 写入后，选区按最近锚点自动恢复或明确置零并留痕。
- run trace 记录 `selectionRestoreMode: 'auto' | 'reset' | 'none'`。

执行记录（2026-09-25）：

- 已实现：`EditorPanel.vue` 的 textarea 接入 `@select`，用户手动换选区后快照基线即时刷新；外部写入再基于最新快照做恢复或置零。
- 已实现：折叠按钮语义升级为“折叠当前选区所属的最内层标题”，不再要求光标精确停在标题行；`toggleFold()` 保留为服务层基础原语，生产组件只消费 `toggleFoldForSelection()`，无第二套折叠入口。
- 已实现：重叠写入、折叠隐藏、tab 切换的选区置零路径；写入后未受影响区域选区保持，写入前区域按内容平移恢复。
- RED→GREEN：`editorFolding.spec.ts` 新增 3 条用例，先失败后修复通过。
- Electron 真实 UI 证据：`node scripts/verify-editor-selection-restore-electron.mjs` 输出 `PASS: 10/10 selection restore rounds`；报告见 `_audit/verification-editor-selection-restore/electron-10-rounds.json`。
- 全量回归：`npm run test:services` 96 files / 977 tests 全绿；`npm run type-check` 通过；`npm run verify:production-wiring` 330 modules / 1075 dependencies，0 违规；`npm run build:vue` 通过，仅既有 chunk 大小与 Vite 配置 warning。
- 回头看：runTrace 与 DiagLogger 每轮各 6 条记录可对账；验证脚本允许 DiagLogger 预期 warning 留痕，`error` / `pageerror` 仍要求为 0；临时调试脚本与 profile 已清理，`_audit/tmp` 复核为空。

验收：

- 单测：折叠/展开后选区恢复、API 写入后选区重置、tab 切换后选区置零。
- Electron E2E：选中一段文字 → 触发 API 写入其他区域 → 原选区仍保持或明确置零。

### 2.4 验证方案

1. `npm run test:services` 全绿。
2. `npm run type-check` 通过。
3. `npm run verify:production-wiring` 0 违规。
4. 新增专项测试覆盖 A1-A5 每项至少 4 条正例 + 2 条反例。
5. Electron 级真实 UI 实测：
   - 5000 字文档折叠/展开 10 轮。
   - 书签增删查 + 跨 tab 保持 10 轮。
   - 大纲面板跳转 10 轮。
   - 搜索高亮显示/清除 10 轮。
   - API 写入后选区状态验证 10 轮。
6. 回头看扫描：
   - `rg` 确认无旧搜索逻辑残留。
   - `rg` 确认折叠/书签/大纲面板只挂 EditorPanel，不侵入 API 直写链路。
   - run trace 新字段同步覆盖。

## 3. P1：撤销统一 + 入口适配 + 上下文注入 + 长文档

### 3.1 业界共识（源码证据）

**撤销系统**：

- `microsoft/vscode` `src/vs/platform/undoRedo/common/undoRedoService.ts`：VS Code 的 undo/redo 不是组件级栈，是平台级服务。核心概念：
  - `IUndoRedoElement`：每个撤销单元有 `label`、`undo()`、`redo()`、`cleanup()`。
  - 多资源编辑（跨文件）通过 `ResourceUndoRedoElement` 合并到一个事务。
  - 服务统一调度，不区分“是用户编辑”还是“是扩展写入”。
- `quilljs/quill` `packages/quill/src/modules/history.ts`：Quill 的 history module 基于 Delta 操作而不是文本 diff，每次变更记录为 `{ops, undoOps}`，支持 merge 窗口。
- `yjs/yjs` `src/utils/UndoManager.js`：协同编辑的 undo 不回滚“时间”，只回滚“自己的操作”，通过 `origin` 过滤。
- `neovim/neovim` `src/nvim/undo.c`：C 层实现，基于 `u_header` 链表，每个 header 记录完整的 buffer 快照或 delta。

**共识**：撤销必须是文档/编辑器级别的单源服务，不是组件内自建栈。手动编辑、API 写入、外部修改统一走同一个事务管理器。

**入口适配**：

- `outline/outline` `app/components/DocumentViews.tsx`：多入口消费同一个 Document model，入口只做 view 层适配。
- `microsoft/monaco-editor` 的 playground sample（`adding-a-keybinding-to-an-existing-command`）：命令注册后，任何入口（palette、keybinding、API）都能调用，不存在入口私有命令。
- `toeverything/AFFiNE`：BlockSuite 编辑器核心与 AFFiNE 应用层严格分层，应用层通过 facade 消费。

**上下文注入**：

- `continuedev/continue` `core/context_retrieval/pipelines/NoRerankerRetrievalPipeline.ts`：上下文注入是管道（pipeline），不是一次性全文拼接。步骤：retrieve → filter → rank → assemble → inject。
- `openai/codex` `codex-rs/core/src/context_token_budget_context.rs`：token budget 是一个独立 context，在请求构建前显式声明。
- `zed-industries/zed` `crates/edit_prediction_context/src/assemble_excerpts.rs`：excerpt 组装有独立模块，控制每个片段的最大长度和优先级。
- `Aider-AI/aider` `aider/coders/context_prompts.py`：上下文构建按文件类型和 token 预算分层注入。

**长文档**：

- `zed-industries/zed` `crates/language/src/buffer/row_chunk.rs`：buffer 按行分块存储，读取按 chunk 索引。
- `neovim/neovim` `src/nvim/buffer.c`：buffer 是一等对象，有独立的修改通知机制（`changedtick`）。
- `micro-editor/micro` `internal/buffer/search.go`：大文件搜索有独立入口，不挂载全量到内存。

### 3.2 我们的差距

1. **大纲撤销仍是组件内自建栈**：`OutlineWorkspace.vue` 自己维护 undo/redo 数组，没有走 `editorStore` 或独立 undo service。API 写入和手动编辑的撤销语义不统一。
2. **双入口适配层分叉**：主页 `ChatPanel.vue` 与大纲 `OutlineWorkspace.vue` 各自维护 read cap、selection snapshot、context injection 的薄适配。
3. **上下文注入单通道化刚完成**：但 token budget 显式声明与分层检索管道还未系统化。
4. **长文档自动路由**：1 万字阈值判定存在，但“整篇重排自动转 EditTask 分批”的自动链路未完全闭合。

### 3.3 改造项

#### A. 撤销服务单源化（P1-A1）

- 新增 `src/services/editorUndoService.ts`：
  - `pushUndoTransaction(documentId, transaction: UndoTransaction)`。
  - `undo(documentId)` / `redo(documentId)`。
  - `UndoTransaction = { label, operations, timestamp, origin: 'manual' | 'api' | 'import' }`。
- 主页 EditorPanel 与大纲 OutlineWorkspace 都消费此服务。
- 删除大纲组件内自建栈。

验收：

- 单测：手动编辑、API 写入、导入，撤销/重做行为一致。
- Electron E2E：大纲手动输入 → API 写入 → 撤销一次（回滚 API 写入）→ 再撤销（回滚手动输入）。

#### B. 双入口 facade 统一（P1-A2）

- 新增 `src/services/editorEntryFacade.ts`：
  - `getReadCapChars(provider, model)`。
  - `buildSnapshot(target)`。
  - `buildContextPack(target, mode)`。
- 主页与大纲统一 import，删除本地实现。

验收：

- `rg` 回头看：不存在 `resolveHomeReadCapChars` / `resolveOutlineReadCapChars` 两个函数。
- 双入口等价性 E2E 已有脚本回归通过。

执行记录（2026-09-25）：

- 已完成：`src/services/editorEntryFacade.ts` 与 8 条 facade 单测；ChatPanel 与 OutlineWorkspace 删除本地 read cap / snapshot / context pack 实现，全部改走单源 facade；outline ContextPack 收敛到 `conversationContextService.buildOutlineContextPack()`。
- 已验收：`npm run test:services` 98 files / 991 tests 全绿；`npm run type-check` 通过；`npm run verify:production-wiring` 334 modules / 1087 dependencies，0 违规；`node scripts/verify-api-direct-write-electron.mjs` 通过且包含双入口等价性场景；`node scripts/verify-editor-undo-electron.mjs` 10/10；`npm run build:vue` 通过。
- 回头看：`resolveOutlineReadCapChars` / `resolveHomeReadCapChars` / `buildMainEditorContextPack` / 组件直调 `conversationContextService.buildOutlineContextPack` / `parseOutlineStructure` / `createEditorTargetSnapshot` 在双入口生产代码中 0 残留；A1 撤销链路回归未破坏。

#### C. 上下文注入管道化（P1-A3）

- 新增 `src/services/editorContextPipeline.ts`：
  - `buildContext(target, budget: ContextBudget): ContextPack`。
  - 步骤：`retrieve → filter → rank → assemble → validate`。
  - `validate` 步骤检查：总 token 不超预算、必选字段（label/length/selection）不缺、工具指引不缺。
- 主页与大纲统一消费。

验收：

- 单测：短文档全文、长文档 packed、预算边界、缺失字段报错。
- Electron E2E：主页 10 万字文档请求，system prompt 不含全文，document_map/read_range 可用。

执行记录（2026-09-25）：

- 已完成：`editorContextPipeline` 五阶段管道 + `editorEntryFacade.buildContextPack()` 单源入口；ChatPanel 与 OutlineWorkspace 已接入，旧“编辑器全文重复注入 system prompt”路径删除。
- 已验收：专项 25/25；Electron 实测 10/10 packed 轮次，117,910 字主文档 packed 后估算输入 499 tokens（contentRatio 约 1.1%），每轮包含 `editor.document_map` / `editor.read_range`，页面 0 错误；报告 `_audit/verification-editor-context-pipeline/electron-20-rounds.json`。

#### D. 长文档自动 EditTask 路由闭合（P1-A4）

- `longDocumentPolicy.ts` 新增：
  - `shouldAutoRouteToEditTask(length, operationType)`：整篇重排 / 全文替换 / 大范围修改 且长度超过阈值 → 自动进入 EditTask。
  - 不是“建议”，是直接路由，并写入 trace。
- 意图路由联动：长文档工作流已成立时，`discuss` 不降级写权限（M66 已实现，保持）。

验收：

- 单测：1 万字以下整篇替换走 direct、1 万字以上走 EditTask、已有 EditTask 不重复创建。
- Electron E2E：10 万字文档请求“全文重排”，自动进入 EditTask 分批流程，trace 记录路由原因。

执行记录（2026-09-25）：

- 已完成：`classifyLongDocumentOperation()` + `shouldAutoRouteToEditTask()`；主页与大纲双入口接线，trace / DiagLogger 双通道记录 `autoRouteReason / windowDeclared / availableContextTokens / estimatedDocumentTokens`。
- 已验收：100,049 字整篇重排 10/10 自动路由 EditTask，`operationType=whole-document-restructure`，`autoRouteReason=whole-document-operation+length>=10000`；专项 25/25、type-check、production-wiring 0 违规。
- 已登记保守空档：`large-scope-edit` 暂无正则命中，回落 `targeted-edit`，避免误放大范围改写；后续由 EditTask planning 显式升级。

### 3.4 验证方案

1. `npm run test:services` 全绿。
2. `npm run type-check` 通过。
3. `npm run verify:production-wiring` 0 违规。
4. 双入口等价性 E2E（已有脚本）全场景通过。
5. Electron 级真实 UI 实测：
   - 撤销/重做 10 轮（含 API 写入后回滚）。
   - 10 万字文档自动 EditTask 路由 10 轮。
   - 上下文注入 packed 模式验证 10 轮。
6. 回头看扫描：
   - `rg` 确认大纲无本地 undo 栈残留。
   - `rg` 确认无双入口 read cap / snapshot / context 重复实现。
   - run trace 新字段（undo origin、context pipeline mode、auto-route reason）同步覆盖。

## 4. P2：可观测性 + 验证强度

### 4.1 业界共识（源码证据）

- `microsoft/playwright` trace 相关源码：trace 记录是结构化的（action、selector、before/after snapshot），不是纯文本日志。
- `rust-lang/rust`：instrumentation 有独立 macro 层，编译期注入，不污染业务代码。
- `OpenHands/OpenHands` `__tests__/components/features/chat/components/context-window-meter.test.tsx`：上下文使用量有专门的 UI meter 和独立测试。
- `cline/cline`：权限确认和 API 调用 trace 分层记录，用户可以看到每次工具调用的完整入参出参。

### 4.2 我们的差距

1. **供应商 trace 字段不一致**：不同供应商（OpenAI / Anthropic / Gemini / Azure）的 usage、finishReason、toolCallId 字段格式不同，当前未做字段级归一。
2. **live 供应商覆盖只有单形态**：只有 OpenAI 兼容网关做过真实 live 实测，Anthropic / Gemini / Azure 仍是协议级验证。

### 4.3 改造项

#### A. 供应商 trace 字段归一（P2-A1）

- 新增 `src/services/traceFieldNormalizer.ts`：
  - `normalizeUsage(provider, rawUsage): NormalizedUsage`。
  - `normalizeFinishReason(provider, rawReason): NormalizedFinishReason`。
  - `normalizeToolCallId(provider, rawId): NormalizedToolCallId`。
- aiService 调用后统一走 normalizer 再写入 run trace。

验收：

- 单测：4 家供应商的原始 usage 格式 → 归一后字段一致。
- Electron E2E：mock 不同供应商响应，trace 输出字段一致。

执行记录（2026-09-25）：

- 已完成：`src/services/traceFieldNormalizer.ts` + `src/services/traceFieldNormalizer.spec.ts`；`aiService` / `runTrace` 消费统一归一字段。
- 已验收：`npm run verify:provider-wire-electron` 四家 mock 矩阵全绿，报告 `_audit/verification-api-direct-write-electron/provider-wire-matrix.json`；归一相关回归 `5 files / 194 tests` 全绿。

#### B. 供应商 live 实测矩阵（P2-A2）

- 扩展 `scripts/verify-api-direct-write-live-v3.mjs`：
  - 支持环境变量切换 `PROVIDER=openai|anthropic|gemini|azure`。
  - 每家至少跑：写入、修改、删除、工具循环 4 轮。
- 本轮只做方案，实际 live 测试需要用户提供各家 key。

执行记录（2026-09-25）：

- 已完成：`scripts/verify-api-direct-write-live-v3.mjs` 支持 `SHENYI_LIVE_PROVIDER=openai|anthropic|gemini|azure`；Azure 要求 `SHENYI_LIVE_DEPLOYMENT` 与 `SHENYI_LIVE_API_VERSION`；证据 JSON 记录 `liveProvider/providerType`。
- 已验收：`node --check` 通过；三类参数错误分支按预期拦截；`npm run build:vue` 通过。
- 待执行：四家真实 live Key 提供后逐家运行并保存证据。

### 4.4 验证方案

1. 归一器单测全绿。
2. 现有 mock E2E 回归通过。
3. live 测试矩阵脚本可运行（不要求本轮全部执行，等 key）。

## 5. 执行顺序

| 优先级 | 改造项 | 依赖 | 预估改动范围 |
| --- | --- | --- | --- |
| P0-A1 | Markdown 折叠 | 无 | 新服务 + EditorPanel 渲染层 |
| P0-A2 | 书签系统 | 无 | 新服务 + gutter UI |
| P0-A3 | 大纲导航面板 | 无 | 新组件 + EditorPanel 挂载 |
| P0-A4 | 搜索高亮叠加 | 无 | EditorPanel overlay |
| P0-A5 | 选区保持保障 | 无 | EditorPanel + trace |
| P1-A1 | 撤销服务单源化 | 无 | 新服务 + 双入口消费 |
| P1-A2 | 双入口 facade 统一 | 无 | 新服务 + 双入口消费 |
| P1-A3 | 上下文注入管道化 | P1-A2 | 新服务 + 双入口消费 |
| P1-A4 | 长文档自动 EditTask 路由 | P1-A3 | longDocumentPolicy + trace |
| P2-A1 | 供应商 trace 字段归一 | 无 | 新服务 + aiService 接线 |
| P2-A2 | 供应商 live 实测矩阵 | P2-A1 | 验证脚本扩展 |

## 6. 风险反推

| 风险 | 反推 | 防线 |
| --- | --- | --- |
| P0 折叠/书签改变编辑器布局，破坏 API 直写定位 | 折叠不改存储内容，书签不侵入工具协议 | API 直写 13 场景 E2E 回归 |
| P0 搜索高亮 overlay 与现有 diff/定位高亮冲突 | 高亮层按 z-index 分通道，每通道独立清理 | 视觉回归测试 |
| P1 撤销服务迁移破坏大纲现有撤销行为 | 先写等价测试锁基线，再迁移 | 撤销/重做 10 轮 E2E |
| P1 facade 统一引入新 import 环 | 只做纯函数导出，不引入 Vue 响应式 | type-check + production-wiring |
| P1 上下文管道化改变现有 SKILL 行为 | packed 模式字段是现有 ContextPack 超集，不删字段 | SKILL 场景回归 |
| P1 自动路由过于激进，误判小文档 | 阈值与操作类型联合判定，只拦截整篇级操作 | 正负样本回归 |
| 修一处坏一处 | 每个改造项独立提交，独立验证，不合并大改动 | 每项独立回头看 |

## 7. 交付物

1. P0-A1 至 P2-A2 全部代码与测试。
2. Electron 级真实 UI 实测报告（每项至少 10 轮）。
3. run trace / DiagLogger 新字段覆盖证据。
4. 更新后的 SKILL 直写说明文档。
5. 开发日志与本方案状态更新。

## 8. 门禁遵守

- M1 影响圈声明：每个改造项动手前列出改动文件与影响链。
- M6 门禁复读：动手前复读最新 DEV_LOG 与经验文件。
- M8 日志覆盖同步：新增 undo origin、context pipeline mode、auto-route reason、selection restore mode 等 trace 字段，DiagLogger 同步。
- M17 回头看：每项完成后回头看，连续 3 轮无新问题才允许进入下一项。
- M18 方案成熟度：本方案已给出“成熟”结论，10 维度各 10 轮源码调研全部完成。
- M42 收尾清理：调研缓存与轮次记录作为证据保留，不删除本轮产生的方案、日志与经验。

## 9. 审核确认点

1. P0 五项（折叠、书签、大纲面板、搜索高亮、选区保持）是否全部纳入本轮？
2. P1 四项（撤销单源、facade、上下文管道、自动路由）是否全部纳入本轮？
3. P2 两项（trace 归一、live 矩阵）是本轮做还是下一轮？
4. 执行顺序按 P0 → P1 → P2，还是并行推进？

审核结论（2026-09-25）：

1. P0 五项全部纳入本轮；P0-A1 至 P0-A5 已全部闭环并保留 Electron 10 轮证据。
2. P1 四项全部纳入后续执行，不降级、不改名、不合并到其他任务。
3. P2 两项保留为后续独立阶段，不在 P0 轮内偷跑。
4. 执行顺序固定为 P0 → P1 → P2；当前 P0 已收口，下一项从 P1-A1 撤销服务单源化开始。
