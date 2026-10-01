# 2026-09-22 意图路由自动化对抗语料工厂

## 目标

解决意图路由“不能靠客户反复导出运行记录来成长”的核心问题：用可信种子加确定性变异自动生成对抗语料，配合 1000 字测试稿验证长上下文行为，让路由器在真实语料积累前也能持续发现盲区，同时不污染生产阈值校准。

## 范围

- `src/services/intentMutationEngine.ts`：七类确定性变异（错别字、近义词、口语化、截断、标点、语序、混合意图），记录 seedId、mutationType、mutationRule、expectedIntent；意图可能漂移的变异降级 Bronze。
- `src/services/intentTestManuscript.ts`：内置自创作约 1000 字小说测试稿，快速层与 Electron 层共用。
- `scripts/run-intent-adversarial-factory.mjs`：批量执行 Silver/Bronze、失败聚类、手稿长上下文对照，输出可审计 JSON。
- `scripts/research-intent-corpus-sources.mjs`：真实 API 搜索社区来源，Bronze 样本物理分文件。
- `scripts/verify-intent-corpus-electron.mjs`：新增第 8 场景 `manuscript-long-context-write-isolation`。
- 文档：`docs/INTENT_ROUTING_CORPUS_SPEC.md`、`_audit/ROADMAP_2026-09-22_INTENT_CORPUS_GROWTH.md`。

## 数据信任边界

- Gold：仍只来自真实用户 confirmed 样本，用于阈值校准与 holdout。
- Silver：可信种子标签的确定性变异，只做对抗回归、盲区挖掘与示例库候选，永不进入 train/dev/test，永不单独决定生产阈值。
- Bronze：社区原始句式或弱标签样本，只做盲区发现；需确定性变异或人工审核后才可升级 Silver 候选。
- 生产阈值仍由真实 confirmed holdout 把关；写入安全阈值禁止放宽。

## 首轮结果

`_audit/intent-adversarial-factory-round-1.json`：

- seed 82，Silver 336，Bronze 1571，总样本 1907。
- Silver：writeFalseTriggers 0，missedRejections 0。
- 手稿场景 80 条抽样，一致性 97.50%（78/80）；2 条不一致均为“裸输入 no_match、带手稿上下文后正确匹配”，属于上下文增益，不是写入安全缺陷。
- Bronze 的 44 条 writeFalseTriggers 全部来自 mixed-intent 变异簇，已按协议保持 Bronze，不进入 Silver 回归门。
- 主要 Silver 失败簇集中在 colloquial 与 typo 的 `no-keyword-overlap`，后续按 Phase 2 语义层路线继续迭代，不允许直接放宽阈值。

## Electron 验证

第 8 场景 `manuscript-long-context-write-isolation`：

- 编辑器填充 1000 字手稿，routingContextVersion 与 manuscriptVersion 对齐。
- analyze / discuss / 位置咨询为只读；edit / generate 才可写入。
- generate 轮 mock 曾因重复同一写调用被 `duplicate_write_blocked` 拦截；修复为每个场景只发起一次预期写调用。
- 手稿内容 80/80 保持一致，编辑器 hash 变化全部符合预期意图。

## 本轮发现的测试脚本缺陷与修复

1. 位置咨询被路由到 discuss 属既定产品语义，不是路由缺陷；测试断言从“必须 edit/generate”修正为“只读且不写入”。
2. mock 写入触发原来按全局请求计数分支，与真实请求序列不对齐；改为按场景显式标记触发。
3. generate 轮 mock 重复回放同一写调用，被服务层 `duplicate_write_blocked` 拦截后形成假失败；改为每场景一次写调用，保留重复写入守卫本身。

教训已写入经验文件 M54：验证脚本的 mock 触发条件必须与真实请求序列对齐，禁止用全局请求计数做分支开关。

## 验证证据

- `npx vitest run`：5 个相关测试文件，69 tests 全部通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过。
- `node scripts/run-intent-adversarial-factory.mjs`：Silver 336，writeFalseTriggers 0，missedRejections 0，手稿一致性 97.50%。
- `node scripts/calibrate-intent-routing-thresholds.mjs`：dev 8/9，阈值无变化；产物 generatedAt 晚于 Electron 证据。本轮 F6 只改文档，校准脚本输入未改，故校准证据保持有效。
- `node scripts/verify-intent-corpus-electron.mjs`：8 scenarios，corpusSamples 5，全部 pass。

## 对应用的价值

客户不再需要为“喂养路由器”反复导出运行记录；系统可以用自动对抗集先发现盲区、守住写入安全回归，再等待真实 confirmed 语料自然积累。Gold 需求从 60 条降至 30 条，路由成长周期显著缩短，同时避免合成语料污染生产阈值。
