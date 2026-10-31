# 开发日志：双层验收边界收口（2026-10-31）

## 背景

正文层 folder SKILL 与应用层此前在“章级事件增量”上出现双裁判：SKILL 负责叙事结构，应用又按七类收益与豁免标签做二次判定。用户裁决：“同一维度只能有一个裁判。”

## 裁决

- SKILL 层：叙事有效性。场景推进、动作链、事件增量是否达标、FACT_LOCK 语义连贯。
- 应用层：平台合同。净字数口径、终态、retry 预算、候选保留、失败路由、协议字段存在性。
- 应用可以显示和路由 SKILL 自报的叙事结论，但不得计算、推断或复查叙事质量。

## 修复

1. `chapterEventDensity.ts` 退役应用侧收益分类、豁免标签与“少于两类”语义；`事件增量` 只做字段存在性协议观测。
2. 新增 `narrativeStatus / narrativeReason / stateChangingScenes` 显式 verdict 解析：`ready` 透传，`not_ready` 进入上游阻断路由，未声明不推断。
3. `realSkillExecutor` 在 postProcess 前消费 `resolveChapterNarrativeBlock`：旧密度 NOT-READY 与新 not_ready 都在第一次物理返回后 blocked，不进入第 2/3 次重试。
4. `stepArtifactAcceptance.resolveStepArtifactFlow` 新增 `chapterNarrativeVerdict`，只读交接 metadata；链式与 compose 路径均写 `chapter-narrative-verdict` trace。
5. `PipelinePanel` 的 blocked 专项处理与 handoff 升级重试排除改为识别双诊断码；`chapter-narrative-not-ready` trace error 明确提示回章节规划/剧情层。
6. 更新 folder SKILL 适配手册，说明 verdict 单通道契约与旧收益分类语义退役。

## 验证

- 旧语义清零：`rg` 返回 0 matches。
- 定向回归：4 files / 106 tests passed。
- `npm run type-check`：exit 0。

## 影响面

- 正文层链式与 compose 验收、folder blocked 路由、trace 事件流、SKILL 适配契约。
- 不改变净字数契约、word-gap、候选账本、降AI与 FACT_LOCK 对账。

## 台账

详见 `TASK_LEDGERS/TASK_LEDGER_2026-10-31_narrative-verdict-ownership.md`。

## 后续：全层单一裁判权只读徹查

用户追问其他层级是否存在同类问题后，完成全层对账，报告见 `AUDIT_2026-10-31_single-owner-verdict-full-scope.md`。

- 结论：设定、大纲工作台、卷纲、章节、正文、导入路由与批次编排均未发现仍在裁决叙事质量的第二裁判；正文层收口语义未在其他层复现。
- 新增发现：`contractReview` 属叙事语义观测残留，仅写 trace 不裁决，列为待裁决项；`narrativeValidation` 命名误导；`selectCompleteChapters` 生产调用为 0。
- fallback 疑点排除：正文层 fallback 提示词只在无 SKILL/无 system 的 compose 兜底路径消费，链式分支不消费。
- 本轮只读审计未修改应用源码，未触碰 SKILL 目录，未升版、未封装、未提交。

## 闭环：审计残留项执行

用户裁决按建议执行后：

- `src/services/contractReview.ts` 退役 `REVEAL_RE` 与本地三态，改为底牌提及协议观测 + SKILL `contractStatus/contractReason` 显式 verdict；`PipelinePanel` 调用点更名，trace level 只由 SKILL `broken` 提升，仍不阻断。
- `src/services/narrativeValidation.ts` 导出改为 `validateVolumeStructure / validateChapterStructure / StructureValidationResult`，生产调用点同步更名。
- `selectCompleteChapters` 函数、未使用 import 与旧测试语义删除。
- 验证：定向 3 files / 18 tests passed；`npm run type-check` exit 0；旧语义 `rg` 清零。
- SKILL 侧契约补入 `SKILL_NARRATIVE_VERDICT_HANDOFF_2026-10-31.md` 第 8 节。
