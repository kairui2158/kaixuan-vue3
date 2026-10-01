# A08 Codex 子 Agent interrupt

- 仓库：openai/codex
- 源码：codex-rs/core/src/tools/handlers/multi_agents_v2/interrupt_agent.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/multi_agents_v2/interrupt_agent.rs
- 关键证据：`interrupt_agent` 调用 `agent_control.interrupt`（47-55）；analytics 记录结果（24-28）。
- 机制：Agent 可以被父级或用户中断，中断也是工具级可观测事件。
- 应用对账：EditTask 有 cancel；Agent 系统目前无真实中断协议。
- 采纳：采纳。实现 `agent.cancel/interrupt`，终态必须同步 activeTask、UI、runTrace。

