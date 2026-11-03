# DEV_LOG：正文层内嵌降AI V6.1 缺口闭环

日期：2026-11-03
关联方案：`_audit/PROPOSAL_2026-11-02_BODY_DEAI_COLLABORATION_V6_1.md`
关联台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-deai-v6-1-gap-closure.md`

## 目标

闭环上一轮对账查出的四个缺口：误伤候选无入口、校准账本无上限、模型画像入口硬编码步骤号、诊断/报告并发守护缺失。

## 实际改动

1. `src/services/deaiCalibrationLedger.ts`
   - 新增 `DEAI_CALIBRATION_LEDGER_MAX_ENTRIES = 500`。
   - 新增 `DeaiCalibrationPruneResult` 与 `DeaiCalibrationRecordResult`。
   - `recordDeaiCalibrationFindings` 写入时裁剪账本，并返回 `ledger + pruneResult`。
   - `buildDeaiCalibrationTraceEvent` 记录 `ledgerEntryCount/maxEntries/pruned/prunedCount`。
2. `src/services/deaiCalibrationLedger.spec.ts`
   - 补账本裁剪、record API 返回裁剪结果、低于上限原样保留三类断言。
   - 原有断言迁移到 `result.ledger` 新形态。
3. `src/components/pipeline/PipelinePanel.vue`
   - `resolveDeaiModelProfileGuidanceForRun` 从 `step !== 4` 改为 body 层语义标记；请求编号统一来自 `BODY_LAYER_STEP` 常量。
   - 生成前画像调用点同步去硬编码：`const isBodyLayer = pipelineLayerForStep(step) === 'body'` 作为唯一入口条件，`true` 字面量不再传入。
   - 校准落账消费新的 `ledger + pruneResult`。
   - 报告组装改为继承当前 run 已登记的 `falsePositives`，不再固定空数组。
   - 正文层降AI反馈区新增“登记误伤”输入与按钮，只写当前 run 报告，不进校准账本。
4. `src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts`
   - 补误伤登记入口与隔离断言。
   - 补 body 层绑定断言，负向断言旧 `step !== 4` 不回归。
   - 补调用点负向断言：画像入口不回归到 `step === 4` 或 `true` 字面量传参。
   - 补 per-run 状态与链内局部诊断 guidance 的并发守护断言。
5. `_audit/SKILL_ADAPTATION_2026-11-03_body-deai-v6-1-gap-closure.md`
   - 新增 SKILL 适配说明：账本裁剪、body 层绑定、误伤登记与消费方式。

## 并发与边界

- S2 诊断 guidance 是链执行局部变量；诊断与报告对象挂在 `perRunUi(runId)`。
- attempt 重置清空 `deaiStageDiagnosis`；报告导出和误伤登记都按 displayed body run 读取。
- 误伤登记不参与校准、画像、guidance、终态。
- 账本只按 provider/model/ruleId/sampleCount/updatedAt 聚合，不保存正文或候选全文。

## 验证

- `npx vitest run src/services/deaiCalibrationLedger.spec.ts src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts`：2 files / 22 tests passed。
- `npx vitest run src/services/deaiCalibrationLedger.spec.ts src/services/deaiModelProfile.spec.ts src/services/deaiSkillReport.spec.ts src/services/deaiStageDiagnosis.spec.ts src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts`：6 files / 52 tests passed。
- `npm run type-check`：exit 0。
- `npm run test:services`：245 files / 2629 tests passed（当时测试总数；后续新增测试后最新结果为 2638）。

## 2026-11-03 追加缺口闭环

### 根因与修复

1. 最新 live 暴露 `releaseGate=null`：旧实现只有在存在 eligible 规则时才把画像视为冻结，导致无规则样本缺少 `calibration-not-ready` 证据。修复为 `DEAI_MODEL_PROFILE_RELEASED=false` 时一律输出 release gate；无 eligible 规则时 label 为“模型事实画像未达标，未注入”。
2. 单条诊断 sample 无独立上限：总预算 1200 字符无法防止单条超长证据挤压其他 finding。修复为每条 sample 独立截断 120 字符。
3. 0 条诊断无 trace：成功但无 finding 时无法证明“诊断已执行但未注入”。修复为输出 `S2 后降AI位置诊断已执行：0条 / 未注入`，detail 记录 `injected=false`；该事件只补观测证据，不注入 prompt、不影响终态。
4. live/Electron 停滞检测被心跳时间戳污染：`currentRunSnapshot` 携带 `at` 字段导致每秒签名变化，掩盖真实业务停滞。修复为签名只看业务状态。
5. live 断言不足：旧脚本只看事件存在，未硬断言预算、注入、UI 与 release gate。修复为逐项硬断言。

### 最新 live 归因

`_audit/verification-deai-stage-guidance-live/run-20261103-020722/summary.json`：

- 第 1 章 success：3 个逻辑 call、7 次物理 call；方法论 15 条/1073 字符；S2→S3 诊断 3 条/92 字符；校准 6 条；UI 三线可见。
- 第 2 章 failed：S2 三次候选净字数约 1434/1447/1447，均低于 1600 下限；第 3 次出现 reasoning-only 停滞约 12 分钟，应用按 `reasoning_only_stalled` 断流并用关闭思考重试。三次 word-gap retry 均携带 S1 场景骨架、FACT_LOCK、目标/当前/还差净字数，且未携带候选全文。
- 第 2 章未进入 S3，因此没有 `deai-stage-guidance` 是正确行为，不能伪造注入。
- 该次 trace 的 `releaseGate=null` 属于本轮已修复的旧实现缺口，不能作为当前代码行为。

### 追加验证

- `npx vitest run src/services/deaiStageDiagnosis.spec.ts src/services/deaiModelProfile.spec.ts src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts`：RED 1 failed（旧源码断言仍守护“有规则才冻结”），修正断言后 GREEN 3 files / 34 tests passed。
- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0，双构建完成。
- `node --check scripts/verify-deai-stage-guidance-live.mjs; node --check scripts/verify-deai-stage-guidance-electron.mjs`：exit 0。
- `node scripts/verify-deai-stage-guidance-electron.mjs`：真实 Electron UI 通过，3 个逻辑 call、3 次物理 call，`deai-model-profile` 冻结观测、`deai-stage-guidance` 注入、`deai-calibration` 落账、报告导出均可见；末尾 `===== DEAI STAGE GUIDANCE ELECTRON PASSED =====`。

## 2026-11-03 过度设计追加收敛

### 根因与修复

1. `resolveDeaiModelProfileGuidanceForRun` 曾携带永远为 true 的 `isBodyLayer` 参数：调用点已经先判断 body 层，函数内再重复判断属于冗余状态。已删除该参数与函数内重复判断，调用点保留唯一 body 层语义入口。
2. S2→S3 诊断入口曾硬编码 `step === 4`：同段代码已有 `pipelineLayerForStep(step) === 'body'`，继续使用步骤号会在未来步骤重排时静默失效。已改为 `isBodyLayer && si < templates.length - 1 && ...`，并保留 `step` 只用于 trace 展示。
3. 集成测试锚点同步迁移：诊断块断言改为 `isBodyLayer`，负向断言禁止 `step === 4 && si < templates.length - 1` 回归；删除对冗余 `isBodyLayer` 参数的旧断言。

### 过度设计四问

1. 是否替 SKILL 承担质量责任？否。画像冻结不注入；S2→S3 诊断只给位置、规则名、命中事实，不改写正文。
2. 是否为了证明应用有用？否。0 finding 只留观测事件；报告只服务 SKILL 作者迭代，不生成应用侧质量分。
3. 是否新增配置、等待状态或跨层共享状态？否。无新增用户配置；诊断 guidance 是链内局部变量；报告与诊断挂 per-run 状态。
4. 删除后接线正确性与负向守护是否仍可验证？冗余 `isBodyLayer` 参数已删除且测试守护唯一入口；诊断入口改为 body 层语义后有负向断言和真实 Electron 验证。

### 追加验证

- `npx vitest run src/services/deaiStageDiagnosis.spec.ts src/services/deaiModelProfile.spec.ts src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts`：3 files / 34 tests passed。
- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0，双构建完成。
- `node scripts/verify-deai-stage-guidance-electron.mjs`：真实 Electron UI 通过，3 个逻辑 call、3 次物理 call；末尾 `===== DEAI STAGE GUIDANCE ELECTRON PASSED =====`。
- `npm run test:services`：245 files / 2638 tests passed。

## 未验证边界

- 真实供应商 live 已有五个 observational 证据目录：一次第 1 章失败，一次第 1/2 章成功但第 3 章 running，三次第 1 章成功后第 2 章失败；不作为质量提升证明或发布门禁。
- 账本裁剪在真实长期用户数据上的分布未观测，上限 500 是防膨胀保护值。
- 2026-11-03 用户已授权 3.112.0 交付：升版、封装、显式提交 git；本文件旧“不升版、不封装、不提交”边界已由发布台账接续。
