# DEV LOG — 2026-11-14 — deai-stage-guidance Phase B 观测闭环收尾

## 交付

Phase B 观测器（`scripts/verify-deai-stage-guidance-live.mjs`）已按方案 `_audit/PROPOSAL_2026-11-14_PHASE_B_OBSERVATION_CLOSURE_V1.md` 增强：读取 `folderDiagnostics.postProcessReport.perf`、`body-artifact-attempt.repairScope`、run 状态历史与 model profile 两态，并将业务失败收敛为 `observational-blocked`。

## 真实运行结果

| run | 超时 | 物理调用 | summary 终态 | 结论 |
|---|---|---|---|---|
| `run-20261114-060516` | DEAD 180s | 1 次后仍 running | `failed / completed`（旧观测器口径） | 180 秒看门狗先误杀 |
| `run-20261114-061535` | 章级 30m | 8 次，1 个 running | `failed / observational-blocked` | deep 供应商未收敛 |
| `run-20261114-064747` | 章级 45m / 全局 50m | 9 次，1 个 running | `failed / observational-blocked` | trace 暴露 S2 失败接线缺陷 |

三次均为真实 Electron + 真实供应商 folder-chain，均无成功章级 observation。Phase D 的 `postProcessReport.perf`、`repairScope` 运行顺序与 `deai-model-profile injectedRuleCount` 仍为 `untested`，不得宣称观测闭环。

## 新登记缺陷

trace `run-trace-正文层-20261114-144756-deep` seq 224-227 证实：

1. S2 三次 attempt 均 `folder-skill-blocking-gate failed`，但 `callerStatus !== 'success'` 在 `PipelinePanel.vue:4934-4938` 提前返回，跳过 artifact acceptance、trace、记忆与产物持久化；`stepAcceptanceDecisions=[]`。
2. targeted 修复复用上游产物时检查 `isGeneratorEnvelopeArtifact`（`chainExecution.ts:384-394`），而 targeted 计划从 S2 起步、检查的是 S1 产物（`PipelinePanel.vue:4575-4596`）。S1 现役是 legacy 行合同，天然不满足信封条件；实测降级为 S1 全链重跑。

以上登记为独立缺陷单：`_audit/PROPOSAL_2026-11-14_BODY_GENERATOR_FAILURE_WIRING_V1.md`。本轮不修产品代码。

## 验证

- `node --check scripts/verify-deai-stage-guidance-live.mjs` → exit 0。
- 双向 trace 干跑已留在 Phase B 台账第 6 节：成功历史 trace 全断言 PASS；失败历史 trace 按设计阻断。
- 真实运行三次证据保留于 `_audit/verification-deai-stage-guidance-live/` 与 `_data/deai-stage-guidance-live-exports/`。

## 边界

不新增预算、调度、UI、第二裁判或新修复系统；不改 SKILL；不宣称降AI提升质量；不把 `observational-blocked` 包装成 `observational-pass`。
