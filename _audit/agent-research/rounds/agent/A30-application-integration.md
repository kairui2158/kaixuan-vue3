# A30 应用集成反查与冲突控制

- 仓库：本应用对账，基于前 29 轮证据
- 源码：src/services/dialogueToolSurface.ts、src/services/editTaskService.ts、electron/main.js、src/services/runTrace.ts
- 原始地址：本地仓库
- 关键证据：工具面单源与读写授权已成型（dialogueToolSurface.ts:68-155）；EditTask checkpoint 与状态机成熟（editTaskService.ts:1-125）；Agent IPC 空壳（electron/main.js:269-294）。
- 机制结论：应用不是从零造 Agent，而是把 Codex 的编排语义映射到现有单源工具面、EditTask、runTrace。
- 采纳：采纳。Agent 不能另建第二工具面或第二状态机，只能作为编排层消费现有单源。

