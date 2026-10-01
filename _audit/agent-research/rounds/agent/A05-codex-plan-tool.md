# A05 Codex 计划工具

- 仓库：openai/codex
- 源码：codex-rs/core/src/tools/handlers/plan.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/plan.rs
- 关键证据：计划参数解析失败时返回纠正性错误（81-110），不是静默失败。
- 机制：Agent 对复杂任务先形成计划，再执行；坏参数要让模型可以自纠。
- 应用对账：EditTask 有 planning 状态，但 direct 对话的长任务缺少计划前置。
- 采纳：采纳。长任务进入 `agent.plan`，计划成为 runTrace 一等事件。

