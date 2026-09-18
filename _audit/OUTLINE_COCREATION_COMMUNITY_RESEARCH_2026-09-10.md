# 大纲工作台长文档共创社区调研报告

日期：2026-09-10  
调研目标：验证“索引层 + 检索层 + 上下文组装层 + 双向编辑层”四层假设，解决两个客户痛点：几十万字大纲的读取覆盖能力、API 对编辑器的可靠双向编辑能力。  
证据缓存：`_audit/research-cache/outline-co-creation-2026-09-10/`

## 结论摘要

1. 四层假设成立，但还不够。社区成熟系统普遍是“结构索引 + 固定核心上下文 + 按需检索 + 提案式写入”的组合；其中“固定核心上下文”和“提案蒸馏”是我们当前设计里最缺的两块。
2. 长文档读取没有一家采用“全量塞上下文”。PageIndex 用渐进式读取协议，Aider 用 repo map，Continue 用多路索引检索，NovelClaw 用类型化记忆库 + 固定注入，novel-studio 用 ContextPack。共同点是：模型先看结构和摘要，再按范围/检索取局部。
3. 双向编辑没有一家允许模型直写。Cline 是工具调用 + diff 审批，Aider 是 SEARCH/REPLACE + 失败反馈，jarvis-write 是“多轮研讨 → 蒸馏提案 → 用户确认 → 版本化落库”。我们已有 propose_edits 方向是对的，但缺蒸馏、影响分析、版本化确认链。
4. 我们的读取能力目前是“一次性硬截断 + 240 字预览”，与社区成熟方案差一个量级；大纲工作台的编辑器工具甚至没有传入 `getAllSnapshots`，导致跨目标读取工具实际不可用。
5. 建议优先级：先补结构化读取协议和工具可用性，再做上下文组装层，最后做提案式写入增强。向量库不是第一优先级；关键词/结构索引 + 固定核心块 + 按需读取可以零依赖落地。

## 调研方法

本次调研沿用 DEAI/Folder 协议调研的五轮法：

1. 候选池扩展：GitHub search 覆盖 `novel-writing-ai`、`long-context-rag`、`coding-agent`、`agent-editor`、`agent-memory`、`story-bible` 等方向，缓存原始搜索结果。
2. 浅读筛除：先看仓库元数据和 README，剔除与目标无关、无实质实现、纯营销型项目。
3. 真实源码取证：对入选项目拉取核心源码文件到本地缓存，逐行阅读，所有结论带 file:line 证据。
4. 对照本应用：核查 `conversationContextService.ts`、`editorTools.ts`、`OutlineWorkspace.vue`、`ChatPanel.vue`、`aiService.ts` 的现状。
5. 汇总归纳：按“索引/检索/组装/写入”四层对照差距，区分零依赖可等价实现项与需评估依赖项。

不采用“只看 README 就下结论”的调研方式。以下每个项目都有本地源码证据。

## 深读项目与证据

### 1. PageIndex（35.6k stars，vectorless 渐进读取基准）

核心文件：`pageindex-pageindex__agent_tools.py`

- 工具协议：`browse_documents → get_document → get_document_structure → get_page_content`，先浏览再取结构再取局部内容（`pageindex-pageindex__agent_tools.py:65-302`）。
- 强制先看结构：大文档必须先调 `get_document_structure()`，工具描述明确要求先取结构再选页（`:182-230`）。
- 引导式返回：每个工具返回都带 `next_steps`，失败也返回 error envelope，不抛异常打断 Agent（`:311-323`，`:1202-1256`）。
- 结构分块：结构树超过预算时自动切 chunk，`part` 参数用于迭代大结构（`:669-709`，`:953-1001`）。

对我们的直接启示：大纲工作台应有 `outline.get_structure`、`outline.read_range`、`outline.search`、`outline.get_summary` 这类渐进读取工具，而不是把 12,000 字硬截断文本塞进 system message。

### 2. Aider（48.8k stars，repo map + 精确编辑基准）

核心文件：`aider-repomap.py`、`aider-editblock_coder.py`

- RepoMap 是“结构索引”的经典实现：默认 1024 token 的结构地图，用 PageRank 给标签排序，按 token 预算二分生成树形地图（`aider-repomap.py:47-75`，`:103-155`，`:576-690`）。
- 上下文窗口预留 padding：`target = min(max_map_tokens * multiplier, max_context_window - 4096)`，避免结构地图挤爆上下文（`:120-132`）。
- 编辑协议是 SEARCH/REPLACE：精确匹配优先，其次空白容错，支持 `...` 省略匹配（`aider-editblock_coder.py:134-210`）。
- 失败反馈闭环：不静默失败，把失败块、相似行、“REPLACE 已存在”等诊断信息返回给模型，让模型只重发失败块（`:82-124`）。

对我们的直接启示：我们可以做“大纲地图”：卷/章/设定/伏笔/人物的结构化索引，每次对话注入的是索引和当前焦点全文，其余内容通过工具按范围读取。编辑失败时必须把候选位置返回给模型，而不是让用户重新猜。

### 3. Continue（35.8k stars，多路检索 + ContextProvider 基准）

核心文件：`continue-retrieval.ts`、`continue-CodebaseContextProvider.ts`

- ContextProvider 插件化：codebase、current file、diff、docs、file tree、open files、problems、repo map 等全部是独立 Provider（`continue-tree.json:3098-3385`）。
- 检索结果是“上下文项”而非纯文本：每项带名称、描述、行号区间、uri，方便 UI 呈现来源（`continue-retrieval.ts:99-128`）。
- 按上下文窗口动态计算召回数：`nFinal = min(25, contextLength / 512 / 2)`，有 reranker 时先召回 2 倍再精排（`:34-41`）。
- 检索为空时返回引导信息：“Agent 模式下没有检索结果，请尝试其他工具”，而不是让模型幻觉（`:80-96`）。

对我们的直接启示：我们的上下文不应只有一个 `[工作区上下文]` 大字符串，应拆成结构化上下文块（当前焦点、大纲地图、相关卷章、设定、记忆），并在气泡里展示“这次注入了什么、来源是什么”。

### 4. NovelClaw（写作域，367 stars）

核心文件：`novelclaw-apps__novelclaw__rag__memory_system.py`

- 16 个类型化记忆库：session_profile、story_premise、style_guide、entity_state、relationship_state、world_state、continuity_facts 等（`:15-32`）。
- 固定注入 + 检索注入混合：滚动摘要、最近 2 章摘要、最近 6 张事实卡片固定注入，保证关键信息不依赖检索；再叠加 top_k 检索（`:794-864`）。
- 组装有目标头：`=== CURRENT GOAL ===` 明确当前任务，再按 bank 组装并限制每 bank 条数（`:388-417`）。
- 向量可选：embedding 关闭后退化为词法检索 `_lexical_search`（`:285`，`:753-769`）。

对我们的直接启示：几十万字大纲不需要全部进上下文，但必须有“固定核心块”：作品 premise、当前卷/章焦点、关键人物状态、最近连续性事实。这些不能依赖关键词检索碰运气。

### 5. novel-studio-ai（写作域，技术栈与我们最近）

核心文件：`novsstudio-src__lib__context__contextPack.ts`、`novsstudio-src__lib__memory__memoryService.ts`

- ContextPack 结构化组装：storyBible、styleBible、volumeOutline、arcPack、chapterOutline、sceneBeats、最近 3 章摘要、上一章结尾摘录、活跃角色状态、图谱三元组、向量块、关键词块、时间线事件（`contextPack.ts:75-162`）。
- 活跃角色提取：先从 chapterOutline/sceneBeats 提取角色名，再查角色状态，避免全量角色表注入（`:106-107`）。
- 事实优先级数组：用户手动设定 > Story Bible > 已确认正文 > 角色状态 > 三元组 > 大纲 > 草稿（`:153-161`）。这解决的是冲突时的裁决规则，不只是召回。
- 章节接受门：high/critical 一致性问题未解决时禁止章节入库（`memoryService.ts:24-26`）。
- 接受后结构化抽取：新角色、场景、角色状态、实体、关系三元组、时间线事件、伏笔增删、文风样本（`:307-329`）。

对我们的直接启示：事实优先级是长篇共创的核心规则。几十万字大纲必然有旧版本、草稿、设定冲突，没有优先级声明，模型会在冲突信息里随机摇摆。

### 6. jarvis-write（写作域，一致性优先）

核心文件：`jarvis-backend__app__engines__outline_discuss.py`、`jarvis-backend__app__engines__cascade__impact.py`

- 两段式大纲研讨：① 带上下文续聊；② 独立蒸馏调用把对话提炼成结构化提案 `{new_title, new_summary, change_reason}`（`outline_discuss.py:3-9`，`:57-95`）。
- 提案不直接落库：前端确认后才走 apply 链路，版本化并标失配（`:8-9`）。
- 蒸馏失败不阻塞对话：proposal 置空并记录 warning（`:94-95`）。
- 影响分析只分析不执行：LLM 判断第 K 章改动波及哪些后续章，结果给用户决策；`_MAX_DOWNSTREAM=30` 防 prompt 膨胀，只认给过 LLM 的章号防幻觉（`impact.py:22`，`:50-89`）。

对我们的直接启示：客户“聊完后不知道插入点在哪”的问题，社区解法不是让模型直接写，而是把多轮讨论蒸馏成一个明确提案，用户一键确认后应用。

### 7. Cline（67.7k stars，Agent 编辑器基准）

核心文件：`cline-shared-tools.ts`、`cline-tool-definitions.ts`

- 完整工具面：ask、attempt、bash、replace_in_file、read_file、write_to_file、search、list_files、apply_patch、editor、todo、condense 等（`cline-shared-tools.ts:10-32`）。
- `read_files` 支持行范围分页：每次最多固定行数/字符数，长文件报告总行数并提示用 `start_line/end_line` 分页（`cline-tool-definitions.ts:271-282`）。
- 并行工具调用指引：明确鼓励同一响应里并行读多个文件、并行执行独立工具（`:272-278`，`:369-378`）。
- 编辑工具有两种：小而精确的 `editor`（old_text/new_text + insert_line）和多文件 `apply_patch`（`:586-709`）。
- 编辑不可自动重试：`retryable: false`，防止状态化编辑重复应用（`:693-696`）。

对我们的直接启示：我们的大纲工作台现在只有单目标工具；Cline 证明成熟做法是“结构/搜索/读取/编辑”一组工具配合，且读取必须支持范围分页。

## 本应用现状对照

### 读取层：一次性硬截断

- `MAX_OUTLINE_CHARS = 12000`（`src/services/conversationContextService.ts:55`）。
- `contextMessage()` 直接 `clip(outline, 12000)` 注入（`:167-185`）。
- `buildContextBundle()` 在存储层就先截断一次（`:275-299`）。
- `editor.get_state` 只返回 240 字预览（`src/services/editorTools.ts:119-144`）。
- `editor.multi_get_state` 和 `editor.global_search` 需要传入 `getAllSnapshots` 才可用（`:325-390`）。
- 大纲工作台 `askPlainAi` 路径创建工具时没有传 `getAllSnapshots`，所以跨目标读取工具实际不可用（`src/components/common/OutlineWorkspace.vue:2051-2060`）。

结论：几十万字大纲在当前链路里最多只有开头 12,000 字进入模型上下文，其余内容既不能索引浏览，也不能按范围读取。这是客户“问几次才能找到准确信息”的直接根因之一。

### 组装层：单一大字符串

当前是 `[工作区上下文]` 一个 system message，包含截断后的大纲、设定 JSON、记忆、选中文本（`conversationContextService.ts:167-185`）。没有结构索引、没有事实优先级、没有焦点章节全量、没有检索结果来源标记。

### 写入层：有提案雏形，缺完整链路

- `editor.propose_edits` 已存在且只进暂存区，不直写编辑器（`editorTools.ts:236-254`）。
- 主页编辑器传入 `getAllSnapshots`，支持多目标读取（`src/components/chat/ChatPanel.vue:1900-1915`）。
- 兼容模式：供应商不支持原生工具时降级 JSON 协议（`src/services/aiService.ts:815-845`）。
- 大纲工作台能从 toolCalls/兼容文本里提取编辑批次（`OutlineWorkspace.vue:643-647`，`:2115-2123`）。

缺口：没有“讨论 → 蒸馏提案”层；没有影响分析；提案确认后的版本化与失败回滚链路不完整；工具描述没有把“你能读哪里、怎么读、怎么写”讲清楚，导致模型经常不知道自己有编辑能力。

### 工具链路：SKILL chain 路径与 plain 路径能力不一致

大纲工作台 SKILL chain 路径关闭 outline/settings/memory 注入，plain 路径注入工具。也就是说，同一个工作台里，加载 SKILL 与否会改变模型对编辑器的感知能力。这解释了客户反馈里“有时能写、有时完全不知道插入点”的不稳定现象。

## 四层架构修正版

基于社区证据，原四层假设修正为六层：

1. **结构索引层**：大纲地图（卷/章/设定/人物/伏笔/时间线），类似 Aider RepoMap。零依赖可实现。
2. **渐进读取层**：`get_structure / read_range / search / get_summary` 工具组，类似 PageIndex。零依赖可实现。
3. **固定核心上下文层**：premise、当前焦点全文、活跃人物状态、连续性事实，类似 NovelClaw。零依赖可实现。
4. **检索层**：关键词/词法检索优先，向量作为可选增强，类似 Continue/NovelClaw 的混合策略。
5. **上下文组装层**：结构化 ContextPack + 事实优先级声明 + 来源标记，类似 novel-studio。
6. **提案式写入层**：讨论 → 蒸馏提案 → 影响分析 → 用户确认 → 版本化应用 → 失败反馈，类似 jarvis-write + Aider。

## 优先级建议

### P0：读取基础设施（收益最大、零依赖）

1. 大纲结构索引：解析标题层级生成大纲地图，每次注入地图 + 当前焦点全文。
2. 大纲工作台补齐 `getAllSnapshots`，让 `multi_get_state` 和 `global_search` 真正可用。
3. 新增 `outline.get_structure`、`outline.read_range`、`outline.get_summary` 工具，替代“12,000 字截断即全部”的模式。
4. 统一 plain 路径与 SKILL chain 路径的工具注入策略。

### P1：上下文组装升级（零依赖）

1. 把 `[工作区上下文]` 拆成结构化块：当前焦点、大纲地图、相关卷章、设定、记忆。
2. 引入事实优先级：用户当前指令 > 锁定设定 > 已确认正文 > 卷纲/章节 > 草稿。
3. 上下文项带来源和版本，气泡里可见“本次注入了哪些块”。

### P2：提案式写入闭环

1. 增加讨论蒸馏：多轮对话后生成结构化编辑提案（目标位置、理由、影响范围）。
2. 增加影响分析：提案确认前分析对后续卷/章的影响，只分析不自动执行。
3. 编辑失败返回候选位置和诊断，让模型自行修正提案，而不是静默失败。

### P3：可选增强

1. 向量检索（需评估依赖）：在词法检索召回不足时增强，不作为第一版阻塞项。
2. 长期记忆抽取（类似 novel-studio acceptance gate）：章节确认后抽取人物状态、关系、伏笔、时间线。

## 风险边界

- 不做模型直写编辑器：所有社区基准都是提案 + 确认，这条安全边界应保留。
- 不用“压缩”替代“读取”：用户的小说上下文是生产资料，不是成本负担；正确方向是按需读取，不是粗暴摘要压缩。
- 兼容模式要保留：第三方供应商不支持原生工具时，JSON 协议降级仍需可用，但要在 UI 明示。
- 结构索引要处理用户格式随意的问题：不能假设所有用户都写标准 Markdown 标题，需要兜底解析。
- SKILL/Folder 协议不能被破坏：工具注入和上下文组装必须与现有 chain 模式兼容。

## 最终判断

客户的两个痛点都是真实的产品级缺陷，不是模型能力问题。读取侧的问题是“没有索引和渐进读取基础设施”，写入侧的问题是“有提案工具但没有蒸馏、影响分析和确认闭环”。社区成熟方案给出的路径非常一致：结构地图 + 固定核心块 + 按需读取 + 提案式写入。我们可以在不引入重型依赖的前提下，先完成 P0/P1 的零依赖改造，再评估 P2/P3。
