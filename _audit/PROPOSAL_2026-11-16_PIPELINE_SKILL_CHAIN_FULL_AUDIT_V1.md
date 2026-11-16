# 生成流水线 SKILL 链路全量递归审计 V1

状态：P1 已批准并执行完成；版本 3.128.3 收口。审计基准：HEAD `6cda8e21`，执行分支 `codex/direct-write-negative-verification`。N3 保持后续独立对账。

## 结论

主体链路没有回到旧事故状态：结构化失败透传、空账本防空转、folder-chain JSON 冲突剥离、画像与 postProcess usage 注入、folder 诊断恢复语义都在位，154 条定向守护测试通过。

但递归到状态恢复、修复循环和终态裁决的接缝处，仍有 3 个必须修的应用侧缺陷和 1 个低优复审项。它们不是同类旧缺陷复活，而是“同款语义 sibling 不统一”和“批次终态入口漏接交付标志”。

## 新缺陷

### N1 — attempt-start 生成步索引使用合成模板，丢真实 meta

严重度：中。

`resolveAttemptStartGeneratorIndex` 在 `chainExecution.ts:505-521` 用 `{id:'step-i'}` 合成模板，而 `resolveBodyGeneratorStepIndex` 在 `:480-502` 依赖 `skill.meta.chainHandoff.role`。真实调用点 `PipelinePanel.vue:6676-6690` 只传数量，导致 role 声明丢失，非标链落入 `:490-496` 的 penultimate 兜底。

凯旋 3 步链碰巧正确，因为 generator 正好是倒数第二步；4 步或自定义 role 的链会解析错。外层 `PipelinePanel.vue:6645` 已经用真实模板算出正确结果，attempt start 却重新合成，属于 API 设计缺陷。

修复：P1。让 `resolveAttemptStartGeneratorIndex` 接收外层已解析的 `ResolvedBodyGeneratorStep` 或真实模板；保持 compose / previous_state / fallback 优先级。新增非标链负向测试。不加新裁判。

### N2 — 卷纲数量达标但契约语义失败时零修复重试

严重度：中。

`volumeBatchOrchestrator.ts:328-349` 在数量补齐后调用 `validateVolumeBatch`；其中 `validateContractSemantics` 会检查五字段语义，见 `volumeGenerationContract.ts:91-115`。校验失败直接返回 incomplete，绕过 `:226-370` 的 repair 循环；不像 short/error 分支会把 `previousErrors` 带入下一次修复。

这导致只有“缺数量”有修复路径，“格式对但五字段缺漏/非法”没有修复路径。

修复：P1。数量达标后契约失败进入同一有界 repair 循环，把 semantic errors 写入 `previousErrors`，repair prompt 已有 `【上一次验收失败原因】`通道；补齐最终仍失败才 incomplete。不新增外部重试预算。

### N4 — 章节产物已交付但终态仍被历史失败 API 锁死

严重度：中高。

卷纲在 `PipelinePanel.vue:5952/6123/6141`，正文在 `:6513/6935/7032` 都有产物交付标志；章节 finally `:6467-6475` 用 `traceStatusFromRun(trace.runId!)` 默认 `finalArtifactAccepted=false`。`pipelineRunOutcome.ts:48-64` 在该标志为 false 时，任一历史 failed API call 都会判 failed。

章节批次 partial-complete 已把合格章节 commit 并保存断点，但完整失败会让 run 终态为 failed，UI/trace 无法表达“部分产物已交付”。

修复：P1。仿照卷纲/正文新增 `chapterArtifactDelivered`，只在章节产物通过验收并 commit 后置 true，finally 传给 `traceOutcomeFromRun`；同时保留无产物、阻断和校验失败的 failed 语义。新增章节 partial-complete 终态测试。

### N3 — 卷/章 Panel 与 orchestrator 双裁判低优复审

严重度：低。

Panel 侧 `PipelinePanel.vue:6039/6416` 调 `validateVolumes`/`validateChapters`，orchestrator 内部又调 `validateVolumeBatch`/`validateChapterBatch`。字段重叠，但错误文案、历史入参和警告通道不同；当前未证实造成行为冲突，G0.13 禁止立即删除。

修复：P3 独立小方案。先做字段级对账，确认是否为防线冗余；只有证明完全同构才收口，否则保留并记录 owner。

## 设计决策，不改

章节 `maxRepairAttempts:0` 是显式设计：批量内部的缺失由外层 while 补充，用户已有“下一轮补充”语义。`PipelinePanel.vue:6343` 与 `chapterBatchModesWiring.spec.ts:49` 都锁定了这一点。当前不改。

## 已排除项

1. legacy 正文交接残留：`chainExecution.ts:191-197` 只是信封账本格式化兼容，不再作为 S2/S3 输出合同注入。
2. folder-chain JSON 协议冲突：卷 `volumeBatchOrchestrator.ts:72-83` 与章 `chapterBatchOrchestrator.ts:40-101` 已换成任务边界注记，spec 也有守护。
3. 画像与 usage 注入：`deaiModelProfile.ts:11` 已发布，`realSkillExecutor.ts:1380-1385` 已把 usage 传入 postProcess。
4. 正文结构化失败吞态：`bodyArtifactOrchestrator.ts:90-104` 与 `PipelinePanel.vue:5000-5033` 已保留失败态。
5. 空账本 vacuous pass：`stepArtifactAcceptance.ts:220-331` 支持内联 FACT_LOCK，且权威账本为 0 项时返回 `generator_ledger_missing`。
6. folder 诊断任一 failed 锁存：`runTrace.ts:748-766` 已按尾部恢复语义翻转。
7. 章节批量无内部修复：显式设计，见上节。

## G0.13 最小必要性五问

1. 用户目标是否必须依赖？必须。目标就是链路无残缺缺陷。
2. 现有机制为什么不够？N1/N2/N4 都是现有机制在 sibling、repair 分支、终态入口处的接缝缺口。
3. 是否增加延迟、状态纠缠或语义冲突？P1 项全部复用现有合同与循环，最多增加一次有界 repair；N3 只复审不删除。
4. 删除它会不会损失真实用户价值？这里说的是删除候选 N3：立即删除会丢未证实风险的防线，所以只对账。
5. 是否有更小实现？有。N1 传真实模板或已解析结果；N2 把语义失败接入现有 repair；N4 只补章节缺失的交付标志。

## 成熟度

| 层 | 结论 |
| --- | --- |
| 执行器/工具层 | 成熟。修复方向只消费现有合同、模板与终态裁决。 |
| 应用方案/交互闭环 | 成熟。用户可见收益是恢复索引正确、卷纲可修复、章节部分产物可正确表达终态。 |
| 实现接线 | 成熟。N1/N2/N4 已按最小实现接线并经负向测试锁定：`src/services/chainExecution.ts:503`、`src/services/volumeBatchOrchestrator.ts:338`、`src/components/pipeline/PipelinePanel.vue:6171`。执行期发现 ByShape 入口必须无条件抹掉声明 role，避免兼容入口冒认 meta 角色；已修正并测试。 |
| 验证标准 | 成熟。新增 N1/N2/N4 负向守护通过；全量服务测试、type-check、生产构建、production wiring、真实供应商 Electron 烟测与 3.128.3 packaging 补录后均为 PASS。 |

执行边界：不碰 SKILL 包；不新增裁判、预算系统、自动调度或 UI；P3 只做对账方案。批准后按 P1 的 N4 → N1 → N2 顺序执行，先修用户可见终态，再修索引合同，再修修复循环。
