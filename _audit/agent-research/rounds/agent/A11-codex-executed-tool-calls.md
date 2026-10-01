# A11 Codex 已执行工具调用追踪

- 仓库：openai/codex
- 源码：codex-rs/core/src/tools/executed_tool_calls.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/executed_tool_calls.rs
- 机制：记录已执行工具调用，防止重复执行与状态漂移。
- 应用对账：工具循环有计数，但缺少“已执行调用 ID 集合 + 结果摘要”的持久层。
- 采纳：采纳。Agent turn 内维护 executed tool call ledger，重复 callId 要归一处理。

