# DEV_LOG 2026-10-29 降AI多作者原著接入与 A2-A4 校准

## 目标

用户提供 9 部人类作者 raw txt 后，接入 `D:/codex/deai-corpus/`，完成多作者负样本扩容、校准器升级与 A4 provisional 判定。目标不是“把阈值调到能放行”，而是让样本结构诚实地决定判定结果。

## 交付

- `scripts/probe-deai-raw-novels.mjs`：9 部文件编码、章节切分与章节数探测，输出 `_audit/verification-deai-calibration/raw-novel-probe-2026-10-29.json`。
- `scripts/ingest-deai-raw-novels.mjs`：确定性抽样摄入 900 章（每作品 100 章，1500-6000 非空白字符），重跑幂等 `duplicates=900, newEntries=0`；报告在 `D:/codex/deai-corpus/calibration/reports/human-negative-raw-novels.json`。
- `D:/codex/deai-corpus/manifest.json` 升级 v2：登记 9 部来源、7 类题材、抽样规则、作者核验状态与校准缺口。
- `scripts/calibrate-deai-v2-thresholds.mjs` 升级为语料库驱动：作者/题材分层、80/20 held-out、真实模型正样本、阈值敏感度曲线。
- `labels/human-negative.jsonl` 达 6494 行：踏星 5594 + 新增 900。

## A4 结论

`provisional` 保留，且注释从“踏星单一作者口径”升级为多作者口径（`src/services/de-ai.js:60-63`）。理由：

1. 人类负样本 train 720：suspicious+ 误伤 41.39%，blocking 73.89%；held-out 180：suspicious+ 47.78%，blocking 75.56%。
2. 误伤强依赖作者：9%-70% 不等，说明当前阈值/词库是作者敏感的，不是通用边界。
3. 真实模型正样本只有 12 条且单一 provider/model；ngram 命中 91.67%、any finding 100%，但 verdict 分布 advisory 5 / suspicious 5 / clean 2，不足以支撑召回闭环。
4. 阈值敏感度 0.20-0.70 全部命中 180/180，曲线平顶，说明当前评分体系区分度不足，需要重新设计，不是单点调参能解决。

本轮没有修改阈值、词库、评分权重，也没有解除 `provisional: true`。

## 过程中的缺陷与修复

- 交接摘要里的“大奉打更人/全职高手章节异常”是旧口径误差；本轮 probe 显示 9/9 均可用行首 `^第N章` 切分，无需特殊策略。
- 2 部作品作者无法可靠核验，登记为“未知作者”并置 `authorVerified: false`，没有用作品名或猜测冒充作者。
- 首次运行 `scripts/tests/deai-v2.test.mjs` 发现旧断言要求 `protectedSpans` 携带 `hit/missing`；这与 V2 观测诚信规范“检测报告不得伪造修复前保留率”冲突。已修正测试断言为 `{ total: 0 }`、`retentionRatio === undefined`，内核契约保持不变。
- `measurePerformance` 适配新样本形状，使用 `chapter.text`。

## 验证

- `node scripts/probe-deai-raw-novels.mjs` → exit 0，9/9 可切分。
- `node scripts/ingest-deai-raw-novels.mjs` → exit 0，新增 900；重跑 `duplicates=900, newEntries=0`。
- `node scripts/calibrate-deai-v2-thresholds.mjs` → exit 0，报告见 `_audit/verification-deai-calibration/deai-v2-calibration-2026-10-29.json`。
- `node --test scripts/tests/deai-v2.test.mjs` → exit 0，`9 tests passed`。
- `npx vitest run src/services/de-ai-v2.spec.ts src/services/deaiObservationEvents.spec.ts` → exit 0，`2 passed (2)`，`16 passed (16)`。
- `git diff --check` → exit 0。

## 边界

- 致命偏宠、最强反套路系统仍为“未知作者”，需要用户补充署名。
- 模型正样本仍只有 deepseek-v4-pro，召回结论只能按模型局部有效。
- 下一阶段若要解除 provisional，需要：更多真实 provider/model 正样本、更多可信作者，以及重设计 finding 累加评分与阻断策略；blocking 主贡献来自 `deai-broken-punctuation`、`deai-style-drift`、`deai-banned-phrase`。
- 本轮不做 git 提交、不封装、不做 live API；仓库前轮脏文件保持原样。
