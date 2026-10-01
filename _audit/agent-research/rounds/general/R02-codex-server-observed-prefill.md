# R02 Codex 服务器观测 prefill 校准

- 仓库：openai/codex
- 源码：codex-rs/core/src/state/auto_compact_window.rs
- 原始地址：https://github.com/openai/codex/blob/main/codex-rs/core/src/state/auto_compact_window.rs
- 关键证据：`AutoCompactWindowPrefill` 区分 `ServerObserved` 与 `Estimated`（27-31）；首次服务器 usage 会覆盖估算（105-119）；后续估算不能覆盖服务器观测值（121-130）。
- 机制结论：本地 token 估算只做过渡值，真实 usage 到达后必须校准；压缩窗口的基线由服务器观测优先。
- 应用对账：`src/services/contextBudget.ts:72-125` 依赖本地窗口估算；`realSkillExecutor.ts:691-723` 存在 1.5x 假提升，未以真实 usage 为一等校准源。
- 采纳结论：采纳。建立 `usageReconciliation` 单源：真实 usage 到达后回写窗口基线，禁止估算值覆盖真实值。

