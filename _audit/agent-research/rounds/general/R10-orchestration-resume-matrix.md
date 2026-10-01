# R10 Vercel/LangGraph/OpenHands 恢复矩阵

- 仓库：vercel/ai、langchain-ai/langgraphjs、All-Hands-AI/OpenHands
- 源码：examples/ai-functions/src/harness-agent/claude-code/resume.ts、libs/checkpoint-postgres/src/index.ts、src/components/conversation-events/chat/event-content-helpers/get-action-content.ts
- 原始地址：https://github.com/vercel/ai/blob/main/examples/ai-functions/src/harness-agent/claude-code/resume.ts；https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint-postgres/src/index.ts；https://github.com/All-Hands-AI/OpenHands/blob/main/src/components/conversation-events/chat/event-content-helpers/get-action-content.ts
- 关键证据：Vercel `HarnessAgentResumeSessionState` 支持跨进程恢复；LangGraph checkpoint 与 store namespace 分层；OpenHands Action/Observation 强类型并支持 `TaskAction.resume`。
- 机制结论：Agent 成熟度取决于“状态可恢复 + 事件强类型 + 子任务可等待”，不是一次 prompt 循环。
- 应用对账：`electron/main.js:269-294` 的 agent IPC 是 `renderer_handled` 空壳；`AgentProgressPanel.vue` 只能轮询无真实状态源。
- 采纳结论：采纳。主进程提供 AgentRuntime 状态源，checkpoint、resume、wait、cancel 全部进入统一协议。

