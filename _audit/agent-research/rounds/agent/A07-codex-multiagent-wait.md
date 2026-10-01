# A07 Codex 子 Agent wait 与超时边界

- 仓库：openai/codex
- 源码：codex-rs/core/src/tools/handlers/multi_agents_v2/wait.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/multi_agents_v2/wait.rs
- 关键证据：timeout 必须在 min/max/default 三值内（53-65）；wait 有 InProgress 与 Completed 事件（76-113）。
- 机制：等待不是 sleep，而是 activity 订阅 + deadline。
- 应用对账：应用没有 agent wait；流水线 chain 只能顺序等待。
- 采纳：采纳。实现 `agent.wait`，支持订阅式等待与超时事件。

