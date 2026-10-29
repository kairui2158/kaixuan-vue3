# DEV_LOG 2026-10-29 降AI校准语料 Track A Phase A1-A2

## 范围

- 建立 `D:/codex/deai-corpus/` 开发期离线语料库，与应用仓库分离，不进安装包、不参与运行时。
- Phase A1：从历史 run trace 收割正文层 S2/S3 原始模型响应。
- Phase A2：从 `D:/codex/拆文库/` 建立人写负样本索引。
- 不修改产品源码，不更新检测阈值，不解除 `provisional`。

## 交付

- `scripts/harvest-deai-run-traces.mjs`：扫描 16 个 trace 目录，识别 3 个正文层 trace，收割 12 条真实模型原始响应（KAI-S2 creative 8 条、KAI-S3 polish 4 条），全部保留 trace path、payload ref、attempt id、provider/model 与时间。
- `scripts/index-deai-human-corpus.mjs`：索引《踏星》5594 章，2 章因 1500-6000 字数门槛跳过，0 重复；每条记录保留 author/work/chapter/title/charCount/sourcePath/sourceSha256/authorization。
- 语料产物：
  - `D:/codex/deai-corpus/labels/model-positive.jsonl`：12 条。
  - `D:/codex/deai-corpus/labels/human-negative.jsonl`：5594 条。
  - `D:/codex/deai-corpus/sources/model/prov-1788185503573/deepseek-v4-pro/samples.jsonl`：12 条。
  - `D:/codex/deai-corpus/sources/human/authors/%E8%B8%8F%E6%98%9F/works/%E8%B8%8F%E6%98%9F/chapters.jsonl`：5594 条。
  - 报告：`calibration/reports/model-positive-harvest.json`、`calibration/reports/human-negative-index.json`。
- `D:/codex/deai-corpus/manifest.json` 登记来源、授权、样本数与当前缺口。

## 过程中的缺陷与修复

1. 正样本收割脚本 `accepted` 计数漏加，导致报告显示 0 样本；已修复并复跑。
2. 收割脚本重复 append 导致样本 JSONL 由 12 条膨胀为 24 条；改为按 sample id 去重写入，修复后 `total=12, unique=12`。
3. 负样本索引脚本初版假设 `.novel/benchmarks/<author>/<work>/` 结构，与现场不符；改为支持作者根目录作品与嵌套作品两种形态。
4. CSV 读取未剥离 UTF-8 BOM，导致 schema 校验失败；已修复。
5. `lines` 变量语义从数字改为数组后，边界校验误把所有章节判为 `chapter-line-range-invalid`；已修复为 `lines.length`。
6. 中文 author/work 被 `normalizeId` 抹成 `--`；改为 URI 编码目录名，修复后路径保留可读、可恢复的中文身份。
7. 修复过程中曾产生错误目录 `sources/human/authors/--`，已在路径守卫下删除；临时性能探针 `scripts/tmp-probe-deai-index.mjs` 已删除。

## 验证

- `node scripts/harvest-deai-run-traces.mjs --dry-run` → exit 0，`accepted=12`。
- `node scripts/harvest-deai-run-traces.mjs` → exit 0，样本文件 `total=12, unique=12`。
- `node scripts/index-deai-human-corpus.mjs --dry-run` → exit 0，约 0.99 秒，`indexedChapters=5594`。
- `node scripts/index-deai-human-corpus.mjs` → exit 0，`indexedChapters=5594, duplicates=0`。
- `Test-Path scripts/tmp-probe-deai-index.mjs` → `False`。

## 边界

- 负样本当前仅一位作者《踏星》，不满足 G1.22 的 3-5 位作者、2-3 个题材门槛，因此本轮不进入 Phase A3/A4，`provisional` 必须继续保留。
- 正样本当前仅 `deepseek-v4-pro` 一个模型，召回率结论只能作为后续扩样本的基础。
- 本轮不做 git 提交、不封装、不修改 `src/services/de-ai.js`。
