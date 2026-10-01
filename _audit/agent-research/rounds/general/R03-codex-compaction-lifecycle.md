# R03 Codex 压缩生命周期确定性

- 仓库：openai/codex
- 源码：codex-rs/core/src/compact_token_budget.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/compact_token_budget.rs
- 关键证据：manual 与 inline auto 都走同一条 compaction lifecycle（19-55）；hook 可停止压缩（63-68）；最终统一调用 `start_new_context_window`（70-76）。
- 机制结论：压缩、换窗口、hook、turn item 是一个正式生命周期，不是请求前的临时字符串裁剪。
- 应用对账：当前应用上下文压缩分散在 `conversationContextService.ts` 与调用路径中，缺少统一可观测生命周期事件。
- 采纳结论：采纳。设计统一 `ContextCompactionController`，压缩前后、窗口切换、hook 结果全部写入 runTrace。

