# A02 Codex Session Turn 状态模型

- 仓库：openai/codex
- 源码：codex-rs/core/src/session/turn.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/session/turn.rs
- 机制：Turn 有独立 ID、取消令牌、执行上下文，主会话不会把子任务状态混成同一条记录。
- 应用对账：`AgentProgressPanel.vue` 只有轮询 UI，`electron/main.js` 没有真实 Agent turn 状态源。
- 采纳：采纳。设计 `AgentTurn` 状态结构，含 `turnId/status/step/toolCallId/cancelToken/checkpoint`。

