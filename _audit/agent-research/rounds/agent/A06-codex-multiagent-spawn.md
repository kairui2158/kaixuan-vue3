# A06 Codex 子 Agent spawn

- 仓库：openai/codex
- 源码：codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs
- 关键证据：`handle_spawn_agent` 解析 fork 模式、角色、模型、推理强度（101-145）；`child_depth` 控制深度（131-159）；spawn 失败会记录 telemetry（208-217）；sub-agent activity 有 started 事件（224-234）。
- 机制：子 Agent 是显式工具调用，配置、来源、深度、失败路径都结构化。
- 应用对账：`electron/main.js:269-294` 的 `agent:execute/spawn` 是空壳，实际能力缺失。
- 采纳：采纳。实现 `agent.spawn`，保留 depth 限制与失败 trace。

