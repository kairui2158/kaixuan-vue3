# TASK_LEDGER_2026-11-02_body-deai-v6-1-phase-bc.md

## 1. 目标与原话

- 用户原话：`PhaseA做真实 Electron 端到端运行验证，验证后接着做Phase B/C`
- 方案授权：`_audit/PROPOSAL_2026-11-02_BODY_DEAI_COLLABORATION_V6_1.md`（Phase B/C）
- 本轮目标：修复 skill 接管态 `deaiPromptVariant` 观测；建立 provider/model 画像读取、样本门槛与 run 内 immutable 快照；UI 三线显示方法论/诊断/校准；建立校准账本与 SKILL 迭代报告导出。
- 最终可感知行为：接管态 trace/UI 不再丢失 variant；画像未达标不注入；诊断线在 UI 可见；终稿后 findings 落账本并生成可导出报告。
- 本轮交付物：生产代码、测试、Electron E2E 扩展、任务台账、DEV_LOG、方案状态更新。

## 2. 门禁读证

- G0.3 诚实闭环（`_audit/神意开发经验总结_v9.md:36`）：完成声明区分已验证/未验证，mock E2E 不冒充真实链路。
- G0.5 回头看（`:52`）：收尾前对账 Phase B/C 原始义务、逐行审 diff、双向扫描生产与验证器。
- G0.6/0.7/0.9/0.10/0.12：方案已确认、正反推、影响圈、新旧清零、台账七节。
- G1.1 精准编辑（`:138`）：仅 apply_patch 编辑。
- G1.4 验证真实分层（`:158`）：Electron E2E 证明真实组装与 UI；真实供应商 live 仍登记 untested。
- G1.13 真实 UI 操作（`:108`）：用户可见 UI 状态由真实 Electron 页面采集，不注入业务选中态。
- G1.21 脚本质量（`:402`）：E2E 保留超时、阶段日志、finally 清理与证据目录。

## 3. 路由判定

- 加入：G0.3/G0.5/G0.6/G0.7/G0.9/G0.10/G0.12/G1.1/G1.4/G1.13/G1.21/G2.9/G2.13。
- 排除：G2.10 旧 trace 回放，本轮为新增链路；G2.14 存储根迁移，本轮只使用既有 storage API。
- Phase C 报告默认本地导出，不新增用户配置、不阻塞生成。

## 4. 影响圈与作者反证

- 打算改：`PipelinePanel.vue`（variant 观测、画像/诊断/校准接线、UI 三线）、`runTrace.ts`（新 trace 类型/字段持久化）、新增 `deaiModelProfile.ts`、`deaiCalibrationLedger.ts`、`deaiSkillReport.ts`、`deaiGuidanceDisplay.ts`（三线投影）、对应测试、Electron E2E 脚本。
- 可能碰到：`skillDeaiContract.ts` 接管态 variant、`deaiStageDiagnosis.ts` findings、UI 徽章现有测试、真实执行链 trace。
- 最可能错假设：接管态 `deaiProjection.variant` 始终有值。证伪方式：读取 `resolveDeaiPromptForSkillStep` 与 E2E skill 夹具，off 态必须继续写 undefined/0 注入。
- 作者反证：若画像在 skill 接管态注入写作方法论、诊断影响终态/retry、报告含自动改 SKILL 规则执行路径，即失败。

## 5. 停止条件

- 完成：RED→GREEN；`npm run type-check`、定向测试、`npm run test:services`；`npm run build:vue` 后 Electron E2E 完整重跑（含 skill 接管态）；方案/DEV_LOG/台账收尾。
- 失败：任一 RED 未先红、接管态 variant 仍缺失、UI 与 trace 数值不一致、账本/报告无持久化证据、出现无法解释 diff。

## 6. 执行证据

- RED→GREEN 与定向测试（2026-11-03 02:55:07）：`npx vitest run src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts src/services/deaiStageDiagnosis.spec.ts src/services/deaiSkillReport.spec.ts src/services/deaiModelProfile.spec.ts src/services/deaiGuidanceDisplay.spec.ts src/services/deaiCalibrationLedger.spec.ts` → exit 0，`Test Files 6 passed (6)`，`Tests 47 passed (47)`。
- 类型回归修复：`npm run type-check` → exit 0，`vue-tsc --noEmit` 无输出错误。修复内容为 [PipelinePanel.vue](/D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:899) 导入块恢复 `type DeaiStageDiagnosis`；该类型在 [PipelinePanel.vue](/D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1031) 的 `diagnosisReportInput` 中仍被消费，死亡变量清理时误删类型导入属于本轮回看发现并已闭环的执行缺口。
- 全量服务测试：`npm run test:services` → exit 0，`Test Files 245 passed (245)`，`Tests 2623 passed (2623)`（2026-11-03 03:02:45）。首轮全量曾失败 1 条：`pipelineProgressReaders.spec.ts` 仍断言 `feedbackHidden?: boolean` 位于 `PipelinePanel.vue`，而 per-run 状态已外移到 [pipelinePerRunUiState.ts](/D:/codex/novel-workshop-vue3/src/services/pipelinePerRunUiState.ts:20)；测试断言源已同步外移，定向 15/15 通过后全量复跑通过。
- 死代码清零对账：`rg -n "pendingStageDiagnosis\b" src/components/pipeline/PipelinePanel.vue` → exit 1（0 matches）。生产变量已删，仅保留仍在消费的 `pendingStageDiagnosisGuidance`。
- 生产构建（最终复跑）：`npm run build:vue` → exit 0，`✓ built in 2.12s`，第二协议构建 `✓ built in 79ms`。
- Electron E2E：`node scripts/verify-deai-stage-guidance-electron.mjs` → exit 0，`===== DEAI STAGE GUIDANCE ELECTRON PASSED =====`；3 次 UI 真实选择 folder SKILL，`apiCallCount=3`、`physicalCalls=3`、`runStatus="success"`，事件序列包含 `deai-model-profile`、`deai-injection-policy`、`deai-prompt-variant`、`deai-stage-guidance`、`deai-calibration`。
- E2E 关键断言：真实按钮导出报告成功（`dialog:writeFile result ok:true, bytes:615`），并断言报告本体：`- S2诊断：3条`、`- 变体: methodology, creative, polish`、`## 误伤候选\n\n- 无`；trace 断言 `guidance.sourceSkillIndex=1`、`targetSkillIndex=2`、`findingCount>0`、`guidanceChars<=1200`、`degraded=false`、`budgetExceeded=false`。
- E2E 证据：`_audit/verification-deai-stage-guidance-electron/summary.json`（`runId=run-1793646268827-1`、`requestCount=3`、`hardRules.visibleElectron=true`、`realUiSkillSelection=true`、`realBodyButtonClick=true`、`deepTraceExport=true`、`physicalRequestAssertion=true`）；报告与深 trace 均已落盘。首轮 E2E `runId=run-1793645741138-1` 为修复前验证，最终复跑在全量测试与生产构建之后执行并覆盖其证据。
- 生产接线证据：
  - S2 诊断生成与暂存：[PipelinePanel.vue](/D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:4943)、[PipelinePanel.vue](/D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:4956)。
  - attempt 重置隔离：[PipelinePanel.vue](/D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:6305)。
  - 终稿诊断与校准落账：[PipelinePanel.vue](/D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:6536)。
  - 报告变体从真实 apiCalls 派生：[PipelinePanel.vue](/D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1425)、[PipelinePanel.vue](/D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:6580)。
  - per-run 状态与终态修剪：[pipelinePerRunUiState.ts](/D:/codex/novel-workshop-vue3/src/services/pipelinePerRunUiState.ts:16)、[PipelinePanel.vue](/D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1345)、[PipelinePanel.vue](/D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1415)。
  - 报告空集合显式输出：[deaiSkillReport.ts](/D:/codex/novel-workshop-vue3/src/services/deaiSkillReport.ts:74)、[deaiSkillReport.ts](/D:/codex/novel-workshop-vue3/src/services/deaiSkillReport.ts:80)、[deaiSkillReport.ts](/D:/codex/novel-workshop-vue3/src/services/deaiSkillReport.ts:85)。
  - 测试锚定：[deai-stage-guidance.integration.spec.ts](/D:/codex/novel-workshop-vue3/src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts:118)、[deai-stage-guidance.integration.spec.ts](/D:/codex/novel-workshop-vue3/src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts:126)、[deaiSkillReport.spec.ts](/D:/codex/novel-workshop-vue3/src/services/deaiSkillReport.spec.ts:68)。
- 回头看补充修复（before/after）：
  - S2 诊断被 S3 清空：before 为终步 else 分支执行 `runUi.deaiStageDiagnosis = null`；after 为该分支不再清理，改由 attempt 重置块显置 null，防止跨 attempt 串台。
  - `variants` 恒空：before 报告只读当前内存常量；after 从 `runTraceStore.getRun(runId).apiCalls` 去重收集并过滤 `off`。
  - per-run Map 无界增长：before 面板重建后旧 run 状态全部保留；after 新 run 创建时修剪终态 run，仅保留 40 个。
  - 动态 import：before 运行时 `await import('../../services/deaiCalibrationLedger')`；after 顶部静态导入 `readDeaiCalibrationLedger`。

## 7. 缺口清单

- 已闭环：接管态 variant 观测、模型画像与门槛、UI 三线显示、校准账本、SKILL 迭代报告导出、Electron 真实 UI E2E、S2 诊断存续、报告变体推导、per-run 状态有界化、类型导入回归。
- 未验证边界：本轮 E2E provider 为 mock（`deai-stage-guidance-provider / deai-stage-model`）；后续真实供应商 observational live 已在五个证据目录中留证，含失败与 running 状态。真实模型输出下 findings 分布、误伤率与 SKILL 迭代效果保持 observational，不由 mock 证明。
- 交付边界：本轮当时不升版、不封装、不提交 git；2026-11-03 用户已授权 3.112.0 交付，发布证据由发布台账接续。
- 后续通道：folder SKILL 作者可通过导出报告回传误伤候选；应用只登记，不代判误伤。
