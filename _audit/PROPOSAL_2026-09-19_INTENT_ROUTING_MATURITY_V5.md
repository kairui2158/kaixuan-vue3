# 2026-09-19 意图路由成熟化执行方案 V5

**方案成熟度：成熟（可执行方案，尚未实施）**

按 M18 四层评估：

| 层级 | 成熟度 | 依据 |
| --- | --- | --- |
| 执行器/工具层 | 成熟 | `dialogueFoundation` + `authorizeDialogueTools` 已有分层授权与测试 |
| 应用方案/交互闭环 | 成熟 | V5 补齐三态 fallback、可恢复等待、入口单源、初始化韧性 |
| 实现接线 | 成熟（方案层面） | 已明确 `chainIntentRouter -> workspaceSkillEngine -> 入口 -> trace` 的改动点和验收 |
| 验证标准 | 成熟 | 五类真实用户路径 E2E + corpus 评估 + trace 双侧对账 + 旧链路清零 |

注意：**“方案成熟”不等于“已实现”。** 本文档是执行前方案，实施后必须按第 9 节验证矩阵逐项验证，任何一项未过不得声称闭环。

## 1. 目标

1. 讨论、分析、位置咨询类请求不得被 `no_match` 拦死。
2. 写入类请求必须有明确信号才进入 `edit/generate`。
3. 路由结果、工具面、trace 三者必须来自同一决策结果。
4. 等待用户确认必须是可恢复的 run 状态，不是消息层装饰。
5. 路由器初始化失败、jieba 失败、语料缺失必须可见、可诊断、可恢复。
6. SKILL 调试方能从 trace 完整还原路由、降级、等待、恢复、postProcess 全过程。

## 2. 不做范围

1. 不引入 LangGraph / OpenAI Agents runtime。
2. 不做 per-route 动态阈值调优。
3. 不改动 pipeline 的非交互式写入策略。
4. 不恢复 `editor.propose_edits` / `pending_user_confirmation` 确认预览链路。

## 3. 核心设计

### 3.1 路由结果扩展

在 `ChainRoutingResult` 上增加 fallback 信息，保持类型收口：

```ts
type RoutingFallbackMode =
  | 'readonly-discuss'
  | 'await-user'

type ChainRoutingResult =
  | { kind: 'matched'; intent: Exclude<ChainIntent, 'auto'>; confidence: number; reason: string }
  | {
      kind: 'no_match'
      confidence: number
      reason: 'low-confidence' | 'no-keyword-overlap' | 'empty-input' | 'router-degraded'
      fallbackMode: RoutingFallbackMode
    }
  | {
      kind: 'ambiguous'
      candidates: Exclude<ChainIntent, 'auto'>[]
      confidence: number
      reason: string
      fallbackMode: RoutingFallbackMode
    }
```

三态规则：

| 原因 | fallbackMode | 行为 |
| --- | --- | --- |
| `no-keyword-overlap` | `readonly-discuss` | 直接以 discuss 进入只读 SKILL |
| `low-confidence` | 有写入信号时 `await-user`，否则 `readonly-discuss` | 写入必须用户确认 |
| `ambiguous` | edit/generate 候选时 `await-user`，纯只读候选 `readonly-discuss` | 避免误写 |
| `router-degraded` | `readonly-discuss` | 初始化失败时只读兜底 |

这保证：**不认识的输入不再等死，但有写入风险的输入绝不自动写入。**

### 3.2 歧义阈值真实接线

修改 `routeChainIntent`：

```ts
if (second && top.score - second.score < CHAIN_ROUTING_AMBIGUITY_THRESHOLD) {
  return {
    kind: 'ambiguous',
    candidates: [top.intent, second.intent],
    confidence: keywordConfidence,
    reason: 'ambiguous-top2',
    fallbackMode: awaitUserIfWriteCandidate([top.intent, second.intent]),
  }
}
```

同时删除 `top.score - second.score === 0` 的旧判断，避免新旧并存。

### 3.3 入口单源

新增统一入口函数（建议放在 `dialogueFoundation` 或新 `workspaceRoutingService`）：

```ts
async function resolveWorkspaceRouting(input: {
  requestText: string
  adapter: WorkspaceSkillEngineAdapter
  templates: WorkspaceSkillTemplate[]
  routingOverride?: RoutingOverride
}): Promise<{
  routing: ChainRoutingResult
  intent: ChainIntent
  requestedToolSurface: DialogueToolSurfaceSummary
  actualToolSurface: Array<{ name: string; policy: 'read' | 'write' }>
  tools: DialogueTool[]
}>
```

职责：

1. 唯一调用 `routeChainIntent`。
2. 根据 routing 结果计算 intent。
3. 唯一调用 `buildTools` + `authorizeDialogueTools`。
4. 返回 trace 需要的 `actualToolSurface`。
5. 处理 `bypass` 与用户确认后的 `forcedIntent`。

OutlineWorkspace 和 ChatPanel 不再自行用 `forcedIntent || 'auto'` 构建工具面，只消费该函数结果。

### 3.4 可恢复等待状态

`awaiting_confirmation` 从消息层装饰升级为 run 状态：

```ts
type RoutingAwaitState = {
  runId: string
  originalRequestText: string
  candidates: Exclude<ChainIntent, 'auto'>[]
  fallbackMode: RoutingFallbackMode
  createdAt: number
  resumeToken: string
}
```

恢复规则：

1. 用户点击候选意图 → 传 `routingOverride.forcedIntent`，reason 固定 `user-confirmed-recommendation`。
2. 恢复时继承原 run，不新建 run，不重新路由。
3. `runTrace` 记录 `awaiting_user -> active` 状态转移。
4. 用户取消或新请求时清理旧 await state。
5. 恢复输入必须是合法 intent，非法输入保持等待态，不静默降级。

这对应 OpenAI Agents 的 `return_interruption / rerun_turn / advance_step` 和 Mastra 的 suspension 恢复语义。

### 3.5 初始化韧性

修改 `initIntentRouter`：

1. 失败后重试 3 次，指数退避。
2. 仍失败则记录 `router-degraded` 状态。
3. `routeChainIntent` 在 degraded 时返回 `readonly-discuss`，不允许静默字符级推断。
4. trace 写入 `router-degraded` 事件。
5. jieba 失败可重试，不再永久置位。

### 3.6 语料与评估闭环

1. 补充领域名词 + 变化动词组合：如“钩子”“时间线”“伏笔” + “重新设定”“调整”“改”。
2. 补充作者解释、质疑、补充既有内容的正负样本。
3. 每个意图至少 30 条真实用户风格样本。
4. `evaluate:chain-intent` 必须输出：
   - 总准确率。
   - 每意图准确率。
   - failure 按 `no-keyword-overlap` / `low-confidence` / `ambiguous` / `wrong-intent` 分类。
   - 未过阈值样本清单。
5. 事故样本进入 corpus 后必须有回归测试，防止修好又回归。

### 3.7 postProcess 终态策略

统一规则：

| postProcess 结果 | run 终态 | trace 事件 |
| --- | --- | --- |
| 无 issues | `success` | `post-process-completed` |
| warning 且影响输出 | `degraded` | `post-process-degraded` |
| blocking | `blocked` | `post-process-blocked` |
| warning 且不影响输出 | `success` + report | `post-process-warning` |

不允许 `issues` 只存在于 report 而 run 终态仍是 `success`。

### 3.8 trace 完整性

每次路由相关 run 必须记录：

1. `routing_started`：requestText、workspace、activeSkillIds。
2. `routing_result`：完整 routing 对象。
3. `actualToolSurface`：来自单源函数。
4. `router-degraded`：初始化失败原因。
5. `awaiting_user`：候选意图、fallbackMode。
6. `user-confirmed-recommendation`：用户选择。
7. `state-transition`：`awaiting_user -> active`。
8. `post-process-*`：完整 report，含截断标记。
9. `run_completed`：终态由 reasons 归并，不允许 finally 兜底 success。

## 4. 文件改动清单

| 文件 | 改动 |
| --- | --- |
| `src/services/chainIntentRouter.ts` | fallback 三态、阈值接线、初始化重试 |
| `src/services/workspaceSkillEngine.ts` | 消费 fallbackMode，等待态返回 runId/恢复信息 |
| `src/services/dialogueFoundation.ts` | 新增 `resolveWorkspaceRouting` 或等价收口 |
| `src/components/common/OutlineWorkspace.vue` | 删除入口自行推断，消费单源结果 |
| `src/components/chat/ChatPanel.vue` | 同上，统一等待/恢复 |
| `src/stores/runTrace.ts` | 等待态、恢复、postProcess 终态事件 |
| `src/services/stateTransitionGuard.ts` | 如需新增状态，注册映射 |
| `src/services/chainIntentPhraseCorpus.ts` | 补语料 |
| `scripts/evaluate-chain-intent-router.mjs` | failure 分类输出 |

## 5. 执行顺序

1. **语料与路由器**：先补 corpus，跑评估，确认事故样本通过。
2. **路由器三态**：实现 fallbackMode 和阈值接线。
3. **入口单源**：实现 `resolveWorkspaceRouting`，切换两个入口。
4. **等待状态**：实现 runId + resumeToken 恢复合同。
5. **初始化韧性**：重试 + degraded 可见。
6. **postProcess 与 trace**：统一终态归并。
7. **测试补齐**：单测、集成测试、E2E。
8. **旧链路清零**：按第 8 节矩阵执行。
9. **回头看循环**：直到一轮无新发现。

## 6. 门禁映射

| 门禁 | 本方案对应 |
| --- | --- |
| M11 | `classifyChainIntent` 与 `routeChainIntent` 语义单源，新增语料同步两条入口 |
| M17 | 回头看覆盖 forcedIntent、fallback 推断、trace 终态、新旧语义 |
| M18 | 四层成熟度已给出，实施后按验证矩阵复核 |
| M19 | actualToolSurface 由单源函数产出，真实请求与 trace 同源 |
| M21 | 语料单源，正负样本齐备，评估报告归档 |
| M22 | 等待态与恢复态进入状态机 |
| M23 | turn / apiCall / event 三层 ID 对账 |
| M26 | 旧 `no_match -> awaiting` 语义按七面矩阵清零 |
| M28 | E2E 前校验构建产物新鲜度 |

## 7. 反推：为什么这个方案不会再修一处坏一处

1. **先改数据结构，再改调用方**：`ChainRoutingResult` 扩展后，入口和服务层都消费同一结构，不再各自推断。
2. **单源函数是硬约束**：入口不允许再调用 `buildTools` 自行组装工具面。
3. **等待态有身份**：恢复靠 runId + resumeToken，不靠重新猜。
4. **终态归并收口**：finally 不再兜底 success，trace 状态由 reasons 决定。
5. **旧语义清零是独立步骤**：不是“顺手删”，而是七面矩阵逐面核对。

## 8. 旧链路清零矩阵

| 面 | 需清理项 | 验收 |
| --- | --- | --- |
| 生产入口 | 入口内 `forcedIntent \|\| 'auto'`、自行 buildTools | `rg` 确认仅单源函数调用 |
| 服务层 | `no_match -> awaiting_confirmation` 旧语义 | fallbackMode 分支替代 |
| UI | 消息层自行推断 fallback | 只消费 service 返回 |
| 测试 | 旧断言 `no_match -> awaiting` | 更新为三态断言 |
| 脚本 | evaluate 未分类 failure | 输出分类报告 |
| 规格 | 文档中旧闸门描述 | 更新为三态语义 |
| 日志字段 | 旧 routingFallback 语义 | 保留兼容读取，新写入用新结构 |

## 9. 验证矩阵

| 场景 | 预期 UI | 预期 trace |
| --- | --- | --- |
| “解释一下第一卷钩子” | 直接进入 discuss，有回复 | `routing_result: matched/discuss`，只读工具面 |
| “把钩子改强一点” | edit 意图，允许写入工具 | `routing_result: matched/edit`，actualToolSurface 含 write |
| “钩子需要重新设定” | 不确定但有写入风险 | `ambiguous -> await-user`，用户确认后恢复 |
| “大纲里的第一卷钩子需要重新设定” | readonly-discuss 或明确候选 | 不再 `no-keyword-overlap` 拦死 |
| “继续” 无上下文 | 四意图候选等待 | `ambiguous` + await state |
| 路由器初始化失败 | 只读讨论可用 | `router-degraded` + readonly fallback |
| postProcess blocking | 明确阻断提示 | `blocked` + `post-process-blocked` |
| postProcess warning | 降级提示 | `degraded` + report |

E2E 要求：

1. 必须用真实构建产物，先过 M28 新鲜度校验。
2. 必须断言 UI 可感知行为，不许 mock 中间态。
3. 必须对账 runTrace 与 DiagLogger 双侧。
4. 必须覆盖等待、恢复、取消三条路径。

## 10. 风险与回退

| 风险 | 处理 |
| --- | --- |
| 三态 fallback 导致讨论 SKILL 误写 | discuss/analyze 工具面强制只读，服务层权限门校验 |
| 等待态恢复后上下文丢失 | 恢复继承原 run，禁止重新路由 |
| 入口单源改动影响 pipeline | pipeline 不走交互式写入工具，单测覆盖 |
| corpus 扩充引入误判 | evaluate 必须全绿，failure 分类归档 |
| trace 结构变更兼容 | schemaVersion 升级，旧数据兼容测试 |

## 11. 放行条件

满足以下全部才允许封装：

1. `npm run evaluate:chain-intent` 全绿，failure 分类为空。
2. 所有相关单测通过。
3. 五类真实用户路径 E2E 通过。
4. trace 双侧对账一致。
5. 旧链路七面清零完成。
6. 回头看循环至少一轮无新发现。
7. DEV_LOG 与经验文件同步更新。

