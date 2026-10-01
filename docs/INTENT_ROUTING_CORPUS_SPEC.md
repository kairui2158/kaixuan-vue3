# 意图路由语料自成长系统 V2 说明

更新日期：2026-09-22

本文档描述当前已交付的意图路由语料自成长系统。意图路由负责判断用户在大纲工作台、主页编辑器与流水线中的输入属于 `analyze`、`edit`、`generate`、`discuss` 还是无法识别；本系统在其运行过程中自动积累真实语料，用于后续路由调优，不改变任何生产路由阈值。

## 采集范围

语料来自两个生产入口的真实路由现场：

- 大纲工作台直接对话：`OutlineWorkspace.vue` 的 `askAi()` 与 `askPlainAi()`。
- 主页 API 对话：`ChatPanel.vue` 的 `sendMessage()`。

当前没有流水线采集入口。采集器类型层保留 `pipeline` workspace，是为后续流水线路由观测预留的兼容枚举，当前版本不会产生该类样本。

样本携带 `runId`、`turnId`、`workspace`、`projectId`，可与运行记录和诊断日志对账。

## 三级标注

| 等级 | 来源 | 用途 |
| --- | --- | --- |
| `confirmed` | 用户在 fallback 气泡中显式选择推荐意图 | 可进入校准候选 |
| `inferred` | 用户在低置信输入后下一轮重述明确意图 | 进入分析与候选池，不直接参与阈值校准 |
| `observed` | 仅记录路由结果，无用户反馈 | 只做分布统计与疑难样本筛查 |

跨轮推断有效期 10 分钟，且必须匹配同一项目与 workspace。用户点击 fallback 气泡时，本轮 `observed` 样本只被抑制一次，后续同 workspace 的真实观测不会被永久吞掉。

## 本地存储

存储位置：应用数据目录下 `intent-corpus/`。

文件结构：

- `samples.jsonl`：样本流，append 后整体重写并原子替换。
- `manifest.json`：schemaVersion、样本数、最大容量、最近写入时间。
- `index.json`：输入哈希与样本 ID 的映射。

治理规则：

- 输入归一化后按 `workspace + projectId + normalizedText` 计算 SHA-256 哈希；同哈希保留最新现场。
- 单条输入最长 2000 字。
- 单机最多保留 10000 条，超出后从最旧开始环形覆盖。
- 写入失败走 DiagLogger，绝不阻塞对话、生成或编辑器写入。

## 导出

导出物 schema 为 `shenyi.intent-corpus-package`：

- 默认仅导出当前项目作用域，显式选择 `includeGlobal` 才包含全局样本。
- 包含分级样本、项目 ID、样本数与生成时间。
- 不包含 API key、项目正文、完整 API response。

## 社区影子语料

社区影子语料由 `shadowIntentCorpus.ts` 承载，schema 为 `shenyi.shadow-intent-corpus`。

限制：

- 只用于观察分数分布与发现盲区。
- 永不进入真实语料包。
- 永不进入 train/dev/test。
- 永不参与阈值选择。

## 自动化对抗语料工厂

工厂脚本：`scripts/run-intent-adversarial-factory.mjs`。

核心组件：

- `src/services/intentMutationEngine.ts`：确定性变异引擎，生成错别字、近义词、口语化、截断、标点、语序与混合意图变异；同 seed + 同 rule + 同版本输出稳定，意图可能漂移的变异降级为 Bronze。
- `src/services/intentTestManuscript.ts`：内置约 1000 字自创作小说测试稿，供快速层与 Electron 层共用，验证长上下文不会稀释意图信号或误触编辑器写入。
- `_audit/intent-adversarial-factory-round-{N}.json`：每轮全量结果，包含 Silver/Bronze 指标、失败簇、长文档一致性对照与可回放样本行。

数据信任分级：

- Silver：继承可信种子标签的确定性变异，只用于对抗回归、盲区挖掘与示例库候选，永不进入 train/dev/test，永不单独决定生产阈值。
- Bronze：社区原始句式或弱标签样本，只做盲区发现；必须经确定性变异或人工审核后才可升级为 Silver 候选。
- Gold：仍只来自真实用户 confirmed 样本。

硬约束：

- Silver 集 writeFalseTriggers 与 missedRejections 必须保持 0。
- 带手稿上下文与不带上下文的路由一致性不低于 95%。
- analyze / discuss 场景编辑器 hash 必须不变；edit / generate 只在预期意图下触发写入。

### 收敛轮与 inputHash

- `inputHash` 只由工厂输入集（样本 id、输入文本、期望意图、信任级）计算；路由行为修复不改变该 hash。因此 inputHash 只能证明“输入是否变化”，不能单独证明“这是不同的有效收敛轮”。
- 有效收敛轮必须在 `_audit/intent-factory-convergence-ledger.json` 登记：轮次报告路径、inputHash、Silver 指标、metricsDelta、actions、evidence。停止审计 S3 只认账本中末尾连续三个完整有效轮。
- 本轮收敛采用 13、14、16 三个有效轮。round-12 暴露 `盘点…伏笔…` 误配为 edit，通过把 `盘点` 纳入只读分析动词修复；round-15 暴露 2 条“补一段”生成种子标签错误，修正为明确生成动词并补充编辑正样本；round-16 全零。
- 工厂扩库种子位于 `INTENT_FACTORY_ACCRETION_SAMPLES`，物理隔离于 train/dev/test，只用于工厂回归与盲区挖掘。

## 影子校准

校准脚本：`scripts/calibrate-intent-routing-thresholds.mjs`。

环境变量：

- `SHENYI_INTENT_CORPUS_PACKAGE`：真实语料包路径；仅 `confirmed` 样本可进入候选。
- `SHENYI_INTENT_SHADOW_CORPUS`：影子语料路径；只做泄漏检测与诊断。

输出：`_audit/intent-routing-v6-phase6-calibration.json`。

硬约束：

- `writeFalseTriggers = 0`。
- `missedRejections = 0`。
- 禁止为降低误拒而放宽写入类安全阈值。

输出只是建议升级包，不会自动修改生产常量。任何生产阈值更新都必须走人工审核与完整回归。

## 运行与验证

生产链路：

```powershell
npx vitest run src/services/intentCorpusCollector.spec.ts src/services/shadowIntentCorpus.spec.ts src/services/chainIntentRouter.spec.ts src/services/workspaceSkillEngine.spec.ts
npm run type-check
npm run build:vue
node scripts/verify-intent-corpus-electron.mjs
```

Electron 验证覆盖八类场景：正常采样、fallback confirmed、跨轮 inferred、写盘失败 fail-open、项目语料包导出、影子语料隔离、大纲 plain 对话路由保真、1000 字手稿长上下文写入隔离。手稿场景会填充编辑器，并抽样执行 analyze / discuss / edit / generate / 位置咨询请求，对账路由结果与编辑器 hash 变化。证据输出到 `_audit/verification-intent-corpus-electron/intent-corpus-electron-evidence.json`。
