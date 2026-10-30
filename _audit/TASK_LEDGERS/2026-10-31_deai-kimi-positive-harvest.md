# TASK_LEDGER 2026-10-31 Kimi 正样本收割与用户导出溯源

## 1. 目标与用户原话

用户目标原话：“这是生成流水线正文层生成的内容”，随后要求继续未完成工作。本轮目标：

1. 收割新增正文层真实模型输出进入外部校准语料。
2. 判定两个用户导出正文文件是独立正样本还是已入库样本的整理稿。
3. 复跑校准与发布门禁，诚实保留 `NOT_READY` 与 `provisional`。

## 2. 门禁读证与路由

- G0.12：`_audit/神意开发经验总结_v9.md:112` 要求七节台账，本文件即本轮台账。
- G1.21：脚本必须文件化、显式退出码、失败输出完整错误；本轮新增映射脚本遵守该规则。
- G1.22：`_audit/神意开发经验总结_v9.md:408` 要求真实负样本误伤与真实正样本召回双向报告；`provisional` 只能按样本结构解除。
- `_audit/HANDOFF_2026-10-29_DEAI_CORPUS_AND_LIBRARY.md:2.1`：正样本权威来源是 run trace `payloads/` 原始响应，不允许 UI 回显或人工拼接文本冒充独立样本。
- `_audit/SCRIPT_QUALITY_LESSONS_2026-10-29.md`：新增映射脚本先落盘再执行，只读外部语料，输出结构化报告。

路由判定：数据收割 + 溯源审计 + 校准复验；不改运行时检测内核。

## 3. 影响圈

- 修改：`scripts/harvest-deai-run-traces.mjs`（模型名点号保留与幂等合并为前轮未收口内容，本轮复核）。
- 新增：`scripts/map-deai-user-body-exports.mjs`。
- 新增外部语料数据：`prov-1793181379831/kimi-k3.1-pro` 32 条正样本。
- 更新外部登记：`manifest.json` 新增 `derivedEvidence.userBodyExportMapping`。
- 新增审计：`_audit/DEV_LOG_2026-10-31_deai-kimi-positive-harvest.md`、本台账、`DEV_LOG_MASTER_INDEX.md` 登记。
- 不修改：`src/`、阈值、词库、评分权重、`provisional`、应用安装包。

## 4. 执行证据

- `node --check scripts/map-deai-user-body-exports.mjs` → exit 0。
- `node scripts/map-deai-user-body-exports.mjs --export="C:/Users/凯瑞/Desktop/SKILL调试文件/正文层生成内容.txt" --export="C:/Users/凯瑞/Desktop/SKILL调试文件/正文生成内容2.txt"` → exit 0：
  - `正文层生成内容.txt` coverage 0.9945，matchedSamples 18，unmatchedIntervals 3。
  - `正文生成内容2.txt` coverage 0.9978，matchedSamples 18，unmatchedIntervals 2。
- 未覆盖区间证据：
  - 文件 1：`[0-18]` 题名与开头；`[3459-3488]`、`[4929-4960]` 为样本衔接编辑。
  - 文件 2：`[3210-3232]`、`[6571-6593]` 为样本衔接编辑。
- `node scripts/harvest-deai-run-traces.mjs --dry-run` → exit 0，`eligiblePhysicalCalls=44`。
- `node scripts/harvest-deai-run-traces.mjs` → exit 0，`preservedLabelCount=52`，`preservedSampleCount=44`，无重复。
- `node scripts/calibrate-deai-v2-thresholds.mjs` → exit 0，`modelPositive=52`。
- `node scripts/verify-deai-calibration-release-gate.mjs _audit/verification-deai-calibration/deai-v2-calibration-20261030T214006Z.json` → exit 1，`NOT_READY`，失败项 4 个。
- `node --test scripts/tests/deai-v2.test.mjs` → 10 tests passed。
- `node node_modules/vitest/vitest.mjs run src/services/de-ai-v2.spec.ts src/services/deaiObservationEvents.spec.ts` → 2 files / 17 tests passed。

## 5. 对账结论

- 用户导出文件不是独立正样本：99.45% / 99.78% n-gram 均能命中已入库 payload，未覆盖内容是题名与短衔接编辑。
- 权威正样本仍是 run trace `payloads/` 中的 S2/S3 原始模型响应。
- 语料规模提升为 52 条正样本、4 个 provider/model 组、3 个 provider。
- 门禁没有因样本数增加而放行，`minSamplesPerModelGroup`、人写误伤、最差作者误伤、正样本 suspicious+ 召回仍失败。

## 6. 缺口

1. `prov-1788185503573/deepseek-v4-pro` 12/30；`prov-1793181246179/deepseek-v4-pro` 4/30；`prov-1793181246179/glm-5` 4/30。
2. 人写 held-out suspicious+ 23.67%，要求 ≤10%。
3. 最差作者 suspicious+ 70%，要求 ≤20%。
4. pooled 正样本 suspicious+ 召回 86.54%，要求 ≥90%。

## 7. 边界

- 两个用户导出文件仅登记为衍生证据，不写入 labels。
- 不修改检测内核、阈值、词库、评分权重，不解除 `provisional`。
- 不做 git 提交、不封装、不发起 live API。
- 外部语料与映射报告不属于应用运行时依赖。
