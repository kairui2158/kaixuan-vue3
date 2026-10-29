# 正文层降AI V2 校准发布门禁（2026-10-29）

## 结论

降AI V2 保持 `provisional: true`。解除 provisional 不允许按主观感觉宣布，必须通过脚本化发布门禁：

```powershell
node scripts/calibrate-deai-v2-thresholds.mjs
node scripts/verify-deai-calibration-release-gate.mjs _audit/verification-deai-calibration/deai-v2-calibration-<date>.json
```

第二条命令 exit 0 才代表 `READY_TO_REMOVE_PROVISIONAL`；exit 1 必须保持 provisional，并把失败项写进台账。禁止为了通过门禁调低要求。

## 放行条件

| 条件 | 硬标准 | 当前状态 | 结论 |
|---|---:|---:|---|
| 已核验人类来源身份 | >= 10 | 10（8 实名 + 2 用户指定匿名身份） | PASS |
| 未核验来源身份样本 | 0 | 0 | PASS |
| 覆盖题材 | >= 7 | 7 | PASS |
| 真实模型正样本分组 | >= 3 | 3 | PASS |
| 每个模型组样本数 | >= 30 | 4 | FAIL |
| 正样本供应商数 | >= 2 | 2 | PASS |
| held-out 人写 suspicious+ 误伤率 | <= 10% | 43.00% | FAIL |
| held-out 人写 blocking 误伤率 | <= 5% | 69.50% | FAIL |
| 最差已核验来源身份 suspicious+ | <= 20% | 70% | FAIL |
| 真实模型正样本 suspicious+ 召回 | >= 90% | 45% | FAIL |
| 真实模型正样本 n-gram 命中 | >= 90% | 95% | PASS |
| 召回 95% CI 半宽 | <= 10% | 21.8% | FAIL |
| 阈值曲线不同计数点 | >= 3 | 1 | FAIL |
| 20k 字检测耗时 | <= 300ms | 18.71ms | PASS |

2026-10-30 更新：`致命偏宠` 与 `最强反套路系统` 按用户裁决分别落为 `作者A`、`作者B`。这两个是稳定的独立语料来源 ID，manifest 明确标记为用户指定匿名身份，不冒充真实姓名核验。

## 当前 NOT READY 的真实含义

1. 语料深度不足：每个模型组只有 4-12 条，两组只有 4 条；作者身份侧已达到 10 个独立来源，其中 2 个是用户指定匿名身份。
2. 评分体系区分度不足：阈值曲线在 0.20-0.70 全部命中 180/180，只剩一个计数点；当前累加评分无法把人写与模型输出分层。
3. 双向证据不足：人写误伤 47.78%/75.56%，同时真实模型正样本 suspicious+ 召回只有 45%。当前不是“阈值偏高”单点问题，而是 finding 累加与阻断策略需要重设计。

## 下一步顺序

1. 先重设计评分与阻断：把 `deai-broken-punctuation`、`deai-style-drift`、`deai-banned-phrase` 的贡献、层级和产品口径拆开；目标是恢复阈值曲线区分度。
2. 评分重设计通过后，再扩真实正样本到每个模型组 >= 30 条，避免新样本继续被同一套评分吃掉。
3. 扩真实模型正样本到每个模型组 >= 30 条；本轮新增的作者A/作者B人写误伤率仅 7%/13%，是后续评分重设计的高价值负样本。
4. 复跑校准与发布门禁，全部 PASS 后才允许移除 `provisional`，并同步更新运行时注释、测试、手册与发布清单。

## 边界

- 本门禁不改变运行时阈值、词库、评分权重。
- `provisional: true` 保留在 V2 报告层，观测能力可用，但不得作为阻断或最终判定依据。
- 门禁脚本输出落盘到 `_audit/verification-deai-calibration/deai-release-gate-<date>.json`，作为发布审计证据。
