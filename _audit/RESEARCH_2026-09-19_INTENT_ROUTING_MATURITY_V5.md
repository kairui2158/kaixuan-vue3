# 2026-09-19 意图路由成熟化社区调研报告 V5

## 结论先行

本轮调研不是从零开始，而是在 V4 的结论上做两类核验：

1. **社区证据核验**：V4 引用的 OpenAI Agents、Mastra、LangGraph、semantic-router 是否真实存在于本地缓存，且源码行为是否支持 V4 的结论。
2. **应用适配反查**：这些社区模式接到本应用时，现有 `chainIntentRouter -> workspaceSkillEngine -> OutlineWorkspace/ChatPanel -> runTrace` 链路是否存在结构性断点。

核验结果：**V4 的方向正确，但 V4 尚未形成完整执行方案。** V5 在其基础上补齐了可恢复等待状态、入口单源、初始化韧性、语料评估闭环和 trace 终态归并这五块，才达到可执行方案的标准。

## 调研材料与真实性声明

所有社区结论均来自本地真实包缓存，路径为 `_audit/research-cache/`：

| 包名 | 版本 | 本地路径 | 核验文件 |
| --- | --- | --- | --- |
| `@openai/agents-core` | 0.18.0 | `_audit/research-cache/intent-routing-v5/package/` | `package.json:2,8` |
| `@mastra/core` | 1.67.0 | `_audit/research-cache/intent-routing-v5/extract-mastra/package/` | `package.json:2,3` |
| `@langchain/langgraph` | 1.4.16 | `_audit/research-cache/intent-routing-v5/extract-langgraph/package/` | `package.json:2,3` |
| `semantic-router` | V4 缓存 | `_audit/research-cache/intent-routing-v4/semantic-router/` | `base.py` |

V4 中提到的 `runLoop.js`、`toolExecution.js` 在实际缓存中位于 `dist/runner/` 子目录，本轮已按真实路径重新核对。V4 报告中部分行号因此需要修正，本文引用的均为实际文件位置。

## 一、OpenAI Agents-core：中断不是失败，而是可恢复状态

### 证据

`dist/run.js:813` 是主执行循环 `while (true)`。`dist/run.js:545-553` 显式支持 `options.maxTurns`。`dist/run.js:847` 和 `:1568` 在恢复轮调用 `resumeInterruptedTurn`。

`dist/runner/runLoop.js:123` 的 `resumeInterruptedTurn` 是核心：恢复前会先检查哪些工具调用已经获得审批，只有已批准的工具才继续执行。

`dist/runner/runLoop.js:195-213` 定义了三种恢复动作：

| 动作 | 含义 | 对应应用语义 |
| --- | --- | --- |
| `return_interruption` | 仍在等待审批，返回但不失败 | `awaiting_user` |
| `rerun_turn` | 同一轮重跑，不递增轮数 | 用户澄清后继续当前请求 |
| `advance_step` | 继续下一步 | 用户确认后恢复执行 |

`dist/runner/toolExecution.js:232-275` 的 `handleFunctionApproval` 在工具执行前先走审批，未批准则不执行。`dist/runner/toolExecution.js:602` 是 `handleFunctionApproval` 的实现。

`dist/agent.d.ts:112-128` 中 `interruptions: RunToolApprovalItem[]` 是一等返回状态，不是错误。

### 对本应用的启示

1. 等待用户确认不应是“结束当前调用、新建一个调用”，而应是“挂起当前 run，用户回复后恢复同一 run”。
2. 恢复必须携带身份信息（如 `runId` + 恢复动作），不能靠 UI 重新推断意图。
3. 等待不是失败，`awaiting_user` 不应被 `finally` 折叠成 `success`。

## 二、Mastra：挂起状态按 ID 精确恢复

### 证据

`extract-mastra/package/dist/agent-controller-CKgKFyMR.js:4666` 定义 `CONTROLLER_MAX_STEPS = 1e3`，`:4405` 子代理默认 `maxSteps ?? (stopWhen ? 0 : 50)`。

关键不是数值本身，而是 `:6020-6032` 的 `buildSharedRunOptions`：初始 stream 和每次 resume 共用同一 maxSteps。源码注释明确说明“resume 缺 maxSteps 会静默截断”。

`:4022` 的 `respondToToolSuspension` 和 `:4080` 的 `approveToolCall` 支持 suspension 按 `toolCallId` 精确恢复，拒绝也能 resume。`:1892` 的 `SessionSuspensions` 用 Map 结构支持并发挂起、按 runId 清理失效挂起。

`:588` 附近处理 `tool-call-suspended` 事件，`finishAgentRun("suspended")` 不是 error。

### 对本应用的启示

1. 恢复路由等待时必须继承原始 run 的上下文和配置，不能重新初始化。
2. 如果用户取消或重新发起，旧的挂起状态必须被显式清理。
3. “等待用户”要有一个稳定的挂起身份，不能只靠内存对象。

## 三、LangGraph：interrupt 必须有持久化支撑

### 证据

`extract-langgraph/package/dist/interrupt.js:60`：没有 checkpointer 时调用 `interrupt()` 会抛 `GraphValueError("No checkpointer set")`。

`:66-75`：resume 值按序消费，数量不匹配会抛错。`:24-27`：`responseSchema` 可校验 resume 输入。

### 对本应用的启示

LangGraph 的完整 graph checkpointer 对当前应用过重，但它的原则必须保留：

1. 挂起状态不能只存在内存，应用重启后至少要能识别“该 run 曾处于等待态”。
2. 用户恢复输入必须有结构校验，不能任意字符串都当成有效恢复动作。

V5 不引入 graph runtime，只在 `runTrace` 层记录可恢复状态，这是适配本应用的最小合理实现。

## 四、semantic-router：阈值语义必须显式

### 证据

`base.py:639-700`：`total_score >= current_threshold` 才算通过，无阈值时默认通过，未通过返回空 `RouteChoice` 而非错误。

`base.py:645-651`：阈值可按路由单独设置。`base.py:1166-1206` 和 `:1601` 支持阈值更新与调优。

### 对本应用的启示

1. `0.08` 歧义阈值必须真正参与判定，不能只是常量。
2. `no_match` 不是错误，而是“未路由”，应由应用策略决定降级到只读讨论还是等待用户。

## 五、应用反查：结构性缺陷链

以下问题均已重新核对当前源码，不是 V4 结论的复述。

| 编号 | 缺陷 | 源码证据 | 影响 |
| --- | --- | --- | --- |
| A1 | 歧义阈值假接线 | `src/services/chainIntentRouter.ts:35` 定义 `CHAIN_ROUTING_AMBIGUITY_THRESHOLD = 0.08`，但 `:824-830` 只判断 `top.score - second.score === 0` | 常量未生效，轻微分差被当成确定意图 |
| A2 | `no_match` 被当成硬停机 | `src/services/chainIntentRouter.ts:823-827` 返回 `no_match`；`src/services/workspaceSkillEngine.ts:1078`、`:1390` 直接进入 `awaiting_confirmation` | 讨论请求被拦死，SKILL 不执行 |
| A3 | 入口在路由前自行推断 | `src/components/common/OutlineWorkspace.vue:2068-2134` 用 `forcedIntent || 'auto'` 构建工具面和 trace；`src/components/chat/ChatPanel.vue:1083-1113` 同款 | 引擎内部路由结果不回写入口 trace，工具面双源 |
| A4 | 等待态不是可恢复会话状态 | `src/services/stateTransitionGuard.ts:30` 有 `awaiting_user -> active/canceled/expired`，但 UI 只用消息层 `routingFallback` 承载 | 恢复时靠重新推断，违反单源 |
| A5 | 路由器初始化无韧性 | `src/main.ts:114` fire-and-forget，失败只 console.error | `initialized` 永远 false，静默退化为字符级推断 |
| A6 | 降级路由质量骤降 | `src/services/chainIntentRouter.ts:653,917` 未初始化时走 `inferIntentsFromName` / 字符分割 | jieba 加载失败后无用户可见提示 |
| A7 | 事故原话无语料覆盖 | “大纲里的第一卷钩子需要重新设定”中“钩子”“重新设定”不在语料组 | 落入 `no-keyword-overlap` |
| A8 | jieba 失败无恢复路径 | `src/services/chainIntentRouter.ts:463-475` 的 `jiebaLoadFailed` 一旦置位就没有重试 | 路由器永久降级 |
| A9 | fallback 推断逻辑分叉 | `src/services/workspaceSkillEngine.ts:529` 与 `OutlineWorkspace.vue:523`、`ChatPanel.vue:635` 各自实现 | 服务层调整后 UI 仍消费旧假设 |
| A10 | trace 终态被折叠 | `OutlineWorkspace.vue:2396` finally 非取消固定 `success`；`ChatPanel.vue:321,333` 存在 running 兜底 success | 降级和等待在 trace 中失真 |
| A11 | postProcess issues 缺统一终态策略 | `realSkillExecutor.ts:781-825` 产生 report，`workspaceSkillEngine.ts:733-734` 传递，但终态归并不消费 issues | SKILL 调试方无法从 trace 判断阻断/降级 |
| A12 | 上下文承接过窄 | `chainIntentRouter.ts` 中 `CONTEXTUAL_REPLY_MAX_LENGTH = 20` | 长句解释被重新路由 |

## 六、社区模式与本应用的适配判断

| 社区模式 | 是否直接采用 | 理由 |
| --- | --- | --- |
| OpenAI Agents 的 interruption/resume | 采用其状态语义，不引入其 runtime | 应用已有自己的 trace 和 UI，只需对齐“挂起-恢复”合同 |
| Mastra 的 suspension 按 ID 恢复 | 采用 | 等待态必须有稳定身份，恢复时继承原始上下文 |
| LangGraph 的 checkpointer | 不直接引入 | 过重；V5 只要求 runTrace 能识别挂起态并保存恢复动作 |
| semantic-router 的 per-route threshold | 部分 | V5 只接线全局歧义阈值，不做动态调优 |
| Rasa/Botpress 的误解样本回流 | 采用 | `evaluate:chain-intent` 必须输出 failure 分类，形成语料闭环 |

## 七、本轮反查新增发现

1. **V4 引用的社区包真实，但部分路径写错**。`runLoop.js` 和 `toolExecution.js` 实际在 `dist/runner/` 下。V5 已修正。
2. **大纲工作台的等待态已经部分正确**：`OutlineWorkspace.vue:2233-2251` 等待时不收尾 trace。但主页路径和 trace 终态归并仍未统一。
3. **folder postProcess 已经部分接线**：`runTrace.ts:350` 有 `folderDiagnosticsStatus`，`OutlineWorkspace.vue:2287-2291` 和 `ChatPanel.vue:1243-1248` 已传递 report。但 `issues` 对 run 终态的影响仍是断点。
4. **语料量不是零，但事故样本缺失**。现有 `chainIntentPhraseCorpus.ts` 已覆盖大量写入、定位、参考、澄清语料，但“钩子”“重新设定”这类领域名词 + 变化动词组合缺失。问题不是没有语料，而是缺少事故回流机制。

## 八、V5 需要吸收的社区原则

1. **路由不是闸门，是状态机**：`no_match` / `ambiguous` / `matched` 都只是状态，不是错误。
2. **等待必须有恢复合同**：runId、原始请求、候选意图、恢复动作四者缺一不可。
3. **入口不能自行重判**：工具面和 trace 必须由路由结果驱动。
4. **降级必须可见**：路由器初始化失败、jieba 失败、语料缺失都要进入 trace。
5. **样本必须回流**：真实事故样本进入 corpus，评估脚本输出 failure 分类。

## 九、调研循环结论

本轮共执行 5 类核验：

1. 包真实性与版本核验。
2. OpenAI Agents interrupt/resume 源码核验。
3. Mastra suspension 源码核验。
4. LangGraph checkpointer 源码核验。
5. 应用全链路适配反查。

每轮反查都发现新断点，最后一轮仍发现 V4 路径引用错误和应用侧 A11/A12 两个问题。因此 V4 不能直接执行，必须升级为 V5 的完整方案。

