# A26 LangGraph checkpoint

- 仓库：langchain-ai/langgraphjs
- 源码：libs/checkpoint-postgres/src/index.ts
- 原始地址：https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint-postgres/src/index.ts
- 机制：图执行每个节点可保存 checkpoint，恢复时回到精确节点。
- 应用对账：EditTask checkpoint 只覆盖编辑批次。
- 采纳：采纳。Agent checkpoint 覆盖 turn、工具、压缩、子任务四层。

