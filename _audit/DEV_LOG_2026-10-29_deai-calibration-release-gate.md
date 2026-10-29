# DEV LOG：降AI校准发布门禁固化（2026-10-29）

## 背景

用户确认按建议方向推进。为避免“解除 provisional”退化成口头判断，本轮先把放行条件固化为脚本化硬门禁，再进入评分体系重设计。

## 交付

- 新增 `scripts/verify-deai-calibration-release-gate.mjs`：
  - 读取最新校准报告、`human-negative.jsonl`、`model-positive.jsonl`。
  - 检查作者核验、题材、模型组、每组样本深度、供应商数、人写误伤、召回、置信区间、阈值曲线区分度、性能。
  - 输出 `READY_TO_REMOVE_PROVISIONAL` 或 `NOT_READY`，并落盘 `_audit/verification-deai-calibration/deai-release-gate-<date>.json`。
  - NOT_READY 时 exit 1，防止 CI 或收尾流程误放行。
- 新增 `_audit/DEAI_CALIBRATION_RELEASE_GATE_2026-10-29.md`，登记 14 条硬标准、当前对账、失败项与下一步顺序。

## 关键修正

初版门禁的召回计算按“组内存在 suspicious+ 即整组命中”，得到虚高结果。已修正为按各组 verdict 计数汇总：

- 修正前：`modelPositiveSuspiciousOrHigherRecall = 1`。
- 修正后：`9/20 = 0.45`，95% CI 半宽 `0.218`。

这个修正使当前真实状态更刺眼：评分层不仅人写误伤严重，对真实模型正样本的 suspicious+ 召回也不足。

## 验证

- `node --check scripts/verify-deai-calibration-release-gate.mjs` → PASS。
- `node scripts/verify-deai-calibration-release-gate.mjs .../deai-v2-calibration-2026-10-29.json` → exit 1，`decision: NOT_READY`。
- 失败项：`verifiedAuthorCount, unverifiedAuthorLabels, minSamplesPerModelGroup, humanSuspiciousOrHigherRate, humanBlockingRate, worstAuthorSuspiciousOrHigherRate, modelPositiveSuspiciousOrHigherRecall, recallConfidenceIntervalHalfWidth, thresholdCurveDistinctCounts`。
- `node --test scripts/tests/deai-v2.test.mjs` → 9 passed。
- `npx vitest run src/services/de-ai-v2.spec.ts src/services/deaiObservationEvents.spec.ts` → 通过。
- `git diff --check` → PASS。

## 边界

- 本轮不改运行时代码、不改阈值、不解除 `provisional`、不提交 git、不封装。
- 下一阶段优先做评分与阻断策略重设计，然后才扩正样本，避免新样本被同一套评分吃掉。
