# A13 Codex 模型能力表

- 仓库：openai/codex
- 源码：codex-rs/core/src/session/context_window.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/session/context_window.rs
- 机制：模型上下文与工具能力来自模型元数据，不靠 UI 手填。
- 应用对账：`providerAdapter.ts` 与设置页仍手填 token 上限。
- 采纳：采纳。内置模型能力目录，支持远端刷新与本地缓存。

