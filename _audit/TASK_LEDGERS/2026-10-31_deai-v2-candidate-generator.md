# TASK_LEDGER 2026-10-31 降AI V2候选参数生成器

## 1. 目标与原话

- 用户原话：“进行下一个阶段”。
- 最终可感知行为：研发侧候选参数生成器在真实语料上完成可复现的有界搜索，输出与 held-out 复验对齐的候选提案；不改应用运行时阈值、词库与 `provisional`。
- 本轮交付物：候选搜索库、生成 CLI、单元测试、full 搜索产物、DEV_LOG 与主索引登记。

## 2. 门禁读证

- G0.3（`_audit/神意开发经验总结_v9.md:36`）：`NOT_READY` 与未验证面必须如实保留，不用仪器口径包装。
- G0.5（`:52`）：收尾前逐行审 diff、复核生产入口与验证证据。
- G0.7（`:68`）：非平凡修改需正反推，锚定真实检测入口与真实语料路径。
- G0.12（`:112`）：七节台账，无台账不得声称完成。
- G1.21（`:392`）：脚本需可复现、显式失败、非零退出；full 搜索不得伪装为全量枚举。
- G1.22（`:408`）：候选比选必须同报负样本误伤与正样本召回；CI 与分层证据不得被候选搜索吞掉。
- G1.24（`:430`）：候选评分代理必须与运行时评分同刻度，指标名不得跨语义域混用。

## 3. 路由判定

- 加入：G0.3/G0.5/G0.7/G0.12/G1.21/G1.22/G1.24，因本轮修改校准仪器与候选评分代理。
- 排除：G1.23，本轮不暴露对外契约开关；G2.9，本轮不改生成流水线运行时；G2.13，本轮不改 SKILL 执行协议。排除理由均为无对应改动面。

## 4. 影响圈与作者反证

- 打算改：`scripts/lib/deai-v2-candidates.mjs`、`scripts/generate-deai-v2-candidate-thresholds.mjs`、`scripts/tests/deai-v2-candidates.test.mjs`、本轮台账/DEV_LOG/主索引。
- 可能碰到：`scripts/calibrate-deai-v2-thresholds.mjs` 只做回归复跑，不修改；`src/services/de-ai.js` 只读，不改。
- 最可能错假设：候选代理能等价运行时评分。证伪方式：默认候选必须逐行还原 runtime score；若残差非零，停止参数结论并修代理。
- 第二风险：beam 搜索漏掉全局最优。证伪方式：与 minimal 精确枚举对照，产物报告真实评估数与策略，不声称 exhaustive。

## 5. 停止条件

- `node --check` 三个脚本通过。
- 候选器测试、校准语料测试、既有 V2 测试全部通过。
- minimal 与 full 生成器均产出 JSON，full 不 OOM，产物包含真实评估数、推荐候选、held-out 复验与缺口。
- 既有校准器可复跑，release gate 结论如实保留。
- 台账、DEV_LOG、主索引完成且无空白节。

## 6. 执行证据

- 代码：
  - `scripts/lib/deai-v2-candidates.mjs:80-89`：feature row 新增 `currentBlockingCount`、`currentAdvisoryCount`，评分代理可重建运行时 base score。
  - `scripts/lib/deai-v2-candidates.mjs:124-161`：候选评分公式为 blocking/advisory 权重 + style drift + CV contribution，与 `src/services/de-ai.js:686` 运行时公式同刻度。
  - `scripts/lib/deai-v2-candidates.mjs:239-318`：full 搜索为 deterministic beam；minimal 强制 exact enumeration；真实输出 `strategy` 与 `evaluatedCount`。
  - `scripts/generate-deai-v2-candidate-thresholds.mjs:132-149`：推荐候选先由 train/dev 决定，held-out 仅做一次复验。
  - `scripts/generate-deai-v2-candidate-thresholds.mjs:151-165`：`proposal.selection` 包含 dev 正样本召回、分组表现、held-out 人写误伤与正样本召回字段。
  - `scripts/tests/deai-v2-candidates.test.mjs:45-55`：row 夹具补齐新字段。
  - `scripts/tests/deai-v2-candidates.test.mjs:61-71`：旧断言从“忽略 runtime CV”修正为“默认候选复现 runtime CV 贡献”，避免违反 G1.24 的跨刻度口径。
- 测试：
  - `node --test scripts/tests/deai-v2-candidates.test.mjs` → 10 tests passed。
  - `node --test scripts/tests/deai-calibration-corpus.test.mjs` → 4 tests passed。
  - `node --test scripts/tests/deai-v2.test.mjs` → 10 tests passed。
  - `npx vitest run src/services/de-ai-v2.spec.ts src/services/deaiObservationEvents.spec.ts` → 2 files / 17 tests passed。
- minimal 产物：
  - `_audit/verification-deai-calibration/deai-v2-candidate-thresholds-20261030T224342Z.json`
  - `strategy=exact-enumeration combinations=512 evaluated=512 fullyEligible=0`。
  - train/dev 人写 suspicious+ 均为 0，dev 正样本召回 0.8333，held-out 人写 0、正样本召回 0.9、n-gram 1.0。
- full 产物：
  - `_audit/verification-deai-calibration/deai-v2-candidate-thresholds-20261030T224305Z.json`
  - `strategy=deterministic-beam combinations=3,675,000 evaluated=1,956 fullyEligible=0`，明确 `exhaustive=false`。
  - 推荐 4 个参数变化：`sentenceCVHighNgramBigram 900→300`、`sentenceCVHighNgramTrigram 300→100`、`blockingWeight 12→8`、`advisoryWeight 6→0`。
  - train/dev 人写 suspicious+ 均为 0，dev 正样本召回 0.8333；held-out 人写 0、正样本召回 0.9、n-gram 1.0。
- 校准器与 release gate：
  - `node scripts/calibrate-deai-v2-thresholds.mjs` → `sampleCount=1000 heldOut=300 modelPositive=52`，产物 `deai-v2-calibration-20261030T223750Z.json`。
  - `node scripts/verify-deai-calibration-release-gate.mjs _audit/verification-deai-calibration/deai-v2-calibration-20261030T223750Z.json` → exit 1，`NOT_READY`。

## 7. 缺口清单

- full 搜索 `fullyEligible=0`：当前没有任何候选同时满足 `positive suspicious+ recall >= 0.9` 与 n-gram recall gate；推荐候选仍在 `devEligible` 池，必须人工审核，不能视为校准通过。
- 正样本深度不足：4 个模型组分别为 12/4/4/32 条，`minSamplesPerModelGroup >= 30` 未达标，仅 Kimi 组 32 条略过线。
- release gate 四项失败：`minSamplesPerModelGroup=4`、`humanSuspiciousOrHigherRate=0.2367`、`worstAuthorSuspiciousOrHigherRate=0.7`、`modelPositiveSuspiciousOrHigherRecall=0.8654`。
- full 与 minimal 推荐不同：full 更保守（4 参数变化），minimal 更激进（8 参数变化）；二者 held-out 表现相同，但 full 的非 exhaustive 边界意味着不能声称全局最优。
- 未验证面：不改运行时阈值，因此未做运行时替换后的真实流水线回归；本轮也不做 live 供应商验证、git 提交与封装。
