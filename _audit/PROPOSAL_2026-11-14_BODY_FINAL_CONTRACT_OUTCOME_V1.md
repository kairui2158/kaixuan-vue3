# 2026-11-14 正文层终态契约与产物回退方案 V1

## 目标
1. 终稿验收后，历史物理调用失败不再毒化 run 终态。
2. 结构化阻断不再被字数合同放行；质量失败先 targeted，targeted 失败再 full_chain。
3. 断点恢复与定点修复复用 S2/S3 产物前，先做纯结构信封校验。
4. postProcess perf 观测三态化，暴露 usage 缺失和阈值未命中。

## 裁决边界
- SKILL 拥有叙事质量判定；应用只保存判定并路由。
- 应用新增的 `isGeneratorEnvelopeArtifact` 只查交付形态：JSON 信封 + 非空 body + 非空 extractedMeta。
- 不新增预算系统、调度器、UI 或第二裁判。

## 执行结果
### Phase A
- `src/services/pipelineRunOutcome.ts`：历史物理调用 failed 仅在 `!finalArtifactAccepted` 时毒化终态。
- 新增 `src/services/pipelineRunOutcome.spec.ts`。
- 验证：10 tests PASS；type-check / build:vue PASS。
- Commit: `7992942a`

### Phase B
- `src/services/bodyArtifactOrchestrator.ts`：新增唯一 `blockingVerdict`，blocked+retryable → `handoff_not_ready`，failed+blockingGateFailed → `quality_failed`；第一次质量失败走 targeted，targeted 失败后 full_chain；`validation.valid` 必须服从 blocking verdict。
- 验证：32 tests PASS；type-check / build:vue PASS。
- Commit: `2dbd11b8`

### Phase C
- `src/services/chainExecution.ts`：新增纯结构函数 `isGeneratorEnvelopeArtifact`。
- `src/components/pipeline/PipelinePanel.vue`：断点恢复和定点修复复用前校验信封；失败降级整链并记录 `body-resume-artifact-invalid` 或 `upstream_artifact_invalid`。
- `src/services/chainExecution.spec.ts`：补完整信封、空 body、缺 metadata、非法 JSON、legacy 五类用例。
- 验证：focused 33 tests PASS；Phase A/B focused tests PASS；type-check / build:vue PASS。
- Commit: `d249dca6`

### Phase D
- `src/services/realSkillExecutor.ts`：`postProcessReport.perf` 三态化。
- `src/services/realSkillTypes.ts`、`src/stores/runTrace.ts`：同步类型。
- `src/services/realSkillExecutor.spec.ts`：保留 `usageUnavailable`，新增 `thresholdNotMet`。
- 验证：全量 `npm run test:services` 251 files / 2748 tests PASS；`npm run type-check` PASS。
- 状态：`untested`。真实供应商 trace 未回填，不宣称闭环。
