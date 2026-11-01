# TASK_LEDGER_2026-11-01_deai-mentor-guidance-v5-final

## 1. Objective

用户裁决：全部决策点采纳建议值“是”，要求从 V1 审到 V4.1，确认无误后出最终执行方案版本。本轮交付：跨版本审计、V5 FINAL 方案、台账、DEV_LOG、主索引登记、V4.1 台账指向。不改生产代码。

## 2. Gate Evidence

- G0.1 目标对齐：`_audit/神意开发经验总结_v9.md:52` 附近
- G0.3 诚实闭环：同文件 `:56` 附近
- G0.6 成熟度四层：同文件 `:60`
- G0.7 正反推：同文件 `:68`
- G0.9 七面影响圈：同文件 `:84`
- G0.10 七层清零与五证：同文件 `:92-104`
- G0.12 台账七节：同文件 `:114-126`
- G2.9 单一裁判：同文件 `:524-544`

## 3. Routing Decision

采纳：G0.1、G0.3、G0.6、G0.7、G0.9、G0.10、G0.12、G2.9。

排除：G0.11 真实 UI 冒充禁令，本轮无 UI 实施，列为 Phase A/B 验证门禁；G2.10 真实 trace 回放，列为 Phase B 验证门禁。

## 4. Impact Circle And Author Counter-Evidence

改动：仅新增 `_audit` 文档项。

可能碰到的：无生产代码、无测试、无配置。

关键证伪：

1. V1-V4.1 是否存在目标漂移：逐版复读，方向一致；发现三处早期承诺被后续裁决覆盖（手动入口、blocking、skill-wins），已在 V5 FINAL 第 1 节显式裁决，避免执行时拿错版本。
2. V4.1 的 10 漏项是否全部进入最终版：L1-L10 分别映射到 A4/B1/B2/A3/B5/B3/A2/B4/A5/A3。
3. 决策是否全部锁定：V4.1 六项 + 前序仍有效决策合并为 14 项锁定清单。

## 5. Stop Conditions

1. 用户确认执行前不改生产代码。
2. 任一 Phase Task 缺预写验证命令，该 Phase 禁止开始。
3. Task 无原始验证输出，状态只能未完成。
4. 七层清零或五证缺一，禁止封装。
5. provisional 校准未解除，禁止输出总分或语义 verdict。

## 6. Execution Evidence

1. V1 全文复读：`PROPOSAL_2026-11-01_DEAI_DIAGNOSE_ROUTE_RETURN_V1.md`。
2. V2 全文复读：`PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V2.md`。
3. V3 全文复读：`PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V3.md`。
4. V4/V4.1 全文与源码锚点复读：前轮已完成，本轮复用。
5. 最终方案结构自检：见 DEV_LOG 验证节。

## 7. Gap List

1. A2-A6、Phase B/C 未执行。
2. 影子配对数据尚不存在。
3. 本轮不升版、不封装、不提交 git。

## 8. Execution Ledger

### Task A1 — complete

方案条文：切断 `PipelinePanel.vue` 对手动 DEAI store 的 4 读 1 写；不删除 `runBodyMinimalEdit`（Phase C 退役）；同批迁移位置耦合断言，避免红灯前进。

实施文件：

1. `src/components/pipeline/PipelinePanel.vue:1178` 附近删除 `const deAiStore = useDeAiStore()`。
2. `src/components/pipeline/PipelinePanel.vue:6090-6298` 原后处理块整段删除，含 legacy-auto、detect、deep-fix、失败降级四个分支。
3. 同文件删除已无调用点的 `useDeAiStore`、`buildDeaiDetectSummaryEvents` import。
4. `src/services/proseHardSignalWiring.spec.ts:6-16` 将“hard signal 在 deAiStore 开关之前”的耦合断言迁移为负向断言：`expect(pipelineSource).not.toContain('deAiStore.hardruleEnabled')`。

执行裁决：A3 的断言迁移提前到 A1 同批执行。原因：A1 删除读取点后该 spec 必红，按 V5 FINAL 执行条例不允许红灯前进；这不扩大行为面，只把 A3 预写的迁移前移。

验证命令与原始输出：

1. `rg -n "deAiStore\.(hardruleEnabled|hardRuleMode|hardRules)|setLastDetectReport|useDeAiStore\(\)|buildDeaiDetectSummaryEvents" src/components/pipeline/PipelinePanel.vue` → exit 1，无输出，读/写/import 清零。
2. `npx vitest run src/services/proseHardSignalWiring.spec.ts` → 1 file passed / 6 tests passed。
3. `npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts` → 1 file passed / 9 tests passed。
4. `npm run type-check` → `vue-tsc --noEmit` exit 0。

状态：complete。下一项：Task A2。

### Task A2 — complete

方案条文：修 `finalStepDetection` 正常终步接线，并验证 `skillRouter` 链式与 compose 双路径透传。

实施文件：

1. `src/services/realSkillExecutor.ts:543` 新增 `composeFinalStepTeachingFeedback`：仅 `role=polish` 且 `deaiDetection != off` 时在有效正常终步合成 app-owned DEAI 教学反馈；通过既有 `onFinalStepFeedbackComposed` 回调外送，不改 status、errors、output、retry。
2. `src/services/realSkillExecutor.ts:1368-1373` 在 `validation.valid` 分支接入上述函数；schema retry 分支保持原行为。
3. `src/services/realSkillExecutor.spec.ts:1872-1938` 新增正常终步 on/off 双用例：on 生成 findings 反馈且 success/errors 不变、单次物理调用、无 `quality_gate_degraded`；off 无回调。
4. `src/services/skillRouter.spec.ts:289-366` 新增 folder 链式与 composite 双路径 `finalStepRetry` 透传守护用例。

Ruling: 正常终步反馈按 V4 第 13 节“只控制教学反馈生成，不改终态”执行为观测回调，不把反馈注入 prompt。正常终步无失败可修复，注入 prompt 会违反“教学反馈不触发重试、不改请求产物”的核心不变式；成本是 Phase B UI 面板落地前只能从回调/trace 观测该数据。

RED 证据：

1. `npx vitest run src/services/realSkillExecutor.spec.ts src/services/skillRouter.spec.ts` → exit 1；唯一失败 `composes app-owned DEAI teaching feedback on a valid normal final step`，断言 `expected [] to have a length of 1 but got +0`，其余 76/77 通过，证明断链真实且测试未测 mock。

GREEN / 验证证据：

1. `npx vitest run src/services/realSkillExecutor.spec.ts src/services/skillRouter.spec.ts` → exit 0，Test Files 2 passed / Tests 77 passed。
2. `npm run type-check` → `vue-tsc --noEmit` exit 0。
3. `git diff -- src/services/realSkillExecutor.ts src/services/realSkillExecutor.spec.ts src/services/skillRouter.spec.ts` → 全部 diff 行均归属 A2，无圈外修改。
4. `rg -n "composeFinalStepTeachingFeedback|deaiDetection === 'off'|sourceCounts\.deai" src/services/realSkillExecutor.ts src/services/realSkillExecutor.spec.ts` → 生产实现 3 处锚点、测试断言 3 处锚点，正常终步 off 分支存在。

状态：complete。下一项：Task A3。

### Task A2 addendum — complete

复核发现：A2 正常终步教学反馈复用 `onFinalStepFeedbackComposed` 后，`PipelinePanel` 固定 label 会把无重试的教学观测误标为“终步重试反馈”。

实施文件：

1. `src/services/finalStepFeedback.ts:26` `FinalStepFeedbackResult` 增加可选 `kind: 'retry' | 'teaching'`。
2. `src/services/realSkillExecutor.ts:534,556` schema retry 输出 `kind: 'retry'`，正常终步教学输出 `kind: 'teaching'`。
3. `src/components/pipeline/PipelinePanel.vue:2663,3002-3018` 审计状态与 trace detail 记录 `kind`，label 区分“终步教学反馈 / 终步重试反馈”。
4. `src/services/realSkillExecutor.spec.ts:1789-1825` 终步重试用例断言 `kind=retry`；正常终步 on 用例断言 `kind=teaching`。

验证：

1. `npx vitest run src/services/realSkillExecutor.spec.ts src/services/finalStepFeedback.spec.ts` → exit 0，Test Files 2 passed / Tests 70 passed。
2. `npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/services/skillRouter.spec.ts` → exit 0，Test Files 2 passed / Tests 20 passed。
3. `npm run type-check` → exit 0。

状态：complete。下一项：Task A3。

### Task A3 — complete

方案条文：引入 `BODY_LAYER_STEP = 4` 常量，收口 DEAI 终步判定裸字面量；迁移对生产源码的字面耦合断言，不收口 `PipelinePanel` 正文业务层编号点。

实施文件：

1. `src/services/skillDeaiContractValidation.ts:5-9` 新增 `BODY_LAYER_STEP = 4` 与用途注释。
2. `src/services/skillDeaiContract.ts:9,23,99` import/export 常量，`step !== 4` 迁移为 `step !== BODY_LAYER_STEP`。
3. `src/services/de-ai.js:2,1255,1265` import/export 常量，`resolveDeaiPromptForChainStep` 迁移为常量判定。
4. `src/components/settings/DeAiSettings.vue:280,346` 设置页终步关闭判定迁移为常量。
5. `src/services/de-ai.d.ts` 新增 `BODY_LAYER_STEP: 4` 声明。
6. `src/components/pipeline/__tests__/deai-injection-policy.spec.ts:79-80` 脆弱断言迁移为 import 与 `detail.step === BODY_LAYER_STEP` 断言。

RED 证据：

1. `npx vitest run src/services/de-ai.spec.ts src/services/skillDeaiContract.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts` → exit 1；唯一失败 `shows the skill-declared final-step shutdown next to the user post-processing mode`，断言 `expected settingsSource to contain 'detail.step === 4'`。

GREEN / 验证证据：

1. `npx vitest run src/services/de-ai.spec.ts src/services/skillDeaiContract.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts` → exit 0，Test Files 4 passed / Tests 24 passed。
2. `rg -n "step === 4|step !== 4|step: 4" src/services/de-ai.js src/services/skillDeaiContract.ts src/components/settings/DeAiSettings.vue src/components/pipeline/PipelinePanel.vue` → DEAI 收口文件 0 命中；仅剩 `PipelinePanel.vue` 13 处正文业务层编号点（显示、断点、进度、正文合同、trace step 字段），符合方案“不一刀切替换”的排除范围。
3. `npm run type-check` → `vue-tsc --noEmit` exit 0。

状态：complete。下一项：Task A4。

### Task A4 — complete

方案条文：设置页 source 双向过滤，只读不改手动功能本体。

实施文件：

1. `src/components/settings/DeAiSettingsObservations.ts` 新增 `collectDeaiSettingsObservations`：手动观测（变更率、门禁降级）只读 `source === 'home'`；SKILL 终步声明只读 `source === 'pipeline'` 且 `step === BODY_LAYER_STEP`。
2. `src/components/settings/DeAiSettings.vue:280,308` 接入隔离收集器，最近检测报告与 SKILL 终步声明不再共享同一事件流；`:316` 暴露测试钩子。
3. `src/components/settings/DeAiSettingsObservation.spec.ts` 覆盖 home/pipeline 双向隔离与组件接线。
4. `src/components/pipeline/__tests__/deai-injection-policy.spec.ts:79-93` 迁移为隔离收集器接线与声明位置断言。
5. `scripts/verify-deai-settings-source-isolation-ui.mjs` 新增真实 Electron + CDP 冒烟，并内置 renderer 构建新鲜度门禁。

验证命令与原始输出：

1. `npx vitest run src/components/settings/DeAiSettingsObservation.spec.ts` → exit 0，3 tests passed。
2. `npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/services/de-ai.spec.ts src/services/skillDeaiContract.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts` → exit 0，4 files / 24 tests passed。
3. `npm run type-check` → exit 0。
4. `node scripts/verify-deai-settings-source-isolation-ui.mjs`（构建门禁先红，证实 dist-renderer 为旧包）→ `AssertionError: renderer build is stale; run npm run build:vue first: assets/index-DcVMed10.js ... 26 !== 0`。
5. `npm run build:vue` → exit 0，`vite build` 与 protocols 二段构建均完成。
6. `node scripts/verify-deai-settings-source-isolation-ui.mjs` → exit 0，输出 `[PASS] DEAI settings source isolation renders correctly in real Electron UI` 与 `manualChangeRateVisible=true pipelineQualityGateVisible=false skillFinalStepDeclarationVisible=true`。

状态：complete。下一项：Task A5。

### Task A5 — complete

方案条文：voice profile 采用 run 级快照，仅流水线路径冻结；无 run 场景保持实时计算，手动侧不受影响。

实施文件：

1. `src/services/deaiVoiceProfileRunSnapshot.ts` 新增 `createDeaiVoiceProfileRunSnapshotStore`：活跃 run 首次解析时冻结声纹；null/terminal run 返回实时投影；run 变 terminal 后由 watch 释放快照。
2. `src/services/deaiVoiceProfileRunSnapshot.spec.ts` 覆盖单 run 冻结、双 run 独立、无 run 实时与 terminal 释放。
3. `src/components/pipeline/PipelinePanel.vue:911-927` 接入 `activePipelineRunIds` 与快照 store；删除实时 `pipelineDeaiVoiceProfile`。
4. `src/components/pipeline/PipelinePanel.vue:937-950` `resolveDeaiProjection` 增加 `pipelineRunId` 参数；folder 调用点与 agent 调用点均按 run 取快照。
5. `src/components/pipeline/PipelinePanel.vue:916-924,2832,3757` `emitDeaiVoiceProfileTrace` 按 trace 归属解析 run，使用 run 快照生成 trace，不再读全局实时风格。
6. `src/components/pipeline/PipelinePanel.vue:6185` `runBodyMinimalEdit` 使用 `bodyRunId` 快照；该路径 Phase C 退役，退役前仍保持同 run 声纹。
7. `src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts` 新增集成守护：run 启动后改项目风格时 request prompt 与 trace event 不变；null-run 保持实时；PipelinePanel 接线负向断言 `pipelineDeaiVoiceProfile.value` 清零。
8. `src/components/pipeline/__tests__/deai-injection-policy.spec.ts:223-227` 位置耦合断言同批迁移到 run 参数形态。

RED 证据：

1. `npx vitest run src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts` → exit 1；唯一失败 `wires PipelinePanel projections, traces, and minimal edits to run-owned snapshots`，断言缺少 `createDeaiVoiceProfileRunSnapshotStore({`，其余 2 tests passed，证明 PipelinePanel 未接线且测试未冒充通过。

GREEN / 验证证据：

1. `npx vitest run src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts src/services/deaiVoiceProfileRunSnapshot.spec.ts` → exit 0，Test Files 2 passed / Tests 6 passed。
2. `npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts src/services/deaiVoiceProfileRunSnapshot.spec.ts src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts` → exit 0，Test Files 4 passed / Tests 18 passed。
3. `npm run type-check` → `vue-tsc --noEmit` exit 0。
4. `rg -n "pipelineDeaiVoiceProfile|resolveDeaiProjection\(" src/components/pipeline/PipelinePanel.vue src/components/pipeline/__tests__` → 生产 `pipelineDeaiVoiceProfile` 0 命中；两个生产调用点均携带 `pipelineRunIdParam`；仅测试断言保留新形态。

Ruling: run 进入 terminal 状态时，快照由 `activeRunIds` watch 统一释放，不逐点调用 `resetTerminalRun`。原因：流水线终态入口分散在 success/fail/cancel，逐点释放必然漏；以 active run 集合为唯一状态源可避免终态漏清。代价：终态瞬间同一 run 再次被显式请求时会得到实时风格，但该场景没有在途请求，语义等价于“run 已结束，不再保留历史快照”。

状态：complete。下一项：Task A6。

### Task A6 — complete

方案条文：新增指导包构造器、trace 摘要、确定性零 diff、并发隔离测试；每步最多 6 条、指导包 1200 字符、总注入 1900 字符、本地构造 5ms 警告线。

实施文件：

1. `src/services/deaiGuidancePack.ts` 新增纯函数构造器：按 `methodology / methodology-compose / creative / polish` 四角色选择方法条目；输出 immutable 指导包与结构化摘要；不读 store、不写 store、无 IO、无全局可变状态。
2. 同文件导出预算常量：`DEAI_GUIDANCE_MAX_ITEMS=6`、`DEAI_GUIDANCE_CHAR_BUDGET=1200`、`DEAI_VOICE_PROFILE_CHAR_BUDGET=700`、`DEAI_GUIDANCE_TOTAL_CHAR_BUDGET=1900`、`DEAI_GUIDANCE_CONSTRUCTION_WARNING_MS=5`。
3. 同文件 `buildDeaiGuidancePack`：同输入同文本、同 hash；对象逐层 `Object.freeze`；确定性预算截断并记录 `droppedItemIds`；构造耗时记录 `constructionMs` 与 `slowConstruction`。
4. 同文件 `buildDeaiGuidancePackTraceEvent`：只写结构化摘要（schemaVersion、step、role、条数、guidanceChars、voiceProfileChars、totalInjectionChars、truncated、droppedItemIds、constructionMs、hash），不保存指导包全文与声纹全文。
5. `src/services/deaiGuidancePack.spec.ts` 覆盖：四角色硬预算、确定性截断、两个 run 构造物互不污染、构造耗时 on/off、100 次真实构造 5ms 警告线、trace 摘要不含全文、无 store/IO 依赖负向断言。

RED 证据：

1. `npx vitest run src/services/deaiGuidancePack.spec.ts` → exit 1；`Cannot find module './deaiGuidancePack'`，证明 A6 实现不存在且测试先行。

GREEN / 验证证据：

1. `npx vitest run src/services/deaiGuidancePack.spec.ts` → exit 0，Test Files 1 passed / Tests 7 passed。
2. `npx vitest run src/services/deaiGuidancePack.spec.ts src/services/skillDeaiContract.spec.ts src/services/de-ai.spec.ts src/services/deaiVoiceProfileRunSnapshot.spec.ts src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts` → exit 0，Test Files 5 passed / Tests 25 passed。
3. `npm run type-check` → `vue-tsc --noEmit` exit 0。
4. `rg -n "deaiGuidancePack|buildDeaiGuidancePack" src` → 生产消费目前仅 `src/services/deaiGuidancePack.ts`；未接线是刻意结果，Phase A 门禁允许构造器先落地，B1 才替换旧三段提示词。提前注入会违反 Phase A 零 diff 影子门禁。
5. `rg -n "performance\.now|Date\.now" src/services/deaiGuidancePack.ts src/services/deaiVoiceProfileRunSnapshot.ts src/services/skillDeaiContract.ts` → 仅构造器内部计时 `deaiGuidancePack.ts:200,213`；无时间戳进入确定性内容或 hash。
6. `git diff --no-index -- /dev/null src/services/deaiGuidancePack.ts` 与 `git diff --no-index -- /dev/null src/services/deaiGuidancePack.spec.ts` → 本 Task 新增文件逐行可归属，无圈外修改。

Ruling: A6 的“指导包”按方案角色定义是应用默认教学包；声纹仍由 A5 的 run 级快照供给，A6 只把 `injectedChars` 纳入总预算统计，不在构造器内重复渲染声纹，避免第二次注入与 Phase A 零 diff 影子被破坏。`methodology-compose` 是既有非链式变体，不新增第五个链路角色。

状态：complete。下一项：Phase A 门禁检查。

### Phase A Gate — complete

方案条文：A1-A6 全部有原始验证输出；隔离负向断言、终步 off/on、零 diff、并发、手动回归全部通过；失败禁止进入 Phase B。

复核命令与原始输出：

1. `npx vitest run src/services/proseHardSignalWiring.spec.ts src/services/realSkillExecutor.spec.ts src/services/skillRouter.spec.ts src/services/skillDeaiContract.spec.ts src/services/de-ai.spec.ts src/services/deaiVoiceProfileRunSnapshot.spec.ts src/components/settings/DeAiSettingsObservation.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts src/services/deaiGuidancePack.spec.ts` → exit 0，Test Files 11 passed / Tests 123 passed。
2. `npm run type-check` → exit 0，`vue-tsc --noEmit` 无错误。
3. `rg -n "deAiStore\.(hardruleEnabled|hardRuleMode|hardRules)|setLastDetectReport|useDeAiStore\(\)|pipelineDeaiVoiceProfile" src/components/pipeline/PipelinePanel.vue src/services/deaiGuidancePack.ts src/services/deaiVoiceProfileRunSnapshot.ts` → exit 1，无输出；手动 store 读写与全局实时声纹负向断言清零。
4. 台账复核：A1-A6 均有实施文件、RED/GREEN 原始输出；A4 有真实 Electron UI 输出；A6 指导包未接线且有 100 次构造 5ms 警告线测试。

Ruling: Phase A 放行。A6 构造器尚未进入请求链是刻意保持 Phase A 零请求面改动；B1 才允许替换旧三段提示词。

状态：complete。下一项：Task B1（先写 RED 测试）。

### Task B1 — complete

方案条文：指导包替换旧三段提示词；blocking 退场为 informational-only。验证：S1/S2/S3 requestMessages 分别携带对应指导包且不含旧提示词；blocking findings 注入后 success/errors/retry/终态不变。

实施文件：

1. `src/services/skillDeaiContract.ts:2-13,52-59,98-127` 唯一注入内容源由 `resolveDeaiPromptForChainStep` 旧三段 prompt 替换为 `buildDeaiGuidancePack`；`guidancePack` 暴露 trace/测试用结构化对象；step/generation/source/policy/conflict 语义保持。
2. `src/services/skillDeaiContract.spec.ts`、`src/components/pipeline/__tests__/deai-injection-policy.spec.ts`、`src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts`、`src/services/deaiChainVariantIntegration.spec.ts` 同批迁移：三链步与 compose 路径 requestMessages 携带对应角色指导包，且负向断言旧三段标题不出现。
3. `realSkillExecutor` 的降AI findings 已是观测/教学反馈路径，不改 success、errors、output、retry；A2 的 on/off 测试继续守护，本轮未扩大裁判权。

RED 证据：

1. 生产切换后运行定向测试 → exit 1，6 个测试失败，全部是旧三段 prompt 断言；`deaiChainVariantIntegration.spec.ts` 此前未纳入 Phase A 合并回归，作为 B1 新增集成守护。

GREEN / 验证证据：

1. `npx vitest run src/services/skillDeaiContract.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts src/services/deaiChainVariantIntegration.spec.ts src/services/de-ai.spec.ts` → exit 0，Test Files 6 passed / Tests 28 passed。
2. `npm run type-check` → exit 0，`vue-tsc --noEmit` 无错误。
3. `rg -n "DEAI_METHODOLOGY_PROMPT|DEAI_CREATIVE_PROMPT|DEAI_POLISH_PROMPT|resolveDeaiPromptForChainStep" src --glob "!src/services/de-ai.js" --glob "!src/services/de-ai.d.ts" --glob "!src/services/de-ai.spec.ts"` → exit 1，无输出；除兼容定义与旧 prompt 专项规格外，生产消费面清零。

Ruling: `resolveVariant` 返回联合包含 `off`，但调用前已由 `generation === 'off'` 分支拦截；类型上显式收敛为 `methodology`，避免未来分支重排时编译期报警。旧 prompt 本体按 Phase C 七层清零计划暂留兼容定义。

状态：complete。下一项：Task B2（注入总预算与分项 trace）。

### Task B2 — complete

方案条文：注入总预算 1900 字符与分项 trace（guidance 1200 + voice 700）。验证：预算单测；trace 字段 `guidanceChars/voiceProfileChars/totalInjectionChars` 存在且合计不超限。

实施文件：

1. `src/components/pipeline/PipelinePanel.vue:2832-2845` folder 路径在 `resolveDeaiProjection` 后构造 `guidancePackTraceEvent`，仅在 `traceRunId && guidancePackTraceEvent && systemPromptSuffix` 时写入 run trace，与 `logDeaiVariant` 同批发射。
2. `src/components/pipeline/PipelinePanel.vue:3756-3780` agent 路径同样构造事件，并在 `runId && deaiPrompt` 的既有 trace 块内发射，保证“无注入不报账”。
3. `src/stores/runTrace.ts:967` `RETAINED_AUDIT_EVENT_TYPES` 加入 `deai-guidance-pack`，防止事件被压缩丢弃。
4. `src/components/pipeline/__tests__/deai-injection-policy.spec.ts:34-39,78-112` 白名单与双生产路径接线守护；事件字段与 `guidanceChars/voiceProfileChars/totalInjectionChars` 对账，合计断言不超过 1900。

RED 证据：

1. `npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts` → exit 1，10 tests 中 2 failed：`keeps every projection and policy event in the retained audit whitelist` 缺 `'deai-guidance-pack'`；`emits the guidance-pack budget event from both production call paths` 缺 `buildDeaiGuidancePackTraceEvent(` 接线。
2. 首次 GREEN 修正后仍有 1 failed：测试断言写死为 `guidancePackTraceEvent && (systemPromptSuffix || deaiPrompt)`，与两条路径的实际分立守卫不符；判定为测试形状错误而非生产缺陷，改回分立断言。

GREEN / 验证证据：

1. `npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/services/deaiGuidancePack.spec.ts src/services/skillDeaiContract.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts src/services/deaiChainVariantIntegration.spec.ts` → exit 0，Test Files 5 passed / Tests 29 passed。
2. `npm run type-check` → `vue-tsc --noEmit` exit 0。
3. `rg -n "buildDeaiGuidancePackTraceEvent|deai-guidance-pack|guidancePackTraceEvent" src/components/pipeline/PipelinePanel.vue src/stores/runTrace.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts` → folder 与 agent 各 1 处构造/发射，runTrace 白名单 1 处，测试覆盖 2 处生产调用计数。

Ruling: 指导包事件只在真实注入时发射。folder 路径以 `systemPromptSuffix`（冲突裁决后的最终注入）为准，agent 路径以 `deaiPrompt` 为准；`generation: off` 不产生事件，避免“无注入却有预算账”。事件对象本身只含结构化摘要，不带指导包全文或声纹全文。

状态：complete。下一项：Task B3（契约 V2）。

### Task B3 — complete

方案条文：契约 V2：`contractVersion: 2`、`guidanceOwnership`、`overlaps`、未知字段 error、skill-wins 默认迁移。验证：契约测试覆盖未知字段 error、旧版本兼容读、ownership 推导；导入 UI 与健康检查双入口；五证验收。

实施文件：

1. `src/services/skillDeaiContractValidation.ts:1,11,18-19,31-37,55,81,87,91,127-147` 契约版本升级 2；新增 `guidanceOwnership`、`overlaps`；默认 `skill-wins + app`；v1 兼容读；未知字段 error；ownership 推导；未知版本错误文案列明 `1 / 2`。
2. `src/services/skillDeaiContract.ts:66,116,171-203` skill ownership 注入退场；declared overlaps 与 keyword overlaps 并集，`overlapOrigins` 记录 `keyword/declared`。
3. `src/components/pipeline/PipelinePanel.vue:2803-2813` folder 路径在 skill ownership 时发射 info 级 `deai-injection-policy`：`降AI方法指导已由 SKILL 接管，应用注入退场`。
4. `src/services/skillDeaiContract.spec.ts`：v2 默认、v1 迁移、未知字段 error、ownership 推导、skill 退场、overlaps 校验与并集。
5. `src/services/skillPackageManager.spec.ts:125-140`：导入预检 v2 valid、v1 兼容 warning、非法值 errors。
6. `src/components/pipeline/__tests__/deai-injection-policy.spec.ts:57-71,338-348`：三方绑定手册 v2、skill ownership 退场与生产接线断言。
7. `_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md`：手册升 v2，新增字段、迁移策略、冲突边界与 skill 接管说明。

RED 证据（日志 `$env:TEMP\b3-red.log`）：

1. `npx vitest run src/services/skillDeaiContract.spec.ts src/services/skillPackageManager.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts` → exit 1，`Test Files 3 failed (3)`，`Tests 9 failed | 26 passed (35)`。
2. 失败点：默认契约仍 `contractVersion: 1` 且无 `guidanceOwnership/overlaps`；未知字段未按 error 断言；ownership 推导返回 undefined；skill ownership 未清空 prompt；declared overlaps 未生效；导入预检 v2 断言失败；手册缺 v2 锚点。

GREEN / 验证证据：

1. `npx vitest run src/services/skillDeaiContract.spec.ts src/services/skillPackageManager.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts` → exit 0，`Test Files 3 passed (3)`，`Tests 35 passed (35)`。
2. Phase B 定向回归：`npx vitest run src/services/skillDeaiContract.spec.ts src/services/skillPackageManager.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/services/deaiChainVariantIntegration.spec.ts src/services/de-ai.spec.ts src/services/deaiGuidancePack.spec.ts src/services/deaiVoiceProfileRunSnapshot.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts src/services/skillRouter.spec.ts src/services/realSkillExecutor.spec.ts src/services/finalStepFeedback.spec.ts` → exit 0，`Test Files 12 passed (12)`，`Tests 137 passed (137)`。
3. `npm run type-check` → exit 0，`vue-tsc --noEmit` 无错误。
4. 旧语义钉点扫描：`rg -n 'contractVersion: 1' src _audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md` → 仅 2 处：v1 兼容读测试与导入预检 legacy 用例；生产实现 0 残留。`rg -n 'contractVersion 1 已迁移为 2' ...` → 仅校验器 warning、测试断言与手册迁移说明。
5. 文案补漏复核：未知版本错误从“仅支持 2”修正为“仅支持 1 / 2”；手册“契约 v1 边界”修正为 v2 并指向 `overlaps` 显式声明；修正后三份定向测试 35/35 全绿。

Ruling:

1. 默认策略为 `conflictPolicy: skill-wins` 且 `guidanceOwnership: app`：重叠时让位给 SKILL，默认时仍由应用教学；只有显式或推导命中 `skill` 才彻底退场。推导规则：显式 ownership 优先；仅声明 conflictPolicy 时 `skill-wins→skill`、其余→app；完全未声明保持默认 app。
2. `suffix-only` 在 V2 与 `on` 显式等价并保留声明值；V5 FINAL B3 未要求分叉，测试锁定该行为，后续如分叉需新契约版本。
3. agent 路径不重复发射同款 ownership 事件：`emitDeaiInjectionPolicyTrace` 已携带完整 policy（含 guidanceOwnership）；folder 路径新增事件是为了零注入时仍有观测锚点。
4. declared overlaps 的命中条件为 prompt 或 template 任一侧包含：skill ownership 退场后 prompt 为空，声明域仍需从 template 侧参与 skill-wins 判定。

五证对账：

1. v1 兼容读：`validateSkillDeaiMeta({ contractVersion: 1, ... })` valid，仅迁移 warning。
2. v2 正向：默认契约与显式 v2 字段均通过，导入预检 valid。
3. 未知字段 error：`unknownField` 进入 errors，导入预检 issue 展示，运行时忽略并保留 trace。
4. 双入口预检：导入与健康检查共用 `validateSkillDeaiMeta`；skillPackageManager 测试锁定导入入口，运行时 trace 锁定健康入口。
5. 生产消费面无旧默认：`rg` 显示生产实现仅 v2 语义，v1 只剩兼容测试与手册说明。

状态：complete。下一项：Task B4（keyword-lite 共享纯函数）。

### Task B4 — complete

方案条文：keyword-lite 共享纯函数。验证：共享函数单测；`skillDeaiContract` 与 `deaiVoiceProfile` 两侧行为等价；共享函数无 store import。

实施文件：

1. `src/services/deaiSharedTopics.ts:1-33` 新增唯一共享主题源 `DEAI_SHARED_TOPICS`，覆盖 sentence-rhythm、transition、dialogue、perspective、integrity、ai-trace；导出 `findDeaiSharedTerms`（扁平词）与 `findDeaiSharedTopicConflicts`（主题分组）。
2. `src/services/skillDeaiContract.ts:9,155-156` 删除本地 `DEAI_CONFLICT_TERMS`，关键词重叠改为共享 `findDeaiSharedTerms` 后再按模板双文本命中过滤。
3. `src/services/deaiVoiceProfile.ts:3,63-67` 删除本地 `SHARED_TOPICS`，声纹冲突改为共享 `findDeaiSharedTopicConflicts`，输出保持 `DeAiVoiceProfileConflict` 形状。
4. `src/services/deaiSharedTopics.spec.ts` 覆盖唯一主题源、扁平命中、分组命中、store/IO 负向断言、两侧消费接线与旧本地词表清零。

RED 证据：

1. `npx vitest run src/services/deaiSharedTopics.spec.ts` → exit 1，`Cannot find module './deaiSharedTopics'`，`Test Files 1 failed`，`Tests no tests`，证明共享层不存在且测试先行。

GREEN / 验证证据：

1. `npx vitest run src/services/deaiSharedTopics.spec.ts src/services/skillDeaiContract.spec.ts src/services/deaiVoiceProfile.spec.ts src/services/deaiVoiceProfileRunSnapshot.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts` → exit 0，`Test Files 6 passed (6)`，`Tests 29 passed (29)`。
2. `rg -n 'DEAI_CONFLICT_TERMS|const SHARED_TOPICS' src` → 仅测试负向断言 2 处；生产旧本地词表 0 残留。
3. `rg -n 'deaiSharedTopics|findDeaiSharedTerms|findDeaiSharedTopicConflicts' ...` → skill 侧消费 1 处、voice 侧消费 1 处、共享层导出 2 函数。
4. `npm run type-check` → exit 0，`vue-tsc --noEmit` 无错误。

Ruling: 共享层统一主题清单，但不统一两边判定语义。skill 侧保持“提示词与模板双文本同时命中”；voice 侧保持“声纹渲染文本单侧命中并输出主题分组”。这样共享词表不会改变任一消费方的既有行为边界。测试中的 store 负向断言针对共享层与 skill 侧运行时依赖；voice 侧保留既有 `import type StyleRule from '../stores/project'` 类型导入，不构成运行时 store 读取。

状态：complete。下一项：Task B5（UI 徽章、日志、反馈面板、HelpGuide 按 trace 实值显示）。

### Task B5 — complete

方案条文：UI 徽章、日志、反馈面板、HelpGuide 按 trace 实值显示。验证：真实 UI 交互验证（G0.11），数值与 trace 完全一致；文档-测试-实现三方绑定。

实施文件：

1. `src/components/pipeline/PipelinePanel.vue` 静态“已内嵌降AI（17条）”徽章替换为 `id="pl-deai-guidance-badge"` 动态徽章；新增 `deaiGuidanceTraceForRun`、`displayedBodyDeaiGuidanceBadge`、`displayedBodyDeaiGuidanceFeedback`，由当前 run 的 `deai-guidance-pack` trace 实值驱动。
2. `src/components/pipeline/PipelinePanel.vue` 新增 `id="pl-deai-guidance-feedback"` 反馈面板，class 包含 `informational-only`；预注入日志改为“实际条数与字符数以运行记录 `deai-guidance-pack` 事件为准”；新增 `.pl-deai-guidance-feedback` 样式。
3. `src/components/common/HelpGuide.vue` 文案改为“正文层生成前提供方法指导：只把降AI方法注入提示词，不改写正文，实际条数和字符数以运行记录为准。”
4. `src/components/pipeline/__tests__/deai-injection-policy.spec.ts` 迁移为文档-测试-实现三方绑定断言；修正测试载体缺 `node:fs` 导入与相对路径错误。
5. `scripts/verify-deai-guidance-ui.mjs` 新增 Electron + CDP 真实 UI 验证脚本：seed 正文层 `deai-guidance-pack` trace（6条/1180字符），真实点击流水线第 5 个步骤页签，断言徽章、反馈面板、条数字符串、`informational-only`、不改写正文文案。

RED 证据：

1. 首次运行 `npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts` 因测试自身缺 `import fs from 'node:fs'` 失败，判定为测试载体错误并修复。
2. 载体修复后同命令进入真实 RED：`PipelinePanel.vue` 仍包含 `17条`，三方绑定断言失败，exit 1。

GREEN / 验证证据：

1. `npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts` → exit 0，`Test Files 1 passed (1)`，`Tests 12 passed (12)`。
2. `npm run type-check` → exit 0，`vue-tsc --noEmit` 无错误。
3. `npm run build:vue` → exit 0。
4. `node scripts/verify-deai-guidance-ui.mjs` → exit 0，输出 `[PASS] DEAI guidance badge and informational-only feedback render in real Electron UI` 与 `badgeText=方法指导 6条 / 1180字符 feedbackInformationalOnly=true`。
5. 定向回归 `npx vitest run src/services/deaiGuidancePack.spec.ts src/services/deaiSharedTopics.spec.ts src/services/skillDeaiContract.spec.ts` → exit 0，`Test Files 3 passed (3)`，`Tests 23 passed (23)`。

Ruling:

1. `deaiGuidanceTraceForRun` 遍历 `runTraceStore.sortedRuns`，run 归属支持 `trace.pipelineRunId === pipelineRunId` 与 `pipelineStore.getPipelineRunIdForTrace(trace.id) === pipelineRunId` 两条路径；前者覆盖 UI 冒烟 seed，后者覆盖生产真实路径。
2. 事件取值使用 `[...trace.events].reverse().find(type === 'deai-guidance-pack')`，事件压缩后仍从保留窗口取最新实值；`detail` JSON 解析失败时跳过该事件，trace 本体仍保留证据。
3. 徽章只在 `displayedBodyDeaiGuidanceBadge` 非空时渲染，不写死条数；反馈文案固定为 `降AI方法指导：X条 / Y字符（informational-only，不改写正文、不改终态）`，避免 UI 与注入账实分离。
4. 正文层是流水线第 5 个步骤（页签 index 4），面板 id 为 `#pl-step-5-content`；`#pl-step-4-content` 是章节层。UI 验证脚本必须点击页签后才断言面板内容，不能只读静态 DOM。

状态：complete。下一项：Task B6（配对影子数据 20 章、2 题材、2 模型）。

### Task B6 — provisional（数据未达标，禁止接管宣称）

方案条文：配对影子数据 20 章、2 题材、2 模型。验证：配对键齐全；效率与合同失败率报告；劣化超 10% 降条数复测。

核查过程：

1. 扫描 `C:\Users\凯瑞\Desktop\SKILL调试文件` 下 `run-trace-正文层-202610*` 与 `run-trace-正文层-20261101-*` 全量目录，统计 `deai-guidance-pack` 事件、`api-start.model` 与终态。
2. `20261021` 到 `20261101` 共 20 份正文层运行记录，`deai-guidance-pack` 事件全部为 0；模型分布为 `deepseek-v4-pro`（3份，含1 failed）、`kimi-k3.1-pro`（14份）、2份模型字段为空（1 failed/1 success）。
3. 结论：这些样本均产生于 B2 的 trace 事件接线落地之前，且缺少“同一章、同题材、同模型、有/无指导包”的配对键；不能把旧样本冒充新链路影子数据，也不能伪造配对结果。

RED / GREEN 证据：不适用。B6 是数据验收任务，当前没有可运行的新链路真实生成样本；按方案停止条件，缺样本不得启动生成冒充验证。

Ruling:

1. 教学有效性与阈值校准保持 `provisional`，本台账禁止出现“教学接管有效”“效率无劣化”“合同失败率下降”等结论。
2. 后续达标条件：20 章、2 题材、2 模型，且每章具备同模型同题材的有/无指导包配对样本；效率、合同失败率、10% 劣化阈值按配对报告。
3. Phase C 可以继续执行旧语义清零：清零的是旧改稿语义，不依赖 B6 结论；但封装后的发布说明必须保留 provisional 状态。

状态：provisional。下一项：Phase C（旧语义七层清零）。

### Task C1 — complete

方案条文：删除旧三段提示词、`legacy-auto/deep-fix` 流水线分支、`runBodyMinimalEdit`；`de-ai.spec.ts` 旧 prompt 专项规格同批退役。

实施文件：

1. `src/components/pipeline/PipelinePanel.vue` 删除 `runBodyMinimalEdit` 函数与 `DeAiProcessor` import。
2. `src/services/de-ai.js`、`src/services/de-ai.d.ts` 删除 `DEAI_METHODOLOGY_PROMPT / DEAI_CREATIVE_PROMPT / DEAI_POLISH_PROMPT / resolveDeaiPromptForChainStep / getMethodologyPrompt`。
3. `src/services/de-ai.spec.ts` 整文件删除（旧 prompt 专项规格，生产消费面已清零）。
4. `src/stores/runTrace.ts` 曾误删 `deai-change-rate` 白名单；复核发现手动降AI深修共用该事件后已恢复，流水线与手动观测均保留。
5. `_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md` 新增“生成期注入形态”，明确指导包只进 prompt、总预算 1900 字符、旧三段退役、流水线不改稿、手动降AI独立。

验证命令与原始输出：

1. `npm run type-check` → exit 0，`vue-tsc --noEmit` 无错误。
2. `npx vitest run src/services/skillDeaiContract.spec.ts src/services/skillPackageManager.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts src/services/deaiChainVariantIntegration.spec.ts` → exit 0，Test Files 5 passed / Tests 41 passed。
3. `rg -n "DEAI_METHODOLOGY_PROMPT|DEAI_CREATIVE_PROMPT|DEAI_POLISH_PROMPT|resolveDeaiPromptForChainStep|runBodyMinimalEdit|getMethodologyPrompt|deai-minimal-edit" src electron scripts` → exit 1，无输出；生产、脚本、Electron 全部清零。
4. `_audit` 内旧语义仅剩历史方案/台账/手册“退役说明”引用，保留为历史记录层，不属于执行层新增写入。

状态：complete。下一项：Task C2（测试同批迁移）。

### Task C2 — complete

方案条文：测试同批迁移，含位置耦合断言；全部相关 spec 迁移为新语义断言 + 旧形态负向断言。

实施文件：

1. `src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts`：`runBodyMinimalEdit` 的声纹快照正向断言迁移为 `not.toContain('runBodyMinimalEdit')` 负向断言；其余 run 快照接线断言保留。
2. `src/services/pipelineProgressReaders.spec.ts`：body 修复旁路队列事件计数从 2 迁移为 1，退役 `runBodyMinimalEdit` 后只保留 `runHardSignalRepair` 真实旁路；队列归属断言不变。
3. `src/services/pipelineParallelismPhase0.spec.ts`：移除对 `activePipelineRunIds` 的误伤性禁令。该标识是 A5 引入的全局活跃 run 集合快照源，不属于同层“当前 run 槽位劫持”禁令范围；`activePipelineRunIdForStep`、`providerQueueStepByCallId` 禁令保留。
4. `src/services/realS2ProtectedContract.integration.spec.ts`：夹具补齐外部 folder SKILL 新增必填字段 `chapterIntent`，测试与真实 S2 契约重新对齐。

RED 证据（全量 `npm run test:services` 首轮）：4 failed / 2535 passed。

1. `deai-voice-profile-run-snapshot.spec.ts` 仍断言已退役的 `runBodyMinimalEdit` 声纹调用。
2. `pipelineProgressReaders.spec.ts` 仍期望 2 个 body 旁路 `callAi` meta source。
3. `pipelineParallelismPhase0.spec.ts` 禁止 `activePipelineRunIds`，与 A5 的 run 级快照接线直接冲突。
4. `realS2ProtectedContract.integration.spec.ts` 输出 `degraded`；插入诊断输出后确认三次失败均为“正文交接缺字段：chapterIntent”，属外部 SKILL 必填字段演进导致测试夹具漂移，非应用回归。

GREEN / 验证证据：

1. `npx vitest run src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts src/services/pipelineProgressReaders.spec.ts src/services/pipelineParallelismPhase0.spec.ts` → exit 0，Test Files 3 passed / Tests 50 passed。
2. `npx vitest run src/services/realS2ProtectedContract.integration.spec.ts --reporter=verbose` → exit 0，Test Files 1 passed / Tests 1 passed。
3. 临时诊断 `console.log('DEBUG_RESULT', ...)` 已在夹具修复同批移除，生产与测试文件均无调试残留。

Ruling:

1. Phase0 的 `activePipelineRunIds` 禁令按“单一活跃 run 槽位”意图收窄到 `activePipelineRunIdForStep`。A5 使用的是 `pipelineStore.activeRuns` 派生的集合快照，天然支持多 run 并发，不会让第二个 run 劫持第一个 run 的声纹。代价：若未来有人把该集合改回单 run 槽位，需由 `activePipelineRunIdForStep` 禁令或新增结构性测试承接。
2. S2 集成失败不改应用生产行为，只修测试夹具。folder SKILL 是外部活体契约，应用测试必须跟随其必填字段演进；缺字段会导致该集成从 `success` 变 `degraded`。

状态：complete。下一项：Task C3（trace 执行层、文档、构建产物清零）。

### Task C3 — complete

方案条文：trace 执行层写入、文档、构建产物清理；执行层旧 processor/variant 新增写入为 0；文档与手册同步；安装包扫描不含旧语义。

实施文件：

1. C1 已完成源码层旧语义退役；本 Task 重点是构建产物与安装包验证。
2. `_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md` 已在 C1 同批更新“生成期注入形态”，承诺与实现同步。
3. `package.json` 版本升级 `3.110.12 → 3.110.13`。

验证命令与原始输出：

1. `npm run build:vue` → exit 0，renderer 与 protocols 均构建完成。
2. `rg -n "DEAI_METHODOLOGY_PROMPT|DEAI_CREATIVE_PROMPT|DEAI_POLISH_PROMPT|resolveDeaiPromptForChainStep|runBodyMinimalEdit|getMethodologyPrompt|deai-minimal-edit" dist-renderer src electron scripts` → 仅剩 `deai-voice-profile-run-snapshot.spec.ts:78` 的负向断言 `not.toContain('runBodyMinimalEdit')`；生产与构建产物 0 命中。
3. `npm run build` → exit 0，生成 `dist\神意助手-Setup-3.110.13.exe`，大小 231,646,326 字节，时间 2026-11-01 07:10:21。
4. `rg -a -n "DEAI_METHODOLOGY_PROMPT|DEAI_CREATIVE_PROMPT|DEAI_POLISH_PROMPT|resolveDeaiPromptForChainStep|runBodyMinimalEdit|getMethodologyPrompt|deai-minimal-edit" dist/win-unpacked/resources/app.asar` → exit 1，无输出；安装包内旧语义 0 命中。

状态：complete。下一项：Task C4（五证验收与最终回归）。

### Task C4 — complete

方案条文：五证验收与最终回归：type-check、全量 Vitest、真实 UI 验证、安装包扫描、五证逐条输出。

五证原始输出：

1. `npm run type-check` → exit 0，`vue-tsc --noEmit` 无错误。
2. `npm run test:services` → exit 0，`Test Files 238 passed (238)`，`Tests 2539 passed (2539)`，Duration 47.27s。
3. `node scripts/verify-deai-guidance-ui.mjs` → exit 0，输出 `[PASS] DEAI guidance badge and informational-only feedback render in real Electron UI`，`badgeText=方法指导 6条 / 1180字符 feedbackInformationalOnly=true`。
4. `node scripts/verify-deai-settings-source-isolation-ui.mjs` → exit 0，输出 `[PASS] DEAI settings source isolation renders correctly in real Electron UI`，`manualChangeRateVisible=true pipelineQualityGateVisible=false skillFinalStepDeclarationVisible=true`。
5. `rg -a ... dist/win-unpacked/resources/app.asar` → exit 1，无输出，安装包旧语义清零；安装包文件存在且版本号为 3.110.13。

补充回归：

1. `npm run build:vue` → exit 0。
2. `npm run build` → exit 0，完整安装包封装成功。

状态：complete。下一项：收尾（经验文件、开发日志、主索引、git 提交）。

### Task R1 — complete

方案条文：V5 FINAL 交付后倒查残余、新旧语义打架、线程/状态纠缠；对发现的死接口执行清理并回归。

倒查结论：

1. 旧三段提示词与 `runBodyMinimalEdit` 生产源码清零，仅剩负向守护测试命中；`dist-renderer` 中的降AI命中为手动功能本体与契约校验代码，属设计内保留。
2. `PipelinePanel.vue` 无 `deAiStore` 硬规则读写、`setLastDetectReport`、`DeAiProcessor.processBody`、`legacy-auto/deep-fix/detect-report` 接线；手动路径保留在 `useDeAi.ts`，隔离不变式成立。
3. 旧 processor 枚举仅作历史 trace 兼容，执行层新增写入点只剩手动路径 `useDeAi.ts:252`；流水线写入 `deaiPromptVariant` 新契约，无新旧语义双写。
4. `BODY_LAYER_STEP` 契约收口成立；`PipelinePanel.vue` 剩余 `step === 4` 为已登记的正文业务编号点，不属契约/注入面违规。
5. trace 白名单保留 `deai-guidance-pack`、`deai-injection-policy`、`deai-contract-warning`、`deai-conflict-policy`、`deai-change-rate`，G1.26 事故点未复发。
6. 快照释放由 `activeRunIds` watch 统一处理，多 run 冻结/释放/隔离测试通过；`activePipelineRunIds` 多 run 集合与 `activePipelineRunIdForStep` 单 run 槽位守卫意图已区分，无误伤。

实施文件：

1. `src/services/deaiVoiceProfileRunSnapshot.ts`：删除未接线的 `resetTerminalRun` 接口声明、实现与返回值；终态释放唯一权威保持为 `activeRunIds` watch。
2. `src/services/deaiVoiceProfileRunSnapshot.spec.ts`：新增负向守护，断言 run 快照 store 不再暴露 `resetTerminalRun`，防止未来重新引入多终态入口释放造成漏清。

验证命令与原始输出：

1. `rg -n "resetTerminalRun" src _audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v5-final.md` → 源码仅剩负向断言 `deaiVoiceProfileRunSnapshot.spec.ts:24`；台账第 201 行为历史裁决记录。
2. `npx vitest run src/services/deaiVoiceProfileRunSnapshot.spec.ts src/components/pipeline/__tests__/deai-voice-profile-run-snapshot.spec.ts src/components/pipeline/__tests__/deai-voice-profile-injection.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts` → exit 0，Test Files 4 passed / Tests 22 passed。
3. `npx vitest run src/services/deaiVoiceProfileRunSnapshot.spec.ts src/services/pipelineParallelismPhase0.spec.ts` → exit 0，Test Files 2 passed / Tests 35 passed。

Ruling: 不把 `resetTerminalRun` 接回终态入口。success/fail/cancel 入口分散，逐点释放会重新引入漏清风险；以 `activeRuns` 集合为唯一状态源是更稳的释放语义。若未来 run registry 出现滞留 running 的缺陷，应修 registry 终态推进，而不是给快照层加旁路释放。

状态：complete。
