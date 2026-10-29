# TASK LEDGER：正文层内嵌降AI V3 总方案逐条对账（2026-10-30）

## 1. 目标与原话

用户原话核心：“你现在在回头重新对账总方案方案，逐条对账，每一条都要看有没有落实到应用里，而且还要反推。”

可感知交付：V3 方案 Phase 1-10 与验收矩阵逐条判定，明确区分“已验证 / 部分未闭环 / 条文偏差 / 设计内未放行”，并把反推缺口按优先级登记，供下一轮修复立项。

## 2. 门禁读证

- G0.3 诚实闭环：不把“代码存在”当成“验收闭环”，不把替代验证伪装成方案原文验证。
- G0.5 回头看：方案条文、源码、测试、Electron 证据、校准门禁五层逐条对账。
- G0.12 门禁执行台账：本文件即七节凭证。
- G1.4 验证真实性：本轮重跑定向测试与 type-check，Electron 证据只作为历史证据标注日期。
- G1.23 契约开关四件套：真实消费点、测试锚定、手册披露、跨进程实现逐项检查。
- G1.15 自盲区：主动反推验收矩阵未覆盖的 UI 状态、事件采样、Playwright 替代验证。

## 3. 路由判定

- 加入：方案逐条对账、验收矩阵反推、测试与源码证据核对、DEV_LOG 与台账落盘。
- 排除：运行时代码修改，本轮问题需要先出修复方案并经用户审核。
- 排除：git 提交与封装，用户未要求，版本保持 `3.110.7`。
- 排除：解除 provisional，Phase 10 门禁明确 NOT_READY。
- 排除：重跑 Electron 验证器，当前是审计轮；新增场景应并入下一轮修复验证，而不是在未改代码的情况下重复旧证据。

## 4. 影响圈与作者反证

打算改：仅新增本轮 DEV_LOG、TASK_LEDGER，并在 DEV_LOG_MASTER_INDEX 登记。

可能碰到：主索引为已修改文件，追加时只写末尾，不重排既有条目。

最可能错的假设：

1. “事件在白名单里就等于会发出” → 已证伪并修正：folder/agent 路径存在真实 `addEvent`，但 Electron 证据未采样。
2. “变更率算法是近似计数” → 已证伪并修正：`de-ai.js` 是标准句级 LCS。
3. “测试全绿等于验收矩阵全过” → 已证伪：UI 双状态条文没有实现，也没有测试。

## 5. 停止条件

- Phase 1-10 每条都有源码或产物证据与判定。
- 验收矩阵 10 行逐行给出状态。
- 反推缺口至少覆盖 UI 验收、端到端场景、声纹一致性断言、验证命令偏差、校准放行断点。
- 定向测试与 type-check 本轮新鲜通过。
- DEV_LOG、TASK_LEDGER、主索引三处落盘。

## 6. 执行证据

- 方案：`_audit/PROPOSAL_2026-10-29_BODY_EMBEDDED_DEAI_V3.md`
- 观测诚信：`src/services/de-ai.js:685-686`、`src/services/realSkillExecutor.ts:523-532`
- 变更率：`src/services/de-ai.js:470-531`、`src/components/pipeline/PipelinePanel.vue:6282-6337`
- 内核：`src/services/de-ai.js:537-689`
- 声纹：`src/services/deaiVoiceProfile.ts:79,156,170`、`PipelinePanel.vue:908-915,2778,3651,6221`
- 提示词：`src/services/de-ai.js:1222-1251`
- legacy 默认：`src/stores/deai.ts:66,94-98`
- trace 白名单：`src/stores/runTrace.ts:939-955`
- 契约：`src/services/skillDeaiContract.ts`、`src/services/skillDeaiContractValidation.ts`、`PipelinePanel.vue:2726-2779,3615-3651`
- Electron 证据：`_audit/verification-deai-body-electron/report.json` 三场景 + heartbeat
- 校准门禁：`_audit/verification-deai-calibration/deai-release-gate-2026-10-29.json` NOT_READY
- 测试：`npx vitest run ...` → 5 files / 92 tests passed；`npm run type-check` → exit 0；`git diff --check` → PASS

## 7. 缺口清单

- `finalStepDetection: 'off'` + `deep-fix` UI 双状态未实现未测试（P1）。
- Electron 验证器缺终步关闭双状态与 conflictPolicy 真实 UI 场景（P1）。
- 缺 S1/S2/S3 同一声纹投影集成断言（P2）。
- `deai-voice-profile` 事件缺端到端采样（P2）。
- Playwright test runner 未跑，自研 Electron 验证器是替代验证，需正式对账或补跑（P2）。
- 校准正样本每组 4 条、人写误伤、最差作者、召回、CI 半宽五项未达发布门禁（P0 前置）。
- 本轮不修代码、不提交、不封装；缺口按“先出方案审核，再执行”的流程处理。
