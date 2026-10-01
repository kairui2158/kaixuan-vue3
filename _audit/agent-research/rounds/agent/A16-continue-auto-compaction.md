# A16 Continue 自动压缩触发

- 仓库：continuedev/continue
- 源码：extensions/cli/src/stream/streamChatResponse.autoCompaction.ts
- 原始地址：https://github.com/continuedev/continue/blob/main/extensions/cli/src/stream/streamChatResponse.autoCompaction.ts
- 机制：响应结束后按阈值判断自动压缩，压缩后再继续，不阻塞用户输入。
- 应用对账：应用压缩主要发生在下一次请求前，缺少统一时机。
- 采纳：采纳。API turn 完成后即判断压缩，用户输入不丢失。

