# 开发日志：章级事件增量硬闸应用侧适配（2026-10-31）

## 背景

正文层 folder SKILL 将“章级事件增量”从软建议升级为硬字段、硬校验与全链传递。应用侧原实现只统一处理 `failed/blocked`，无法区分“上游剧情材料不足”与“本层可重试失败”；验收层也没有消费 `事件增量`。

## 根因

1. `realSkillExecutor` 把所有 postProcess blocking issue 都纳入本层重试，不知道哪些缺口的正确解法在上游。
2. `PipelinePanel` 的 blocked 处理只保留通用文案，用户无法从 trace/UI 得知“应回章节规划/剧情层补剧情点”。
3. `stepArtifactAcceptance` 只对账 FACT_LOCK，未消费 SKILL 新增的 `事件增量` 契约字段。

## 修复

1. 新增 `chapterEventDensity.ts` 单源语义模块：
   - `NOT-READY + 章级事件密度不足` 识别为 `upstream_material_gap`。
   - `事件增量` 提取与收益分类；静章/抒情章/关系观察章豁免。
2. `realSkillExecutor` 在第一次物理返回后立即返回 `blocked`，携带明确 guidance 与 `chapter-event-density-not-ready` 诊断，阻断正文层重试。
3. `PipelinePanel` 在 folder blocked 抛错路径（`routeSkill` catch）识别该诊断码：先关闭 API trace，再写 `chapter-event-density-not-ready` trace error、步骤日志与带上游指引的终态错误。此前写在正常返回分支的专项处理不可达，已移除，避免 blocked 仍走通用失败文案；另补 `skillRouter` 回归，钉死 blocked 必须携带 `folderResult` 抛出，防止后续再把专项处理接回不可达分支。
4. 链式 handoff 异常升级重试增加密度闸排除：即使错误发生在非 full_text 交接步骤，也不把 `chapter-event-density-not-ready` 升级为全文重试，而是直接进入失败断点并透传终态错误。
5. `stepArtifactAcceptance.resolveStepArtifactFlow` 新增 `chapterEventIncrementAdvisory`；评估源只读 `【正文交接】` 提取出的 metadata，不读正文本体，避免“新信息/处境改变”等剧情叙述词污染判定；链式与 compose 路径均写 `chapter-event-increment-advisory` trace，检测到问题时聚合显示为 chain warning。
6. 更新 folder SKILL 适配手册，明确识别口径、豁免规则与禁止事项。

## 验证

- `chapterEventDensity.spec.ts`：9 passed。
- `realSkillExecutor.spec.ts`：63 passed；新增 NOT-READY 不重试用例。
- `stepArtifactAcceptance.spec.ts`：18 passed；新增 3 条 advisory 用例，其中 1 条证明正文本体中的收益词不参与判定。
- 联合定向回归：6 files / 107 tests passed。
- `npm run type-check`：exit 0。

## 影响面

- 正文层链式与 compose 验收路径。
- folder SKILL blocked 语义路由；不改变其他 blocked 原因的处理。
- 降AI、word-gap、候选账本逻辑保持不变。

## 后续

- 若同类 NOT-READY 多次出现，应视为上游剧情点供给不足，调整章节规划/剧情层生成策略；不要放宽本闸。
- 自动跨层补剧情点需要先定义跨层产物契约，当前版本先保持“明确阻断 + 指引”。
