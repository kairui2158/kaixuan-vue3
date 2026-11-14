# DEV LOG — 2026-11-15 — SKILL 转达指纹与重试载荷对账

## 输入

SKILL 转达两项：正文层手册 §9 三个指纹过期；S2 attempt 2 反馈合成总长 12403 超过 12000 上限。

## 对账

1. 对 `D:/codex/玄武规划SKILL/凯旋-正文层/kaixuan-s1|s2|s3/script.js` 逐字节计算 SHA256，结果与 SKILL 声明的现役指纹一致：
   - S1：`398B51CE5D91BAC726229E3DE686B51D60CEC11C1C7ECFFCE36A78AA51D2550A` / 28563B
   - S2：`B109EB5F8596688A4C3B8794BAF2B23D2624E8FEEC2CEF58A3D48B04806C5C73` / 52022B
   - S3：`74E6BD77E0A2288FFCC9820BDEE22883652DABB65AE397288A0B0EFD209008F9` / 80380B
2. 解析 `run-trace-正文层-20261115-034957-deep/payloads/005-request.json`：system 3878 字符、user 7956 字符、总长 11834 字符；【结构化重试反馈】本体 255 字符。
3. 解析 `run-trace-正文层-20261115-034957-deep/payloads/012-request.json`：system 4447 字符、user 7956 字符、总长 12403 字符；【结构化重试反馈】本体 824 字符。
4. 源码核查：`schemaRetryFeedback.ts` 的反馈本身使用 errors/anchors/preview/scaffold 多项独立有界上限；`chainExecution.ts:152` 的 12000 是终步账本 `formatFinalStepLedger` 总限；S2 磁盘包中的 12000 分别是输入瘦身线 `S2_DIET_LIMIT` 与输出阻断线 `OUTPUT_BLOCK_CHARS`，均不是应用反馈合成总限。

## 结论

1. 指纹转达属实，手册旧快照属于应用侧文档滞留。
2. “S2 retry feedback 合成面超 12000”不属实：12403 是请求 system + user 总长，反馈本体仅 824 字符；12000 与该反馈路径无关。
3. 不改反馈合成代码；如果仍有反馈过大问题，必须先提供具体物理请求文件和字段口径复现。

## 变更

- 更新 `_audit/SKILL_HANDOFF_BODY_LAYER_FULL_PIPELINE_SPEC_2026-11-14.md` §9 当前声明指纹与快照日期。
- 在 L1 新增 G1.31 “SKILL 转达载荷对账”；未新增代码、预算系统、调度器、UI 或第二裁判。
