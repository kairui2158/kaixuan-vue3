# DEV LOG：降AI校准语料作者匿名身份收口（2026-10-30）

## 背景

用户裁决：`致命偏宠` 与 `最强反套路系统` 不需要真实作者名，分别使用用户指定的稳定匿名身份 `作者A`、`作者B`。校准需要的是可区分、可复现、不可混用的独立来源，而不是真实姓名。

## 改动

- `D:/codex/deai-corpus/labels/human-negative.jsonl`：200 条 label 从 `未知作者 / authorVerified:false` 改为 `作者A|作者B / authorIdentity:"anonymous-user-designated" / authorVerified:true`，其余字段保持原值。
- `D:/codex/deai-corpus/sources/human/authors/`：目录从 `%E6%9C%AA%E7%9F%A5%E4%BD%9C%E8%80%85` 迁移为小写编码目录 `%E4%BD%9C%E8%80%85a`、`%E4%BD%9C%E8%80%85b`，两个 `chapters.jsonl` 各 100 条同步身份字段，旧目录删除。
- `D:/codex/deai-corpus/manifest.json`：`user-provided-raw-novels.authors` 变为 10 个独立身份；新增 `authorIdentity` 说明，明确匿名身份是稳定语料 ID，不冒充实名核验。
- `scripts/verify-deai-calibration-release-gate.mjs`：门禁文案从 "verified human authors" 改为 "verified independent human source identities"，避免语义造假；判定阈值未放宽。
- 新增迁移脚本 `_audit/verification-deai-calibration/anonymize-authors-20261030.mjs` 与 before 快照 `anonymize-before-20261030.json`，保留完整可追溯证据。

## 验证

- 迁移脚本：`node _audit/verification-deai-calibration/anonymize-authors-20261030.mjs` → `labels: 6494, replaced: 200`。
- 结构对账：labels 总数 `6494`；按作者分组为 10 组，`作者A:100`、`作者B:100`；`未知作者:0`；两个 source 文件各 100 条且身份字段不合规数为 0；旧目录存在性为 `false`。
- 校准复跑：`node scripts/calibrate-deai-v2-thresholds.mjs` → exit 0，`humanLabels: 6494`，`humanByAuthor` 出现 `作者A` 与 `作者B`，二者 suspicious+ 误伤率分别为 7%/13%。
- 门禁复跑：`node scripts/verify-deai-calibration-release-gate.mjs` → exit 1，`verifiedAuthorCount: 10` PASS，`unverifiedAuthorLabels: 0` PASS。
- 剩余失败项：`minSamplesPerModelGroup`、`humanSuspiciousOrHigherRate`、`humanBlockingRate`、`worstAuthorSuspiciousOrHigherRate`、`modelPositiveSuspiciousOrHigherRecall`、`recallConfidenceIntervalHalfWidth`、`thresholdCurveDistinctCounts`。

## 边界

- 不改运行时阈值、词库、评分权重，不解除 `provisional`。
- `authorVerified:true` 在本轮语义中表示“该独立来源身份已被用户确认并锁定”，不是真实姓名核实；manifest 中保留匿名身份说明。
- 模型正样本深度不足是独立缺口，本轮不处理。
