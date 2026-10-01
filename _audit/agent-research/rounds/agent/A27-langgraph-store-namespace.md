# A27 LangGraph store namespace

- 仓库：langchain-ai/langgraphjs
- 源码：libs/checkpoint-postgres/src/store/index.ts
- 原始地址：https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint-postgres/src/store/index.ts
- 关键证据：namespace + key + value 存储（86-121），支持删除与 namespace 检索（123-153,317-352）。
- 机制：状态存储有清晰命名空间，不同任务不会互相污染。
- 应用对账：Agent 状态建议使用 `projectId/agentId/turnId/layer` 命名空间。
- 采纳：采纳。

