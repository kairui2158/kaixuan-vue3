# 意图路由自动化对抗语料工厂方案

日期：2026-09-22  
状态：待用户审核  
方案成熟度：成熟（已明确数据信任分级、自动闭环、1000 字测试稿、停止条件、失败路径、验证门与安全不变量）

## 1. 问题定义

当前意图路由的短板不是结构，而是真实评估语料不足：

- 阈值选择语料仅 28 条真实 trace（train 10 / dev 9 / test 9）。
- 生产示例库 151 条，社区影子语料 5 条，规模不足以覆盖真实用户的表达变异。
- 客户不应被要求反复导出运行记录来“喂养”路由器。

用户提出的自动化路线是可行的，但必须加一条硬边界：

> 自动化工厂可以大规模发现盲区、扩充对抗测试和回归集；但合成语料永远不能单独决定生产阈值。生产阈值仍必须通过真实 confirmed holdout 验证。

这样做的目的不是否定自动化，而是防止“模型生成语料 → 模型校准模型 → 路由器学会模拟器偏见”的循环验证。

## 2. 数据信任分级

| 等级 | 来源 | 允许用途 | 禁止用途 |
| --- | --- | --- | --- |
| Gold | 真实用户 confirmed 样本 | 阈值校准、holdout 验证 | 无 |
| Silver | 有可信标签种子的确定性变异（错别字、近义词、口语化、截断） | 对抗回归、盲区挖掘、示例库候选 | 单独决定生产阈值 |
| Bronze | 社区原始句式或 LLM judge 弱标签 | 盲区发现、候选生成 | 直接进入校准集或生产示例库 |

分级原则：

1. Silver 样本必须继承种子标签，且变异规则必须保证“意图不变”。
2. Bronze 样本必须经过确定性变异或人工审核，才可升级为 Silver 候选。
3. Gold 样本只来自真实用户显式确认，永不由合成流程生成。

## 3. 自动化闭环设计

```text
社区/真实 trace/内置示例
        |
        v
种子抽取与去重 --> 确定性变异引擎 --> 批量路由执行
        |                                      |
        |                                      v
        |                            失败聚类与反向检测
        |                                      |
        |                                      v
        +------------- 修复/扩库/调参建议 <------+
                                               |
                                               v
                                 完整回归 + 校准重跑
```

### 3.1 种子来源

1. 内置真实 trace：`chainIntentEvalData.ts` 中 28 条真实样本。
2. 生产示例库：当前 151 条。
3. 社区影子语料：`shadowIntentCorpus.ts`。
4. 社区增量挖掘：通过 GitHub / Hugging Face / npm / PyPI API 搜索中文 NLU 意图数据集、聊天意图分类、指令路由、写作助手语料；只抓真实仓库与真实数据文件，记录来源 URL、license、抓取时间与样本数，禁止虚构高星项目。
5. 后续真实 observed 样本：只作为 Bronze 候选，不直接进入 Silver。

### 3.2 确定性变异引擎

新增 `src/services/intentMutationEngine.ts`：

变异类型：

1. **错别字变异**：钩子→勾子、设定→设订、脚踝→脚裸等，基于领域错别字映射表。
2. **近义词变异**：修改→调整/改一下/弄一下，分析→看看/审一遍/挑毛病。
3. **口语化变异**：加入“麻烦”“帮我”“先”“一下”“这块”等口语成分。
4. **截断变异**：去掉宾语或修饰，只保留动词短语。
5. **标点变异**：去除问号、逗号、句号，或改为全角/半角混排。
6. **语序变异**：有限模板重排，只重排已标注安全片段。
7. **混合意图变异**：拼接两个种子，但标签必须来自显式规则（如“最终动作优先”“禁止写入优先讨论”），并记录 note。

硬规则：

- 每个变异样本必须记录 `seedId`、`mutationType`、`mutationRule`、`expectedIntent`。
- 变异规则必须可复现：同 seed + 同 rule + 同版本 = 同输出。
- 意图可能改变的变异（自由改写、随机删词）不允许生成 Silver，只能进入 Bronze 待审。
- 每个种子默认生成 5-10 个变异，总量上限先设 2000 条，避免噪声淹没。

### 3.3 批量路由执行

新增 `scripts/run-intent-adversarial-factory.mjs`：

两层执行：

1. **快速层**：Node 直接调用 `classifyChainIntentDetailed()`，跑全部 Silver 变异样本，输出分数、margin、OOS、reason。
2. **抽样 UI 层**：每轮从失败簇中抽样，跑 Electron 级真实 UI 验证，确保离线结果与线上行为一致（M47）。

输出：

- `_audit/intent-adversarial-factory-round-{N}.json`：本轮全量结果。
- 失败样本列表：falseRejections、writeFalseTriggers、missedRejections、discussBlocked。
- 聚类报告：按 reason、intent、score 区间、mutationType 聚类。

### 3.4 反向检测与修复策略

每轮对失败簇做归因，四类处理：

| 失败类型 | 处理 |
| --- | --- |
| 词库覆盖缺口 | 从失败簇选代表句，走人工审核后扩入示例库 |
| 规则误触发 | 修正规则，优先收窄触发条件 |
| embedding margin 拦截 | 记录为 margin-gate 候选，不直接调阈值 |
| 变异引擎缺陷 | 修变异规则，样本作废并重新生成 |

禁止行为：

- 禁止因为 Silver 集失败而放宽写入安全阈值。
- 禁止把失败样本直接塞进 train/dev/test。
- 禁止用 LLM judge 生成 Gold 标签。

### 3.5 循环与停止条件

每轮流程：

1. 生成/更新 Silver 集。
2. 批量执行快速层。
3. 失败聚类与归因。
4. 修复或扩充（带人工审核点）。
5. 完整回归 + 校准脚本重跑（M53）。
6. 抽样 Electron UI 验证（M47）。

停止条件（满足其一）：

- 连续 3 轮没有新增失败簇。
- Silver 集 2000 条，且 falseRejections / writeFalseTriggers / missedRejections 均为 0 或全部定性为“合理 ambiguous”。
- 剩余失败全部属于真实用户分布问题，合成变异无法继续推进。

### 3.6 1000 字测试稿

**目的：** 单独的意图句只能验证路由器本身；加入约 1000 字测试稿后，才能验证真实使用形态下的四类风险：

1. 长文本进入上下文后是否稀释意图信号，导致误拒或降级。
2. 编辑器内容是否被错误注入路由判断，引发“基于正文而非用户请求”的误判。
3. 位置咨询类请求是否能在长文档中稳定识别，不被正文关键词干扰。
4. analyze / discuss 请求是否意外触发编辑器写入，造成误写。

**测试稿来源：**

- 默认内置一篇约 1000 字的自创作中文小说稿，包含大纲、设定、人物、场景和对话段落，覆盖常见小说要素。
- 测试稿不使用客户项目数据，不含 API key 或隐私信息。
- 可选从社区摘录，但必须记录来源 URL 与 license；无法确认授权时一律使用自创作稿件，禁止摘录无授权文本。

**使用方式：**

- 测试稿作为固定 fixture 供工厂脚本和 Electron UI 验证共用，保证两层测试对齐。
- 每轮从 Silver 失败簇和稳定簇抽样意图句，与测试稿组合成“长文档 + 用户请求”场景。
- 生成场景必须记录 `manuscriptVersion`、`intentSampleId`、`mutationType`、路由结果、工具调用和编辑器 hash 变化。

**验收断言：**

- analyze / discuss 请求不产生任何编辑器内容变更。
- edit / generate 请求仅在对应意图下触发写入路径。
- 带 1000 字上下文与不带上下文的路由结果一致性不低于 95%。
- 位置咨询请求返回位置建议，不直接写入。
- 每个抽样场景都有完整 trace 证据，可回放归因。

## 4. 与现有校准体系的关系

1. Silver 集不进入阈值选择的 train/dev/test。
2. Silver 集进入回归门：每轮修复后必须保持 writeFalseTriggers = 0、missedRejections = 0。
3. 生产阈值升级仍需 Gold holdout 验证；Gold 需求从 60 条降为 30 条，因为大量覆盖工作已由 Silver 承担。
4. 社区影子语料继续物理隔离，只做诊断。

## 5. 执行阶段

### Phase F0：基线与影响圈

- 复读 M17、M21、M47、M51、M52、M53 与意图路由 DEV_LOG。
- 盘点 `chainIntentRouter.ts`、`chainIntentEvalData.ts`、`shadowIntentCorpus.ts`、校准脚本的现有接口。
- 输出影响圈清单。

验收：

- 现有 65 项意图专项测试基线通过。
- 影响圈清单完成，未列入文件不动。

### Phase F1：变异引擎

文件：

- `src/services/intentMutationEngine.ts`
- `src/services/intentMutationEngine.spec.ts`
- `src/services/intentTestManuscript.ts`

任务：

- 实现七类确定性变异。
- 实现标签继承与变异记录。
- 实现可复现性（固定随机种子或纯规则）。
- 内置约 1000 字测试稿，标记版本号，供脚本与 Electron 共用。

验收：

- 同输入同规则输出稳定。
- 意图可能漂移的变异被拒绝或降级 Bronze。
- 单测覆盖每类变异和非法变异拒绝路径。
- 测试稿长度、结构、版本由结构测试锁定。

### Phase F2：工厂脚本

文件：

- `scripts/run-intent-adversarial-factory.mjs`
- `_audit/intent-adversarial-factory-round-{N}.json`

任务：

- 汇总种子源。
- 批量执行路由。
- 输出指标、失败列表、聚类报告。
- 每轮抽样组合“1000 字测试稿 + 意图句”，输出长文档场景对比结果。

验收：

- 一轮可完整跑完并生成可审计 JSON。
- 指标口径与校准脚本一致。
- 输出不包含敏感字段。
- 报告包含测试稿场景的带上下文/不带上下文一致性指标。

### Phase F3：社区增量挖掘

文件：

- `scripts/research-intent-corpus-sources.mjs`
- `_audit/RESEARCH_2026-09-22_INTENT_CORPUS_FACTORY_SOURCES.json`

任务：

- 用真实 API 搜索 GitHub / Hugging Face / npm / PyPI。
- 记录仓库、数据文件、license、样本数、抓取时间。
- 只抽取中文意图/指令/对话数据，先落 Bronze。

验收：

- 每条来源有真实 URL 与抓取证据。
- 无虚构项目、无 README-only 结论。
- Bronze 与 Silver 物理分文件。

### Phase F4：闭环修复与回归

任务：

- 对失败簇归因。
- 修复规则/扩示例库（人工审核点）。
- 重跑工厂、校准、专项测试。

验收：

- 每轮有前后对比指标。
- writeFalseTriggers / missedRejections 保持 0。
- 修复不破坏既有 65 项专项测试。

### Phase F5：Electron 级抽样验证

任务：

- 从失败簇抽样跑真实 UI。
- 验证离线路由与 UI 行为一致。
- 验证无编辑器误写入。
- 使用 1000 字测试稿填充编辑器，抽样执行 analyze / discuss / edit / generate / 位置咨询五类请求。
- 对比编辑器前后 hash，记录是否发生写入及写入批次。

验收：

- 抽样场景全部 pass。
- 证据时间晚于最后一次源码改动（M47）。
- analyze / discuss 场景编辑器 hash 不变。
- edit / generate 场景只在预期意图下产生写入。

### Phase F6：路线图合并与文档

- 更新 `ROADMAP_2026-09-22_INTENT_CORPUS_GROWTH.md`：Gold 需求降为 30 条，Silver 工厂作为 G0 加速器。
- 新增 DEV_LOG。
- 更新 `docs/INTENT_ROUTING_CORPUS_SPEC.md`。
- 如发现新事故模式，升级经验文件门禁。

## 6. 验证门

1. `npx vitest run src/services/intentMutationEngine.spec.ts src/services/chainIntentRouter.spec.ts src/services/intentCorpusCollector.spec.ts src/services/shadowIntentCorpus.spec.ts src/services/plainDialogueIntent.spec.ts`
2. `npm run type-check`
3. `npm run build:vue`
4. `node scripts/run-intent-adversarial-factory.mjs`
5. `node scripts/calibrate-intent-routing-thresholds.mjs`
6. `node scripts/verify-intent-corpus-electron.mjs`
7. 1000 字测试稿场景：上下文一致性不低于 95%，analyze / discuss 零写入，edit / generate 仅预期写入。
8. 回头看：目标对账、diff 归属、新旧并存清零、日志覆盖、证据新鲜度。

## 7. 风险与防护

| 风险 | 影响 | 防护 |
| --- | --- | --- |
| 合成语料污染校准 | 高 | Silver 永不进入 train/dev/test；阈值升级仍需 Gold holdout |
| 变异改变真实意图 | 高 | 标签继承硬规则 + 意图漂移变异降级 Bronze |
| 变异规则过拟合 | 中 | 每轮人工审核代表样本；失败簇归因后再扩库 |
| LLM judge 错标 | 中 | judge 只做 Bronze 发现，不产生 Gold/Silver 标签 |
| 写入安全回退 | 高 | writeFalseTriggers / missedRejections 永远为 0 |
| 离线与线上分叉 | 高 | 每轮抽样 Electron UI 验证（M47） |
| 证据过期 | 中 | 源码改动后必须重跑校准与 UI 验证（M53/M47） |
| 长文档稀释意图信号 | 高 | 1000 字测试稿进入快速层与 UI 层双验证，一致性低于 95% 视为阻断 |
| 正文关键词误导路由 | 高 | 测试稿包含高频小说要素，位置咨询与讨论句不得被正文内容带偏 |
| 无授权摘录文本 | 中 | 默认自创作 fixture；社区摘录必须记录 URL 与 license，不确定则不用 |

## 8. 交付边界

完成后达到：

- 自动化生成 2000 条以内 Silver 对抗集。
- 自动发现并归因路由盲区。
- 每轮产出可审计 JSON 证据。
- 真实 Gold 需求从 60 条降至 30 条。
- 生产阈值仍由真实 confirmed holdout 把关。

不在本方案内：

- 不自动应用任何生产阈值。
- 不把合成样本伪装成真实用户样本。
- 不接入客户隐私数据。
