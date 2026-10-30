# 任务台账：章级事件增量硬闸应用侧适配（2026-10-31）

## 目标

适配正文层 folder SKILL 的“章级事件密度不足”硬闸语义，确保上游剧情材料缺口不再被误当成正文层可重试失败，并让【正文交接】`事件增量` 进入应用验收观测。

## 输入

- SKILL 层说明：`D:/codex/玄武规划SKILL/凯旋-正文层/APP_SIDE_ISSUES_2026-10-31.md`
- 核心变更：S1 可输出 `NOT-READY`；`事件增量` 成为 S1/S2/S3 全链必填字段；静章/抒情章/关系观察章可豁免。
- 应用侧要求：识别上游材料缺口并阻断本层重试；增加章级验收 advisory；多次 NOT-READY 视为上游供给不足信号。

## 实施记录

1. 新增 `src/services/chapterEventDensity.ts`
   - `detectChapterEventDensityNotReady`：识别 `NOT-READY + 章级事件密度不足`，输出 `upstream_material_gap` 语义。
   - `findChapterEventIncrementValue`：提取【正文交接】`事件增量` 字段。
   - `evaluateChapterEventIncrement`：识别七类收益与豁免章，非豁免推进章少于两类不可归一收益时给 advisory。
2. 接线 `src/services/realSkillExecutor.ts`
   - 在 postProcess 前检测候选输出，命中章级密度 NOT-READY 时立即返回 `blocked`。
   - 返回结构包含原始输出、明确 guidance、`chapter-event-density-not-ready` 诊断与完整 apiMeta，不再进入第 2/3 次物理重试。
3. 接线 `src/services/stepArtifactAcceptance.ts`
   - `resolveStepArtifactFlow` 新增 `chapterEventIncrementAdvisory` 字段。
   - advisory 不改变 accept/reject 决策，只提供事件增量观测结果。
   - 评估源只读交接 metadata，不读正文本体，防止剧情叙述中的收益词被误识别为交接契约。
4. 接线 `src/components/pipeline/PipelinePanel.vue`
   - folder blocked 会被 `routeSkill` 转成携带 `folderResult` 的异常，因此专项处理放在 `callValidatedSkill` 的 catch 分支：先 `finishFolderTraceFromResult` 关闭 API trace，再写 trace error、步骤日志，最后抛出带上游指引的错误。
   - 正常返回分支中的不可达专项处理已移除。
   - `skillRouter.spec.ts` 新增密度闸 blocked 回归：断言异常消息与 `folderResult.diagnostics`，钉死 catch 语义。
   - 链式 handoff 升级重试前先排除密度闸 blocked：此类错误不进入全文重试，直接保存失败断点并透传，保证硬闸只允许上游补材料。
   - 链式与 compose 两条正文验收路径都会发出 `chapter-event-increment-advisory` trace；检测到问题时聚合为 chain warning，不再埋在事件流里。
5. 更新 `_audit/FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md`
   - 新增“章级事件增量硬闸”章节，说明识别口径、豁免规则与 SKILL 禁止事项。

## 测试与验证

- `npm exec vitest run src/services/chapterEventDensity.spec.ts`
  - 9 passed。
- `npm exec vitest run src/services/realSkillExecutor.spec.ts`
  - 63 passed；新增用例证明 NOT-READY 只发起 1 次物理调用并返回 blocked。
- `npm exec vitest run src/services/stepArtifactAcceptance.spec.ts`
  - 18 passed；新增 3 条事件增量 advisory 用例，含正文本体污染回归。
- `npm exec vitest run src/services/chapterEventDensity.spec.ts src/services/realSkillExecutor.spec.ts src/services/stepArtifactAcceptance.spec.ts src/services/schemaRetryFeedback.spec.ts src/services/realS2ProtectedContract.integration.spec.ts src/services/skillRouter.spec.ts`
  - 6 files / 107 tests passed。
- `npm run type-check`
  - exit 0。

## 边界与未做

- 未实现自动跨层回写章节规划/剧情层；本轮采用“明确阻断 + 指引”，避免在未定义跨层产物契约时误路由。
- `事件增量` advisory 不改变契约验收结果；字段缺失仍属于 SKILL 侧结构失败。
- 未做供应商 live 验证；本轮证据为单测、集成测试、类型检查与源码对账。
- 工作区存在其他未提交改动，本任务只新增/修改上述文件，不触碰降AI校准相关脏文件。
