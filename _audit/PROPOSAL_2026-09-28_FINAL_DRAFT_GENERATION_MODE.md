# 终稿生成模式方案（Final Draft Generation Mode）

日期：2026-09-28  
版本基线：3.69.0  
状态：待用户审核，未动生产代码

## 1. 目标

把“全文整理 / 全文重排 / 全文重写 / 统一格式 / 清理重复”从精确编辑系统里拆出来，变成一条专门的**终稿生成通道**：

1. API 对话框只负责讨论与发起任务，不在对话气泡里输出整篇终稿。
2. 模型按终稿要求直接生成完整文章，**写入编辑器**。
3. 输出超过模型单次上限时自动停止，出现“继续生成”，可反复续写直到自然结束。
4. 不设应用侧 token 预算、输出上限、轮次上限；唯一边界是供应商模型本身的上下文与单次输出能力。
5. 主页编辑器与大纲工作台共用同一套终稿通道，不复制两份逻辑。
6. 保留现有 EditTask 精确编辑能力，用于局部修改、删除、移动、小范围重写。

## 2. 现状与根因

当前代码把终稿型任务误判为“编辑任务”：

- [longDocumentPolicy.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentPolicy.ts) 把 `whole-document-restructure / replacement / large-scope-edit` 识别为长文档编辑。
- [longDocumentExecutionPlanner.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentExecutionPlanner.ts) 对这些操作固定生成 `edit-task` 模式。
- [longDocumentWriteProtocol.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentWriteProtocol.ts) 把重排限制为单条 `reorder_sections`，把整理/重写限制为分段 `replace_match / rewrite`。

结果：用户要的是“像网页端 AI 一样直接重出整篇终稿”，应用却要求模型提交大量精确编辑命令。命令越多，失败面越大，于是出现 tool-loop、半应用状态、等待过久和“看似完成但全文没变”。

已存在的可复用能力：

- `aiService` 已透传流式文本、`finish_reason`、usage、物理请求事件。
- `continuation / continuationService / continuationStorage` 已有续生成状态机、接缝合并、持久化。
- `ChatPanel.vue` 与 `OutlineWorkspace.vue` 已有续生成按钮与恢复链路。
- `editTaskService / editorTools` 已有 `documentVersion + contentHash` checkpoint、批次回滚、undo 联动。

因此本方案不新建生成引擎，而是把现有“生成 + 续生成”接到一个受控的“编辑器终稿写入层”。

## 3. 任务分轨规则

### 3.1 终稿生成模式（Final Draft）

触发语意：对全文或大范围内容“重新产出完整成品”。

进入终稿模式的示例：

- 把全文按 Word 文档格式重新整理。
- 全文重新排序 / 重新整理排序。
- 全文统一标点、统一格式、统一编号。
- 删除全文重复项并输出干净终稿。
- 全文重写、整篇重写、全文替换。

分轨依据：任务对象是“成品文档”，而不是“某个位置上的精确差异”。

### 3.2 精确编辑模式（EditTask 保留）

触发语意：对明确位置做局部变更。

保留现有链路的示例：

- 修改第 3 节第 2 段这句话。
- 删除“沈萤”第一次出现的段落。
- 把第 5 章移动到第 2 章后面。
- 润色选区。
- 插入一段设定。

### 3.3 混合请求

请求同时包含终稿与局部编辑时，按主目标分轨：

- “全文重排，并把主角名改成李明” → 终稿模式，重排要求写进终稿指令，改名属于终稿内容的一部分。
- “帮我看看第 4 章哪里有问题，然后修掉” → 讨论后进入精确编辑。
- “全文整理，但不要动第 1 章” → 终稿模式 + 保护范围约束；保护范围写入终稿指令，不做工具级禁写。

### 3.4 边界样例表

| 用户输入 | 路由 | 理由 |
| --- | --- | --- |
| 整理全文标点 | final_draft | 全文成品 |
| 全文重排并清理重复 | final_draft | 全文成品 |
| 重写全文 | final_draft | 全文成品 |
| 修改第 2 卷标题 | edit_task | 精确位置 |
| 删除这句话 | edit_task | 精确目标 |
| 帮我看看结构哪里不顺 | discuss | 无写入意图 |
| 全文整理但保留第 1 章 | final_draft + protected_range | 主目标是全文成品 |

## 4. 架构设计

### 4.1 新增服务：`finalDraftService`

新增 [finalDraftService.ts](/D:/codex/novel-workshop-vue3/src/services/finalDraftService.ts)：

```ts
export type FinalDraftDestination = 'home-editor' | 'outline-editor'

export interface FinalDraftTaskState {
  taskId: string
  destination: FinalDraftDestination
  sourceContent: string
  sourceContentHash: string
  instruction: string
  constraints: string[]
  protectedRanges: Array<{ start: number; end: number; reason: string }>
  accumulatedText: string
  continuationCount: number
  status: 'planning' | 'generating' | 'awaiting_continuation' | 'writing' | 'completed' | 'failed' | 'rolled_back'
  finishReason?: string
  documentVersionBeforeWrite?: number
  createdAt: number
  updatedAt: number
}
```

职责：

1. 建立终稿任务状态，创建写入前快照。
2. 组装终稿生成 prompt。
3. 调用现有 `callAi` / `callAiWithoutTools`，要求纯正文输出。
4. 复用 continuation 逻辑处理 `finish_reason=length`。
5. 完成后执行完整性校验。
6. 校验通过后一次性写入目标编辑器。
7. 写入失败或校验失败时回滚到快照。

不做的事：

- 不做 staging 预览。
- 不做用户确认弹窗。
- 不做应用侧 token/次数/时间预算。
- 不让模型在终稿轮使用写入工具，避免工具循环。

### 4.2 生成请求形态

终稿轮使用无工具或只读工具的生成请求：

```ts
const request = {
  messages: [
    { role: 'system', content: FINAL_DRAFT_SYSTEM_PROMPT },
    { role: 'user', content: buildFinalDraftUserPrompt({ sourceContent, instruction, constraints, protectedRanges }) }
  ],
  stream: true,
  tools: [], // 终稿轮禁止写工具
  suppressToolProtocolStream: true
}
```

系统提示核心规则：

1. 输出完整终稿正文，不输出说明、计划、JSON、工具调用。
2. 保留原文有效内容与结构信息，执行用户指定的整理/重排/重写要求。
3. 不添加“以下是整理后的文章”之类的开场白。
4. 如受单次输出限制截断，在截断处停止，不总结、不收尾。
5. 遵守保护范围约束。

### 4.3 续生成

复用现有 continuation 基础，但目标从“聊天气泡续写”改为“终稿缓冲区续写”：

1. `finish_reason=length` → 任务进入 `awaiting_continuation`，UI 显示“继续生成终稿”。
2. 点击后用 `buildContinuationMessages` 类似机制继续，从已生成文本尾部取重叠上下文。
3. 使用 `mergeContinuationText` 去重接缝，禁止重复拼接。
4. 每轮续写继续写任务缓冲区，不写编辑器。
5. `finish_reason=stop` → 进入完整性校验与写入阶段。
6. 不限制续写次数；取消按钮始终可用。

### 4.4 写入编辑器

写入发生在终稿完成之后，而不是生成过程中：

1. 写入前记录 `documentVersionBeforeWrite`、源内容 hash。
2. 一次性替换目标编辑器全文。
3. 写入后写入 undo 栈，用户可用现有撤销回退。
4. 写入成功后编辑器滚动到文档顶部，展示变更摘要：原字数、终稿字数、变更类型。
5. 失败时恢复源内容，任务标记 `rolled_back`，对话区显示失败原因。

### 4.5 完整性校验

写入前的守卫，只拦截明显异常，不拦截合理重写：

必过条件：

1. 终稿非空。
2. `finish_reason=stop` 或用户明确选择接受当前截断稿。
3. 接缝无重复：续写合并后不得出现大段重复。
4. 无工具协议残留、无 JSON 围栏、无“我无法”类拒绝文本。

警告但不阻断：

1. 长度比例显著变化（重写任务允许）。
2. 章节标题集合变化（重排/整理允许）。
3. 词汇分布变化。

任何校验失败都不写入，任务回滚并显示具体失败项。

### 4.6 双入口统一

`ChatPanel.vue` 与 `OutlineWorkspace.vue` 都只做两件事：

1. 把目标编辑器的读写适配器传给 `finalDraftService`。
2. 渲染终稿任务状态与续生成按钮。

编辑器差异（tab 内容、outline store、selection API）封装在各自 adapter 中，核心逻辑不复制。

## 5. 与现有系统的关系

### 5.1 意图路由

新增意图：`final_draft`。

路由层新增终稿分类器，输入包含：

1. 请求文本。
2. 当前文档长度。
3. 是否已有活动终稿任务。
4. 用户是否在续生成语境中。

路由优先级：

1. 活动终稿任务的续生成指令优先。
2. 明确全文成品请求 → `final_draft`。
3. 明确位置/片段请求 → `edit_task`。
4. 讨论请求 → `discuss`。

### 5.2 长文档策略

修改 [longDocumentPolicy.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentPolicy.ts)：

1. `whole-document-restructure / whole-document-replacement / large-scope-edit` 不再默认进 EditTask。
2. 新增输出 `finalDraftCandidate: boolean`。
3. EditTask 只保留 `targeted-edit` 与用户明确要求命令式编辑的场景。

修改 [longDocumentExecutionPlanner.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentExecutionPlanner.ts)：

1. 终稿型操作不再生成分段 `replace_match` 计划。
2. 生成 `final-draft` 计划：源文档、指令、保护范围、续生成预估。

修改 [longDocumentWriteProtocol.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentWriteProtocol.ts)：

1. EditTask 内的“禁止整篇 replace_document”规则保留。
2. 新增终稿模式说明：终稿写入由应用执行，不由模型提交编辑命令。

### 5.3 Agent Orchestrator

终稿任务是生成型任务，不进入多工具 Agent 循环：

1. `final_draft` 意图命中后直接进终稿通道。
2. 终稿轮不暴露 `editor.write`，避免模型误走旧路。
3. 终稿完成后的后续局部修改恢复正常工具面。

### 5.4 Run Trace

终稿任务全程记录：

1. 任务创建、路由判定、分轨理由。
2. 每次物理请求、流式文本累计、finish_reason、usage。
3. 续生成次数、接缝去重结果。
4. 完整性校验结果。
5. 写入前快照、写入结果、回滚事件。

对话框 UI 只显示进度与结果，不显示工具调用细节。

## 6. 去旧清单（防新旧并存）

| 位置 | 旧行为 | 新行为 |
| --- | --- | --- |
| longDocumentPolicy | 全文任务 → EditTask | 全文任务 → finalDraftCandidate |
| longDocumentExecutionPlanner | 终稿型生成分段编辑计划 | 生成终稿生成计划 |
| longDocumentWriteProtocol | 全文整理要求分段命令 | 终稿模式不提交编辑命令 |
| ChatPanel / OutlineWorkspace | 续生成只更新聊天气泡 | 终稿任务续写进终稿缓冲区 |
| 意图路由 | 全文整理落入 edit/generate 混合语义 | 独立 final_draft 意图 |

保留不动：

1. 局部编辑的 EditTask 全链路。
2. 普通聊天续生成。
3. SKILL / folder 生成流水线。

## 7. 正推

用户输入“全文整理并按 Word 格式重排”：

1. 意图路由识别 `final_draft`。
2. 创建终稿任务，快照当前全文。
3. 模型流式生成终稿，对话框显示生成进度。
4. 输出被 `length` 截断，任务停在 `awaiting_continuation`。
5. 用户点“继续生成”，模型接着输出。
6. `finish_reason=stop`，完整性校验通过。
7. 一次性写入编辑器，undo 栈可回退。
8. 对话框显示完成摘要，trace 记录全过程。

预期收益：

1. 消除全文任务的多命令失败面。
2. 长文重排不再依赖几十条精确编辑命令。
3. 续生成自然适配模型上限。
4. 用户感知与网页端 AI 长文体验一致。

## 8. 反推

### 8.1 会不会破坏局部编辑？

不会。EditTask 只收窄到 `targeted-edit`，现有局部修改、删除、移动、批次回滚不变，并有专项回归测试。

### 8.2 会不会造成不可逆丢失？

不会。写入前有快照与 undo；校验失败、写入失败、用户取消都可回滚。

### 8.3 会不会让模型偷懒输出摘要？

用系统提示与完整性校验拦截：空稿、摘要化短稿中的明确拒绝文本、未完成标记都会阻断写入。

### 8.4 超过模型上下文怎么办？

输入侧：文档超过模型窗口时，提前提示并按结构分批生成终稿，每批仍走续生成合并。
输出侧：单次输出上限由续生成消化。

### 8.5 会不会出现新旧并存？

用去旧清单逐项收口，并在 M17 回头看中对 `longDocumentPolicy / planner / writeProtocol / 意图路由 / 双入口` 全仓 `rg` 对账，旧路径命中必须区分为“已删除”或“仍在执行”。

## 9. 爆炸半径矩阵

| 模块 | 改动 | 风险 | 防护 |
| --- | --- | --- | --- |
| 意图路由 | 新增 final_draft | 误路由 | 正负样本回归 |
| longDocumentPolicy | 全文任务改道 | 局部编辑误伤 | targeted-edit 专项测试 |
| finalDraftService | 新服务 | 写入失败 | 快照回滚 |
| 双入口 UI | 新任务状态 | 双入口分叉 | 共享状态映射 |
| continuation | 目标切换 | 普通聊天续写回归 | 旧链路保留测试 |
| runTrace | 新事件 | trace 断层 | 字段契约测试 |

## 10. 实施阶段

### Phase 1：路由与策略收口

1. 意图层新增 `final_draft` 分类。
2. `longDocumentPolicy` 输出 `finalDraftCandidate`。
3. planner 对终稿型任务生成 `final-draft` 计划。
4. 单测覆盖分轨边界样例表。

### Phase 2：终稿服务

1. 实现 `finalDraftService` 状态机。
2. 接入生成请求、续生成、接缝合并。
3. 实现完整性校验与快照回滚。
4. 单测覆盖成功、截断续写、校验失败、写入失败、用户取消。

### Phase 3：双入口接线

1. ChatPanel 接入 home editor adapter。
2. OutlineWorkspace 接入 outline editor adapter。
3. UI 显示生成进度、续生成按钮、完成摘要。
4. 工具调用细节只进 trace，不进气泡。

### Phase 4：trace 与观测

1. 新增终稿任务事件。
2. 记录路由、请求、续写、校验、写入、回滚。
3. 保证导出的 deep trace 可复盘全链路。

### Phase 5：验证

1. 单测与定向回归。
2. 双入口 Electron 真实 UI 测试，必须使用可见窗口。
3. **真实供应商 API 长文测试：100k / 200k / 1M 字符档**。
4. 用户可见窗口实测。
5. 真实长文重排 / 重构必须等待模型真实完成，不设催促式短超时。

Phase 5 硬性验收规则：

1. **最终验收禁止用 mock、离线回放或历史 trace 冒充真实 API**。mock 只能用于失败路径单测，不得写入最终验收结论。
2. **所有真实 API 验证必须走真实供应商请求**，记录每次物理请求、finish_reason、usage 与耗时。
3. **Electron 验证脚本步进超时不得低于 30 分钟（1,800,000 ms）**，且必须可用环境变量继续调高；长文 1M 档默认按真实耗时等待。
4. **长文重排 / 重构不允许因为“跑得久”而中断判定失败**。超时先判脚本口径，再判应用卡死。
5. **验证报告必须区分“等待中”和“失败”**。模型仍在流式输出时，状态只能是等待中，禁止标红失败。
6. **用户可见窗口验证**：PID、窗口标题、每轮请求与结果必须落盘，用户可在桌面亲眼看到运行。
7. 真实 API 验证未全部通过前，本方案不得声明“已验证成熟”，也不得封装交付。

### Phase 6：收尾

1. M17 回头看。
2. 经验文件与 DEV_LOG 更新。
3. 版本升级与封装。

## 11. 验证矩阵

| 验证项 | 方式 | 通过标准 |
| --- | --- | --- |
| 分轨准确性 | 单测 + 正负样本 | 边界样例表全对 |
| 终稿生成 | 单测 + Electron | 完整正文写入编辑器 |
| 续生成 | 单测 + Electron | 无重复接缝，可多轮续写 |
| 截断停止 | mock finish_reason=length | 显示继续按钮，不写半稿 |
| 校验失败 | 单测 | 不写入，可回滚 |
| 写入失败 | 单测 + Electron | 恢复原内容 |
| 局部编辑回归 | 全量测试 | 现有 EditTask 用例不退化 |
| 双入口一致性 | Electron | 两入口行为一致 |
| 长文真实 API | 100k/200k/1M 真实供应商请求 | 全流程 success；等待真实完成，禁止短超时判失败 |
| trace 完整性 | deep trace 检查 | 每阶段有事件与字段 |
| 长文耗时 | 真实 API 计时 | 步进超时 >= 30 分钟，可环境变量覆盖 |
| mock 边界 | 验收报告审查 | mock 仅限失败路径单测，最终验收零 mock |

## 12. 门禁对照

- M12：已做正推、反推、爆炸半径矩阵。
- M17：执行完成后必须回头看，含全仓调用点与新旧并存扫描。
- M18：本方案成熟度见第 14 节。
- M40：终稿写入必须 Electron 级真实 UI 验证。
- M73：用户可见 Electron 验证，登记 PID 与窗口标题。
- M78：真实 API / Electron 长文复刻步进超时不得低于 30 分钟，超时先判脚本口径。
- M79：EditTask 的 `reorder_sections` 原子协议保留，终稿通道不得破坏该协议。

## 13. 风险清单

1. 供应商不返回准确 `finish_reason`：靠 usage 与截断启发式兜底，trace 记录判定依据。
2. 模型输出摘要而非全文：完整性校验阻断，提供重试。
3. 超上下文文档：结构分批生成，每批终稿合并。
4. 双入口行为分叉：共享 `finalDraftService`，UI 只做渲染。
5. 用户误触终稿任务：取消即回滚，写入后 undo 可退。

## 14. 方案成熟度

**方案成熟度：半成熟。**

理由：

1. 架构设计已锚定真实代码链路：路由、生成、续生成、快照回滚、双入口均有现存实现可复用。
2. 分轨规则、去旧清单、验证矩阵已完成正反推。
3. 断点：尚未获得用户审核确认；实现与 Electron / 真实 API 验证未开始。

放行条件：

1. 用户确认本方案。
2. 按 Phase 1-6 顺序执行。
3. 每阶段完成后再进入下一阶段，验证不过不推进。
