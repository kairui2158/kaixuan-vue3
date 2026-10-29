# TASK_LEDGER 2026-10-29 降AI多作者原著接入与 A2-A4 校准推进

## 1. 目标与用户原话

用户目标原话：“我现在提供足量的人类作者你能完成后续的工作么？”，随后直接提供 9 部人类作者 raw txt：大奉打更人、黎明之剑、全球高武、全职高手、神秘复苏、圣墟、我有一座冒险屋、致命偏宠、最强反套路系统。

最终可感知行为：

1. 9 部 raw 小说被可靠解码、切章、抽样并接入 `D:/codex/deai-corpus/` 负样本结构。
2. 负样本满足多作者、多题材门槛，并能输出分作者/题材统计。
3. 校准脚本升级为多作者/题材/模型分层 + held-out 复验 + 阈值敏感度输出。
4. 用新语料复跑校准，按 G1.22 诚实判定 `provisional` 是否可解除；不满足则保留并写明边界。

本轮交付物：摄入脚本、扩展语料、扩展报告、校准脚本升级、校准证据、DEV_LOG 与台账闭环。

## 2. 门禁读证

- G0.12（`_audit/神意开发经验总结_v9.md:112`）：非平凡任务先建七节台账，本文件即本轮台账。
- G0.3（`:44`）：诚实闭环，mock/合成/单模型边界不得冒充真实多模型校准。
- G0.6（`:60`）：方案成熟度需分层评估；数据摄入与校准器属于高风险脚本任务，执行前列为半成熟，断点是异常章节格式需探测后定策略。
- G0.9（`:84`）：影响圈先行；本轮不碰 `src/` 运行时代码、不解除 `provisional`（除非 A4 门禁通过）、不做 git 提交、不封装。
- G1.21（`:392`）：脚本必须文件化、路径守卫、显式退出码、不吞错、临时脚本生命周期受控。
- G1.22（`:408`）：检测/阈值校准必须真实负样本误伤 + 真实正样本召回，分层报告；`provisional` 只能按样本结构解除。
- `_audit/SCRIPT_QUALITY_LESSONS_2026-10-29.md:36`：多行脚本禁止 inline；大输入避免无谓全量复制；失败必须读完整错误换方案。
- `_audit/HANDOFF_2026-10-29_DEAI_CORPUS_AND_LIBRARY.md:112`：A3 要求分层与 held-out；A4 要求通过门禁后才能更新阈值/词库/权重并处理 `provisional`。
- `_audit/TASK_LEDGERS/2026-10-29_deai-corpus-a1-a2.md:120`：已登记 A1/A2 缺口，本轮就是补多作者负样本并推进 A3/A4。

## 3. 路由判定

加入：G0.12、G0.3、G0.6、G0.9、G1.21、G1.22、G0.8 收尾清理、G0.5 回头看。

排除：

- G0.11 真实交互冒充禁令：不适用，本轮无 Electron/UI 交互验证目标。
- G2.x 各运行时门禁：不适用，本轮不改 `src/` 运行时、流水线、编辑器与供应商链路。
- Track B 应用内拆书库：不适用，交接文件明确独立立项。

## 4. 影响圈与作者反证

打算改：

- 新增 `scripts/ingest-deai-raw-novels.mjs`。
- 扩展 `D:/codex/deai-corpus/` 的 manifest、labels、sources、reports。
- 升级 `scripts/calibrate-deai-v2-thresholds.mjs` 为语料库驱动版本。
- 新增/更新 `_audit/DEV_LOG_2026-10-29_deai-raw-novels-a2-a4.md`、本台账、MASTER_INDEX 登记项。

可能碰到：

- GB18030/UTF-8 解码错误会把乱码当正文；必须 fatal UTF-8 探测失败才回落 GB18030，并登记编码。
- 站点声明、前言、广告可能被误切成章节；必须只接受章节标题行，首章前内容不进入样本。
- 全职高手、大奉打更人章节标记异常，不能硬套统一正则；必须 probe 后决定。
- 追加写入可能造成重复；必须按 id 与内容 hash 双重去重，且旧《踏星》数据不得被覆盖。
- 作者名不确定的文本不得臆造；登记 `authorVerified: false` 并在报告标注。
- 正样本仍只有 deepseek-v4-pro，A4 不得因此宣称模型多样性闭环。

作者反证：

- 若摄入只按文件名当作者，会把“作品名”冒充“作者名”；证伪方式是每作品登记 `author` 与 `authorVerified`。
- 若校准只报总体误伤率，会掩盖作者/题材分层风险；证伪方式是报告必须分作者/题材统计并输出 held-out。

## 5. 停止条件

1. 摄入脚本以 probe 模式输出 9 文件编码、章节匹配数、异常文件诊断。
2. 正式摄入后，负样本 labels 至少 5 位作者、至少 3 个题材、每位作者不少于 50 章、单章 1500-6000 非空白字符；异常作品如无法达标必须显式登记跳过原因。
3. 追加写入后《踏星》旧 5594 条不丢失，新记录与旧记录无重复 id。
4. 校准脚本输出分作者/题材误伤、真实正样本召回、held-out 复验、阈值敏感度曲线。
5. A4 依据 G1.22 做出 `provisional` 保留/解除判定，并把证据写入报告、DEV_LOG、manifest gaps。
6. 本台账第 6/7 节补齐原始证据与缺口清单。

## 6. 执行证据

### A2 摄入与幂等

- `node scripts/probe-deai-raw-novels.mjs` → exit 0：9/9 文件可用行首 `^第N章` 切分；UTF-8 为大奉打更人、圣墟，其余 7 部为 GB18030；章节数分别为 1431、1594、1431、1402、1605、1685、1212、1321、1900。证据：`_audit/verification-deai-calibration/raw-novel-probe-2026-10-29.json`。
- `node scripts/ingest-deai-raw-novels.mjs` → exit 0：新增 900 条（每作品确定性抽样 100 章，单章 1500-6000 非空白字符）。
- 幂等复跑 → exit 0：`duplicates=900, newEntries=0`。
- `labels/human-negative.jsonl` 行数 6494（踏星 5594 + 新 900），旧数据未覆盖。
- 作者登记：卖报小郎君、远瞳、老鹰吃小鸡、蝴蝶蓝、佛前献花、辰东、我会修空调，另 2 部登记为“未知作者”且 `authorVerified: false`，不臆造作者名。
- 报告：`D:/codex/deai-corpus/calibration/reports/human-negative-raw-novels.json`；manifest 升级 v2。

### A3 校准器升级与运行

- `scripts/calibrate-deai-v2-thresholds.mjs` 已升级为语料库驱动：从 labels + sources 水化样本、按作者/题材分层、80/20 held-out、阈值敏感度曲线、真实模型正样本分模型统计。
- `node scripts/calibrate-deai-v2-thresholds.mjs` → exit 0，证据：`_audit/verification-deai-calibration/deai-v2-calibration-2026-10-29.json`。
- 人类负样本 train 720：suspicious+ 41.39%，blocking 73.89%。
- held-out 180：suspicious+ 47.78%，blocking 75.56%。
- 分作者 suspicious+：卖报小郎君 70%、远瞳 70%、辰东 68%、踏星 45%、佛前献花 39%、蝴蝶蓝 36%、老鹰吃小鸡 28%、我会修空调 19%、未知作者 9%。
- 真实模型正样本 12 条：ngram 命中 91.67%，any finding 100%，verdict 分布 advisory 5 / suspicious 5 / clean 2，无 likely_ai/blocking。
- 阈值敏感度：0.20-0.70 全部 `suspiciousOrHigher=180`，held-out score 全部 ≥ 0.7，曲线平顶，说明当前单点 score 阈值区分度不足。

### A4 判定与代码收口

- 判定：`provisional` 必须保留。依据 G1.22：人类误伤率过高且作者敏感；真实正样本单一 provider/model 且 verdict 偏轻；敏感度平顶说明不是单点调参可解决。
- `src/services/de-ai.js:60-63` 注释已更新为多作者校准后的 provisional 边界；`provisional: true` 保留在 `src/services/de-ai.js:626` 与 `:1012`。本轮未改阈值、词库、评分权重。
- 期间发现 `scripts/tests/deai-v2.test.mjs` 对 `protectedSpans` 的旧断言与 V2 观测诚信规范冲突：检测报告不得在未修复前伪造 `hit/missing/retentionRatio`。已修正测试为 `{ total: 0 }` 且 `retentionRatio === undefined`，内核契约未改。

### 回归验证

- `node --test scripts/tests/deai-v2.test.mjs` → exit 0，`9 tests passed`。
- `npx vitest run src/services/de-ai-v2.spec.ts src/services/deaiObservationEvents.spec.ts` → exit 0，`2 passed (2)`，`16 passed (16)`。
- `git diff --check` → exit 0。

## 7. 缺口清单

1. 作者缺口：致命偏宠、最强反套路系统仍为“未知作者”，`authorVerified: false`；需要用户补充作者署名后才能升级为可信作者层。
2. 正样本多样性缺口：仍只有 `prov-1788185503573/deepseek-v4-pro` 12 条；需要至少其他 provider/model 的正文层真实原始输出。
3. 阈值体系缺口：score 敏感度平顶、人类误伤作者敏感，说明当前 finding 累加评分与阻断策略需要重设计（broken punctuation、style drift、banned phrase 是 blocking 主贡献），不能通过单点调参解除 provisional。
4. 校准产物缺口：本轮校准报告已有 2026-10-29 单日文件；后续新增校准建议加时间戳或批次号，避免同日覆盖。
5. 交付边界：不做 git 提交、不封装、不做 live API；仓库大量前轮脏文件保持原样，不回滚。
