# 全层单一裁判权审计（已闭环，2026-10-31）

## 结论

按经验文件 v9 G2.9 的“同一维度只有一个裁判”标准，对设定、大纲工作台、卷纲、章节、正文、导入路由与批次编排做了全层只读审计。

- **未发现仍在裁决叙事质量的第二裁判。** 正文层收口后，各层验收基本已归位为平台合同；叙事有效性只由 SKILL 显式自报 verdict，应用消费后阻断/路由，不自行推断剧情好坏。
- **发现 1 个待裁决灰色项：** `contractReview` 仍用本地词表推断“终局底牌是否被提前揭晓”。它当前只写 trace，不阻断、不 retry、不改写正文，因此不是第二裁判；但判定内容属于叙事语义，与 G2.9 的边界声明存在张力。
- **发现 2 个旧语义残留：** `narrativeValidation` 命名误导；`selectCompleteChapters` 生产调用为 0，仅 import 与 spec 引用。
- **fallback 提示词疑点排除：** 正文层链式模式完全不消费 fallback；“请基于章节剧情点生成正文”只在无 SKILL/无 system 内容的 compose 兜底路径生效，不是 S1/S2 职责冲突残留。

## 1. 真双裁判 / 需修复

本轮只读审计未发现需要立即修代码的双裁判。此前正文层的字数、FACT_LOCK、事件密度双门槛已收口，未在其他层复现。

## 2. 待裁决 / 命名观测边界

### 2.1 contractReview：叙事语义观测残留

**位置**

- 实现：`src/services/contractReview.ts:25-68`
- 消费：`src/components/pipeline/PipelinePanel.vue:6070-6079`
- 引用检查：`rg reviewVolumeContractSemantics|contract_review src --glob '!*.spec.ts'` 仅上述实现与消费点，无其他裁决入口。

**行为**

- `REVEAL_RE = /(揭晓|揭示|公开|就是|真相是)/`，命中终局底牌后 80 字窗口即标记 `contract_broken`。
- 消费点只写 `contract_review` trace 事件，level 为 `error/warn/info`，没有 retry、失败终态或正文改写。

**判定**

- 严格按 G2.9，它检测的是“剧情信息是否提前释放”，属于叙事语义，应用侧不应自行从正文推断。
- 但它不是双裁判：不产生第二次 retry，不影响终态，只留观测痕迹。
- 主要风险是命名误导与后续误接线：如果未来有人把 `contract_broken` 接进验收终态，会立刻变成双裁判事故。

**待裁决选项**

1. **推荐：退役本地语义推断，改消费 SKILL verdict。** 应用保留协议观测（底牌字段存在性），剧情是否提前释放由 SKILL 在 `narrativeStatus` 中自报；trace 改为记录 SKILL verdict，应用不推 `contract_broken`。
2. 保留观测但改名与降级：函数改为 `observeVolumeContractMentions`，状态改为 `mention_observed`，trace 明确 `advisory_only`，防止未来误接线。
3. 原样保留：不推荐，等于把 G2.9 留一个已知例外。

### 2.2 narrativeValidation 命名误导

**位置**

- `src/services/narrativeValidation.ts:1-142`
- `src/components/pipeline/PipelinePanel.vue:812`

**行为**

- 实际校验：数量、名称、概要存在、重复名、来源编号断档、场景名/内容与数量。全部是结构/平台合同。
- 但导出名为 `validateVolumeNarrative/validateChapterNarrative`，容易被误读为应用侧叙事裁判。

**建议**

- 行为合规，保留；建议后续改名为 `validateVolumeStructure/validateChapterStructure`，或加注释声明“只验结构合同，不判叙事质量”。

### 2.3 selectCompleteChapters 死导入口

**位置**

- 定义：`src/services/narrativeValidation.ts:144-153`
- import：`src/components/pipeline/PipelinePanel.vue:812`
- 生产调用：0；仅 `src/services/narrativeValidation.spec.ts:3,32` 引用。

**建议**

- 删除 `PipelinePanel.vue:812` 中的未使用 import 与该死函数，或注明保留原因。它不产生运行时问题，但属于旧语义残留。

## 3. fallbackTemplate 疑点对账

**调用点**

- `src/components/pipeline/PipelinePanel.vue:5922-5929`：正文层仍传入“你是小说写作专家。请基于章节剧情点生成正文。”

**链式分支**

- `src/components/pipeline/PipelinePanel.vue:3983` 进入 chain 分支。
- `src/components/pipeline/PipelinePanel.vue:4078-4080` 遍历真实模板。
- 失败保存断点后 `4833-4850` 抛出，链式路径没有读取 fallback。
- 消费点唯一在 compose 分支：`src/components/pipeline/PipelinePanel.vue:4875` `merged.systemSkill || resolveSkillTemplate(fallbackTemplate...)`。

**判定**

- 多步 folder SKILL 链不会消费该 fallback，S1/S2 职责冲突不成立。
- 唯一消费条件是：模板存在但全部未产生 system 内容，或无模板。属于直连兜底合同，不越权。

## 4. 合规清单（保留）

| 层 | 位置 | 裁判内容 | 结论 |
|---|---|---|---|
| 正文回显 | `src/services/chainExecution.ts:287-358`、`workspaceSkillEngine.ts:1702` | 终步 generator、ratio>=0.85 或逐字相同；polish 豁免 | 平台合同，合规 |
| 章节事件密度 | `src/services/chapterEventDensity.ts:93-106` | 只消费 SKILL 自报 `narrativeStatus`/协议字段 | 符合 G2.9 |
| 字数契约 | `src/services/proseWordContract.ts` | minRatio 单源 | 平台合同，合规 |
| 受保护正文账本 | `src/services/protectedSkillContract.ts` | 已剥离【正文交接】后计数 | 口径已修，合规 |
| 卷/章批次契约 | `volumeGenerationContract.ts`、`chapterGenerationContract.ts:190` | 数量/枚举/重复标题；剧情重复仅 warning | 平台合同，合规 |
| 设定契约 | `settingsArtifactContract.ts`、`settingsArtifactOrchestrator.ts` | 非空/重复/数量 | 平台合同，合规 |
| 大纲完整性 | `outlineIntegrity.ts` | 结构覆盖、数量、字数骤减 | 平台合同，合规 |
| 工作台验收 | `workspaceArtifactAcceptance.ts` | body 走字数/契约，outline 走结构 | 合规 |
| 上下文冲突 | `contextConflictDetector.ts` | 同名实体文本不一致，锁定优先 | 输入合同，合规 |
| 风格仲裁 | `pipelineStyleArbiter.ts` | 输入侧指令仲裁，不判产物 | 合规 |
| 工程污染 | `proseHardSignalNet.ts`、`proseHardSignalRepair.ts` | 工程痕迹检测与修复，有完整性门禁 | 合规 |
| 批次编排 | `volumeBatchOrchestrator.ts`、`chapterBatchOrchestrator.ts` | 数量/区间/JSON 协议；folder 链剥离 JSON | 合规 |

## 5. 建议执行顺序

1. 裁决 `contractReview` 三个选项；推荐选项 1，与 G2.9 完全对齐。
2. 清理 `selectCompleteChapters` 未使用 import 与死函数。
3. 对 `narrativeValidation` 做命名/注释收口。
4. 更新经验文件与开发日志，登记本轮“全层无第二裁判，仅观测残留”的结论。

## 6. 本轮边界

- 本轮为只读审计，未修改应用源码，未触碰 SKILL 目录，未升版，未封装，未提交 git。
- 工作区已有的技能导入链路 V2.1 未提交改动保持原样，未混入。

## 7. 闭环结果

用户裁决“审计问题按建议执行”后，三个审计项已闭环：

1. **contractReview 退役本地叙事推断**：删除 `REVEAL_RE` 与三态结论；函数改为 `observeVolumeContractMentions`，仅观测底牌字段提及；新增 `detectVolumeContractSkillVerdict` 只消费 SKILL 显式 `contractStatus: safe|broken / contractReason`，未声明为 `undeclared`。
2. **narrativeValidation 命名收口**：导出改为 `validateVolumeStructure / validateChapterStructure / StructureValidationResult`，生产调用点同步更名。
3. **selectCompleteChapters 死语义删除**：函数、未使用 import 与旧测试一并移除。

验证：定向 `contractReview.spec.ts / contractSemanticsWiring.spec.ts / narrativeValidation.spec.ts` 共 18 tests passed；`npm run type-check` exit 0；旧语义 `rg` 清零（仅卷纲产物 `contractRisk` 平台合同保留）。SKILL 契约已补入 `_audit/SKILL_NARRATIVE_VERDICT_HANDOFF_2026-10-31.md` 第 8 节。本轮未升版、未封装、未提交 git。
