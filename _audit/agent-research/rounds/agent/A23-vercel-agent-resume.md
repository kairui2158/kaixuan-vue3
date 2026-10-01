# A23 Vercel Agent resume session state

- 仓库：vercel/ai
- 源码：examples/ai-functions/src/harness-agent/claude-code/resume.ts
- 原始地址：https://github.com/vercel/ai/blob/main/examples/ai-functions/src/harness-agent/claude-code/resume.ts
- 机制：HarnessAgentResumeSessionState 保存并恢复 agent 会话，跨进程可续。
- 应用对账：Electron 主进程重启后 agent 状态丢失。
- 采纳：采纳。Agent checkpoint 存本地，主进程恢复后可继续。

