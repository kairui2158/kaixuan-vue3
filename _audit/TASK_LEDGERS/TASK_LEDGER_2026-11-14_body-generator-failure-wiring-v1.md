# TASK LEDGER · Body generator failure wiring V1

> 状态：方案待审核；未批准前不改产品代码。

## 1. 目标与原话

用户原话（2026-11-14）：

> 我看方案里还留有Phase B的后续项目，你根据经验文件里的相关门禁和执行纪律来做方案

目标：修复 Phase B 观测运行登记出的 W1/W2 两个应用侧接线缺陷，让失败步留下结构化验收账本，并让 S2 targeted 修复正确消费 S1 legacy 骨架。

## 2. 门禁读证

已读：`_audit/神意开发经验总结_v9.md`（v10.4.2）G0.6/G0.7/G0.9/G0.12/G0.13/G1.4/G1.14/G1.17/G1.21/G1.30/G2.9；已读 Phase B 台账第 6/7 节与相关代码锚点。

## 3. 路由判定

只改 `src/components/pipeline/PipelinePanel.vue` 中 W1/W2 两个接线点；不改 folder SKILL；不改叙事裁判权；不新增预算、调度、UI、第二裁判或新修复体系。

## 4. 影响圈与作者反证

影响圈：body step 失败路径、targeted-from-generator 上游形态判定、相关测试。

反证范围：失败空串、失败验收拒绝、失败 S2 误当 S1、非生成层 targeted、checkpoint replay、`onStepOutputs` 重复调用、终态反转。详细七条见方案第 5 节。

## 5. 停止条件

完成须通过 W1/W2 聚焦 spec、`npm run test:services`、`npm run type-check`、`npm run build:vue`、真实 Electron trace 对账、台账收尾与单独提交；任一失败则登记缺口，不宣称闭环。

## 6. 执行证据

已执行。批准后逐项回填：

1. **聚焦回归**：`npx vitest run src/components/pipeline/__tests__/body-generator-failure-wiring.spec.ts src/services/stepArtifactAcceptance.spec.ts` → `Test Files 2 passed (2)`、`Tests 29 passed (29)`。覆盖 W1 失败步接线断言、W2 S1 骨架 targeted 断言、malformed `extractedMeta` 防崩断言。
2. **全量回归**：`npm run test:services` → `Test Files 252 passed (252)`、`Tests 2758 passed (2758)`。
3. **静态回归**：`npm run type-check` → exit 0；`npm run build:vue` → exit 0。
4. **Live 1**：`_audit/verification-deai-stage-guidance-live/run-20261114-102110/chapter-1-deep-trace/run-trace.json` seq 155 `body-step-acceptance` 为 `level=error / callerStatus=failed / decision=reject / reason=caller_failed`；seq 352 为 `repairScope=targeted`。业务 postProcess 仍失败，但失败验收账本与 targeted 路由可见。该 run 暴露 malformed `extractedMeta` 后追加防崩修复。
5. **Live 2**：`_audit/verification-deai-stage-guidance-live/run-20261114-105520/chapter-1-deep-trace/run-trace.json` seq 360/659 失败步均写出 `decision=reject / reason=caller_failed`；seq 660 `body-artifact-attempt` 为 `repairScope=targeted / status=complete / wordCount=1945 / ratio=0.9725`，且 `stepAcceptanceDecisions` 含失败账本，未降级全链；seq 795 出现 `callerStatus=success / decision=accept`。`deai-stage-guidance` seq 796 为 `injected=true / guidanceChars=94 / budgetExceeded=false`。章级业务因 40 分钟超时未完成，诚实登记 `observational-blocked`，不作为 W1/W2 行为门禁。
6. **diff 与锚点**：W1 在 `src/components/pipeline/PipelinePanel.vue:4942-4977`；W2 在 `src/components/pipeline/PipelinePanel.vue:4575-4595`；防崩在 `src/services/stepArtifactAcceptance.ts:205-225`。`git diff --check` 无空白错误；diff 统计为 3 files / +87 / -6，另有新增聚焦 spec 文件。

## 7. 缺口清单与边界

已修复缺陷：

1. **W1**：`PipelinePanel.vue:4934-4938` 失败早退跳过 `resolveStepArtifactFlow`、trace、`rememberBodyStepAcceptance`、`completedStepOutputs.concat` 与 `executionPlan.onStepOutputs`。
2. **W2**：`PipelinePanel.vue:4571-4583` targeted-from-generator 将 S1 legacy 骨架误套 `isGeneratorEnvelopeArtifact`，实测降级全链重跑。
3. **防崩**：Live 1 证实 `extractedMeta` 为字符串时 advisory 解析崩溃，已在 `stepArtifactAcceptance.ts` 增加非数组防御并用 malformed 负向样例锁定。

### G1.14 缺陷面枚举与命中处置

| 枚举面 | 对账结果 | 处置 |
|---|---|---|
| `runStepSkills` 内 body 失败分支及其清理点 | 只有 W1 早退分支漏接 artifact flow；成功分支的验收、trace、记忆、产物回传未被改动 | 已修复 W1；成功断点 guard 与 deai/echo `callerStatus === 'success'` guard 保持原语义 |
| `reuseArtifacts` sibling 路径 | 检查 targeted-from-generator、checkpoint replay、生成步自身复用三类路径 | W2 只放宽 `startSi === generatorIndex` 且上游为 S1 的形态；checkpoint replay 与生成步信封合同不动 |
| `extractedMeta` 全部读取点 | focused/live 覆盖 advisory、narrative、FACT_LOCK 三处消费；`rg` 未见同函数外继续用 `?.join` 的 sibling | 非数组防御收敛到 `metadataSections`，负向测试锁定 |
| 链式字段写读 | W1 写 `body-step-acceptance`、`rememberBodyStepAcceptance`、`completedStepOutputs` 并调用 `onStepOutputs`；Live 2 seq 660 由 orchestrator 读到 `stepAcceptanceDecisions` | 写读闭环；继续保留原结构化 `callerStatus/blockingGateFailed/errors` |
| 旧协议残留 | 本方案不退役协议、不删除旧入口，只补接线 | 无新增迁移残留 |

### 独立保留项

1. **物理调用放大（独立缺陷单）**：Live 2 `chapter-1-observation.json` 记录 `apiCallCount=6 / physicalCallCount=14 / retryPhysicalCallCount=8`；预算在 `PipelinePanel.vue:3364` 为 16。逻辑重试乘物理重试造成放大，需要单独治理步级调用上限与计数口径。
2. **resume/replay 信封闸（独立缺陷单）**：Live 2 seq 362/661 出现两次 `body-resume-artifact-invalid (generator_envelope_missing)`。W2 只修 targeted-from-generator；断点恢复/replay 仍要求生成器信封，需独立对账生命周期与合同形态。
3. **`deai-model-profile` 校准门禁**：两次 Live 共 6 次 `released=false / releaseGate=calibration-not-ready / eligibleRuleCount=0 / injectedRuleCount=0`，已复核为校准数据未达标观测项；不是代码缺陷，处置见 `PROPOSAL_2026-11-15_THREE_REMAINING_ITEMS_V1.md`。
4. glm-5.3/deep 供应商耗时与稳定性、章级 40 分钟超时、503 属供应商观测项；本轮不把它伪装成应用或 SKILL 质量结论。
5. Phase D 其他观测项不因本修复宣布通过；正文质量提升仍需后续成功章级运行另行对账。

本轮边界不变：只修应用平台合同接线，不改 folder SKILL、不加预算系统、调度、UI 或第二裁判。

