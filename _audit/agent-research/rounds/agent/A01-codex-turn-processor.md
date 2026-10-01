# A01 Codex Turn Processor 是编排器而不是循环

- 仓库：openai/codex
- 源码：codex-rs/app-server/src/request_processors/turn_processor.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/app-server/src/request_processors/turn_processor.rs
- 机制：Turn Processor 负责接收请求、绑定会话状态、派发 turn，并把执行结果回传事件流。它不把业务逻辑散落在调用方。
- 应用对账：当前大纲/主页 direct 对话入口把轮次、工具、压缩逻辑分散在 `aiService.ts` 与组件内。
- 采纳：采纳。新建 `AgentOrchestrator`，作为 direct 与 pipeline 共用的唯一执行入口。

