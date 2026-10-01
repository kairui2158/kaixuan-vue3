# A12 Codex 指令文件分层

- 仓库：openai/codex
- 源码：codex-rs/core/src/agents_md.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/agents_md.rs
- 机制：指令按全局、项目、会话分层加载，且有合并优先级。
- 应用对账：应用已有 agent prompt/folder SKILL 分层，但没有统一 Agent 指令层。
- 采纳：采纳。Agent 指令分 `global/project/folder/session` 四层，合并结果进入 trace。

