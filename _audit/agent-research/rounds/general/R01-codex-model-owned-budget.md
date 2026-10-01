# R01 Codex 模型自有预算机制

- 仓库：openai/codex
- 源码：codex-rs/core/src/session/token_budget.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/session/token_budget.rs
- 关键证据：`resolve_token_budget` 只在模型自带 `model_messages.token_budget` 时应用默认值（81-119）；模型默认值校验失败会回退用户配置（110-117）；`has_explicit_settings` 在默认值覆盖前检测显式配置（60-77）。
- 机制结论：预算属于模型能力层，不属于用户手填层；用户未显式配置时优先消费模型能力表，且默认值本身要过 validate。
- 应用对账：`src/services/providerAdapter.ts:86-100` 的 `resolveMaxTokens` 默认 `8192` 是假默认；`src/components/settings/ApiSettings.vue:112,116` 与 `AgentSettings.vue:46-47` 仍暴露用户手填语义。
- 采纳结论：采纳。应用改为“模型能力单源 + 显式高级覆盖”，设置页删除普通 token 上限语义；未知能力不得合成 8192。

