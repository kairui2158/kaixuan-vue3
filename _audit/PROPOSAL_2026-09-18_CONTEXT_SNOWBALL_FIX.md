# 大纲工作台上下文滚雪球修复方案（V2 深挖版）

> 日期：2026-09-18  
> 状态：待用户审核，未进入执行阶段  
> 证据基准：`run-trace-outline-20260918-051616-deep`、本地源码全链路复读、Roo Code / Cline 社区源码二次深挖  
> 方案成熟度：成熟（四层结论见文末；证据来自真实 trace 与生产源码，社区结论均有源码文件支撑）

## 一、结论先行

这次 trace 暴露的不是“大纲 API 真把 7 倍重复上下文发给模型”，而是两个叠在一起的问题：

1. **P0 观测层污染（真实缺陷）**：`apiCalls[0].requestMessages` 显示 221 条 / 686,282 字符，其中包含 7 个完整的 23 条消息快照。但 12 个物理请求分别是 23→42 条、89,461→105,517 字符，属于正常的工具循环追加。污染源头是 `aiService.ts:1534` 把每轮完整 `messages` 快照累加进 `allToolRequests`，随后 `realSkillExecutor.ts:764` 又把这份膨胀数组追加进已经捕获的初始 23 条请求，最终 `payload-001` 变成 221 条。
2. **P1 真实上下文成本（长期风险）**：每轮逻辑输入约 50K-57K token，来源是 `recentTurns: 10`、`DEFAULT_SKILL_HISTORY_TURNS = 10`，以及每轮重复携带的 ContextPack（大纲结构图、selection、memory 等）。物理请求没有 7 倍重复，但长会话下成本和注意力稀释是真实的。

## 二、根因链路（已闭合）

```text
aiService.callAiWithTools
  └─ 每轮 allToolRequests.push(...messages.map(...))          # aiService.ts:1534，观测层放大源头
     └─ return toolRequests: allToolRequests                   # 7 份完整快照拼接
realSkillExecutor
  ├─ buildRequest() 首次执行时 captureRequestMessages(messages) # 正常 23 条
  ├─ captureRequestMessages(result.toolRequests)                # realSkillExecutor.ts:764，二次追加 198 条
  └─ apiMeta.requestMessages = capturedRequestMessages          # 221 条
workspaceSkillEngine.callWorkspaceSkill
  └─ lastRunMeta.requestMessages = folderResult.apiMeta.requestMessages
OutlineWorkspace.onApiCallFinish
  └─ runTraceStore.setApiCallRequest(...)                       # 污染写入 run
electron/ipc/runTrace.js
  └─ collectPayloads() -> payloads/001-request.json             # 导出器如实复制污染
```

物理请求记录链路本身是健康的：`onPhysicalCall -> appendPhysicalCall` 每轮只写当前请求，`buildToolResultChatMessages` 在 OpenAI/Anthropic/Gemini 三协议上都是复制后追加，没有把旧轮结果重复拼接。

## 三、社区调研结论

### Roo Code

- `context-management/index.ts`：不删除历史，而是给旧消息打 `truncationParent` 标记，发送 API 前用 `getEffectiveApiHistory()` 过滤，原文保留在磁盘，可回滚、可恢复。
- `condense/index.ts`：摘要失败不阻断任务，回退到滑动窗口截断；对没有 tool_result 的 tool_call 注入合成结果，避免 provider 拒绝。
- `api/providers/openai-native.ts`：Responses API 把 system prompt 放顶层 `instructions`，不作为消息数组重复传输。

### Cline

`sdk/packages/core/src/extensions/context/compaction-shared.ts` 的关键参数与防线：

- `CONTEXT_WINDOW_INPUT_RATIO = 0.9`，`COMPACTION_TRIGGER_RATIO = 0.9`：占可用输入预算 90% 才压缩。
- `DEFAULT_PRESERVE_RECENT_TOKENS = 20_000`：保留最近上下文原文。
- `DEFAULT_TARGET_RATIO = 0.7`：压缩后目标降到 70%。
- `findCutIndex()` 只在安全边界切分：assistant 消息或用户真实输入。`tool_result`-only 消息永远不能作为切割边界，否则会孤立 tool_use。
- `TOOL_RESULT_CHAR_LIMIT = 2_000`：工具结果进入摘要前先截断。
- 摘要模型关闭 thinking，输出预算 8192，避免 reasoning 吃掉摘要正文导致压缩被跳过。

### 结论

成熟系统没有一家靠“减少轮次”或“砍工具”解决问题；它们的共同结构是：非破坏性标记、输入占比触发、安全切割边界、工具结果限长、摘要失败降级。我们的 P0 是观测语义错误，必须先修；P1 吸收这套结构，但不引入 Cline/Roo 的完整复杂度。

### 第二轮深挖补充

这轮不是复核结论，而是继续下钻 Roo 与 Cline 的实现细节。发现 V1 方案仍有 5 个缺口，已全部吸收进 Phase 2：

1. **Roo 的边界标记**：`truncateConversation()` 不只给旧消息打 `truncationParent`，还在切割边界插入一条 `isTruncationMarker` 的 user 消息，说明隐藏了多少条；rewind 可按 `truncationId` 恢复。V1 只有标记，没有 marker。
2. **Roo 的输入预算公式**：`allowedTokens = contextWindow * (1 - TOKEN_BUFFER_PERCENTAGE) - reservedTokens`，`reservedTokens` 是输出 token。触发压缩时必须给输出留座位，不能只看输入占比。
3. **Cline 的保护尾部**：`buildBudgetProjection()` 用 `findProtectedTailStartIndex()` 找到最后一个尚未有 `tool_result` 的 `tool_use`，从那里开始整个尾部禁止删除；同时永远保护最近一条真实用户输入，且不会把 tool_result-only 的 user 消息误判成用户输入。
4. **Cline 的工具配对闭包**：`collectMessageClosure()` 通过 tool id 建立配对索引，删除任何消息必须连同配对消息一起处理，否则产生孤儿 tool_call。V1 只在切割边界提了这件事，没有把它提升为压缩器通用不变量。
5. **Cline 的摘要器自身预算**：`runAgenticCompaction()` 生成摘要前先算 summarizer 可用输入预算，预算不足直接跳过并记录诊断，而不是硬把残缺上下文摘成错误结论；同时复用上一次 summary，只折叠新增消息。

## 四、修复设计

### Phase 1（P0）：修正 toolRequests 语义

目标：`apiMeta.requestMessages` 表示“本逻辑调用的初始请求”，工具轮次的真实请求由 `physicalCalls` 记录。

1. `aiService.ts`
   - 把 `allToolRequests` 从“N 轮完整快照拼接”改为“每轮只记录本轮新增消息”：第 1 轮记录初始 `messages`；后续每轮在 `buildToolResultChatMessages()` 返回后，只追加本轮新增的 assistant tool_calls 与 tool 结果消息。
   - 返回值中的字段更名为 `toolRequestDeltas`，并在类型中明确注释：这是增量记录，完整请求看 `onPhysicalCall`。
2. `realSkillExecutor.ts`
   - 删除 `captureRequestMessages(result.toolRequests)` 这条二次追加路径。
   - `apiMeta.toolRequests` 改为 `apiMeta.toolRequestDeltas`，不再混入 `requestMessages`。
3. `workspaceSkillEngine.ts` / `chat.ts` / `PipelinePanel.vue`
   - 同步字段改名，`lastRunMeta.toolRequests` 改为 `toolRequestDeltas`。
   - `apiMeta.requestMessages` 保持初始请求语义，不再被工具轮污染。
4. runTrace
   - `schemaVersion` 升级，新增 `toolRequestDeltas` 外置 payload 支持；`collectPayloads()`、`replacePayloadFields()`、导出预览同步注册。
   - 旧 trace 不迁移，读取层按 `toolRequests ?? toolRequestDeltas` 兼容。

### Phase 2（P1）：非破坏性上下文治理

目标：长会话不再线性携带全部 10 轮 + 全量 ContextPack，同时不丢用户可回滚原文。

1. **非破坏性标记 + 边界 marker**：session message 增加 `compactionParent` 与 `compactionId`；`assembleMessages()` 过滤已标记消息，并在切割边界插入 marker 消息，说明折叠条数与 summary ID。原文永不删除，支持 rewind。
2. **触发条件预留输出预算**：`allowedInputTokens = modelContextWindow * 0.9 - reservedOutputTokens`。窗口来自模型元数据/供应商声明，不设应用侧固定上限；输出预留来自本次生成配置。无元数据时用保守字符比例估算并写诊断。
3. **保护尾部精确定义**：最近一条真实用户输入必须保留；从最后一个未完成 `tool_use` 开始的整个尾部必须保留；禁止把 tool_result-only 的 user 消息误判为用户输入。
4. **工具配对闭包不变量**：摘要、截断、预算投影三条路径共用同一套闭包计算；删除或折叠任何消息前，先按 tool id 计算 `tool_use` / `tool_result` 闭包，闭包触碰保护尾部或真实用户输入时禁止删除。
5. **摘要流程**：优先复用已有 summary，只折叠新增消息；摘要器先检查自身输入预算，预算不足直接跳过并降级为标记截断；摘要失败同样降级，任务继续。
6. **工具结果限长**：工具结果进入历史存储前截断，并保留 `[truncated N chars]` 标记；runTrace payload 保留完整原文引用，调试不丢数据。
7. **观测与诊断**：每次压缩写入 `context-compacted` trace 事件与 DiagLogger 记录，包含压缩前后字符/token、保留尾部起点、折叠消息数、摘要 ID、降级原因；预算投影动作清单也写入 trace，供 SKILL 调试方判断上下文形态。

### Phase 3（P2）：观测与验证闭环

1. runTrace 面板在 API call 详情里并列展示：逻辑初始请求、物理请求序列、工具增量。
2. diff 工具支持比较两次运行的上下文构成：system、ContextPack、历史、当前请求四段分别统计。
3. 文档同步：SKILL 调试说明更新 `toolRequestDeltas` 语义，明确“判断真实请求看 physicalCalls，判断逻辑入口看 requestMessages”。

## 五、爆炸半径矩阵

| 影响面 | 风险 | 防线 |
|---|---|---|
| `aiService` 工具循环 | 增量记录遗漏本轮消息 | 单测覆盖 3 轮工具循环，逐轮断言 delta |
| `realSkillExecutor` trace | 字段改名破坏 UI 消费 | 全仓 `rg toolRequests` 清点后同步；类型检查强制收敛 |
| runTrace schema | 导出兼容旧数据 | schemaVersion 升级 + 兼容读取 + 导出回归 |
| 主页 ChatPanel | 与大纲共用 folder meta | 同一 `lastRunMeta` 结构统一改，避免双入口分叉 |
| 流水线 PipelinePanel | 已有 `apiMeta.requestMessages` 消费 | 仅改字段名，语义保持初始请求，不做行为变更 |
| 历史压缩 | 摘要错误影响后续生成 | 非破坏性标记 + 摘要失败降级截断 + trace 全量记录 |
| 压缩切割 | 拆散 tool_use/tool_result 导致 provider 拒绝 | 工具配对闭包 + 保护尾部 + marker 边界 |
| 触发阈值 | 只看输入忽略输出导致请求超限 | allowedInput 公式预留 reservedOutputTokens |
| 工具结果截断 | 调试信息丢失 | 完整原文仍走 runTrace payload，只截断进入历史的副本 |

## 六、反推质询

1. **只修 aiService 够吗？** 不够。`realSkillExecutor.ts:764` 还会把旧语义数组追加进 `requestMessages`，必须同步移除，否则污染仍在。
2. **只修 realSkillExecutor 够吗？** 不够。`allToolRequests` 语义本身错误，流水线和主页若未来消费该字段会再次踩坑。
3. **为什么不直接限制 trace 字符数？** 那会把真实证据截断，违反运行记录“给 SKILL 层完整现场”的目标；正确做法是修语义，而不是砍观测。
4. **历史压缩会不会丢内容？** 采用 Roo 的非破坏性标记，原文仍在 session 存储；摘要只是发送 API 的有效历史替代品。
5. **压缩会不会拆散工具调用对？** V2 已把工具配对闭包设为压缩器通用不变量；闭包触碰保护尾部或真实用户输入时禁止删除。
6. **会不会修 A 坏 B？** Phase 1 只改观测语义，不改请求行为；Phase 2 独立开关，失败自动降级；每阶段有独立测试门。

## 七、验证计划

1. 单元测试
   - `aiService.spec.ts`：3 轮工具循环后 `toolRequestDeltas` 等于初始消息 + 各轮新增，无重复快照。
   - `realSkillExecutor.spec.ts`：带工具的 folder 执行后 `apiMeta.requestMessages` 等于初始请求，`toolRequestDeltas` 为增量。
   - `runTrace.spec.ts`：`setApiCallRequest` 写入的消息与 `physicalCalls[0]` 相等；导出 payload 中 request 与 physical request 分别独立。
   - `conversationContextService.spec.ts`：压缩标记过滤、边界 marker、摘要失败降级、工具配对闭包、保护尾部、真实用户输入保护、工具结果限长。
   - 触发计算测试：`allowedInputTokens = contextWindow * 0.9 - reservedOutputTokens`，断言输出预留不会被忽略。
2. 真实链路验证
   - 使用 mock 供应商跑 3 轮工具循环的大纲 folder 对话，导出 deep trace。
   - 断言 `apiCalls[0].requestMessages` 为 23 条量级，`physicalCalls` 逐轮增长，`toolRequestDeltas` 无重复块。
   - 跑长会话触发压缩，断言 API 输入明显下降且生成仍成功。
3. 回头看
   - 全仓 `rg "toolRequests"`，生产、测试、脚本、文档四面清零或兼容。
   - `npm run type-check`、相关 Vitest、`npm run build:vue`。
   - 对账 runTrace 与 DiagLogger 的 context-compacted 事件。

## 八、执行顺序

1. Phase 1.1 `aiService` 增量记录与类型。
2. Phase 1.2 `realSkillExecutor` 去除二次追加并改名。
3. Phase 1.3 `workspaceSkillEngine`、`chat`、`PipelinePanel` 字段同步。
4. Phase 1.4 runTrace schema 与导出器支持。
5. Phase 1.5 单测与真实链路验证。
6. Phase 2.1 session 标记与有效历史过滤。
7. Phase 2.2 压缩服务、降级策略、工具结果限长。
8. Phase 2.3 trace/diag 覆盖与长会话验证。
9. Phase 3 观测 UI、diff、文档。

## 九、成熟度结论（M18）

- 执行器/工具层：成熟。`aiService` 放大点、`realSkillExecutor` 二次追加点均已定位到行级，三协议工具消息构建已核对。
- 应用方案/交互闭环：成熟。观测修复不改变用户可感知行为；上下文治理采用非破坏性设计，失败降级。
- 实现接线：成熟。四段生产传递链路与导出器均已读过，字段消费点已全仓清点。
- 验证标准：成熟。单测、真实 trace 导出、回头看三层门禁齐备；真实用户路径用 mock 供应商工具循环复现本次问题形态。
- 第二轮社区深挖：成熟。Roo 的 marker/输出预留，Cline 的保护尾部/配对闭包/摘要预算均已吸收，且逐条落到 Phase 2 条目与测试项。

**整体结论：成熟。**  
断点声明：无影响目标的断点。社区调研中 Cline 的 agentic compaction 属于后续可选增强，不进入本轮，避免扩大爆炸半径。
