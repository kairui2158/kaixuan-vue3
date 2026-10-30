# DEV LOG 2026-10-30 降AI优秀度校准器

## 变更

- `scripts/calibrate-deai-v2-thresholds.mjs`
  - 默认样本量升至 1000。
  - 新增 author/work 级 train/dev/held-out 三段切分，同作品不跨段。
  - 新增 bootstrap 置信区间、分作者统计、真实模型正样本分模型统计。
  - 新增 finding 消融与双列阈值敏感度曲线。
  - 产物名改为时间戳批次。
- `scripts/verify-deai-calibration-release-gate.mjs`
  - 阈值曲线判据从单一计数改为双列判据，标准未放宽。

## 验证

- `node --check scripts/calibrate-deai-v2-thresholds.mjs` → PASS。
- `node --check scripts/verify-deai-calibration-release-gate.mjs` → PASS。
- `node scripts/calibrate-deai-v2-thresholds.mjs` → `sampleCount=1000 heldOut=300 modelPositive=20`。
- `node scripts/verify-deai-calibration-release-gate.mjs <最新产物>` → `NOT_READY`，失败项 5 个：`minSamplesPerModelGroup`、`humanSuspiciousOrHigherRate`、`worstAuthorSuspiciousOrHigherRate`、`modelPositiveSuspiciousOrHigherRecall`、`recallConfidenceIntervalHalfWidth`。

## 结论

本轮不改 `src/services/de-ai.js` 运行时阈值或词库。校准器已经能复现运行、分层统计、量化置信区间并暴露正样本不足与评分区分度不足。`provisional` 保留。
