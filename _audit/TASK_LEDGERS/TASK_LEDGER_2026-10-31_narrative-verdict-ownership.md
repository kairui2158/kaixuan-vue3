# 任务台账：双层验收边界收口（2026-10-31）

## 1. 目标与原话

- 用户原话：“确认，执行完后收尾，并且给SKILL层传递”。
- 最终可感知行为：同一维度只有一个裁判。叙事有效性（场景推进、动作链、事件增量是否达标）由正文层 folder SKILL 判定；应用只做平台合同（净字数、终态、重试预算、候选保留、失败路由）与交接协议观测。
- 本轮交付物：应用侧收益分类/豁免语义退役；`narrativeStatus` 单通道 verdict 消费与透传；`not_ready` 阻断回上游；测试迁移；经验与日志回写；SKILL 适配说明。

## 2. 门禁读证

- G0.1（[神意开发经验总结_v9.md:20](../神意开发经验总结_v9.md)）：本轮目标为双层验收边界收口，不扩展为跨层自动补剧情点。
- G0.10（[神意开发经验总结_v9.md:92](../神意开发经验总结_v9.md)）：旧“收益分类 + 豁免判定”属于被替换语义，必须源码、测试、文档、trace 语义一并清零。
- G0.12（[神意开发经验总结_v9.md:114](../神意开发经验总结_v9.md)）：非平凡跨文件改动必须七节台账。
- G2.9（[神意开发经验总结_v9.md:522](../神意开发经验总结_v9.md)）：caller 状态与产物契约分权；失败路由必须按 owner 分流，禁止把结构债推给下游打磨层。

## 3. 路由判定

- 加入：G0.1、G0.10、G0.12、G2.9。
- 排除：G0.11 真实 UI 门禁。理由：本轮改动面是服务层协议与 trace，不包含“用户必须通过 UI 完成 X”的验收目标；未改任何 UI 交互控件。
- 排除：封装与 git 提交。理由：用户本轮只要求执行、收尾和给 SKILL 层传递；版本升级/封装/提交未下令。

## 4. 影响圈与作者反证

- 打算改：`chapterEventDensity.ts`、`realSkillExecutor.ts`、`stepArtifactAcceptance.ts`、`PipelinePanel.vue`、相关测试与审计文档。
- 可能碰到：链式与 compose 的正文验收、blocked 路由、handoff 升级重试排除、trace 事件流。
- 最可能错的假设：假设 `narrativeStatus` 只会出现在交接元数据里。证伪方式：验收层只读 `metadata.extractedMeta`，并保留正文本体污染回归；执行器阻断点在 postProcess 前读取原始候选，只接受显式 verdict 字段，不做语义推断。
- 第二个风险假设：假设旧密度 NOT-READY 与新 verdict 可以共用 blocked 路由。证伪方式：保留两个独立诊断码与 trace type，`isChapterNarrativeBlockDiagnosticCode` 单源识别，测试分别断言。

## 5. 停止条件

- `rg` 全仓无 `BENEFIT_CATEGORIES`、`distinctBenefitCategory`、`benefitCategories`、`exemptReason`、`收益同质`、`不可归一`、豁免章旧判定语义。
- `chapterEventDensity.spec.ts`、`stepArtifactAcceptance.spec.ts`、`realSkillExecutor.spec.ts`、`skillRouter.spec.ts` 全部通过。
- `npm run type-check` 通过。
- `narrativeStatus: not_ready` 在执行器第一次物理返回后 blocked，不进入第 2/3 次重试。
- 旧 `NOT-READY + 章级事件密度不足` 路由保持不变。
- DEV_LOG、任务台账、经验规则、SKILL 适配说明均已更新。

## 6. 执行证据

- 旧语义清零：`rg -n "BENEFIT_CATEGORIES|distinctBenefitCategory|benefitCategories|exemptReason|收益同质|不可归一|豁免章|静章|抒情章|关系观察章" src` → exit 1，0 matches。
- 定向回归：`npm exec vitest run src/services/chapterEventDensity.spec.ts src/services/stepArtifactAcceptance.spec.ts src/services/realSkillExecutor.spec.ts src/services/skillRouter.spec.ts` → 4 files passed / 106 tests passed。
- 类型检查：`npm run type-check` → exit 0。
- 执行器阻断：`src/services/realSkillExecutor.ts:1174` 消费 `resolveChapterNarrativeBlock`；新增测试证明 `narrativeStatus: not_ready` 只发起 1 次物理调用并返回 blocked。
- 协议观测：`src/services/chapterEventDensity.ts:100` 只判断 `事件增量` 字段存在性；`detectChapterNarrativeVerdict` 只透传显式声明。
- 验收透传：`src/services/stepArtifactAcceptance.ts:184-190` 只读交接 metadata，新增 `chapterNarrativeVerdict`。
- UI/trace 消费：`src/components/pipeline/PipelinePanel.vue:3100-3129` 双诊断码分流；`4462-4483`、`4932-4953` 链式与 compose 双路径透传 verdict。

## 7. 缺口清单

- 本轮无登记缺口：代码、测试、类型检查、旧语义清零、日志、台账、经验规则、SKILL 适配说明均完成。
- 未做供应商 live 生成验证；本轮证据为服务层测试、类型检查与源码对账。SKILL 层真实输出 `narrativeStatus` 后，需要一次真实 trace 回放确认字段到达执行器阻断点。
- 未升版、未封装、未 git 提交；等待用户明确指令。

## 8. 全层徹查追加（只读）

- 审计目标：其他层级是否存在“应用侧二次叙事裁判”。判定标准为 G2.9。
- 审计范围：设定、大纲工作台、卷纲、章节、正文、导入路由、批次编排、回显检测、事件密度、上下文冲突、风格仲裁、工程污染修复。
- 审计结论：未发现仍在裁决叙事质量的第二裁判；`chapterEventDensity` 已符合“只消费显式 verdict”边界。
- 灰色项：`src/services/contractReview.ts:25-68` 的本地“提前揭晓”词表推断。当前仅 `src/components/pipeline/PipelinePanel.vue:6070-6079` 写 trace，不阻断、不 retry、不改写，判定为观测残留而非第二裁判；三个处置选项已登记，待用户裁决。
- 旧语义残留：`narrativeValidation` 命名误导；`selectCompleteChapters` 生产调用为 0，仅 `PipelinePanel.vue:812` import 与 `narrativeValidation.spec.ts` 引用。
- fallback 疑点结论：`PipelinePanel.vue:5922-5929` 传入的正文 fallback 仅在 compose 分支 `PipelinePanel.vue:4875` 消费；链式分支 `3983-4867` 不读取 fallback，不存在 S1/S2 职责冲突。
- 证据文件：`AUDIT_2026-10-31_single-owner-verdict-full-scope.md`。

## 9. 闭环执行证据

用户裁决“审计问题按你建议来执行，完成闭环最后收尾”后，三个审计项落地：

- `src/services/contractReview.ts:50` → `observeVolumeContractMentions` 只做底牌字段提及观测；`src/services/contractReview.ts:36` → `detectVolumeContractSkillVerdict` 只消费显式 `contractStatus/contractReason`；`REVEAL_RE` 与 `contract_safe / needs_reinforcement / broken` 三态不再存在。
- `src/components/pipeline/PipelinePanel.vue:6077` → 调用更名，trace label 为“卷契约协议观测”；level 仅在 SKILL `broken` 时提升，不阻断。
- `src/services/narrativeValidation.ts:23` → `validateVolumeStructure`；章节结构校验同步更名；`PipelinePanel.vue:3579` 生产调用已消费新命名。
- `selectCompleteChapters` 与其 import 已删除；旧语义测试改为新观测语义。
- 定向验证：`npm exec vitest run src/services/contractReview.spec.ts src/services/contractSemanticsWiring.spec.ts src/services/narrativeValidation.spec.ts` → 3 files / 18 tests passed。
- 类型检查：`npm run type-check` → exit 0。
- 旧语义清零：`rg "reviewVolumeContractSemantics|REVEAL_RE|selectCompleteChapters|validateVolumeNarrative|validateChapterNarrative" src` → 0 matches；卷纲 `contractRisk` 是产物平台合同，明确保留。
- SKILL 契约：`SKILL_NARRATIVE_VERDICT_HANDOFF_2026-10-31.md` 第 8 节新增卷契约 verdict 说明。
- 边界：未升版、未封装、未提交 git；等待一次 SKILL 真实输出 `contractStatus` 的 trace 回放。
