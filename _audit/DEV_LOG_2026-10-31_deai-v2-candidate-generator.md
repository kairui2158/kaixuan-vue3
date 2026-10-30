# DEV_LOG 2026-10-31 降AI V2 候选参数生成器

## 1. 目标

研发侧校准候选参数生成器：在不修改运行时检测器、词库、评分权重与 `provisional` 的前提下，生成可复现、可审核的候选阈值方案。用户最新指令为“进行下一个阶段”。

## 2. 交付

- 候选评分代理：完整重建运行时评分刻度（blocking/advisory 权重、style drift、句长 CV 贡献），feature row 保留当前 blocking/advisory finding 数量，默认候选可精确复现 runtime score。
- 搜索策略：full 模式为确定性 beam search（beam width 24、rounds 4、评估上限 200,000），minimal 模式为精确枚举；产物如实报告 `strategy`、`evaluatedCount`、`exhaustive=false`，不伪装全量枚举。
- 数据隔离：推荐候选在 train/dev 上决定；held-out 只做一次复验，不参与搜索与推荐。
- CLI：新增 `DEAI_CANDIDATE_BEAM_WIDTH`、`DEAI_CANDIDATE_SEARCH_ROUNDS`；minimal 强制 exact enumeration。
- 产物：`proposal.recommendedCandidate`、`changesFromRuntimeDefaults`、dev 分组表现、held-out 复验、候选池、模型组样本数与缺口说明。

## 3. 关键文件

- 候选库：`scripts/lib/deai-v2-candidates.mjs`
- 生成 CLI：`scripts/generate-deai-v2-candidate-thresholds.mjs`
- 单测：`scripts/tests/deai-v2-candidates.test.mjs`
- full 产物：`_audit/verification-deai-calibration/deai-v2-candidate-thresholds-20261030T224305Z.json`
- minimal 产物：`_audit/verification-deai-calibration/deai-v2-candidate-thresholds-20261030T224342Z.json`
- 台账：`_audit/TASK_LEDGERS/2026-10-31_deai-v2-candidate-generator.md`

## 4. 验证

- `node --test scripts/tests/deai-v2-candidates.test.mjs`：10 passed。
- `node --test scripts/tests/deai-calibration-corpus.test.mjs`：4 passed。
- `node --test scripts/tests/deai-v2.test.mjs`：10 passed。
- `npx vitest run src/services/de-ai-v2.spec.ts src/services/deaiObservationEvents.spec.ts`：2 files / 17 tests passed。
- minimal：`exact-enumeration combinations=512 evaluated=512 fullyEligible=0`。
- full：`deterministic-beam combinations=3,675,000 evaluated=1,956 fullyEligible=0`，无 OOM，非 exhaustive 如实登记。
- 既有校准器复跑：`sampleCount=1000 heldOut=300 modelPositive=52`。
- release gate 复跑：`NOT_READY`，失败项为 `minSamplesPerModelGroup=4`、`humanSuspiciousOrHigherRate=0.2367`、`worstAuthorSuspiciousOrHigherRate=0.7`、`modelPositiveSuspiciousOrHigherRecall=0.8654`。

## 5. 当前候选结论

full 搜索推荐 4 个参数变化：`sentenceCVHighNgramBigram 900→300`、`sentenceCVHighNgramTrigram 300→100`、`blockingWeight 12→8`、`advisoryWeight 6→0`。在当前切分下：train/dev 人写 suspicious+ 均为 0，dev 正样本召回 0.8333；held-out 人写 0、正样本召回 0.9、n-gram 1.0。

该候选只能进入人工审核，不能视为校准通过：`fullyEligible=0` 表示没有任何候选同时达到正样本召回与 n-gram 硬门禁；且正样本模型组深度不足，最小模型组仅 4 条。

## 6. 边界

- 未修改 `src/services/de-ai.js`，未修改语料库 `D:/codex/deai-corpus/`。
- 未解除 `provisional`，未放宽 release gate，`NOT_READY` 如实保留。
- 不提交 git、不封装、不做 live 供应商验证。
- full 搜索是确定性 beam，不是全量枚举；不能声称全局最优。
- held-out 不参与搜索和推荐，只做最终复验。
