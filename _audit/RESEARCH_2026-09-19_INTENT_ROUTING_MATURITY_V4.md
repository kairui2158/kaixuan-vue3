# 2026-09-19 意图路由底座成熟化社区调研报告 V4

## 调研范围与循环

本次调研按用户要求执行「社区深挖 → 记录 → 回头反查应用 → 扩充调研范围 → 再反查」的循环，共完成 4 轮：

1. **第 1 轮**：Rasa、Botpress、LangChain/LangGraph 三条成熟对话系统的 fallback、误解样本闭环、人工审批模式。
2. **第 2 轮**：反查本应用 `chainIntentRouter.ts`、`workspaceSkillEngine.ts`、`dialogueFoundation.ts`、`OutlineWorkspace.vue`，确认缺陷集中在意图判定层，工具授权层已有安全设计。
3. **第 3 轮**：扩充 AutoGen、Haystack、LlamaIndex、semantic-router，聚焦上下文状态维护、兜底路由、阈值语义、工具循环收敛。
4. **第 4 轮**：用第 3 轮结论反查大纲工作台入口，确认还有 trace 降级折叠、fallback 二次推断两个隐藏面。

所有社区结论均来自本轮真实拉取的源码或文档，缓存于 `_audit/research-cache/intent-routing-v4/`。未使用虚构项目或只看 README 的结论。

## 一、本次事故的根因链

证据源：`run-trace-outline-20260919-042658-deep`（run-1789763218480-30）。

### 1. 讨论请求被弱写入组合劫持

用户输入「和我讨论一下第一卷的补充钩子」被判定为 `explicit-write-directive / edit / 0.95`。代码位置：[chainIntentRouter.ts:120](../../src/services/chainIntentRouter.ts)。

具体机制：

1. 「补充」属于 `weakWriteActions`。
2. 「编辑器/大纲」等词属于 `writeTargets`。
3. 祈使标记 `/把|将/` 与 `hasImperativeWriteMarker` 参与放大。
4. `hasExplicitWrite` 在检查 `contextualHits` 之前计算；「讨论」虽然命中 `discussKeywords`，但该分支没有被优先消费。

结果是普通讨论被升级为写入授权，直接进入工具循环。

### 2. `no_match` 被当成硬闸门

[workspaceSkillEngine.ts:1007](../../src/services/workspaceSkillEngine.ts) 中，路由结果不是 `matched` 就返回 `awaiting_confirmation`。因此「钩子需要重新设定」「解释沈萤脚踝钩子的设计目的」这类讨论请求被拦死，SKILL 完全没有执行。

SKILL 层反馈「`no-keyword-overlap` 不能作为停止理由」成立。社区系统同场景默认走只读讨论，而不是停机。

### 3. 上下文承接覆盖不足

`isLikelyContextualReply` 有 20 字长度限制，且依赖 assistant 消息中存在 `await_user: true` 等标记。Turn 3 的长句解释没有命中承接逻辑，被当作新指令重新路由。

AutoGen 的契约明确相反：调用方只传新消息，状态由 agent 维持，不应每次把历史重新交给外部规则去判断（`_assistant_agent.py` 111-115 行）。

### 4. 语料集过小

[chainIntentCorpus.ts:18](../../src/services/chainIntentCorpus.ts) 仅 20 条样本。11 个单测全绿只证明现有样本过拟合，不证明覆盖真实创作对话。Botpress 的 NLU 建议是每个意图 10-20 条，且要混合句式与负样本；我们当前每意图远低于这个标准。

## 二、社区成熟模式

### Rasa：低置信是可路由意图，不是停机

- `FallbackClassifier`（threshold 0.7 + ambiguity threshold）在低置信/歧义时预测 `nlu_fallback`。
- `TwoStageFallbackAction`：确认 → 用户否认则要求重述 → 再失败则 `UserUtteranceReverted()` 回滚状态。
- 关键点：fallback 事件不会污染后续对话状态。我们的 `no_match → awaiting_confirmation` 目前恰好会污染：等待确认气泡残留后，下一轮普通讨论又被当作新路由输入。

### Botpress：把「没听懂」当数据资产

- Misunderstood 模块把 `intent === 'none'` 的事件收进待审队列（New/Pending/Done/Ignored + Amend 归类）。
- 语料建议：每个意图 10-20 条，每个 slot 再加 5-10 条，混句式（纯关键词、自然语言、带废话长句），避免近似重复。
- 对我们的启发：真实用户原话应该回流进语料集，而不是只修触发词。

### LangChain/LangGraph：审批由工具元数据驱动

- `HumanInTheLoopMiddleware` 按 `destructiveHint` 等工具元数据决定哪些工具要审批。
- reject 时给模型明确指令「不要重试，除非用户显式要求」。
- 审批配置错误（如空 allowed_decisions）直接抛错，不静默放行。
- 我们的 `dialogueFoundation.resolveDialoguePermission()` 已经有同类分层（auto 归一 discuss；只有 edit/generate 可写），方向正确，问题在意图判定入口没有对齐。

### AutoGen：状态契约与循环收敛

- 调用方只传新消息；agent 自己维护上下文状态。
- 模型返回无工具调用即立刻结束循环，不管 `max_tool_iterations` 是多少。
- 循环上限是兜底，不是常态。
- 对我们：意图承接应由会话状态机维护，而不是每轮重新做关键词判定；工具循环应以「模型不再请求工具」为第一收敛信号。

### Haystack：必须有显式兜底路由

- `ConditionalRouter` 允许 `{{ True }}` 作为最后一条 fallback route。
- 若所有条件都不满足则抛 `NoRouteSelectedException`，且要求管道设计者显式处理。
- 对我们：`no_match` 不应等于「没有路」，应等于「走只读讨论路由 + 记录低置信证据」。

### semantic-router：阈值语义必须明确

- `score_threshold=None` 表示总返回一个 route，`RouteChoice()` 空对象表示无通过。
- `_set_score_threshold()` 在无阈值时打 warning，因为默认放行会导致意外结果。
- 对我们：`no-keyword-overlap` 与 `low-confidence` 必须区分。前者是「词面无证据」，后者是「有证据但不够强」。当前两者都落到 `no_match`，语义被折叠。

## 三、应用反查新增缺陷

### 缺陷 5：trace 降级被成功收尾折叠

[OutlineWorkspace.vue:2394](../../src/components/common/OutlineWorkspace.vue) 的 finally 兜底在未取消时固定 `finishOutlineRunIfRunning('success', ..., 'skill_execution_complete')`。

这会把 schema 校验失败、产物有效性降级等现场折叠成 success，违反经验文件 M14/M15/M16。第 3 轮日志中 3 次 schema 校验失败后 run 仍显示 success，即为此路径。

### 缺陷 6：fallback 二次推断范围过窄

[OutlineWorkspace.vue:523](../../src/components/common/OutlineWorkspace.vue) 的 `inferOutlineFallbackIntent` 只复制了 `matched.intent` 判断，没有对齐服务层 `inferFallbackIntent()` 的完整语义。`no_match/ambiguous` 时二者行为虽然都回落 discuss，但同款逻辑已分叉两处，后续服务层调整后 UI 层可能继续消费旧假设，违反 M26。

### 缺陷 7：入口 forcedIntent 链路存在放大面

[OutlineWorkspace.vue:2068](../../src/components/common/OutlineWorkspace.vue) 用 `routingDecision.forcedIntent || 'auto'` 构建工具面。若上游误判 forcedIntent 为 edit，工具面直接暴露写入工具。服务层 `resolveAuthorizedToolSurface()` 有二次授权，但 `runWorkspaceSkills` 的 chain 分支消费的是路由后的 intent；入口与引擎之间存在两套消费路径，需要统一为「单源路由结果 → 单源授权」。

## 四、四层成熟度结论

| 层 | 结论 | 断点 |
|---|---|---|
| 执行器/工具层 | 成熟 | `dialogueFoundation` + `authorizeDialogueTools` 已具备分层授权与测试 |
| 应用方案/交互闭环 | 不成熟 | 讨论优先、no_match 只读兜底、上下文承接、误解样本回流均缺失 |
| 实现接线 | 半成熟 | 服务层有路由与授权，但 Outline 入口 forcedIntent 与引擎消费路径未单源 |
| 验证标准 | 不成熟 | 现有 11 个单测过拟合；缺少真实用户路径 E2E 与降级状态断言 |

## 五、成熟方案原则

1. **讨论标记优先于弱写入组合**：命中「讨论/商量/探讨/聊聊/解释/说明/你觉得」时默认 discuss；只有强写入动词（写入、插入、替换、直写、录入、同步）才允许越过讨论标记。
2. **`no_match` 默认只读讨论**：对齐 Haystack 显式兜底路由。工具面由 `discuss` 授权层过滤为只读，SKILL 可执行但不可写。
3. **`no-keyword-overlap` 与 `low-confidence` 分离**：前者直接 discuss 兜底并记录 `routing-fallback-readonly`；后者保留用户确认，但确认气泡只提供「继续只读讨论」与「跳过路由」两个明确选项。
4. **会话状态机承接澄清轮**：assistant 消息带 `await_user` 后，下一轮用户输入默认承接 discuss，除非出现强写入动词。长度限制改为语义判断（解释/说明/回答/选择/反驳），不是 20 字硬截断。
5. **工具循环收敛以「无工具调用」为第一信号**：模型返回正文即结束；连续工具调用无正文时按 M22 状态机细分，不允许笼统显示「正在查找信息」。
6. **误解样本回流**：真实 trace 原话进入语料集，含正负样本；每次修复必须输出准确率、误判样本与未过阈值样本。
7. **Trace 状态不折叠**：schema 校验失败、产物无效、postProcess blocking issue 必须影响 run 终态为 degraded；finally 兜底不得把降级写成 success。

## 六、建议执行顺序

1. 意图判定重排与语料集扩充（P0）
2. `no_match` 只读兜底 + 语义区分（P0）
3. Outline 入口 forcedIntent 单源收口（P0）
4. Trace 降级终态与完整输出修复（P1）
5. 会话状态机承接强化（P1）
6. 语料评估报告与真实用户 E2E（P1）

本报告为调研与方案依据，不含生产代码改动。
