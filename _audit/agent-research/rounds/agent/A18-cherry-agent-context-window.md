# A18 Cherry Agent 上下文窗口运行时

- 仓库：CherryHQ/cherry-studio
- 源码：src/main/ai/runtime/agentContextWindow.ts
- 原始地址：https://github.com/CherryHQ/cherry-studio/blob/main/src/main/ai/runtime/agentContextWindow.ts
- 机制：Agent 上下文与普通聊天上下文分离，按 Agent 配置计算窗口。
- 应用对账：应用 direct 对话、folder SKILL、pipeline 共用上下文策略，Agent 需要独立会话状态。
- 采纳：采纳。Agent 会话与普通对话上下文隔离，但复用统一压缩服务。

