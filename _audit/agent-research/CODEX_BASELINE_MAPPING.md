# Codex 基座到本应用的映射表

| Codex 机制 | 源码锚点 | 本应用承接点 | 映射结论 |
|---|---|---|---|
| Turn Processor | `cache/codex-turn-processor.rs` | 新 `AgentOrchestrator` | 采纳：Agent 编排入口唯一化，direct 与 pipeline 复用 |
| Session Turn 状态 | `cache/codex-session-turn.rs` | 新 `AgentTurn` 状态 | 采纳：turnId、状态、取消令牌、checkpoint 一体 |
| 模型自有预算 | `cache/codex-session-token-budget.rs:81-119` | `providerAdapter.ts` / `contextBudget.ts` | 采纳：模型能力单源，删除用户手填上限语义 |
| 服务器观测 prefill | `cache/codex-auto-compact-window.rs:105-130` | `usageReconciliation` | 采纳：真实 usage 覆盖估算 |
| 压缩生命周期 | `cache/codex-compact-token-budget.rs:57-84` | 新 `ContextCompactionController` | 采纳：压缩前后 hook + trace + checkpoint |
| 工具重名拒绝 | `cache/codex-tools-registry.rs:338-410` | `dialogueToolSurface.ts` | 采纳：工具面构建期冲突检查 |
| 单一可见工具面 | `cache/codex-tools-router.rs:114-207` | `dialogueToolSurface.ts:68-155` | 采纳：Agent 不建第二工具面 |
| 子 Agent spawn | `cache/codex-multiagent-spawn.rs:101-234` | `electron/main.js` Agent IPC | 采纳：TS 版 AgentRuntime，补真实状态源 |
| 子 Agent wait | `cache/codex-multiagent-wait.rs:53-113` | Agent IPC | 采纳：订阅式等待 + timeout 边界 |
| 子 Agent interrupt | `cache/codex-multiagent-interrupt.rs:33-55` | Agent IPC / UI | 采纳：取消进入终态收敛 |
| 剩余上下文工具 | `cache/codex-context-remaining.rs:18-90` | 新 `context.remaining` | 采纳：模型可查真实状态 |
| 轮次 usage 累计 | `cache/codex-turn-token-usage.rs:11-38` | `runTrace.ts` | 采纳：按 provider/model 分层累计 |
| 已执行工具 ledger | `cache/codex-executed-tool-calls.rs` | Agent turn 内部状态 | 采纳：防重复调用与状态漂移 |
| 指令分层 | `cache/codex-agents-md.rs` | Agent prompt / folder SKILL | 采纳：global/project/folder/session 四层 |
| 多 Agent fork | `cache/codex-multiagent-spawn.rs:123-145` | 不做首期 fork | 暂缓：先保证单 Agent 全链路成熟 |

