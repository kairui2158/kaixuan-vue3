# TASK LEDGER：降AI V2 评分重设计与校准仪器修正（2026-10-30）

## 1. 目标与边界

目标：修正校准仪器口径，基于真实语料重设计 DEAI V2 评分，复跑校准与发布门禁，并把当前无法本地闭环的外部依赖如实登记。

边界：不提交 git；不重新封装；不做 live API；不解除 `provisional`；不为了门禁好看放宽任何指标；只处理本任务相关文件，不触碰工作区其他脏改动。

## 2. 门禁读证

- G1.21：校准器/分析器/门禁脚本属于验证器，脚本自身必须进入查账对象；0 字节产物先判仪器再判数据。
- G1.22：评分与 verdict 改动必须同时报告真实负样本误伤与真实正样本召回；provisional 只能按样本结构解除。
- G0.3：门禁 `NOT_READY` 必须如实保留，不得用单测通过冒充校准完成。

## 3. 路由判定

任务是“检测/评分类校准 + 验证脚本修正”，按 G1.21/G1.22 双门禁执行：先修仪器，再改评分，最后用同一语料复跑校准与门禁。

## 4. 执行记录

- 修正 `thresholdSensitivity` 的 0-100 分数刻度。
- 拆分 `blockingRate`（verdict 口径）与 `blockingFindingRate`（finding 口径）。
- 校准脚本 `stdout` 只输出 JSON，进度走 `stderr`。
- 新增 `deai-sentence-cv-excess` advisory finding 与守卫式评分贡献。
- 分析器增加 6 个评分候选比选与 humanTrain debug 输出。
- 单测与 Vitest 增加过度方差用例。
- 删除 0 字节坏产物 `deai-v2-calibration-2026-10-30.json`。

## 5. 验证记录

- `node --check` 三个脚本 → 通过。
- `node scripts/tests/deai-v2.test.mjs` → 10 passed。
- `npx vitest run src/services/de-ai-v2.spec.ts` → 14 passed。
- `node scripts/calibrate-deai-v2-thresholds.mjs` → `sampleCount=1000 heldOut=200 modelPositive=20`。
- `node scripts/verify-deai-calibration-release-gate.mjs` → exit 1，`NOT_READY`，失败项见第 7 节。
- `DEAI_SCORING_DEBUG=1 node scripts/analyze-deai-v2-scoring.mjs` → 输出 `scoring-analysis-2026-10-30.json`；`cvGuardedSignal`：人写 train 0.35、held-out 0.575、正样本 0.9。

## 6. 边界与外部依赖

- 每个真实模型正样本组只有 4 条，要求 >= 30；扩样需要真实供应商生成，不能本地合成。
- 人写 held-out suspicious+ 0.43、最差作者 0.7，评分误伤未达标。
- 正样本召回 0.85，要求 >= 0.9；95% CI 半宽 0.1565。
- 语料库在 `D:/codex/deai-corpus`，不在 git 工作区。
- `package.json` 无 `"type": "module"`，Node 的 MODULE_TYPELESS 警告是已知噪音，本轮不处理。

## 7. 证据

- 运行时：`src/services/de-ai.js:76`（CV 阈值）、`:351`（守卫式信号）、`:655`（finding）、`:667`（评分贡献）。
- 校准器：`scripts/calibrate-deai-v2-thresholds.mjs:18`（UTC 日期）、`:254`（blockingRate）、`:358`（thresholdSensitivity）、`:439`（产物名）。
- 分析器：`scripts/analyze-deai-v2-scoring.mjs:142`（候选比选）、`:295`（debugRows）。
- 测试：`scripts/tests/deai-v2.test.mjs:73`、`src/services/de-ai-v2.spec.ts:86`。
- 产物：`_audit/verification-deai-calibration/deai-v2-calibration-2026-10-29.json`、`deai-release-gate-2026-10-29.json`、`scoring-analysis-2026-10-30.json`。
