# 2026-09-17 tool-loop / 直写 / Trace / Handoff 修复成熟度社区反推调研

## 结论先行

本轮不是找新问题，而是把这几次已经落地的问题与修复方案拿去和真实社区实现对照，反推我们的成熟度。调研对象全部为真实源码或规范文件，证据缓存在 `_audit/research-cache/`，没有虚构项目。

| 组别 | 修复方案 | 社区对照 | 成熟度结论 |
|---|---|---|---|
| A | tool-loop 悬死修复（ToolRunSupervisor） | LangGraph runTimeout / idleTimeout / NodeTimeoutError；MCP cancelled 通知 | 成熟 |
| B | tool-loop 收敛补漏（tool_convergence + 本地摘要兜底 + M25） | OpenAI Agents maxTurns / errorHandlers；LangGraph 重试尊重 abort | 半成熟（断点：收敛请求取消语义） |
| C | API 直写成熟化（意图路由 + 权限门 + 工具面单源） | OpenAI Agents mcpApprovals；09-16 已调研的 semantic-router / roo-code / cline / openhands | 大纲工作台链路成熟；全应用对话范围半成熟（断点：主页无 supervisor、默认迭代预算偏低） |
| D | 运行记录深度化 V2（schema v8） | OTel GenAI 语义约定；MCP progress 规范 | 按当前 SKILL 调试目标成熟；按 OTel 完整语义半成熟（断点：错误类型/堆栈、prompt 版本） |
| E | Chain Handoff 真执行 V2 | LangGraph channel writes / 状态写入约束 | 生成流水线 chain 成熟；对话链仍是既定二期边界 |

最重要的反推结论只有一条：**B 组的 M25 修法从社区角度看是“过度矫正”。** 我们从“收敛请求继承外层 signal / timeout”改成“完全不带 signal”，解决了救场请求被外层死线杀掉的问题，但也让用户在收敛请求期间点取消不再生效。社区共识是分两层：用户级取消永远传染，看门狗死线不传染。这是我们下一步最值得修的点。

## 调研过程记录

1. 门禁复读：读取 `_audit/神意开发经验总结_v5.md`（v5.13）、`DEV_LOG_2026-09-16-tool-loop-stuck-fix.md`、`DEV_LOG_2026-09-17-tool-loop-convergence.md`、`DEV_LOG_2026-09-16-api-direct-write-mature.md`、`DEV_LOG_2026-09-16-chain-handoff-execution-v2.md`，锁定五组对照对象。
2. 网络尝试：对 `openai/openai-agents-js`、`langchain-ai/langgraphjs` 尝试完整 clone，多次连接重置，未获得完整仓库。此处如实记录为失败，不拿失败轮次冒充调研深度。
3. 改用 GitHub API tree + raw 文件精准抓取，两个仓库的 tree JSON 已落在系统临时目录，源码文件落在 `_audit/research-cache/`：
   - OpenAI Agents JS：`turnPreparation.ts`、`constants.ts`、`errorHandlers.ts`、`modelRetry.ts`、`runConfig.ts`、`runLoop.ts`、`steps.ts`、`mcpApprovals.ts`
   - LangGraph JS：`loop.ts`、`retry.ts`、`timeout.ts`、`errors.ts`、`interrupt.ts`、`write.ts`
4. 规范抓取：MCP Schema `2025-06-18`（cancelled / progress 通知）；OTel GenAI 语义约定。注意 OTel GenAI 文档已迁移到 `open-telemetry/semantic-conventions-genai`，本轮使用迁移后仓库文档，缓存目录为 `_audit/research-cache/otel2/`。
5. 我方代码对账：`aiService.ts` 工具循环与收敛请求、`toolRunSupervisor.ts`、`runTrace.ts` schema v8、`chainHandoff.ts`、`dialogueFoundation.ts`、`OutlineWorkspace.vue` 接线点。

## A 组：tool-loop 悬死修复

### 我方现状

`src/services/toolRunSupervisor.ts`：

- idle 默认 150 秒、hard deadline 默认 300 秒、同工具重复错误 3 次。
- 触发后 abort controller 并回调 `onStuck`，只报告与中止，不抢业务终态。
- 接入点：`OutlineWorkspace.vue:2380` 起的大纲 direct 对话。

### 社区对照

LangGraph `timeout.ts`：

- `runTimeout` 与 `idleTimeout` 双看门狗；`idleTimeout` 在节点有进展时刷新。
- 超时后 `scope.close()`、丢弃 buffered writes、abort 该次 attempt、抛 `NodeTimeoutError`。
- `NodeTimeoutError` 默认可被 RetryPolicy 重试，重试前检查 `signal?.aborted`。

MCP 规范 `2025-06-18`：

- `notifications/cancelled` 必须携带 `requestId`。
- `notifications/progress` 由 `progressToken` 关联，且“接收方无义务发送进度”。

### 反推结论

1. 我们的双看门狗（idle + hard）与 LangGraph 的 run/idle watchdog 结构同构，属于社区级成熟设计。
2. “supervisor 只观测与中止，不抢业务终态”与 LangGraph “watchdog 不直接 reject、由执行层收口”一致。
3. 我们把进度事件（streamText / responseText / tool result）作为 idle 刷新依据，比 MCP 的“进度通知可选”更扎实。
4. 边界：supervisor 目前只接大纲工作台。这是当时为控制爆炸半径的分期决策，DEV_LOG 已如实声明，不算机制缺陷。

**成熟度：成熟。**

## B 组：tool-loop 收敛补漏

### 我方现状

`src/services/aiService.ts:1580-1632`：

1. 到达 `maxToolIterations` 且全程无可用正文时，追加 system 指令“停止调用工具，基于已获得的工具结果直接输出最终回答”，发起不带 tools 的 `tool_convergence` 请求。
2. 收敛请求 `timeoutMs: undefined, signal: undefined`，不继承外层逻辑请求的 signal 与 timeout；`callAiWithoutTools` 内部仍有 provider/default 超时兜底，不会无限挂起。
3. 收敛请求失败或空正文时，本地汇总全部工具结果，返回 `tool_converged_local`。
4. catch 里只有 `params.signal?.aborted` 时才上抛。

### 社区对照

OpenAI Agents JS：

- `constants.ts:2`：`DEFAULT_MAX_TURNS = 10`。
- `turnPreparation.ts:155-162`：超过 `_maxTurns` 直接抛 `MaxTurnsExceededError`，默认没有救场请求。
- `errorHandlers.ts:31`：`RunErrorKind = 'maxTurns' | 'modelRefusal' | 'invalidFinalOutput'`；handler 可注入替代最终输出，`attemptedErrors` 防重复处理。这是我们“收敛请求/本地摘要”概念的社区等价物，但它发生在错误处理器，不在主循环里偷偷多发一次请求。
- `modelRetry.ts:292-310`：每次 attempt 用派生 controller；父级 abort 永远传导给子 controller；超时 abort 只作用于本次 attempt。`throwIfTimedModelCallParentAborted` 在多处显式保证“父级取消优先于重试建议”。

LangGraph JS：

- `retry.ts:103`：每次重试前检查 `signal?.aborted`，用户取消停止一切重试。
- `retry.ts:112-119`：per-attempt timeout，每次重试重置计时器，不继承剩余时间。

### 反推结论

1. **比社区更好的部分**：到达上限后主动改请求形态（去 tools + 注入停止指令）并本地兜底工具结果，社区默认只是抛错。对我们“客户绝不能空等、不能无正文”的产品目标，这是合理增强，OpenAI 的 errorHandlers 也证明“错误时给替代输出”是成熟方向。
2. **比社区更激进的部分（真实断点）**：我们把收敛请求的 `signal` 完全置空。社区做法是“用户取消永远传染，timeout/watchdog 不传染”。当前实现下，用户在收敛请求进行中点取消，请求不会被中止，会继续跑到完成或默认超时。
3. **建议修法**：为收敛请求构造派生 AbortController——只监听用户取消 signal，不监听 supervisor 的 idle/hard 死线。这样同时满足：救场请求不被已耗尽的总死线杀掉；用户取消仍然即时生效。
4. 默认 `maxToolIterations = 6`（`aiService.ts:1331`），低于 OpenAI 的 10 和 LangGraph 的 25。我们有收敛兜底，6 不算错误，但对“十几万字大纲需要多轮读取”的真实场景偏紧。建议默认升到 10，保留配置覆盖。

**成熟度：半成熟。断点：收敛请求取消语义未按社区双层 signal 模型实现；默认迭代预算偏紧。**

## C 组：API 直写成熟化

### 我方现状

- `dialogueFoundation.ts:59-71`：意图统一归一化，`edit/generate` 才有 `writeEditor`。
- `dialogueFoundation.ts:153-166`：工具面单源过滤，write 工具只在 edit/generate 暴露。
- `aiService.ts:269` 起服务层统一 `evaluateWritePermission`，入口不传工具不能绕过权限。
- `aiService.ts:1524-1539`：写入预算到达后返回 `write_limit_reached` 工具结果，要求模型直接结束。
- M19/M22/M23 已把 actualToolSurface、tool-loop 状态机、三层对账固化。

### 社区对照

OpenAI Agents `mcpApprovals.ts`：

- 工具审批有同步决策、历史决策、pending approvals 三态。
- 审批拒绝会生成带原因的 rejection message 回给模型，而不是静默失败。
- 审批流在 streaming 与 non-streaming loop 共享同一实现，避免双路径分叉。

结合 09-16 已完成的 semantic-router / roo-code / cline / openhands 调研：

- semantic-router：每 route 独立阈值 + 评估集。我们已落语料集与评估脚本。
- roo-code：`auto_approve / auto_deny / ask_user` 三态权限。我们因产品决策删除确认预览，等价收敛为“意图即权限”：discuss/analyze 只读，edit/generate 直写。
- cline：plan/act 双模式。我们的 discuss/edit 意图即同构模式。

### 反推结论

1. 权限执行点在服务层、工具面单源、拒绝原因回传模型，这三点与社区成熟形态一致。
2. `write_limit_reached` 返回“请基于已写入结果直接结束”的语义，与 mcpApprovals 的“拒绝要带原因回给模型”同构，优于静默拒绝。
3. 我们没有 pending approval 态，是产品决策（删除确认预览）而非缺陷；社区对照反而验证了“权限决策必须显式、可解释”这一原则，我们用意图路由实现了同等显式性。
4. 真实差距一：`toolRunSupervisor` 只接大纲工作台，主页 ChatPanel 的 direct 对话没有同等悬死保护。
5. 真实差距二：默认迭代预算 6 偏紧（同 B 组）。
6. `maxEditorWrites` 默认 1 是产品安全选择，社区无直接对应物，不判为差距。

**成熟度：大纲工作台直写链路成熟；以“全应用 API 对话”为范围时半成熟。断点：主页 supervisor 未接入、默认迭代预算偏紧。**

## D 组：运行记录深度化 V2

### 我方现状

`src/stores/runTrace.ts:479`：`RUN_TRACE_SCHEMA_VERSION = 8`。

- turn / API call / physical call 三层，`turnId + apiCallId + toolCallId` 对账。
- `actualToolSurface` 与真实请求工具面单源。
- `physicalCalls.phase` 覆盖 normal / tool_iteration / tool_convergence / downgrade / retry / continuation。
- payload 外置 + sha256，全文不截断。
- error 为字符串，`downgradeReason`、`retryStrategy`、`finishReason`、`usage` 均有记录。

### 社区对照

OTel GenAI 语义约定：

- `gen_ai.tool.call.arguments / result`：Opt-In 记录工具参数与结果。
- `gen_ai.usage.input_tokens / output_tokens / reasoning.output_tokens`。
- `gen_ai.response.finish_reasons`：数组，可含 `stop / length / error`。
- `gen_ai.prompt.version`：prompt 模板版本。
- `gen_ai.client.operation.exception` 事件：`exception.type`（Conditionally Required）、`exception.message`、`exception.stacktrace`。

### 反推结论

1. 我们的物理请求分相（phase）、finishReason、usage、工具参数与结果、外部 payload + hash，语义上与 OTel GenAI 的 span/event 模型对齐，且比 OTel 基线更“全文不丢”。
2. 差距一：OTel 把异常当作结构化事件（type/message/stacktrace），我们是 error 字符串。SKILL 调试方目前能知道“错了”，但要区分网络错误、协议错误、供应商错误，需要靠文本猜测。
3. 差距二：OTel 有 `gen_ai.prompt.version`；我们记录技能名与 schemaVersion，但没有稳定的 prompt/template 版本字段。SKILL 模板改版后，旧 trace 的可解释性会下降。
4. 这两项不阻塞当前调试目标，属于把 trace 从“应用日志”升级到“可观测性标准”的增强项。

**成熟度：按当前 SKILL 调试目标成熟；按 OTel 完整语义半成熟。断点：结构化异常事件、prompt 版本字段。**

## E 组：Chain Handoff 真执行 V2

### 我方现状

`src/services/chainHandoff.ts`：

- 默认全文；`full / requiresFullPreviousOutput` 全文。
- `structured` 只在全部 `requires` 命中且非空时生效；JSON 顶层键或 Markdown 标题节确定性提取。
- `excerpt` 仅显式声明，默认 2400 字。
- contract-miss 一律回退全文；非全文交付后输出校验失败自动升级全文重试一次。
- 全文始终进 runTrace payload 存档。

### 社区对照

LangGraph `write.ts`：

- 状态写入通过 channel 声明，写入保留通道 `TASKS` 直接抛错。
- 写入值经 mapper 归一化后进入 channel，由 checkpoint 体系统一持久化。
- 状态是“声明式写入 + 冲突由 reducer 收口”，不是每步自由拼字符串。

### 反推结论

1. 我们的“SKILL 声明消费契约 + 确定性提取 + 失败回全文 + 全文存档”与 LangGraph “声明式 channel + reducer”在目标上同构：都避免应用层做语义猜测。
2. 我们比通用 Graph 框架更保守：任何契约不命中都回全文，宁可多花 token 也不丢信息。对小说创作场景这是正确取舍。
3. 对话链（workspaceSkillEngine）仍全文传递，不接 `resolveChainPreviousOutput()`，这是 DEV_LOG 已声明的二期边界，不是未发现缺陷。
4. 后续若接对话链，应沿用同一决策器，避免两套 handoff 语义。

**成熟度：生成流水线 chain 成熟；对话链接入为既定二期范围，不影响本组结论。**

## 反推后的行动建议（按优先级）

1. **P0：收敛请求双层 signal。** 新建派生 AbortController，监听用户取消 signal；不监听 supervisor idle/hard 死线。收敛请求、后续所有“救场类请求”统一走这个模型。社区证据：OpenAI `modelRetry.ts` 父级 abort 传导 + per-attempt timeout；LangGraph `retry.ts` 重试前检查 `signal?.aborted`。
2. **P1：默认 `maxToolIterations` 6 → 10。** OpenAI 默认 10，LangGraph 默认 25；结合我们已有收敛兜底，10 是兼顾成本与长文档多轮读取的保守值。
3. **P1：主页 ChatPanel 接入 ToolRunSupervisor。** 大纲工作台已验证，接线模式可复用；接入时保持 M8 日志同步与 M17 回头看。
4. **P2：runTrace schema v9。** 增加 `errorKind`（或 exception type）、`errorStack`、`promptVersion`。升级时必须同步 schemaVersion、导出按钮版本和旧数据兼容测试。
5. **P2：对话链接入 handoff 决策器。** 沿用 `resolveChainPreviousOutput()`，默认仍全文，只有显式契约才瘦身。

## 证据索引

- `_audit/research-cache/openai-agents-js/`：8 个 runner 源码文件。
- `_audit/research-cache/langgraphjs/`：6 个 pregel/状态源码文件。
- `_audit/research-cache/modelcontextprotocol/`：MCP Schema 2025-06-18。
- `_audit/research-cache/otel2/`：OTel GenAI 迁移后语义约定文档。
- 我方源码：`src/services/aiService.ts`、`src/services/toolRunSupervisor.ts`、`src/services/chainHandoff.ts`、`src/services/dialogueFoundation.ts`、`src/stores/runTrace.ts`、`src/components/common/OutlineWorkspace.vue`。

本轮未修改任何业务代码，未封装，版本保持 3.52.2。调研缓存保留在 `_audit/research-cache/` 作为后续执行与复核证据。
