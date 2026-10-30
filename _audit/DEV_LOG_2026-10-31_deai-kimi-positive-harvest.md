# DEV_LOG 2026-10-31 Kimi 正样本收割与用户导出溯源

## 1. 目标

按 Track A 继续积累真实正文层正样本，并回答用户提供的两个正文导出文件是否构成新增正样本。结论：它们是已收割 payload 的整理拼接，不是独立样本；不应重复入库。

## 2. 交付

- `scripts/harvest-deai-run-traces.mjs` 修正模型名归一化：保留 `kimi-k3.1-pro` 中的点号，同时继续剔除路径非法字符。收割为增量幂等合并，不覆盖既有样本。
- 新增 `scripts/map-deai-user-body-exports.mjs`：只读映射用户导出正文与已入库模型正样本，使用 NFKC、去空白、引号归一、剥离【正文交接】、12 字符 n-gram 双向匹配、区间合并与未覆盖区间输出。
- 外部语料：
  - `labels/model-positive.jsonl` 从 20 条扩到 52 条。
  - 新增 `prov-1793181379831/kimi-k3.1-pro` 32 条。
  - `manifest.json` 新增 `derivedEvidence.userBodyExportMapping`，登记两个用户导出文件与映射报告。

## 3. 用户导出溯源结论

| 导出文件 | n-gram 覆盖 | 命中样本数 | 未覆盖 n-gram |
|---|---:|---:|---:|
| `正文层生成内容.txt` | 99.45% | 18 | 45 / 8185 |
| `正文生成内容2.txt` | 99.78% | 18 | 22 / 10019 |

未覆盖区间均为题名、少量过渡改写或约 20-31 字的衔接编辑，例如导出开头的章节题名“灰绿光下的舱门”、样本间“密码是他的生日翻到最后”等衔接句。主要命中样本均可追溯到 `run-trace.json` 的 `payloads/` 原始响应。

因此这两个文件不是新的独立正样本。把它们整文件入库会制造重复样本、夸大召回置信度，属于校准数据污染。

## 4. 校准与门禁

新鲜复跑产物：

- `_audit/verification-deai-calibration/deai-v2-calibration-20261030T214006Z.json`
- `_audit/verification-deai-calibration/deai-release-gate-2026-10-30.json`

关键结果：

- 人写 held-out：suspicious+ 23.67%，blocking 0%。
- pooled 正样本 suspicious+ 召回 86.54%，n-gram 召回 98.08%，召回 CI 半宽 9.28%。
- 性能：11.06ms / 20k 字。
- 门禁仍为 `NOT_READY`，失败项：
  - `minSamplesPerModelGroup`（最小组 4 / 30）
  - `humanSuspiciousOrHigherRate`（23.67% / ≤10%）
  - `worstAuthorSuspiciousOrHigherRate`（70% / ≤20%）
  - `modelPositiveSuspiciousOrHigherRecall`（86.54% / ≥90%）

`provisional` 继续保留。本轮没有修改检测内核、阈值、词库、评分权重、应用运行时或安装包。

## 5. 验证

- `node --check scripts/map-deai-user-body-exports.mjs` → exit 0。
- `node scripts/map-deai-user-body-exports.mjs --export=...正文层生成内容.txt --export=...正文生成内容2.txt` → exit 0，覆盖率 0.9945 / 0.9978。
- `node --check scripts/harvest-deai-run-traces.mjs`、`node --check scripts/calibrate-deai-v2-thresholds.mjs`、`node --check scripts/verify-deai-calibration-release-gate.mjs` → exit 0。
- `node scripts/harvest-deai-run-traces.mjs --dry-run` → exit 0：24 个 trace 目录，44 个 eligible physical calls。
- `node scripts/harvest-deai-run-traces.mjs` → exit 0：`preservedLabelCount=52`，`preservedSampleCount=44`，无重复入库。
- `node scripts/calibrate-deai-v2-thresholds.mjs` → exit 0：`sampleCount=1000 heldOut=300 modelPositive=52`。
- `node scripts/verify-deai-calibration-release-gate.mjs ...` → exit 1，`NOT_READY`（预期失败项保留）。
- `node --test scripts/tests/deai-v2.test.mjs` → 10 tests passed。
- `node node_modules/vitest/vitest.mjs run src/services/de-ai-v2.spec.ts src/services/deaiObservationEvents.spec.ts` → 2 files / 17 tests passed。
- 外部 `manifest.json` JSON 解析通过；52 条 labels 与源样本 ID、provider、model、charCount 对齐，缺失 0、错配 0。

## 6. 边界

- 两个用户导出文件只作为衍生证据登记，不进入 `labels/`。
- 不回滚或清理 `D:/codex/deai-corpus/` 既有数据。
- 语料仍不进入应用仓库、安装包或客户机。
- 本轮未执行 live API、未提交 git、未重新封装。

## 7. 下一步

1. 每个模型组补足至少 30 条真实正样本，当前 Kimi 已达 32，DeepSeek 与 GLM 仍缺。
2. 解决人写误伤的作者敏感问题，尤其是卖报小郎君、远瞳、辰东的 68%-70% suspicious+。
3. 任何阈值或词库修改必须继续走 G1.22 双向报告与 held-out 复验，不允许只优化召回。
