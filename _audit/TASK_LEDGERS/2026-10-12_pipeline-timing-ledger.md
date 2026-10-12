# 2026-10-12 流水线耗时账本 Phase 1 / Phase 2 任务台账

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
