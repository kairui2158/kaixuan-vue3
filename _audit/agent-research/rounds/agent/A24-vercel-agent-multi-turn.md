# A24 Vercel Agent 多轮驱动

- 仓库：vercel/ai
- 源码：examples/ai-functions/src/harness-agent/claude-code/multi-turn.ts
- 原始地址：https://github.com/vercel/ai/blob/main/examples/ai-functions/src/harness-agent/claude-code/multi-turn.ts
- 机制：多轮由 harness 控制 finish 条件，而不是让模型无限自循环。
- 应用对账：`toolLoopPolicy.ts` 有轮次上限，但缺“任务完成/停滞/需用户输入”三类终态。
- 采纳：采纳。Agent 终态机：completed、stalled、needs_user、failed、canceled。

