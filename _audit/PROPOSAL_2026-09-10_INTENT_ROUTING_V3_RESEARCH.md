# 意图路由 V3 社区调研与成熟化方案

日期：2026-09-10  
状态：已审核，待执行  
范围：大纲工作台、主页编辑器等对话型入口的 chain 意图路由。生成流水线保持单任务执行，不套用对话式澄清流程。  
依据：`_audit/神意开发经验总结_v3.md`、本地源码核对、五个真实开源项目源码。

## 结论

V2 的方向是对的，但兜底语义错了。当前实现的 `auto` 是“不确定就放行全链路”，而成熟框架的处理是“不确定就停止、澄清或进入保守 fallback”。因此 V3 的核心不是继续调高分类器精度，而是把路由从“分类器 + 过滤器”升级为“上下文感知路由 + 保守 fallback + 状态机 + 事件流”。

V3 分为四个闭环：

1. 上下文感知路由：用最近会话上下文消解短承接句。
2. 保守 fallback：低置信、歧义、无匹配技能时绝不跑全链路。
3. 显式运行状态机：预算耗尽、用户取消、部分失败不得伪装成成功。
4. 技能级事件流与运行记录：每一步为什么执行、为什么跳过、是否等待用户确认都可回放。

## 本地缺陷对账

### 1. 意图分类只看当前单句

位置：

- `src/services/chainIntentRouter.ts:207`
- `src/services/chainIntentRouter.ts:232`

`classifyChainIntent(userInput)` 只接收当前输入。短承接句如“继续”“按刚才说的改”因缺少主语和动词，容易低于 `0.15` 阈值而落入 `auto`。

### 2. `auto` 等于全链路放行

位置：

- `src/services/chainIntentRouter.ts:244`
- `src/services/chainIntentRouter.ts:248`

`filterTemplatesByIntent()` 在 `intent === 'auto'` 时直接返回全部模板。这个兜底方向和成熟框架相反。

### 3. 第三方 `intents` 缺少校验

V2 引入 `inferIntentsFromName` 后有改善，但仍存在两个缺口：

- 第三方声明了错误 `intents` 时没有告警或降级策略。
- 未声明技能和声明技能混用时，候选集语义容易变得不可预测。

### 4. 预算耗尽与部分失败状态不透明

位置：

- `src/services/workspaceSkillEngine.ts:445`
- `src/services/workspaceSkillEngine.ts:450`

chain 每步调用 `apiBudget.tryConsume()`，失败后 `break`。外层没有强制的 `BLOCKED / FAILED / CANCELLED` 终态，UI 仍可能显示成功。

## 社区调研证据

以下五个项目均为真实仓库，源码已缓存到 `_audit/research-cache/`。调研时间为 2026-09-10。

### 1. Semantic Router

- 仓库：https://github.com/aurelio-labs/semantic-router
- 数据：3,884 stars，最近推送 2026-08-24。
+ 源码缓存：
  - `semantic-router-1.py`
  - `semantic-router-2.py`
  - `semantic-router-4.md`
  - `semantic-router-5.md`

关键证据：

- `Route` 支持独立 `score_threshold`，见 `semantic-router-1.py:63-74`。
- Router 统一为每个路由应用阈值，见 `semantic-router-2.py:647-655`。
- 没有路由通过阈值时返回空 `RouteChoice()`，见 `semantic-router-2.py:702-703`。
- `route_filter` 可限制候选路由，见 `semantic-router-2.py:576-606` 与 `semantic-router-5.md:3-6`。

可借鉴结论：

- `auto` 必须废弃“全放行”语义。
- 低置信或无匹配应产生显式 `no_match` 结果。
- 应支持按 workspace、purpose、当前讨论对象限定候选技能。

### 2. Rasa

- 仓库：https://github.com/RasaHQ/rasa
- 数据：21,320 stars，最近推送 2026-07-24。
- 源码缓存：
  - `rasa-fallback.py`
  - `rasa-two-stage-fallback.py`
  - `rasa-fallback-doc.mdx`
  - `rasa-unexpected-intent.py`

关键证据：

- `FallbackClassifier` 同时配置 `threshold` 与 `ambiguity_threshold`，见 `rasa-fallback.py:24-25`。
- 低置信或前两名意图过近时进入 fallback，见 `rasa-fallback.py:99-132`。
- Two-stage fallback 先让用户确认意图，否认后再请求改写，见 `rasa-fallback-doc.mdx:225-236`。
- fallback 会回滚用户消息，避免污染后续预测，见 `rasa-two-stage-fallback.py:106-108`。

可借鉴结论：

- V3 需要“置信阈值 + 歧义阈值”双阈值。
- fallback 应是两段式：先展示推荐意图让用户确认；用户否认后请求改写。
- fallback 过程不得污染长期对话记忆。

### 3. LangGraph

- 仓库：https://github.com/langchain-ai/langgraph
- 数据：41,329 stars，最近推送 2026-09-09。
- 源码缓存：
  - `langgraph-2.py`
  - `langgraph-3.py`
  - `langgraph-6.py`

关键证据：

- `interrupt_before_nodes` / `interrupt_after_nodes` 是一等机制，见 `langgraph-3.py:721-769`。
- 超过 `recursion_limit` 抛 `GraphRecursionError`，不会伪装成功，见 `langgraph-3.py:3005-3011`。
- Pregel 每步维护显式 step 与 stop，见 `langgraph-2.py:607-608`。
- Graph 支持检查点与恢复，见 `langgraph-4.py`。

可借鉴结论：

- chain 必须有显式步数预算，耗尽即进入失败或中断终态。
- 高成本步骤前支持人工确认中断。
- 断点状态必须可恢复、可丢弃，不得把半成品当作完成。

### 4. Microsoft Agent Framework

- 仓库：https://github.com/microsoft/agent-framework
- 数据：13,429 stars，最近推送 2026-09-09。
- 源码缓存：
  - `agent-framework-events.py`
  - `agent-framework-checkpoint.py`
  - `agent-framework-workflow-context.py`

关键证据：

- `WorkflowRunState` 区分 `STARTED`、`IN_PROGRESS`、`IN_PROGRESS_PENDING_REQUESTS`、`IDLE_WITH_PENDING_REQUESTS`、`FAILED`、`CANCELLED`，见 `agent-framework-events.py:82-90`。
- `request_info` 是专门的 human-in-the-loop 事件，见 `agent-framework-events.py:137` 与 `agent-framework-workflow-context.py:404-435`。
- 每个执行器有 `executor_invoked / completed / failed / bypassed` 事件，见 `agent-framework-events.py:145-149`。
- checkpoint 保存 pending request，用于恢复等待用户输入的流程，见 `agent-framework-checkpoint.py:60-73`。

可借鉴结论：

- V3 需要独立运行状态机，不能只用字符串 status。
- 技能步骤级事件必须进入运行记录。
- 等待用户确认是一个正式状态，不是 UI 临时现象。

### 5. LlamaIndexTS

- 仓库：https://github.com/run-llama/LlamaIndexTS
- 数据：3,077 stars，最近推送 2026-03-11。
- 源码缓存：
  - `llamaindexts-agent-workflow.ts`
  - `llamaindexts-base.ts`
  - `llamaindexts-function-agent.ts`
  - `llamaindexts-README.md`

关键证据：

- workflow 用 `AgentWorkflowState` 保存 `scratchpad`、memory、当前 agent，见 `llamaindexts-agent-workflow.ts:641-666`。
- 每个 handler 通过 `sendEvent` 发出结构化事件，见 `llamaindexts-agent-workflow.ts:408-432`。
- 工具调用与工具结果也作为事件进入 workflow，见 `llamaindexts-agent-workflow.ts:485-545`。
- task handler 以 `TaskStep` 为单位执行，step 内包含 context 与 store，见 `llamaindexts-base.ts:42-87`。
- 工具调用次数有 `MAX_TOOL_CALLS` 上限，见 `llamaindexts-base.ts:372-373`。

可借鉴结论：

- chain 步骤之间应有共享 scratchpad，而不是只传最终文本。
- 工具调用、事件、状态应属于同一编排层。
- 预算应作用于执行器级别，且必须可观测。

## V3 设计方案

### 模块 1：上下文感知路由器

新增 `ChainRoutingContext`：

```ts
interface ChainRoutingContext {
  projectId: string
  workspace: 'outline-workbench' | 'home-editor' | 'pipeline'
  purpose: string
  recentUserMessages: string[]
  recentAssistantSummaries: string[]
  activeSkillIds: string[]
}
```

分类输入从单句变为：

```text
[用户当前输入]
[最近3轮用户消息摘要]
[最近1轮助手结果摘要]
[当前候选技能名称与声明意图]
```

规则：

- 首轮无上下文时保持现有分类器。
- 短承接句先用最近用户意图消解；消解成功则继承上一轮意图。
- 消解失败进入 `ambiguous`，触发 fallback。
- 上下文窗口限制在最近 3 轮，避免长上下文拖慢路由。

### 模块 2：保守 fallback

结果类型改为：

```ts
type ChainRoutingResult =
  | { kind: 'matched'; intent: ChainIntent; confidence: number; reason: string }
  | { kind: 'no_match'; confidence: number; reason: string }
  | { kind: 'ambiguous'; candidates: ChainIntent[]; confidence: number; reason: string }
```

阈值设计：

- `confidence < 0.45`：`no_match`。
- 前两名意图分差 `< 0.08`：`ambiguous`。
- 候选技能为空：`no_match`。

fallback 行为：

1. 展示推荐意图和将执行的技能。
2. 用户确认后执行。
3. 用户否认后请求改写，不重跑原请求。
4. fallback 轮次不计入长期记忆污染。

### 模块 3：技能候选集与路由表

新增默认路由表：

```ts
const DEFAULT_INTENT_ROUTES: Record<ChainIntent, string[]> = {
  analyze: ['诊断', '审查', '分析', '体检', '评审'],
  edit: ['编辑', '修改', '润色', '重写', '修正'],
  generate: ['生成', '创作', '扩写', '骨架', '正文'],
  discuss: ['讨论', '构思', '共创', '问答', '聊']
}
```

技能候选解析顺序：

1. `meta.json` 显式声明 `intents`。
2. 名称推断。
3. 默认路由表。
4. 仍无匹配则进入 `no_match`。

校验规则：

- `intents` 声明值必须是四类合法值，非法值降级为名称推断。
- 声明意图与名称推断完全冲突时记录 warning。
- 候选集为空时禁止执行 chain，只允许讨论或澄清。

### 模块 4：运行状态机

```ts
type ChainRunState =
  | 'idle'
  | 'routing'
  | 'awaiting_confirmation'
  | 'running'
  | 'awaiting_step_confirmation'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'budget_exhausted'
```

硬规则：

- `budget_exhausted`、`failed`、`cancelled` 必须落盘到运行记录，UI 不得显示 success。
- `awaiting_confirmation` 状态可保存断点。
- 用户确认后从断点继续，不得重跑已成功步骤。
- 每步 API 调用必须记录 `executor_invoked / completed / failed`。

### 模块 5：技能级事件流

新增事件结构：

```ts
interface ChainRoutingEvent {
  type:
    | 'routing_started'
    | 'routing_result'
    | 'fallback_requested'
    | 'user_confirmed'
    | 'user_denied'
    | 'skill_invoked'
    | 'skill_completed'
    | 'skill_failed'
    | 'skill_skipped'
    | 'budget_exhausted'
    | 'run_completed'
  timestamp: number
  runId: string
  stepIndex?: number
  skillId?: string
  data?: unknown
}
```

事件写入当前会话聚合运行记录，保证用户能完整看到：

- 路由判断依据和置信度。
- 哪些技能被过滤。
- 哪些步骤被跳过或失败。
- 预算在哪里耗尽。

### 模块 6：兼容策略

- `auto` 类型保留一个版本作为兼容层，内部映射为 `no_match`。
- compose 模式不接入澄清流程，仍一次性执行。
- 生成流水线不弹澄清，按单任务模式执行。
- 已有 `intents` 声明继续有效，但进入校验流程。

## 实施顺序

1. `chainIntentRouter` 增加上下文输入、双阈值、`no_match / ambiguous`。
2. `workspaceSkillEngine` 接入运行状态机与技能级事件。
3. 运行记录适配新事件，保留会话聚合规则。
4. UI 增加路由确认气泡与断点继续。
5. 补齐单元测试和真实源应用验证。

## 验收标准

1. 短承接句测试集：`继续`、`按刚才说的改`、`就这样生成` 等不得误跑全链路。
2. 低置信测试集：无关闲聊、空输入、乱码输入必须进入 fallback。
3. 歧义测试集：同句同时命中 edit 和 generate 时必须请求确认。
4. 预算耗尽：运行记录终态必须是 `budget_exhausted`，不得显示 success。
5. 用户取消：终态必须是 `cancelled`，不产生伪造 assistant 成功轮次。
6. 技能过滤：被过滤技能必须在事件流中有 `skill_skipped` 与原因。
7. 断点恢复：确认后从正确步骤继续，不重复调用已成功 API。
8. 旧技能兼容：无 `intents` 的第三方技能可被名称推断和默认路由表覆盖。
9. 运行记录：每次路由判断、每次 API 调用、每个终态均可回放。
10. 源应用启动验证：使用源码 Electron 启动，模拟真实用户操作，不使用网页模式或开发者模式。

## 风险与边界

- 路由上下文只取最近 3 轮，避免把长记忆重复注入。
- 澄清只用于对话型入口，生成流水线保持确定性执行。
- 不引入新依赖，本方案全部用现有 TypeScript 服务实现。
- 不改 compose 主链路，避免破坏既有生成能力。

## 已确认的决策

1. **初始阈值确认**：`confidence < 0.45` 判定 `no_match`；前两名意图分差 `< 0.08` 判定 `ambiguous`。作为初始默认值上线，后续根据真实运行数据调整。
2. **跳过意图路由高级选项确认**：fallback 气泡提供“本次直接全链执行”，但必须满足三重约束：
   - 收进“高级”折叠入口，不作为主按钮。
   - 只对本次生效，不写入配置，不影响下一轮路由。
   - 运行记录写入 `user_bypassed_routing` 事件，记录用户原话与当时路由判断结果。
3. **预算追加确认**：`budget_exhausted` 允许一键追加预算并从断点继续。硬规则：
   - 追加必须用户显式点击，禁止自动追加。
   - 从准确断点恢复，禁止重复调用已成功步骤。
   - 运行记录写入 `budget_extended` 事件，记录追加次数与恢复步骤。
