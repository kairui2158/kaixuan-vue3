# DEV LOG：降AI V2 评分重设计与校准仪器修正（2026-10-30）

## 背景

发布门禁把评分层的真实状态暴露出来：旧评分对真实模型正样本 suspicious+ 召回不足，人写 held-out suspicious+ 误伤又过高。本轮先修校准仪器自身的两处口径错误，再基于真实语料重设计评分信号，最后复跑校准与发布门禁。

## 交付

- `scripts/calibrate-deai-v2-thresholds.mjs`
  - `thresholdSensitivity` 从误用 token 个数改为 `score / 100 >= point`，恢复 0-100 分数刻度。
  - `blockingRate` 改为统计 `verdict === 'blocking'`；新增 `blockingFindingRate` 保留“出现 blocking finding”的观测口径，两个概念不再混写。
  - 进度与路径输出改走 `stderr`，`stdout` 只输出纯 JSON，校准产物不再被日志污染。
- `src/services/de-ai.js`
  - 新增 `deai-sentence-cv-excess` advisory finding。句长 CV 是当前最强分离信号：held-out 人写 200 条 mean 0.698、max 0.98、无一条 `CV >= 1`；真实模型正样本 20 条 mean 1.722，18 条 `CV >= 1`。
  - 评分规则：`CV >= 1.1` 且有 bigram/trigram/styleDrift 佐证时贡献 `28 + (CV - 1.1) * 20`；仅达到 advisory 阈值时最多贡献 18。保持 advisory，不做 blocking。
  - `provisional: true` 不变。
- `scripts/analyze-deai-v2-scoring.mjs`
  - 增加 6 个评分候选比选：legacy、cvThreshold100、cvThreshold130、cvSignal、cvNgramCombo、cvGuardedSignal。
  - `DEAI_SCORING_DEBUG=1` 时输出 `debugRows.humanTrain`。
- 测试
  - `scripts/tests/deai-v2.test.mjs` 新增“过度拉大句长方差不进入 blocking”用例。
  - `src/services/de-ai-v2.spec.ts` 增加同主题 Vitest 用例。

## 比选结论

`cvGuardedSignal` 被选为运行时实现：人写 train 误伤保持 0.35、held-out 保持 0.575，真实正样本 suspicious+ 从 0.45 提升到 0.85（分析器口径 0.9）。它没有把人写误伤转移给召回，是当前样本深度下最诚实的增益。

## 验证

- `node --check scripts/calibrate-deai-v2-thresholds.mjs scripts/analyze-deai-v2-scoring.mjs scripts/verify-deai-calibration-release-gate.mjs` → 全部通过。
- `node scripts/tests/deai-v2.test.mjs` → 10 passed。
- `npx vitest run src/services/de-ai-v2.spec.ts` → 14 passed。
- `node scripts/calibrate-deai-v2-thresholds.mjs` → `sampleCount=1000 heldOut=200 modelPositive=20`，产物更新为 `deai-v2-calibration-2026-10-29.json`。
- `node scripts/verify-deai-calibration-release-gate.mjs .../deai-v2-calibration-2026-10-29.json` → exit 1，`NOT_READY`。
- `DEAI_SCORING_DEBUG=1 node scripts/analyze-deai-v2-scoring.mjs` → 产物 `_audit/verification-deai-calibration/scoring-analysis-2026-10-30.json`。
- 删除 0 字节坏产物 `deai-v2-calibration-2026-10-30.json`，删除后 `Test-Path` 返回 `False`。

## 门禁结果

`NOT_READY`，`provisionalMustRemain: true`，失败 5 项：

1. `minSamplesPerModelGroup`：实际 4，要求每组 >= 30。
2. `humanSuspiciousOrHigherRate`：held-out 0.43，要求 <= 0.1。
3. `worstAuthorSuspiciousOrHigherRate`：0.7，要求 <= 0.2。
4. `modelPositiveSuspiciousOrHigherRecall`：0.85，要求 >= 0.9。
5. `recallConfidenceIntervalHalfWidth`：0.1565，要求 <= 0.1。

通过项：作者数 10、未核验标签 0、题材 7、模型组 3、供应商 2、blocking 误伤 0、n-gram 召回 0.95、阈值曲线 10 档、性能 15.16ms。

## 边界

- 本轮不提交 git、不封装、不做 live API、不解除 `provisional`。
- 真实正样本每组 4 条，深度不足以支持阈值/词库/权重发布；扩样是下一阶段硬前置，不能靠放宽门禁替代。
- 人写 suspicious+ 误伤仍高，说明评分体系还需要在真实正样本扩样后重新校准，本轮只登记不掩盖。
- 校准产物日期使用 UTC，本地 2026-10-30 凌晨运行的产物落在 `deai-v2-calibration-2026-10-29.json`，这是设计内行为；0 字节的 `2026-10-30` 空产物已删除。
