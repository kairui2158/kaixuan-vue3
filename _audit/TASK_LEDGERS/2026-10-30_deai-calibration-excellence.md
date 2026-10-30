# TASK_LEDGER 2026-10-30 降AI优秀度校准器

## 1. 目标

用户要求：“我现在的要求不是要成熟度，而是要优秀度。”本轮把校准器从“能跑”升级为高可信、可复现、可审计的校准仪器：work-level 三段切分、分层置信区间、阈值敏感度、finding 消融证据与发布门禁兼容。

## 2. 门禁

- G1.22：真实负样本误伤与真实正样本召回必须分层报告；provisional 只能由证据解除。
- G1.21：校准器和门禁自身进入查账对象；产物必须可复现。
- G0.3：NOT_READY 必须如实保留，不用仪器口径掩盖。
- G0.12：本台账为七节闭环记录。

## 3. 影响圈

- 修改 `scripts/calibrate-deai-v2-thresholds.mjs`。
- 修改 `scripts/verify-deai-calibration-release-gate.mjs` 的阈值曲线判据。
- 新增本台账与后续 DEV_LOG。
- 不改 `src/services/de-ai.js` 阈值、词库、评分权重。
- 不动 `D:/codex/deai-corpus` 与原始书库。

## 4. 执行

- `DEAI_CALIBRATION_SAMPLE_COUNT` 默认改为 1000。
- 新增 author/work 级确定性切分：train / dev / held-out 三段，同一作品不跨段。
- 新增 bootstrap 置信区间、分作者统计、真实模型正样本分模型统计。
- 新增 finding 消融：每个 finding 的误伤降低值与召回损失。
- 新增阈值敏感度曲线：人写误伤率 + 正样本召回率双列。
- 产物名改为时间戳批次，避免同日覆盖。
- 修正门禁阈值曲线判据：同时要求人写误伤和正样本召回两列至少 3 个不同取值。

## 5. 验证

- `node --check scripts/calibrate-deai-v2-thresholds.mjs` → PASS。
- `node scripts/calibrate-deai-v2-thresholds.mjs` → `sampleCount=1000 heldOut=300 modelPositive=20`，产物 `deai-v2-calibration-20261030T150636Z.json`。
- `node scripts/verify-deai-calibration-release-gate.mjs <产物>` → `NOT_READY`，失败项 5 个。
- 人写 held-out suspicious+ 从旧报告 0.4788 降到 0.2367。
- 阈值曲线：score 0.55 时人写误伤 0.0967，正样本召回 0.85；score 0.4 时人写误伤 0.3767，召回 0.85；score 0.7 时人写误伤 0，召回 0.85。

## 6. 结论

本轮不改运行时。`provisional` 必须保留。校准器已经能诚实暴露两个核心缺口：

1. 正样本不足：每个模型组只有 4 条，要求 30 条，召回 CI 半宽 0.1565。
2. 评分区分度不足：score 阈值在 0.55 附近可把人写误伤压到 0.0967，但召回只有 0.85；score 提高到 0.4 以上时误伤明显上升。当前没有一个分数点同时满足误伤 ≤0.1 且召回 ≥0.9。

## 7. 缺口

- `minSamplesPerModelGroup`：4/30。
- `humanSuspiciousOrHigherRate`：0.2367/0.1。
- `worstAuthorSuspiciousOrHigherRate`：0.7/0.2。
- `modelPositiveSuspiciousOrHigherRecall`：0.85/0.9。
- `recallConfidenceIntervalHalfWidth`：0.1565/0.1。
