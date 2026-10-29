# TASK_LEDGER 2026-10-29 降AI校准语料 Track A Phase A1-A2

## 1. 目标与用户原话

用户目标原话：“你是新的对话框，你读取文件来负责文件里的工作”。执行依据是 `_audit/HANDOFF_2026-10-29_DEAI_CORPUS_AND_LIBRARY.md`，本轮负责其中 Track A 前两阶段：

1. 建立 `D:/codex/deai-corpus/` 开发期离线语料库，与应用仓库分离。
2. Phase A1：扫描历史 `run-trace-*`，收割正文层生成步原始模型输出为正样本，产出统计报告。
3. Phase A2：扫描 `D:/codex/拆文库/`，建立 author/work/chapter 索引与负样本标签。
4. 不修改产品源码，不解除 `provisional`，不启动 Track B。

## 2. 门禁读证

- G0.12（`_audit/神意开发经验总结_v9.md:112`）：非平凡任务必须先建七节台账；本文件即本轮台账。
- G0.6（`:60`）：方案成熟度需评估。本轮为数据工程与只读收割/索引脚本，成熟度“半成熟”，断点是正样本识别需以 trace 实际结构验证。
- G0.9（`:84`）：影响圈必须先行。本轮新增语料目录、仓库内校准脚本、审计文档；不修改 `src/`、`electron/`、`package.json`。
- G0.10（`:92`）：新旧并存清零。本轮不删除旧链路，只新增语料管线；后续 Phase A3 改校准器时再执行旧语义反查。
- G1.21（`:392`）：复杂脚本必须先落 `.mjs/.ps1` 文件再执行，临时脚本带生命周期，输出阶段日志、finally 清理、非零退出码。
- G1.22（`:408`）：检测/阈值校准只能按样本结构解除 `provisional`；本轮只积累语料，不改阈值与 verdict。
- `_audit/DEV_LOG_2026-10-29_body-embedded-deai-v3.md:7`：当前整体判定保持 NOT CALIBRATED，Phase 1-10 不重复实现。
- `_audit/DEAI_SAMPLE_CALIBRATION_2026-10-29.md`：当前负样本单一作者、正样本合成，56% suspicious+，本轮目标是扩样本结构。
- `_audit/TASK_LEDGERS/2026-10-29_deai-github-benchmark-review.md:7`：明确未做多作者校准，本任务补齐该缺口。
- `_audit/SCRIPT_QUALITY_LESSONS_2026-10-29.md` 与 `_audit/TASK_LEDGERS/2026-10-29_script-quality-lessons.md`：脚本门禁已读，禁止一行式脚本、吞错、无生命周期临时脚本。

## 3. 路由判定

- 加入：G0.12 台账门禁、G1.21 脚本生命周期、G1.22 校准样本结构边界。
- 加入：G0.8 收尾清理，用于清理临时探针并保留交付脚本与证据。
- 排除：G0.11 真实交互冒充禁令，不适用，因为本轮无 Electron/UI 用户操作验证目标。
- 排除：G1.22 的阈值改动门禁，不适用，因为本轮不改检测器、阈值、词库、评分权重或 verdict。
- 排除：Track B 立项，不适用，交接文件明确其独立立项，不进入 Track A 完成判定。

## 4. 影响圈与作者反证

打算改：

- 新增 `D:/codex/deai-corpus/` 及其 README、manifest、目录骨架。
- 新增仓库内离线脚本 `scripts/harvest-deai-run-traces.mjs`、`scripts/index-deai-human-corpus.mjs`。
- 新增 `_audit/DEAI_CORPUS_A1_A2_REPORT_2026-10-29.md`、本台账、DEV_LOG。

可能碰到：

- run trace 目录结构可能存在多种版本，脚本必须逐目录输出结构识别结果，不允许按单一格式假设。
- `D:/codex/拆文库/` 目前只发现《踏星》，多作者门槛可能无法在本轮满足，必须如实登记而不是从别处搬语料。

作者反证：

- 如果正样本收割只统计“正文层”目录名而不校验 payload 生成步，就可能把卷纲/设定/outline 混入正样本；证伪方式是每条候选记录必须保留 trace path、step、provider/model、attempt id，统计报告列出跳过原因。
- 如果负样本索引只复制文本而不记录授权状态，后续校准会违反 G1.22；证伪方式是 manifest 与 label 每条都必须有 `authorization` 字段，无法确认则 `restricted`。

## 5. 停止条件

1. `D:/codex/deai-corpus/README.md`、`manifest.json`、目录结构存在。
2. Phase A1 脚本存在并以只读模式执行，输出 trace 数、可提取数、跳过原因分布、样本 JSONL 与统计报告。
3. Phase A2 脚本存在并以只读模式执行，输出作者/作品/章节数、去重记录、授权字段与 `labels/human-negative.jsonl`。
4. 两个脚本均为文件化脚本，带参数、显式退出码、异常输出与清理逻辑；无 `_tmp_` 脚本遗留。
5. 本台账第 6/7 节补齐本轮原始证据与缺口。

## 6. 执行证据

### 6.1 执行结果

- `node scripts/harvest-deai-run-traces.mjs --dry-run` → exit 0：`scannedTraceDirs=16`、`bodyTraceDirs=3`、`bodyApiCalls=5`、`eligiblePhysicalCalls=12`、`accepted=12`、`duplicates=0`。
- `node scripts/harvest-deai-run-traces.mjs` → exit 0：写入 `labels/model-positive.jsonl`（12 行）、`sources/model/prov-1788185503573/deepseek-v4-pro/samples.jsonl`（12 行，12 个唯一 id）。
- `node scripts/index-deai-human-corpus.mjs` → exit 0：`scannedAuthors=1`、`works=1`、`indexedChapters=5594`、`duplicates=0`、`skipped={"chapter-char-count-out-of-range":2}`。
- 人类负样本源文件：`D:/codex/deai-corpus/sources/human/authors/%E8%B8%8F%E6%98%9F/works/%E8%B8%8F%E6%98%9F/chapters.jsonl`，5594 行。
- 标签：`D:/codex/deai-corpus/labels/human-negative.jsonl`，5594 行；`D:/codex/deai-corpus/labels/model-positive.jsonl`，12 行。
- 报告：`D:/codex/deai-corpus/calibration/reports/human-negative-index.json`、`D:/codex/deai-corpus/calibration/reports/model-positive-harvest.json`。
- Manifest：`D:/codex/deai-corpus/manifest.json` 已登记两类来源与样本缺口。

### 6.2 脚本缺陷修复与验证

- `scripts/harvest-deai-run-traces.mjs`：修复 `accepted` 计数漏加；修复重复 append 导致样本文件重复的问题，改为按 id 去重后写入。修复后 `total=12, unique=12`。
- `scripts/index-deai-human-corpus.mjs`：修复 BOM、路径假设、中文 id、`lines` 数字/数组比较错误、逐章 `split` 的性能问题。修复后 dry-run 仅约 0.99 秒，正式运行约 6.3-7.0 秒。
- 验证脚本 `scripts/tmp-probe-deai-index.mjs` 用于定位性能热点，执行完毕后已删除。
- 曾产生的错误目录 `D:/codex/deai-corpus/sources/human/authors/--` 已在路径守卫下删除。

## 7. 缺口清单

1. 负样本作者多样性不足：当前仅《踏星》一位作者，不满足 G1.22 要求的 3-5 位作者、2-3 个题材门槛，`provisional` 不得解除。
2. 模型正样本多样性不足：当前仅 `deepseek-v4-pro` 一个模型，正样本召回率结论只能作为初步参考。
3. 正样本来自历史 run trace，未包含实时模型输出和用户标注，后续需接入 Phase A3/A4。
4. Phase A3/A4（校准器升级与 provisional 解除）尚未启动，需用户确认后再继续。
5. Track B（应用内拆书库/资料库）尚未立项，不属于本轮完成范围。

## 7. 缺口清单

待收尾登记。
