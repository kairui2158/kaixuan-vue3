# A25 Vercel stopWhen 条件

- 仓库：vercel/ai
- 源码：examples/ai-functions/src/harness-agent/claude-code/stop-when.ts
- 原始地址：https://github.com/vercel/ai/blob/main/examples/ai-functions/src/harness-agent/claude-code/stop-when.ts
- 机制：Agent 可配置停止条件，如步数、无未完成 turn。
- 应用对账：direct 6 轮、tool-intensive 12 轮是静态经验值。
- 采纳：部分采纳。保留安全上限，但停止语义由任务状态决定，不只由次数决定。

