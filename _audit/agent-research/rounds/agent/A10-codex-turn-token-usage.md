# A10 Codex 轮次 usage 累计

- 仓库：openai/codex
- 源码：codex-rs/core/src/state/turn_token_usage.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/state/turn_token_usage.rs
- 关键证据：按模型累计 usage，包含 cached/reasoning（11-38）。
- 机制：usage 是 turn 状态的一部分，跨请求累计而不是每请求孤立。
- 应用对账：应用 API 记录有 usage，但缺 turn 级累计与模型切换后的分层。
- 采纳：采纳。`AgentTurn.usage` 按 provider/model 分层累计。

