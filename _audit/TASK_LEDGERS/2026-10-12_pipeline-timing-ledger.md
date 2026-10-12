# 2026-10-12 流水线耗时账本 Phase 1 / Phase 2 / Phase 3 任务台账

## 1. 目标与原话

用户原话：「按照你的建议落地顺序开始吧」。

最终可感知行为：生成流水线每次 API call 与整个 run 的 trace 中出现可选耗时账本，可区分物理请求数、重试请求数、首 token、流式输出、本地构建/校验/重试/后处理耗时；所有执行行为保持不变，旧 trace 兼容。

本轮交付物：

- runTrace schema 18 类型、写入与自动汇总。
- `aiService` 物理 first-token / output 分段。
- `realSkillExecutor` 本地四段耗时账本。
- `PipelinePanel` 观测接线。
- 方案、DEV_LOG、任务台账、经验增补。

## 2. 门禁读证

读证文件：`_audit/神意开发经验总结_v7.md`（v8.7）。

- G0.1 目标对齐（`神意开发经验总结_v7.md:18`）：只加观测，不改行为；方案、实现、验证均对准耗时账本。
- G0.3 诚实闭环（`:31`）：schema 校验耗时口径错误已修正后重跑验证；未声称真实 run Top 3 结论。
- G0.5 回头看（`:43`）：逐行 diff 审查，发现并修正 schemaValidate 口径。
- G0.6 方案成熟度（`:50`）：方案经用户确认后执行；观测-only 边界明确。
- G0.8 收尾清理（`:56`）：临时分析仅使用既有证据目录，无新增临时脚本。
- G0.9 影响圈声明（`:63`）：只影响 trace schema、aiService、realSkillExecutor、PipelinePanel 与对应测试。
- G0.10 新旧并存清零（`:67`）：schema 18 旧字段不回填；旧 trace 回放不失败。
- G0.12 门禁执行台账（`:110`）：本文档。
- G1.1 精准编辑（`:127`）：apply_patch 逐段修改；diff 逐行复核。
- G1.4 验证分层（`:150`）：单测、type-check、build、回放分层登记；未做新 live 属于观测字段尚未在既有回放中生成的正常边界。
- G1.5 验证器质量（`:161`）：回放脚本三场景全部重新执行。
- G1.8 日志与观测同步（`:194`）：trace 字段、导出通道、测试同批扩展。

## 3. 路由判定

加入门禁：G0.1、G0.3、G0.5、G0.6、G0.8、G0.9、G0.10、G0.12、G1.1、G1.4、G1.5、G1.8。

排除项及理由：

- G0.11 真实交互冒充禁令：本阶段为观测字段，不在 UI 中验证用户操作行为。
- G1.9 状态机与终态收敛：未改变终态语义，旧终态测试已覆盖。
- G1.13 Electron 验证标准：本阶段新增字段由单测和回放证明，未启动新 Electron run。
- G1.14 深层根因追踪：不涉及缺陷修复，仅观测。
- 封装门禁：用户未要求版本号升级和封装，本轮保持 3.81.0。

## 4. 影响圈与作者反证

实际修改：

- `src/stores/runTrace.ts`
- `src/stores/runTrace.spec.ts`
- `src/services/aiService.ts`
- `src/services/aiService.spec.ts`
- `src/services/realSkillExecutor.ts`
- `src/services/realSkillTypes.ts`
- `src/components/pipeline/PipelinePanel.vue`
- `_audit/PROPOSAL_2026-10-12_PIPELINE_TIMING_LEDGER_PHASE1.md`

可能碰到但已反证未破坏：

- 旧 trace 导入：新字段全部可选，旧 trace 回放三场景 `RESULT: ACCEPTED`。
- 重试路径：`timingLedger` 在 catch、schema 耗尽、正常三条 return 路径带出。
- 行为面：账本字段不进入决策、审批或写入逻辑。

最可能错的假设与证伪方式：

1. 假设观测字段不会破坏旧 trace。证伪：三份 live run-trace 用回放脚本重新执行，全部 ACCEPTED。
2. 假设本地耗时段互不重叠。证伪：逐行 diff 审查发现 schemaValidate 计时起点覆盖 postProcess，已修正。
3. 假设 first-token 逻辑不污染执行。证伪：aiService 测试断言首个正文或思考增量才记录时间戳，attempt 开始时重置；全量 1778 条测试通过。
4. 假设 run 级汇总正确。证伪：runTrace 测试覆盖 API call 与 run 级汇总，包含字段缺省时 `undefined` 不被计为 0。

## 5. 停止条件

完成条件（全部满足）：

1. schema 18、物理分段、本地分段、Pipeline 接线全部落地。
2. `npm run test:services` 149 files / 1778 tests 全绿。
3. `npm run type-check` exit 0。
4. `npm run build:vue` exit 0。
5. baseline / schema-retry / echo-repair 三份 live trace 回放全部 `RESULT: ACCEPTED`。
6. DEV_LOG、任务台账、经验 v8.8、DEV_LOG_MASTER_INDEX 登记完成。
7. git diff 逐行自审，工作区仅保留本轮相关改动并提交。

失败条件：

- 新字段改变执行行为、旧 trace 回放失败、计时口径重叠或漏记，任一命中即停止并修复。

## 6. 执行证据

- `npm run test:services` → `Test Files 149 passed (149)`、`Tests 1778 passed (1778)`。
- `npm run type-check` → exit 0。
- `npm run build:vue` → `✓ built in 10.19s`、`✓ built in 121ms`。
- `node scripts/verify-pipeline-repair-feedback-replay.mjs ...baseline\run-trace.json` → `RESULT: ACCEPTED`。
- `node scripts/verify-pipeline-repair-feedback-replay.mjs ...schema-retry\run-trace.json` → `RESULT: ACCEPTED`。
- `node scripts/verify-pipeline-repair-feedback-replay.mjs ...echo-repair\run-trace.json` → `RESULT: ACCEPTED`。
- 实现锚点：
  - `src/stores/runTrace.ts:784`（schema 18）
  - `src/stores/runTrace.ts:1861`（API call 汇总）
  - `src/stores/runTrace.ts:1879`（run 汇总）
  - `src/services/aiService.ts:3586`（attempt 计时重置）
  - `src/services/realSkillExecutor.ts:725`（本地账本）
  - `src/components/pipeline/PipelinePanel.vue:2026`（finishApiCall 传账本）

## 7. 缺口清单

Phase 1 无登记缺口。

### Phase 2 登记缺口（2 项）

1. **重试路径污染 `localOverheadMs`。** `run-1791784391203-1` 第 3 个 API call 的逻辑 `durationMs` 从重试开始计时，而 `physicalDurationSumMs` 包含失败请求与成功请求两段，导致 `localOverheadSumMs=-598,995ms`。账本字段仍是“候选线索”，但负数本身证明口径必须修复后才能用于阶段 3。
2. **600 秒流式超时切断长输出。** 第 3 个 API call 第一次物理请求已有 `firstTokenMs=7,707ms`、`outputMs=592,306ms`、`heartbeat=true`，仍因总时长 600,013ms 被标记“请求超时”并重跑；重试请求首 token 等待 615,502ms。需要在阶段 3 前单独设计“有流式进度不按总时长切断”的超时策略。

## 8. Phase 2 执行证据

- `node scripts/verify-pipeline-timing-ledger-electron.mjs` → `===== PIPELINE TIMING LEDGER ELECTRON LIVE PASSED =====`
- run：`run-1791784391203-1`，状态 `success`，12 API call / 13 物理请求 / 0 失败 API call / 3 卷输出。
- Top 3：`outputSumMs=3,276,691ms`，`firstTokenSumMs=658,956ms`，`postProcessSumMs=115ms`。
- 证据目录：`_audit/verification-pipeline-timing-ledger-live/`
- 失败 run 归档：`_audit/verification-pipeline-timing-ledger-live-archive/`

## 9. Phase 3 修复台账

### 9.1 目标与原话

用户确认执行 Phase 2 登记缺口修复。最终可感知行为：

1. 重试物理请求在 runTrace 中的 `durationMs` 从本次物理请求开始计时，API call 不再出现负 local overhead。
2. 已产生流式输出的长生成不因 600 秒总时长被切断；首输出前超时保护不变，输出后停滞由 idle / progress watchdog 判定。
3. Agent 编排器把正文与思考流式增量视作活跃进度，不再把正在输出的长轮次误判为 idle。

### 9.2 门禁读证

读证文件：`_audit/神意开发经验总结_v7.md`（v8.8）。

- G0.3 诚实闭环（`神意开发经验总结_v7.md:36`）：区分已验证与未验证；本轮明确未重新跑 live 流水线，验证口径为 TDD 单测、全量服务测试与 type-check。
- G0.5 回头看（`:52`）：补登记前核对当前 diff、三个修复点与测试断言；本节即 Phase 3 回头看记录。
- G0.7 正反推研磨（`:68`）：反推覆盖“总时长超时被禁用后是否仍有首输出前保护”，负向测试保留超时合同。
- G1.5 验证器自身质量（`:164`）：首个 active-stream 测试因 fake timer 未触发 `AbortSignal.timeout` 而假绿，已补负向路径测试确认超时仍生效。
- G1.9 状态机与终态收敛（`:212`）：重试、失败、成功路径的 physical event 均按自身 attempt 收口。
- G1.11 测试契约（`:230`）：三个新测试先失败后修复，不为绿灯固化旧契约。
- G1.19 耗时观测先于性能决策（`:306`）：观测仪器本身必须在重试路径上验证；活跃流式输出被总时长切断必须登记为缺陷而非归因模型。

### 9.3 路由判定

加入门禁：G0.1、G0.3、G0.4、G0.5、G0.7、G0.9、G0.12、G1.1、G1.4、G1.5、G1.9、G1.11、G1.19。

排除项及理由：

- G0.11 真实交互冒充禁令：本轮未执行 Electron UI 验证，不涉及用户交互冒充。
- G1.13 Electron 验证标准：用户确认的是根因修复；live 复跑属于后续采账需求，不在本轮目标内。
- G1.15 系统层递进诊断：本阶段已完成四层定位并进入修复执行；无新复杂症状。
- 封装门禁：用户未要求升版与封装，版本保持 3.81.0。

### 9.4 影响圈与作者反证

打算修改：

- `src/services/aiService.ts`
- `src/services/aiService.spec.ts`
- `src/services/agentOrchestrator.ts`

可能碰到但已反证未破坏：

- 非 stream 请求：`physicalStartedAt` 只参与 `durationMs` 计算，不影响请求与响应语义。
- `timeoutMs: null` 生产路径：本轮未改动，终稿与大纲长文档请求继续显式无超时。
- Agent 编排器回调链：`onChunk` / `onReasoning` 先上报进度再原样转发，不改文本内容与顺序。

最可能错的假设与证伪方式：

1. 假设重试时只错在 `durationMs`。证伪：专项测试断言失败请求与重试请求各自 `durationMs` 落在实际耗时区间，且重试时长小于失败请求累计时长。
2. 假设首输出后禁用总时长超时不会引入挂死。证伪：现有 idle / progress watchdog 继续负责停滞检测；本轮不改其阈值与逻辑。
3. 假设编排器进度上报只差 chunk/reasoning。证伪：审读 `agentOrchestrator.ts` 物理请求调用点，确认 tool event、physical running、stream tool progress 已有上报，本轮补齐正文与思考增量两类。

### 9.5 停止条件

完成条件（全部满足）：

1. 三个专项测试通过，且至少两个测试在修复前失败。
2. `aiService.spec.ts + agentOrchestrator.spec.ts` 全绿。
3. `npm run test:services` 全绿。
4. `npm run type-check` exit 0。
5. DEV_LOG、任务台账、G1.19、主索引全部登记。
6. git diff 逐行自审，工作区只保留本轮相关改动并提交。

失败条件：

- `durationMs` 仍使用逻辑起点、活跃流被总时长切断、首输出前超时失效、编排器把活跃流误判 idle、任一测试或 type-check 失败。

### 9.6 执行证据

- `npx vitest run src/services/aiService.spec.ts -t "measures each physical retry from its own start time"` → passed；修复前失败值约 `3540ms`，修复后失败请求约 2400-2900ms、重试请求小于 1500ms。
- `npx vitest run src/services/aiService.spec.ts -t "does not kill an actively progressing stream at the total timeout"` → passed；8 分钟以上持续流式输出只调用 1 次 stream，最终文本 `first-middle-tail`。
- `npx vitest run src/services/aiService.spec.ts -t "still enforces the total timeout before a stream produces output"` → passed；600 秒无输出触发 `请求超时`，stream 只调用 1 次。
- `npx vitest run src/services/aiService.spec.ts src/services/agentOrchestrator.spec.ts` → `Tests 210 passed (210)`。
- `npm run test:services` → `Test Files 149 passed (149)`、`Tests 1781 passed (1781)`。
- `npm run type-check` → exit 0。
- 实现锚点：
  - `src/services/aiService.ts:3596`（`physicalStartedAt`）
  - `src/services/aiService.ts:3629`（per-attempt `durationMs`）
  - `src/services/aiService.ts:3719`（attempt 重置计时）
  - `src/services/aiService.ts:1867`（`streamActivitySignal`）
  - `src/services/aiService.ts:1955`（`markStreamOutput`）
  - `src/services/agentOrchestrator.ts:758`（回调捕获与进度上报）
  - `src/services/agentOrchestrator.ts:800`（chunk/reasoning 包裹）

### 9.7 Phase 3 缺口清单

1. **未重新执行完整 live 流水线。** 本轮修复为计时口径与挂死保护，缺陷复现证据来自 Phase 2 live run，验证使用 TDD 单测、全量服务测试与 type-check。后续需要重新采账或验证真实长流不再被切断时，用 `scripts/verify-pipeline-timing-ledger-electron.mjs` 复跑 live。
2. **供应商覆盖仍为单供应商样本。** Phase 2 live 只有当前供应商形态；跨供应商超时与流式行为未新增证据，属后续效率优化阶段的采样范围。
