# 正文层内嵌降AI V2 真实中文样本校准报告（2026-10-29）

## 结论

Phase 10 已执行，校准数据已落盘。四条放行标准全部 PASS；但 V2 整体判定层仍是 **NOT CALIBRATED**，`provisional: true` 保留，不得宣称最终版。

## 数据来源与口径

- 负样本语料：`D:/codex/拆文库/踏星/.novel/benchmarks/踏星/原文/原文.txt`
- 文件大小：54,551,451 bytes；作者《踏星》随散飘风
- 章节头匹配 5,596 个；跳过前 20,000 字符的番外/重复区后主故事章节数 5,588
- 抽样：固定种子 `mulberry32(20261029)` 抽 200 章；入选条件为非空白字符 1500-6000
- 正样本：受控合成两类各 80 章（重复骨架型、词汇 hedging 型），是构造样本，不是任何真实模型输出
- 证据：`_audit/verification-deai-calibration/deai-v2-calibration-2026-10-29.json`（收尾复跑，2026-10-29T13:02:08Z，26.01ms）；`run-output-2026-10-29.txt` 保留修复词库后的首次运行（12:26:17Z，24.24ms），两次指标一致
- 脚本：`scripts/calibrate-deai-v2-thresholds.mjs`

## 四条放行标准对账

| # | 放行标准 | 校准结果 | 结论 |
|---|---|---|---|
| 1 | 对白 hedging 误伤率 < 5% | 192 章有对白，0 章触发，误伤率 0% | PASS |
| 2 | n-gram 命中率 > 90% | 重复骨架型 80/80 命中，100%；词汇 hedging 型 80/80 命中，100% | PASS |
| 3 | 变更率门禁拒绝“事实保留但整章重写” | `src/services/de-ai-v2.spec.ts` 三个直接用例：整章重写 rejected、30-50% warning、局部最小编辑 accepted | PASS |
| 4 | 20,000 字本地检测 + 变更率 < 300ms | 精确 20,000 字样本，本轮复跑 `detectBody` 26.01ms；另有 20k 字“检测 + 变更率合计 < 300ms”单测 | PASS |

## 首轮校准发现的真实缺陷与修复

首轮结果暴露 V2 报告层重大误伤：200 章真实人写章节 100% 被判 blocking，82.5% 达 suspicious+。根因是 V2 报告层复用 `BANNED_VOCAB` 全量词库（255 词），其中大量是自然中文通用词（如“虽然/或许/可能/立刻/淡淡/不知道/像”），它们不是 AI 特征词。

修复为分层词库，只改 V2 报告层，不改硬规则层：

- `src/services/de-ai.js:84` 新增 `DEAI_V2_BLOCKING_VOCAB`，只保留高置信强特征词（如“虎躯一震/空气仿佛凝固/赋能/嘴角勾起”）。
- `src/services/de-ai.js:278` 新增 `detectV2BannedVocab()`。
- `src/services/de-ai.js:1057` 的 `detectBody` 改用高置信子集。
- `src/services/de-ai.js:835` 的 `detectBannedVocab` 仍供 `processBody` 硬规则层使用，保持旧提示能力，不参与 V2 评分与阻断。

修复后复跑结果：blocking 率 81.5%（主要由 `deai-broken-punctuation` 108 章与 `deai-style-drift` 111 章贡献），suspicious+ 降至 56%。

## 整体判定为何仍 NOT CALIBRATED

1. 负样本只有一个作者（《踏星》）。`deai-broken-punctuation` 对连续破折号、感叹号连用的判定，以及 `deai-style-drift` 对首尾风格差的判定，可能只是该作者文风，不能据此宣称普适误伤。
2. 正样本是受控构造，不是真实模型输出；它证明规则可命中构造特征，不证明真实 AI 文本召回率。
3. 56% suspicious+ 误伤率对产品整体判定不可接受。分层阈值可以保留为 provisional 观测，整体 verdict 在多作者样本校准前不得作为阻断或强判定依据。

## provisional 边界

- `src/services/de-ai.js:626` 与 `:1012` 的 `provisional: true` 保留。
- `src/services/de-ai.js:60-62` 的阈值注释已更新为“作者限定 provisional”。
- 后续要移除 provisional，至少需要：多作者真实人写负样本、真实模型输出正样本、按作者/题材分层报告误伤与召回，并确认 broken-punctuation 与 style-drift 的产品预期。
