# A15 Continue 工具循环与历史一致性

- 仓库：continuedev/continue
- 源码：extensions/cli/src/stream/handleToolCalls.ts
- 原始地址：https://github.com/continuedev/continue/blob/main/extensions/cli/src/stream/handleToolCalls.ts
- 关键证据：tool call 先写入 assistant message（64-106），再执行工具；预处理错误挂在同一 assistant 消息上，避免重复 tool_result（109-127）。
- 机制：历史与执行解耦，先归档意图再执行，失败不产生重复消息。
- 应用对账：工具循环偶发重复调用与状态漂移，需要 executed call ledger 配合。
- 采纳：采纳。每个工具轮先写 turn event，再执行工具，失败更新同一条事件。

