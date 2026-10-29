# TASK_LEDGER 2026-10-29 正文层内嵌降AI GitHub 基准审查

## 1. 目标与用户原话

用户目标原话：“你深度多轮次的搜索github里的去AI味项目或者SKILL后拉取多个精华，然后对账审查我们生成流水线的正文层内嵌去AI味，看我们的是否过时和有缺陷。给我详细的审查报告”。

目标转译：

1. 多轮搜索并拉取多个 GitHub 去 AI 味项目/SKILL 精华，不做单仓抽样。
2. 对账本仓生成流水线正文层内嵌降AI机制，判断是否过时、是否有缺陷。
3. 输出详细审查报告，区分领先点、过时点、缺陷点和可采纳机制。
4. 本轮是只读审查，不修改产品源码，不引入外部依赖，不发起 live API。

## 2. 门禁读证与路由

- 读取 `verification-gate` 技能，按“迁移/对比 + 改需求影响面”复合验证执行。
- 外部 9 个仓库均已克隆到 `D:\codex\_research\deai-github-20261029\`，本轮只读源码，不执行外部项目脚本。
- 本仓审查对象：
  - `src/services/de-ai.js`
  - `src/components/pipeline/PipelinePanel.vue`
  - `src/services/realSkillExecutor.ts`
  - `src/services/schemaRetryFeedback.ts`
- 审查前对账历史问题：卷纲层曾指出 schema retry 候选全文回传；本轮重点复核该问题是否已修复。

路由判定：

- 任务类型是“外部基准对账审查 + 审计文档交付”，不是产品源码修复。
- 因此不进入 L2 实现类门禁；按验证门的“迁移/对比”模板执行三面对账：机制面、证据面、边界面。
- 硬边界：不改 `src/`、`electron/`、`package.json`；不提交 git；不封装；不发起 live API。

## 3. 审查范围与影响圈

本仓机制：

- 生成期提示词注入：`src/services/de-ai.js:736-768`、`src/components/pipeline/PipelinePanel.vue:3505-3554`
- 检测/深度修复/兼容清洗三模式：`src/components/pipeline/PipelinePanel.vue:5801-6005`
- 深度修复保护片段与完整性回滚：`src/components/pipeline/PipelinePanel.vue:6089-6168`
- 后处理后契约复验：`src/components/pipeline/PipelinePanel.vue:5823-5847`、`:5933-5958`
- 终步降AI检测异常路径：`src/services/realSkillExecutor.ts:521-533`
- 结构化重试反馈：`src/services/schemaRetryFeedback.ts:19-22`、`:66-108`

外部基准：9 个仓库，上游地址与本地关键证据见主报告第 3 节与第 5-7 节。

影响圈：

- 本轮新增 3 份 `_audit` 文档：主报告、DEV_LOG、本台账。
- 本轮修改 1 份既有文档：`_audit/DEV_LOG_MASTER_INDEX.md` 追加登记。
- 不修改任何产品源码；所有修复建议只登记为后续立项项。

## 4. 基准对账与证据

机制面对账结论：

1. 生成期注入、三模式分离、事实保护、契约复验、trace 观测、有界 retry 反馈：本仓领先于多数社区项目。
2. 检测内核落后：缺 n-gram 重复指纹、长度自适应阈值、整体评分、verdict、AI-edited fraction。
3. 修改防护缺口：缺 30%/50% 变更率门禁，深度修复可能整章换腔。
4. 风格能力落后：无作者声纹/文风档案接入，无长章节风格漂移检测。
5. 观测诚信缺陷：`retentionRatio` 恒为 1；终步检测异常静默吞掉。

历史问题复核：

- schema retry 候选全文回传已修复。`buildSchemaRetryFeedback` 明确不携带候选全文，只保留错误、锚点和头尾 200 字符预览，见 `src/services/schemaRetryFeedback.ts:19-22`、`:66-108`。

外部关键证据：

- `im-not-ai/CLAUDE.md:22`：30% 变更率警告、50% 强制中断。
- `humanize/plugins/humanize/skills/ai-check/SKILL.md:19-38`：9 信号 0-27 分与证据引用。
- `unslopify/src/unslopify/audit.py:17-18`、`:57-69`：长度自适应阈值；`:141`、`:295-307`：4-gram 重复指纹。
- `unslopify/src/unslopify/voice.py:27-53`：作者样本 VoiceProfile。
- `humanizer-zh/SKILL.md:45-55`：中文作者声纹档案优先。
- `no_ai_slop_writing_rules/skills/rossmann-voice/SKILL.md:66-77`：长文风格漂移信号。
- `work-humanizer/skills/work-humanizer/SKILL.md:21`、`:41-47`：检测器更看句子组织指纹，作者句子材料优先。

## 5. 缺陷清单与采纳优先级

P0（必须修）：

1. P0-1 `protectedSpans` 指标造假，`retentionRatio` 恒为 1。
2. P0-2 终步降AI检测异常被静默吞掉，应引入 `quality_gate_degraded` 状态。
3. P0-3 缺 30%/50% 变更率门禁，深度修复可能过度重写。
4. P0-4 缺中文 n-gram 重复指纹与长度自适应阈值。

P1（应尽快补）：

1. 作者声纹/创作风格卡片未接入降AI提示词。
2. 无长章节风格漂移检测。
3. 无 hedging 场景豁免，对白可能被误伤。
4. 无整体评分、verdict、AI-edited fraction。
5. 提示词规则堆叠偏重，可能制造另一种公式腔。

P2（设计权衡）：

1. `legacy-auto` 硬替换可能制造新公式腔。
2. 外部项目多为英/德/韩文场景，词表与阈值不能直接搬进中文小说。
3. 不应把“检测器分数”当最终目标；主杠杆仍是生成期注入与作者声纹。

建议采纳顺序：P0-1/P0-2 → P0-3 → P0-4 → P1 声纹 → P1 评分 → P1 漂移/hedging → P1 提示词压缩/P2 权衡。

## 6. 执行验证

以下均为 2026-10-29 本轮新鲜命令结果。

1. 主报告关键内容复核：
   - `rg -n "retentionRatio|P0-1|P0-2|P0-3|P0-4|采纳优先级|已验证与未验证边界" _audit/DEAI_GITHUB_BENCHMARK_REVIEW_2026-10-29.md`
   - 输出：第 27 行观测诚信结论；第 89/106/123/140 行四个 P0 小节；第 245 行采纳优先级；第 257 行已验证与未验证边界。
2. 修复建议与外部机制覆盖复核：
   - `rg -n "schemaRetryFeedback|不携带候选输出全文|protectedSpans|quality_gate_degraded|VoiceProfile|style_drift" _audit/DEAI_GITHUB_BENCHMARK_REVIEW_2026-10-29.md`
   - 输出：第 77 行 schema retry 已修复证据；第 94/102 行 protectedSpans 造假证据；第 120 行 quality_gate_degraded 建议；第 169/175 行 VoiceProfile 接入建议；第 185 行 style_drift 建议。
3. 主索引登记复核：
   - `rg -n "2026-10-29|deai-github|去AI味|降AI" _audit/DEV_LOG_MASTER_INDEX.md`
   - 输出：第 3 行更新日期 2026-10-29；第 1320-1325 行本轮登记，包含报告、DEV_LOG、台账链接与范围摘要。
4. 工作区影响面：
   - `git status --short`
   - 本轮相关：`M _audit/DEV_LOG_MASTER_INDEX.md`、`?? _audit/DEAI_GITHUB_BENCHMARK_REVIEW_2026-10-29.md`、`?? _audit/DEV_LOG_2026-10-29_deai-github-benchmark-review.md`、`?? _audit/TASK_LEDGERS/2026-10-29_deai-github-benchmark-review.md`。
   - 用户/前任务脏文件保持原状，未回滚、未触碰 `src/` 与 `electron/`。

## 7. 边界与未完成项

- 本轮为只读审查，未实施报告中的 P0/P1/P2 修复。
- 未执行 live API 生成对比。
- 未用真实中文网文样本做阈值校准。
- 未对外部项目做 license 合规审查；若未来要复制代码而非借鉴机制，需先逐仓审查 license。
- 后续应按主报告第 8 节顺序立项，第一优先级是观测诚信：移除假 retentionRatio、显式暴露 quality_gate_degraded。

## 8. 追问补充复核：星标与 folder SKILL 适配度

用户追问：外部方案是否适配正文层 folder SKILL、项目是高星还是低星、内核是否高级。因此补采 GitHub API 元数据，并在主报告新增第 3.1、3.2 节。

新鲜验证：

1. GitHub API 星标复核：
   - 输出包含 `blader/humanizer stars=61949`、`epoko77-ai/im-not-ai stars=6311`、`harshaneel/humanize stars=584`、`ai-zixun/humanizer-zh stars=202`、`youngfreezy/unslopify stars=0`。
   - 结论：样本不是全高星；星标与内核先进性不等价，`unslopify` 0 星但确定性审计内核最完整。
2. folder SKILL 适配判定依据：
   - `src/services/realSkillExecutor.ts:714-748`：folder SKILL 依赖 `preProcess`、`template.md` 优先级与流水线变量注入。
   - `src/services/realSkillExecutor.ts:1114-1237`：`postProcess`、schema 校验与 retry 反馈是执行协议的一部分。
   - 外部仓为独立 SKILL/CLI，不提供这些协议；直接挂载会造成第二套风格权威与规则堆叠。
3. 结论修正：
   - 外部项目不能直接作为正文层 folder SKILL 使用。
   - 可采纳的是机制：变更率门禁、自适应阈值、n-gram 指纹、评分/verdict、声纹档案。
   - 外部作者声纹不可搬，应复用应用内创作风格卡片投影为 `DeAiVoiceProfile`。

## 9. 后续方案产出

用户确认采纳判断后，要求基于爬取内容与可用机制产出正文层内嵌降AI升级方案。产物：

- [_audit/PROPOSAL_2026-10-29_BODY_EMBEDDED_DEAI_V2.md](../PROPOSAL_2026-10-29_BODY_EMBEDDED_DEAI_V2.md)

追加审核：用户追问 V2 是否遗漏“应用架构协同升级”与“内嵌形态是否应升级以配合 folder SKILL”。复查结论：原 V2 第 3 节只有原则，未落契约；且源码存在双注入点：

- folder 路径：`src/components/pipeline/PipelinePanel.vue:2657` 生成 `systemPromptSuffix`，经 `src/services/skillRouter.ts:200` 传入 `src/services/realSkillExecutor.ts:321`。
- agent 变体路径：`src/components/pipeline/PipelinePanel.vue:3505` 与 `:3515` 手工拼接 `[skillPart, agentPart, deaiPrompt]`。

补强内容已写入方案 Phase 8：

1. folder SKILL `meta.deai` 声明契约：`generation`、`finalStepDetection`、`conflictPolicy`。
2. 双注入点收口为单一投影函数，双路径一致性入测试。
3. 冲突与非法声明必须写 trace，不允许静默覆盖或静默回退。
4. 未声明保持现有默认行为，旧模板零迁移成本。
5. 架构协同成熟度从“未评估”更新为“已评估并有契约设计”。

二次追加审核：用户指出 folder SKILL 不是一成不变的，会经大量真实生成测试后持续迭代；落地后必须提供 SKILL 协同说明指导。方案新增 Phase 8.5：

1. 落地必交付 [_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md](../FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md)。
2. 契约带 `contractVersion`；未知字段宽容但写 trace warning，兼容性扩展走 minor，语义变化走 major。
3. 手册覆盖契约语义、版本策略、SKILL 迭代自检流程、trace 排查路径、冲突升级路径、迁移示例、测试复跑方式、变更登记。
4. 防漂移门禁：fixture 锚定接口片段；应用/测试/手册三处字段一致性测试；手册版本同步纳入发布收尾清单。

三次追加审核：用户要求全量复审方案漏洞、漏项与目标偏移。复查结论：方案未偏移最初需求（吸收外部机制、升级正文层内嵌降AI、不引入第二执行权威），但 Phase 8 存在三个实现级盲区，已补进方案：

1. **agent 变体路径缺 SKILL 元数据**：`PipelinePanel.vue:3488-3515` 只接收 `skillTemplate`，拿不到 folder `meta.deai`；实现必须显式传入解析后的 `skillDeaiMeta`，拿不到时标记 `app-default-no-skill-meta`，禁止伪装 SKILL 声明。
2. **`finalStepDetection` 权限过宽**：原写法会让人误以为它能关闭后处理；现明确它只关闭应用侧终步反馈注入，用户选择的 `detect-report/deep-fix/legacy-auto` 仍执行，冲突时 UI 与 trace 双显示。
3. **双路径一致断言过强**：folder 路径含 samples/guidance，agent 路径含 agent prompt；只能锁定降AI投影、variant、policy、source 一致，不能要求整份 systemPrompt 相等。

另补契约预检：新增 `validateSkillDeaiMeta` 纯函数，`contractVersion` 全字段改为可选并带缺省语义，未知版本不阻断运行但记录 warning；SKILL 迭代后先跑本地契约预检，再进入生成测试。

门禁对账：

- G0.3：方案明确 `provisional` 阈值不得冒充校准完成。
- G0.6：第 9 节给出四层成熟度结论。
- G0.9/G0.10：影响圈限定 `de-ai.js`、Pipeline 降AI接线、trace、测试；旧假指标要求负向断言清零。
- G1.4/G1.8/G1.9：验证分层、观测同步、`quality_gate_degraded` 状态注册均纳入方案。
- G2.13：不引入外部 SKILL 第二权威，folder SKILL 保持唯一执行权威。
- G0.6/G2.13 追加：Phase 8.5 把“SKILL 持续迭代”纳入方案成熟度，不以一次性文档冒充长期协同。
- G0.6/G0.9 三次追加：全量复审后修正 Phase 8 实现级盲区，权限分层与双路径断言均已收敛到可执行、可测试口径。

四次追加：用户要求整合出一个详细无遗漏的最新版方案。产物：

- [_audit/PROPOSAL_2026-10-29_BODY_EMBEDDED_DEAI_V3.md](../PROPOSAL_2026-10-29_BODY_EMBEDDED_DEAI_V3.md)

V3 为整合版，取代 V2 及其全部追加段落，作为唯一执行事实源；V2 保留为历史版本。整合范围：目标与边界、当前基线、架构原则、folder SKILL 契约（`SkillDeaiMeta` / `validateSkillDeaiMeta` / `resolveDeaiPromptForSkillStep`）、Phase 1-10 实施步骤、影响文件清单、验证命令、风险对策、经验门禁对账、执行顺序与放行点、成熟度结论、边界声明。三轮架构追问的结论（协同契约、活 SKILL 指导手册、agent 路径元数据缺口、finalStepDetection 权限收敛、双路径降AI投影断言）全部并入对应 Phase，不再依赖散落在台账里的追加说明。

边界：本轮仅更新 `_audit` 方案与台账，未修改产品源码，未执行测试，等待用户审核。

## 10. V3 执行记录

### 2026-10-29 Phase 1：观测诚信修复

- `detectBody` 删除假 `protectedSpans.hit/missing` 与假 `retentionRatio`；retention 只在深度修复后由 `verifyProtectedSpans` 计算。
- `collectDeaiFindingsWithObservability` 捕获检测异常，`realSkillExecutor` 降级时写 `quality_gate_degraded` diagnostic。
- 验证：`npx vitest run src/services/de-ai-v2.spec.ts` → 7 passed。

### 2026-10-29 Phase 2：变更率门禁

- 新增 `evaluateDeepFixEdit`：句级 LCS + 标点归一；warn 0.30 / reject 0.50，blocking > 3 时收紧为 0.22 / 0.38。
- `PipelinePanel.vue` 深度修复输出后执行门禁；拒绝保留原文并写 `deai-minimal-edit` warn、`deai-change-rate` 事件。
- 验证：`npx vitest run src/services/de-ai-v2.spec.ts src/services/realSkillExecutor.spec.ts` → 65 passed。

### 2026-10-29 Phase 3：检测内核 V2

- `src/services/de-ai.js`：新增 `DEAI_V2_THRESHOLDS`、中文 2/3-gram 重复指纹、叙述/对白 hedging 分层、2,000 字窗口 `style_drift`、0-100 评分、`verdict`、`aiEditedFraction`。`detectBody` 返回 `DeAiDetectReportV2`，旧 findings 字段结构保持兼容；空报告带 V2 元数据。
- 短文本阈值缩放与对白宽容倍率已实现；全部阈值 `source: 'default'`，报告 `provisional: true`。Phase 10 真实样本校准前不得宣称最终阈值。
- `src/stores/deai.ts`：报告类型与回读校验改为 V2 结构，删除旧 `retentionRatio`/`protectedSpans.hit/missing` 必填要求，修复持久化回读拒收新格式的问题。
- `src/components/settings/DeAiSettings.vue`、`src/components/editor/EditorPanel.vue`：消费面删除 `protectedSpans.hit` 读取，改为显示 V2 kernel、score、verdict 与 provisional 标记。
- `src/services/de-ai.d.ts`：补充 `DeAiDetectReportV2` 类型与 `collectDeaiFindingsWithObservability` 声明。

验证（本轮新鲜输出）：

- `npx vitest run src/services/de-ai-v2.spec.ts` → 12 passed
- `npx vitest run src/services/de-ai-v2.spec.ts src/services/realSkillExecutor.spec.ts` → 70 passed
- `npx vitest run src/services/de-ai.spec.ts src/services/deaiChainVariantIntegration.spec.ts src/services/skillRouter.spec.ts` → 12 passed
- 19,600 字本地检测 + 变更率门禁实测 51ms（方案阈值 300ms）

### 2026-10-29 Phase 4：作者声纹接入

- `src/services/deaiVoiceProfile.ts:79` 新增 `buildDeaiVoiceProfile`，从 `styleProfileEffective` 投影 `DeAiVoiceProfile`；未锁定或未注入时返回 null，禁止凭空注入。
- `src/components/pipeline/PipelinePanel.vue:908` 单源计算 pipeline 声纹，`:911` 生成 trace 事件，folder/agent 双路径共用同一投影。
- 验证：`npx vitest run src/services/deaiVoiceProfile.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts`，未锁定不注入、锁定后携带同一投影、trace 字段断言均覆盖。

### 2026-10-29 Phase 5：提示词压缩

- S1/S2/S3 提示词压缩为 12/5/6 条，源码锚点：`src/services/de-ai.js:1133-1163`。
- 保留小说事实保护、FACT_LOCK、章节契约与“过度纠错也是 AI 信号”的反信号；风格细节交给声纹投影，不再堆叠通用禁令。
- 验证：真实 Electron 三场景中三次物理请求 system 分别携带 methodology/creative/polish 注入标记；全量测试 227 files / 2431 tests PASS，FACT_LOCK 与章节契约用例未回退。
- 诚实边界：方案原文的“生成样稿 A/B 对比”未执行；本轮证据是 prompt 注入与回归测试，不是人评 A/B。

### 2026-10-29 Phase 6：legacy-auto 降级

- `src/stores/deai.ts:94-96/:136` 显式记录用户是否选择 legacy-auto，新项目默认不再落到硬替换。
- `src/components/settings/DeAiSettings.vue:28-31` UI 明示“兼容自动替换（不提高人味）”。
- `src/components/pipeline/PipelinePanel.vue:5930/:5979` legacy-auto 与 deep-fix 处理器版本分离，trace 可区分。
- 验证：相关默认值与显式选择逻辑由 store/UI 回归覆盖；真实 Electron 验证未启用 legacy-auto，未产生硬替换。

### 2026-10-29 Phase 7：trace 与 UI 汇总

- `src/services/deaiObservationEvents.ts:2/:37/:47/:65` 生成 `deai-kernel-v2`、`deai-score`、`deai-style-drift` 事件。
- `src/stores/runTrace.ts:947-955` 白名单注册 `deai-voice-profile`、`deai-injection-policy`、`deai-change-rate`、`deai-quality-gate-degraded` 等事件；`:2573` 写入降级诊断。
- Electron 导出、外置 payload 索引与 UI 汇总沿用既有 trace 管线，导出/回读由 `runTraceExportService` 与 worker 测试覆盖。
- 验证：真实 Electron 三场景 trace、物理请求与 UI 截图归档于 `_audit/verification-deai-body-electron/`；全量测试 PASS。

### 2026-10-29 Phase 8/8.5：folder SKILL 契约与手册

- 新增 `src/services/skillDeaiContract.ts`：`SkillDeaiMeta`、默认值、`validateSkillDeaiMeta`、`resolveDeaiPromptForSkillStep`。
- `src/components/pipeline/PipelinePanel.vue:2722/:3611` folder 与 agent 双路径统一走 `resolveDeaiProjection`；`:2727/:3616` 非法声明写 `deai-contract-warning` 并保留原值。
- agent 路径拿不到元数据时标记 `app-default-no-skill-meta`，禁止伪装 SKILL 声明。
- 验证：`npx vitest run src/services/skillDeaiContract.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts`；真实 Electron 三场景覆盖无声明、`generation: off`、非法值回退。
- 手册：[_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md](../FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md) 已交付，包含契约语义、版本策略、迭代自检、trace 阅读与迁移示例。

### 2026-10-29 Phase 9：集成回归

- 单测/集成：`src/services/de-ai-v2.spec.ts` 覆盖内核、阈值缩放、n-gram、变更率三态；`deaiVoiceProfile`、`skillDeaiContract`、injection-policy、观测导出与回读用例覆盖接线。
- 真实 Electron：`node scripts/verify-deai-body-electron.mjs` PASS，三场景（无 `meta.deai` / `generation: off` / 非法声明）全部通过，截图、trace、物理请求、心跳 16 帧归档。
- 全量回归：227 files / 2431 tests PASS；`git diff --check` 无 whitespace error。
- 性能：20,000 字 `detectBody` 26.01ms，检测 + 变更率合计低于 300ms 的单测保持通过。

### 2026-10-29 Phase 10：真实中文样本校准与收尾边界

- 脚本：`scripts/calibrate-deai-v2-thresholds.mjs`；数据与报告：`_audit/DEAI_SAMPLE_CALIBRATION_2026-10-29.md`、`_audit/verification-deai-calibration/deai-v2-calibration-2026-10-29.json`。
- 样本：《踏星》主故事 5,588 章固定种子抽 200 章，加两类合成正样本各 80 章。
- 首轮暴露报告层误伤：255 词全量词库导致真实人写章节 100% blocking。已修复为 `DEAI_V2_BLOCKING_VOCAB` 高置信子集（`src/services/de-ai.js:84`、`:278`），仅 V2 报告层使用，硬规则层保留全量词库。
- 四条分层放行标准 PASS：对白 hedging 误伤 0%；两类正样本 n-gram 命中 100%；变更率三态拒绝整章重写；20,000 字检测 26.01ms。
- 整体判定保持 NOT CALIBRATED：单一作者负样本、合成正样本、suspicious+ 误伤 56%，`src/services/de-ai.js:626/:1012` 的 `provisional: true` 保留。
- 经验文件回写：`_audit/神意开发经验总结_v9.md` 升级 v9.8.0，新增 G1.22 检测/评分类校准门禁。
- 收尾验证：定向 16 tests PASS；全量 227 files / 2431 tests PASS；版本 3.110.7，安装包保持 `dist/神意助手-Setup-3.110.7.exe`，本轮收尾不重复打包。

### 2026-10-29 V3 收尾对账结论

- 已完成：Phase 1-10 功能实现、契约与手册、trace/UI、真实 Electron 验证、真实中文样本校准、经验文件与 MASTER_INDEX 登记。
- 保留边界：整体阈值/评分/verdict 保持 provisional；未发起 live 供应商请求；未做人评 A/B 生成样稿对比。
- 工作区状态：包含前轮与本轮大量未提交改动；本轮既定决策是不提交、不重复封装，未执行 git commit。

### 2026-10-29 V3 Phase 8.5 防漂移补闭环

目标：补齐方案 Phase 8.5 中“应用/测试/手册三处字段一致性测试”和“发布收尾清单包含手册版本同步”两个未闭环项。

影响圈：

- `src/components/pipeline/__tests__/deai-injection-policy.spec.ts` 新增一致性测试，读取手册原文并锁定契约版本、默认值、合法值、权限边界和变更登记规则。
- 新增 `_audit/RELEASE_CHECKLIST.md`，把手册版本同步纳入发布硬门禁，并登记定向测试命令。
- 不修改运行时代码；`SKILL_DEAI_CONTRACT_VERSION` 仍为 1，手册仍为 v1。

边界：

- 该测试证明“契约实现与手册当前文本一致”，不证明手册中的 SKILL 迭代指导对每套真实 folder SKILL 都最优；后者仍需真实生成测试。
- live 供应商对比与多作者样本校准仍按前节登记为后续任务，不由本轮补齐。
