# A04 Codex 单一模型可见工具面

- 仓库：openai/codex
- 源码：codex-rs/core/src/tools/router.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/router.rs
- 关键证据：`from_parts` 存在单一 `model_visible_specs`（114-135）；`can_manage_children` 要求子管理工具成组暴露（120-134）；`exposes_tool` 是唯一可见性判定（175-207）。
- 机制：模型看到的工具、注册表中的工具、可管理子 Agent 的能力，三者统一在一个 router 里。
- 应用对账：`dialogueToolSurface.ts:68-155` 已接近该形态，可作为 Agent 工具面底座。
- 采纳：采纳。Agent 复用同一工具面单源，另加 Agent 管理工具组。

