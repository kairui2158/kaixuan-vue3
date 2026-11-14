# TASK LEDGER · Phase B observation closure

> 本台账记录 Phase B 观测闭环执行状态。B1 静态与双向 trace 干跑已通过；B2 三次真实供应商运行均为 `observational-blocked`，Phase D 三项未回填。

## 1. 目标与原话

用户原话（2026-11-14）：

> 我看方案里还留有Phase B的后续项目，你根据经验文件里的相关门禁和执行纪律来做方案

目标：执行 Phase D 观测闭环——通过一次真实供应商 folder-chain 运行回填 `postProcessReport.perf`、`repairScope`、`deai-model-profile injectedRuleCount` 三项，并对 F1-F5 行为提供证据。

## 2. 门禁读证

已核对：`_audit/神意开发经验总结_v9.md` 相关 G0.12/G0.13/G1.4/G1.14/G1.21/G1.30；方案第 11 节逐门禁对账。B2 前置读取 `STACK.md` 与 `DEV_LOG_MASTER_INDEX.md`，本轮未改产品/SKILL。

## 3. 路由判定

已确认：只改 `scripts/verify-deai-stage-guidance-live.mjs`；不改产品代码；不改 SKILL；不新增预算/调度/UI/第二裁判。

## 4. 影响圈与作者反证

已确认影响圈：`scripts/verify-deai-stage-guidance-live.mjs` 仅新增只读观测与断言。反推 1-5 已覆盖导出缺失、入口 scope、有机账本零规则、业务失败、部分章节失败五类风险。

## 5. 停止条件

已确认停止条件：完成须通过静态检查、双向 trace 干跑、B2 三章真实运行、文档/索引收尾与提交；任一失败则登记 `observational-blocked/failed`，不宣称闭环。

## 6. 执行证据

### B1 静态检查

`[VERIFICATION] node --check scripts/verify-deai-stage-guidance-live.mjs` → exit 0。

### B1 实现位置

`scripts/verify-deai-stage-guidance-live.mjs:598-695`：`collectChapterObservation` 读取 `run.folderDiagnostics`、`body-artifact-attempt` 与 `run.stateHistory`，输出 `postProcessPerf`、`repairScopes`、`traceStateTimeline`。

`scripts/verify-deai-stage-guidance-live.mjs:725-783`：`assertObservations` 断言 perf 三态、首调 `repairScope=none`、failed→success 双跳为 0，并将 model profile 放宽为“成熟释放/未成熟不释放”两态。

`scripts/verify-deai-stage-guidance-live.mjs:697-723`：summary schema/version 为 `shenyi.deai-stage-guidance.live` v3，`classification=observational`；`verificationStatus` 由调用点写入。

### B1 干跑证据

成功 trace：`_audit/verification-deai-stage-guidance-electron/run-trace.json` → 全部观测断言 PASS。实测：`postProcessPerf=['thresholdNotMet'×3]`；`repairScopes[0].repairScope='none'`；`traceStateTimeline.failedToSuccessDoubleJump=0`；model profile 3 条均为成熟释放且注入≤3。

失败 trace：`_data/deai-stage-guidance-live-exports/20261106-095637/run-trace-正文层-20261106-175647-deep/run-trace.json` → `runStatus=failed`，断言按设计抛出。实测：`postProcessPerf=[null]`，`repairScopes=[{repairScope:'none', status:'error'}]`；负面证伪证明不会把失败 run 假过。

注意：上述是历史 trace 干跑，只证明 B1 观测器接线；不能替代 B2 真实供应商运行。

### B2 真实供应商运行证据

供应商：`prov-1793816697590` / glm-5.3 / `https://api.kjdfhl.school/v1`。

1. `run-20261114-060516`：DEAD_TIMEOUT_MS=180000，第 1 章 S1 单次物理调用 180,004ms 仍 `running`，被验证器判死；`summary.json` `businessStatus=failed / verificationStatus=completed`。该 `completed` 由旧版观测器写入，不代表业务成功；新版脚本已正确映射 `observational-blocked`。证据目录 `_audit/verification-deai-stage-guidance-live/run-20261114-060516/chapter-1-deep-trace/`。
2. `run-20261114-061535`：章级 30 分钟超时，8 次物理调用、1 个 API 仍 `running`；`summary.json` `businessStatus=failed / verificationStatus=observational-blocked`。证据目录同根 `run-20261114-061535/chapter-1-deep-trace/`。
3. `run-20261114-064747`：章级 45 分钟、全局 50 分钟超时，9 次物理调用、1 个 API 仍 `running`；`summary.json` `businessStatus=failed / verificationStatus=observational-blocked`。导出 trace `_data/deai-stage-guidance-live-exports/20261114-064747/run-trace-正文层-20261114-144756-deep/run-trace.json` 暴露 S2 失败接线缺陷（见第 7 节）。

结论：三次都没有产出成功章级观测，Phase D 的 `postProcessReport.perf` / `repairScope` 顺序 / `deai-model-profile injectedRuleCount` 仍为 `untested`。失败本身证明 B2 断言链不会假过，但不满足方案第 8 节完成条件。

## 7. 缺口清单与边界

### 已关闭

- B1 观测器未覆盖 perf / repairScope / trace-state 双跳的缺口。
- model profile 断言误把有机账本零规则当作 live 失败的缺陷。
- `verificationStatus` 口径：`observational-pass`、`observational-blocked`、`observational-failed` 已在方案第 4 节声明；现有运行时临时态为 `running/completed`，需在 B2 收尾映射。

### 未关闭

1. Phase D 三项未回填：`postProcessReport.perf`、`repairScope` 运行顺序、`deai-model-profile injectedRuleCount` 保持 `untested`。
2. glm-5.3 deep 单步可达 723 秒以上；默认 DEAD_TIMEOUT_MS=180000 过短，但后续两次用 30/45 分钟章级超时仍未终态收敛。该模型/供应商稳定性与超时口径是独立观测项，本轮不改产品重试策略。
3. S2 失败接线缺陷：`PipelinePanel.vue:4934-4938` 对 `callerStatus !== 'success'` 提前返回，跳过 `resolveStepArtifactFlow`、`body-step-acceptance` trace、`rememberBodyStepAcceptance` 与 `completedStepOutputs.concat`。因此 `stepAcceptanceDecisions=[]`，失败步产物不持久化。
4. targeted 修复路由语义缺口：`planBodyArtifactExecution`（`bodyArtifactOrchestrator.ts:211-220`）对 `quality_failed` 从生成步（S2，index 1）定点重跑，但 `PipelinePanel.vue:4575-4596` 复用 `skillIndex=startIndex-1`（S1）产物且要求 `isGeneratorEnvelopeArtifact`。S1 现役是 legacy 行合同，天然失败；`run-20261114-064747` seq 226/227 实测 `generator_envelope_missing → upstream_artifact_invalid → startSi=0` 全链重跑。这不是执行器行为不符，而是 targeted 修复的产物形态假设与 S1 合同不一致。
5. `run-20261114-060516` 的 `verificationStatus=completed` 是旧观测器汇总语义，不构成假 pass；B2 成功样本缺失已按 `observational-blocked` 记账。

### 交接项

缺陷 3/4 不在本方案内修：需按 `AGENTS.md` 先读代码再改，走独立缺陷单方案（见 `_audit/PROPOSAL_2026-11-14_BODY_GENERATOR_FAILURE_WIRING_V1.md`）。边界：只修应用侧接线与路由语义，不改 SKILL、不加第二裁判、不新增预算/调度/UI。
