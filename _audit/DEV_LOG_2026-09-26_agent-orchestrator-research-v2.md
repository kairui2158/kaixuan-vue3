# 2026-09-26 内置 Agent 编排器 V2 社区调研

## 目标

基于初始方案框架，完成社区真实项目源码级调研，形成 10 轮总体记录与 30 轮 Agent 专项记录，对账应用后产出新方案框架供审核。

## 过程

1. 复核 `_audit/agent-research/cache` 的 55 份源码缓存与 `repo-index.json` / `selected.json`。
2. 逐份核对 Codex 基座关键源码：模型自有预算、服务器观测 prefill、压缩生命周期、工具注册冲突、工具可见性、spawn/wait/interrupt、context remaining、usage 累计。
3. 对账应用现状：`dialogueToolSurface.ts`、`editTaskService.ts`、`providerAdapter.ts`、`contextBudget.ts`、`toolLoopPolicy.ts`、`electron/main.js`。
4. 落盘 10 轮总体记录与 30 轮 Agent 专项记录。
5. 形成 Codex 基座映射表与 V2 方案。

## 产物

- `_audit/agent-research/rounds/general/R01-R10`
- `_audit/agent-research/rounds/agent/A01-A30`
- `_audit/agent-research/CODEX_BASELINE_MAPPING.md`
- `_audit/PROPOSAL_2026-09-26_AGENT_ORCHESTRATOR_V2.md`

## 成熟度结论

项目成熟方案与应用适配方案成熟；实现接线与验证方案半成熟。用户审核通过并完成 Phase 1-6 后，才能升为成熟并封装。

## 后续

等待用户审核 V2 方案。审核通过前不修改生产代码。

## M17 回头看

1. 原始目标复述：基于初始方案框架完成真实项目调研，10 轮总体记录 + 30 轮 Agent 专项记录，对账应用后输出新方案框架供审核。
2. 轮次核验：`rounds/general` 10 份，`rounds/agent` 30 份，数量与编号连续。
3. 生产代码核验：本轮只新增 `_audit` 调研产物，未修改 `src`、`electron`、`package.json`。
4. 证据核验：每轮记录均包含仓库、源码路径、原始 URL、机制、应用对账、采纳结论；源码证据来自本地缓存，不以 README 充数。
5. 方案成熟度：按 M18 明确标注为“半成熟”，且写明放行条件，未冒充成熟。
6. 遗留事项：`_audit/agent-research/work` 下的 sparse clone 理应清理，但当前工具策略阻止递归删除目录；缓存 `cache/` 与记录完整保留，不影响调研证据与后续执行。
