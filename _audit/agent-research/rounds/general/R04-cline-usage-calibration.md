# R04 Cline 真实 usage 校准压缩

- 仓库：cline/cline
- 源码：sdk/packages/core/src/extensions/context/compaction.ts
- 原始地址：https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/context/compaction.ts
- 关键证据：`previousRequestInputTokens` 用于校准本地估算（58-60,342-380）；共享常量触发比率 0.9，低估因子上限 4，总结输出预留 8192（`cline-compaction-shared.ts:15-31`）。
- 机制结论：成熟系统都会把“上次请求真实 input”作为本轮压缩判断的锚点，并对估算误差做上限保护。
- 应用对账：应用有 `apiCallBudget` 与 `contextBudget`，但缺少“上次真实请求输入”持久校准。
- 采纳结论：采纳。每个 provider/模型维护最近一次真实请求的 `inputTokens/outputTokens/contextWindow` 校准记录。

