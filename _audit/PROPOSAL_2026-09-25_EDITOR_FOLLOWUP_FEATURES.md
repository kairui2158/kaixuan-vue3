# 编辑器后续五方向成熟化方案

日期：2026-09-25  
状态：待审核  
方案成熟度：成熟可执行（5 个方向均完成“应用边界摸排 + 5×10 轮真实社区源码调研 + 适配反推”）

## 0. 调研执行与证据口径

| 检查项 | 结果 |
| --- | --- |
| 方向数 | 5 |
| 每方向轮次 | 10 |
| 总轮次 | 50 |
| 唯一真实仓库 | 104 |
| 缓存源码文件 | 419 |
| 失败轮次 | 0 |
| README/License 充当证据 | 0 |
| 轮次台账 | `_audit/research-editor-followup-features-2026-09-25/round-XX-{dimension}.json` |
| 源码缓存 | `_audit/research-editor-followup-features-2026-09-25/cache/` |
| 汇总台账 | `_audit/research-editor-followup-features-2026-09-25/summary.json` |

代表性证据仓库：`microsoft/vscode`、`zed-industries/zed`、`neovim/neovim`、`microsoft/monaco-editor`、`facebook/lexical`、`siyuan-note/siyuan`、`continuedev/continue`、`cline/cline`、`Aider-AI/aider`、`langfuse/langfuse`、`mlflow/mlflow`、`promptfoo/promptfoo`、`toeverything/blocksuite`、`codex-team/editor.js`、`mawww/kakoune`、`helix-editor/helix`、`lapce/lapce`。

## 1. 应用现状边界（先摸清再设计）

### 1.1 查找替换

- 主页编辑器：[EditorPanel.vue](/D:/codex/novel-workshop-vue3/src/components/editor/EditorPanel.vue:1022) 的 `replaceOne()` 依赖当前选区字面相等；[EditorPanel.vue](/D:/codex/novel-workshop-vue3/src/components/editor/EditorPanel.vue:1037) 的 `replaceAll()` 用 `content.split(query).join(replaceQuery)`，无正则、大小写、全词、预览、替换计数。
- 大纲工作台：[outlineReplace.ts](/D:/codex/novel-workshop-vue3/src/services/outlineReplace.ts:77) 已有单源替换服务与锁定/选区校验；[OutlineWorkspace.vue](/D:/codex/novel-workshop-vue3/src/components/common/OutlineWorkspace.vue:1824) 消费该服务，但功能维度同样是字面替换。
- 匹配计算：[editorSearch.ts](/D:/codex/novel-workshop-vue3/src/services/editorSearch.ts:22) 已有匹配结构与高亮计划，是双入口统一的天然落点。

结论：能力缺口不在 UI，而在“匹配模型”只有字面一种。需要统一到单一 Search Model，而不是给两个入口分别补按钮。

### 1.2 超长文档性能层

- 当前仍是单 textarea：[EditorPanel.vue](/D:/codex/novel-workshop-vue3/src/components/editor/EditorPanel.vue:101)。
- 视口测量：[editorViewport.ts](/D:/codex/novel-workshop-vue3/src/services/editorViewport.ts:99) 的 `measureOffset()` 每次 `slice(0, offset)` 并把前缀写入 mirror，长文档下是 O(N) 级 DOM 测量。
- 上下文层已有 packed 注入，但那是 API 上下文，不是渲染层虚拟化。

结论：短中篇可用；几十万字会出现滚动、定位、高亮、写入跟随变慢。需要渲染窗口化，同时保持 textarea 兼容和 API 直写链路不变。

### 1.3 API 写入后的行内 Diff

- 批次原子性：[editorEditBatch.ts](/D:/codex/novel-workshop-vue3/src/services/editorEditBatch.ts:61) 的 `planEditorEditBatch()` 已有 original/next/逐命令 plan；[editorEditBatch.ts](/D:/codex/novel-workshop-vue3/src/services/editorEditBatch.ts:150) 的 `applyAcceptedItems()` 已能按接受命令重放。
- 状态机：[editTaskService.ts](/D:/codex/novel-workshop-vue3/src/services/editTaskService.ts:1) 已有 checkpoint（documentVersion + contentHash）和完整状态链路。
- 缺口：编辑器内没有 hunk 视图、没有单命令回滚 UI、没有“跳到这一处改动”的导航；目前只有写入定位与整体 undo。

结论：底座够硬，缺的是把 batch item 变成可见、可导航、可单独回滚的产品层。

### 1.4 SKILL 调试对比工具增强

- [runTraceDiff.ts](/D:/codex/novel-workshop-vue3/src/services/runTraceDiff.ts:59) 已有 prompt 快照 diff（含 skillVersion、folderFingerprint）；[runTraceDiff.ts](/D:/codex/novel-workshop-vue3/src/services/runTraceDiff.ts:74) 已有工具调用 diff；[runTraceDiff.ts](/D:/codex/novel-workshop-vue3/src/services/runTraceDiff.ts:121) 已有状态首次分叉。
- 缺口：模板版本对比没有一等入口；工具调用序列只有成对列表，没有“序列结构 diff”（调用次数、顺序、参数结构、失败点）；导出有全文但缺少面向 SKILL 调试的聚焦摘要。

结论：数据层已具备，补齐维度和摘要层即可，不需要推翻现有 diff。

### 1.5 多光标 / 块选择

- 全仓检索无任何多光标实现。
- 当前 textarea 的 selectionStart/selectionEnd 是单选区模型。

结论：这是唯一需要新增“选区模型”的方向。直接在 textarea 上模拟多光标会破坏 IME、选区恢复、API 写入映射，必须以“虚拟选区集合 + 单一主光标”的方式进入。

## 2. 社区成熟标准（源码证据）

### 2.1 查找替换

- `facebook/lexical` `FindReplaceExtension/index.tsx`：`findMatches(text, term, caseSensitive, isRegex)` 是纯函数匹配模型；字面量先 `escapeRegExp`，正则异常直接返回空数组；空匹配要推进 `lastIndex` 防死循环；替换支持 `$1` 类模板展开。
- `zed-industries/zed` `crates/search/src/text_finder.rs`：搜索选项是位标志（case/regex/whole word 等），搜索状态独立成 crate，不挂在 buffer 或 UI 上。
- `microsoft/vscode` `findWidgetSearchHistory.ts` / `replaceInput.ts`：查找与替换输入共享历史、选项状态与错误提示生命周期。

成熟共识：匹配是纯函数；选项是结构化状态；UI 只消费 match list；非法正则降级为可解释错误，不炸编辑器。

### 2.2 超长文档渲染

- `siyuan-note/siyuan` `virtualScroll.ts` / `groupTableVirtual.ts`：renderedStart/renderedEnd + 上下 spacer 高度 + 缓存行高；trim 前同步运行时选中状态，回填后恢复；边界进入时只回填边界窗口。
- `zed` `row_chunk.rs` 与 `vscode` `viewportRenderStrategy.ts` / `viewLineRenderer.ts`：渲染只处理可视窗口，文本索引与渲染索引分离。
- `facebook/lexical` FindReplace：offset map 把全局 offset 映射到节点局部位置，用二分查找，避免全量 DOM 扫描。

成熟共识：数据模型全量、DOM 窗口化；测量结果缓存；运行时状态（选区、高亮）在 trim/rebuild 前做快照恢复。

### 2.3 行内 Diff

- `zed` `agent_diff.rs`：diff pane 按 thread 归属，只展示 changed buffers 的 hunk；新增 excerpt 时自动选中最接近 hunk 的位置；hunk renderer 是可替换组件。
- `cline` `apps/cli/src/tui/utils/diff.ts`：LCS 行 diff、统一 hunk 头、上下文窗口（默认 3 行），纯函数可测。
- `continuedev/continue` `extensions/vscode/src/diff/vertical/decorations.ts`：added/removed 分两条 decoration 管理线；后续插入时对既有 range 做 shift；删除行用 ghost text 表示。

成熟共识：diff 是纯函数；展示是 hunk 生命周期；接受/回滚时必须重算后续 hunk 位置，不能沿用旧 range。

### 2.4 Trace / 模板对比

- `mlflow` `EvaluationRunHeaderCellRenderer.tsx` 等：比较视图以“运行列”为一等对象，模型/数据集标识常驻表头，支持复制运行、评估全部、隐藏运行。
- `langfuse`：trace 详情把 observation/tool 元数据徽标、参数结构、执行段落分层展示。
- `promptfoo` / `Aider`：评估与 diff 都围绕“首次分歧点”和结构化摘要，而不是让用户在全文里肉眼找差异。

成熟共识：对比先给结构摘要（次数、顺序、首分歧、版本指纹），再展开全文；全文导出与界面摘要分离。

### 2.5 多光标 / 块选择

- `zed` `columnar_selection.rs`：列选不是一堆 DOM range，而是把行列端点归一成列区间，再映射回 buffer point；边界处理显式处理隐藏行、折叠、超行尾。
- `vscode` `cursorColumnSelection.ts`：列选是 cursor core 的一部分。
- `kakoune` `selection.cc`：多选区是核心数据结构，所有编辑命令都作用在选区集合上。
- `lexical` FindReplace：全局 offset 与节点局部 offset 分离，选区恢复基于 offset map，而不是 DOM 节点引用。

成熟共识：多光标必须建立在“选区集合 + 稳定 offset 映射”上；textarea 原生单选区只能作为主光标载体。

## 3. 分方向方案

### F1. 查找替换面板增强（P0）

目标：双入口同一套 Search Model，支持大小写、正则、全词、替换预览与计数。

改造：

- 新增 `src/services/editorReplace.ts`：
  - `SearchOptions { caseSensitive, wholeWord, useRegex }`
  - `findMatches(content, query, options)`：字面量转义、正则异常返回 `{ matches, error }`、空匹配防死循环。
  - `buildReplacementPlan(content, query, replacement, options)`：返回每条匹配的 before/after/caret/冲突信息，不直接写 store。
  - `applyReplacementPlan()`：只消费 plan，保持锁定校验和 undo 单源。
- `editorSearch.ts` 的匹配计算改为消费该模型，避免第二套匹配逻辑。
- `EditorPanel.vue` 与 `OutlineWorkspace.vue` 只保留 UI 状态，替换执行统一走服务。
- 正则替换支持 `$1-$9`；默认仍是字面量，避免小说文本误替换。

边界：

- 非法正则：显示错误并保留当前匹配，不清空输入。
- 超大匹配数：匹配计算全量，但 UI 高亮只渲染当前视口窗口。
- 锁定状态：允许查找和预览，禁止执行替换。

验收：单测覆盖正则/大小写/全词/非法正则/空匹配/替换模板；双入口行为一致性测试；Electron 真实 UI 各 10 轮。

### F2. 超长文档性能层（P0）

目标：50 万字级文档滚动、定位、搜索高亮、API 写入跟随保持可用。

改造：

- 新增 `src/services/editorVirtualization.ts`：
  - 行索引：`LineIndex { offset, length, lineStart }`，一次性构建，增量维护。
  - 视窗计算：`computeRenderWindow({ scrollTop, clientHeight, lineHeight, bufferRatio })`。
  - offset 映射：`offsetToLine()` / `lineToOffset()` 用二分，不再全量 slice。
- `editorViewport.ts` 的 `measureOffset()` 改为基于行索引的局部测量，只把目标行附近文本写入 mirror。
- 渲染层采用“textarea 保持完整逻辑文档 + 视觉窗口层”：
  - textarea 负责输入、IME、选区、undo；
  - overlay 负责虚拟 spacer、可见行高亮和 diff hunk；
  - 不替换 textarea，避免破坏 API 直写、折叠、书签、选区恢复。
- 高亮、书签、折叠、diff 全部改为先查行索引再算矩形。

边界：

- 行高非恒定：按行缓存测量值，误差超阈值时局部重测。
- 极长行：单行内部继续用 range 测量，限制一次测量的字符量。
- 写入跟随：虚拟化后 `followWriteProgress()` 只测当前行。

验收：50 万字文档性能基准（滚动、跳转、搜索、写入跟随）；10 轮 Electron 长文档实测；现有折叠/书签/搜索/undo 回归全绿。

### F3. API 写入后的行内 Diff 视图（P0）

目标：每次 API 批次写入后，用户能看见改了什么、跳到每处改动、单命令回滚。

改造：

- 新增 `src/services/editorDiff hunks.ts`（实现时命名 `editorDiffHunks.ts`）：
  - `buildEditHunks(original, next, commandPlans)`：以 batch item 为单位生成 hunk，含 before/after/context。
  - `rebaseHunksAfterReject(hunks, rejectedIndexes)`：拒绝或回滚后重算位置。
- 新增 `src/components/editor/EditorDiffLayer.vue`：
  - added/removed 两套装饰状态；
  - hunk 列表与编辑器位置双向跳转；
  - 单 hunk 接受/回滚、整批回滚。
- 接入 `applyAcceptedItems()` 与 EditTask checkpoint：
  - 单命令回滚 = 以原 batch plan 重放 acceptedIndexes；
  - checkpoint 校验失败时禁止回滚并提示版本冲突。
- run trace 记录 `hunkCount/rejectedIndexes/rebaseEvents`，保持日志覆盖同步门禁。

边界：

- 后续 hunk 位置必须 rebase，不允许沿用旧 range。
- 删除命令用 ghost line 展示，不改变实际文档。
- 用户手动编辑后版本号变化，旧 hunk 标记为 stale 并禁止单命令回滚。

验收：单命令回滚 10 轮；整批回滚 10 轮；手动编辑后 stale 状态 10 轮；API 直写链路回归。

### F4. SKILL 调试对比增强（P1）

目标：SKILL 制作方能直接回答“模板改了以后，调用行为差在哪里”。

改造：

- `runTraceDiff.ts` 新增：
  - `TemplateVersionDiff`：skillVersion、folderFingerprint、模板内容 hash、参数快照；
  - `ToolSequenceDiff`：调用次数、顺序 key、参数结构指纹、首个不同调用、失败率；
  - `SkillDebugSummary`：把 overview/模板/工具序列/首个分叉/输出 diff 压成一屏摘要。
- `RunTraceDiffPanel.vue` 新增“模板版本”与“工具序列”两个对比区块。
- 导出保持“摘要 + 双方全文”结构，不截断。

边界：

- 序列对齐失败时显式标注 `alignment: fallback`，不伪造一致。
- 超长模板 diff 沿用现有 stats 模式，导出仍带全文。

验收：构造两次仅模板不同的 trace，序列 diff 能指出首个不同调用；导出 JSON 包含全文；面板渲染 10 轮无溢出。

### F5. 多光标 / 块选择（P1）

目标：先落地稳定的多选区模型，再逐步开放编辑命令。

阶段：

- F5-1 虚拟选区集合：
  - 新增 `src/services/editorSelectionModel.ts`，`SelectionSet { primary, cursors[], anchor/focus }`；
  - textarea 的原生 selection 永远是 primary，其余光标只在 overlay 显示；
  - 所有 offset 先经过行索引/虚拟化映射，禁止直接用 DOM range。
- F5-2 查找全部加入选区：`Find All Occurrences` 把全部匹配变成虚拟选区，这是风险最低、价值最高的入口。
- F5-3 块选择：参考 `zed` 的列区间归一化，先支持矩形选区显示与复制，再支持编辑。
- F5-4 多光标编辑命令：插入/删除/换行作用于选区集合；每批进入 undo 单事务；API 写入期间多光标降级为单主光标。

边界：

- IME 组合期间锁多光标编辑，结束后再应用。
- 折叠/虚拟化窗口外光标保持数据存在，但不渲染。
- API 写入与多光标编辑并发时，以 documentVersion 冲突检测为准，冲突则拒绝多光标命令并提示。

验收：Find All 选区 10 轮；多光标插入/删除 10 轮；折叠和长文档下映射 10 轮；API 写入并发冲突 10 轮。

## 4. 执行顺序与依赖

1. F1 查找替换：独立，先做；同时给 F5 的 Find All 打基础。
2. F2 虚拟化：F3/F5 都依赖行索引，第二个做。
3. F3 行内 Diff：消费 F2 的行映射，同时复用现有 batch/checkpoint。
4. F4 Trace 对比：纯数据与面板层，可与 F3 并行。
5. F5 多光标：最后做，且只开放已验证的命令集。

## 5. 验证方案（双并行）

每个方向必须同时满足：

1. 单测/服务测试：新增服务先 RED→GREEN，覆盖正例、反例、边界。
2. Electron 真实 UI 多轮实测：主流程 10 轮；涉及长文档/并发/API 的项 10 轮专项。
3. 全量回归：`npm run test:services`、`npm run type-check`、`npm run verify:production-wiring`、`npm run build:vue`。
4. 日志覆盖同步：runTrace/DiagLogger 增加对应事件，验证脚本断言覆盖。
5. 回头看：`rg` 检查旧实现是否清干净；双入口行为一致性对账；确认没有新旧并存。

## 6. 影响圈与风险

| 风险 | 控制 |
| --- | --- |
| 虚拟化破坏 textarea 输入/IME | 不替换 textarea，只做 overlay 与索引层 |
| diff 回滚破坏文档版本 | 复用 checkpoint 校验，版本不符禁止单命令回滚 |
| 正则替换误伤正文 | 默认字面量；正则需显式开启；预览先行 |
| 多光标破坏 API 直写 | API 写入期间降级单主光标；documentVersion 冲突拒绝 |
| 双入口行为分叉 | 查找替换/行索引/选区模型全部单源服务 |

## 7. 成熟度结论

- F1：成熟可执行。模式与边界均有直接源码证据，应用已有单源落点。
- F2：成熟可执行，风险最高。采用“不换编辑器底座、只加索引与视窗层”的保守路径。
- F3：成熟可执行。batch/checkpoint 已达标，补产品层即可。
- F4：成熟可执行。数据结构已存在，属于维度补齐。
- F5：分阶段成熟。F5-1/F5-2 成熟；F5-3/F5-4 依赖前四项验证后执行。

本方案未写业务代码，等待审核。
