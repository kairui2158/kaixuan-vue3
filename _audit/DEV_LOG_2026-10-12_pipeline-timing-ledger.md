# 2026-10-12 流水线耗时账本 Phase 1 / Phase 2

## 背景

用户要求按既定顺序落地生成流水线效率优化：先建只读耗时账本，用真实数据定位 Top 耗时来源，再做重复上下文与无效串行等待修复、受控并发批次、模型路由和增量校验。本阶段不改变生成、重试、写入和审批行为。

## 实现

- runTrace schema 17→18：`RunTracePhysicalCall` 新增 `firstTokenMs` / `outputMs`；`RunTraceApiCall.timingLedger` 与 `RunTrace.timingLedger` 均为可选字段，旧 trace 不回填。
- API call 级汇总在 `finishApiCall` 自动生成：物理请求数、重试请求数、物理耗时合计、首 token 最小/最大值、本地空隙；run 级汇总在 `finishRun` 自动生成。
- `aiService` 记录每个物理请求首个正文或思考增量的时间戳，并经 `PhysicalCallEvent` 传出。
- `realSkillExecutor` 记录请求构建、直出重试、postProcess、schema 校验四类本地耗时，三个 return 路径均通过 `apiMeta.timingLedger` 带出。
- `PipelinePanel` 把物理首 token 分段与 API call 本地耗时账本接入 runTrace。

## 回头看修正

逐行 diff 审查发现 `schemaValidateMs` 的计时起点在 postProcess 前，会把后处理耗时重复计入校验耗时。观测账本若口径失真，后续 Top 耗时分析会指向错误优化点。已修为：`postProcessMs` 只覆盖后处理，`schemaValidateMs` 从后处理结束后开始计时。

## 验证

- `npm run test:services` → 149 files / 1778 tests passed。
- `npm run type-check` → exit 0。
- `npm run build:vue` → exit 0，仅既有 Vite chunk / config warning。
- live 回放：
  - baseline → `RESULT: ACCEPTED`
  - schema-retry → `RESULT: ACCEPTED`
  - echo-repair → `RESULT: ACCEPTED`

## 证据

- 方案：`_audit/PROPOSAL_2026-10-12_PIPELINE_TIMING_LEDGER_PHASE1.md`
- 任务台账：`_audit/TASK_LEDGERS/2026-10-12_pipeline-timing-ledger.md`
- 新增测试：`src/stores/runTrace.spec.ts`、`src/services/aiService.spec.ts`
- 回放脚本：`scripts/verify-pipeline-repair-feedback-replay.mjs`

## 后续

阶段 1 只建立观测。下一步需要让真实生成流水线跑出带 `timingLedger` 的 trace，再按账本数据排序 Top 3 耗时来源；禁止在拿到真实数据前凭感觉改上下文策略或并发。

## Phase 2 真实运行

用户确认执行阶段 2 后，新增 `scripts/verify-pipeline-timing-ledger-electron.mjs`，使用可见 Electron 窗口、真实 API、真实 UI 下拉选择 4 个卷纲 SKILL，跑 3 卷 x S1-S4。前三次 run 均被 30 分钟安全网截断：第一次是旧 shell 环境变量未继承，第二次和第三次是 `waitForVolumeCompletion` 的独立 `STEP_TIMEOUT_MS` 仍为默认 30 分钟。修正后两层防挂死保护均设置为 3 小时并确认进入同一 node 进程。

`run-1791784391203-1` 完整通过：状态 `success`，12 个 API call，13 个物理请求，0 个失败 API call，输出 3 卷。

Top 3：

1. 模型流式输出 `outputSumMs=3,276,691ms`（结论）
2. 模型首 token 等待 `firstTokenSumMs=658,956ms`（结论）
3. 后处理 `postProcessSumMs=115ms`（结论）

请求构建 17ms、schema 校验 0ms、本地后处理 115ms，说明本地计算不是本 run 的耗时主因。

## Phase 2 回头看发现的两个缺陷

1. **`localOverheadSumMs=-598,995ms` 是账本口径缺陷。** 第 3 个 API call 的第一次物理请求 600,013ms 超时失败，随后重试成功；但 retry 路径重置了逻辑 call 的计时起点，导致 `durationMs=847,237ms` 小于两次物理请求合计 1,447,227ms。`localOverheadMs=durationMs-physicalDurationSumMs` 因此出现 -599,990ms。负数不是“本地负开销”，而是重试后的 `durationMs` 起点口径错误。
2. **600 秒流式超时会切断已在输出的长生成。** 失败物理请求 `firstTokenMs=7,707ms`、`outputMs=592,306ms`、`heartbeat=true`，说明流没有停，只是没在 10 分钟内完成；重试成功请求又先等待 615,502ms 才收到首个 token。该超时切断了 592 秒已经生成的流式内容并强制整段重跑，是后续效率优化的优先修复点。

## Phase 2 证据

- 脚本：`scripts/verify-pipeline-timing-ledger-electron.mjs`
- 当前证据：`_audit/verification-pipeline-timing-ledger-live/`
- 失败 run 归档：`_audit/verification-pipeline-timing-ledger-live-archive/`
- 方案：`_audit/PROPOSAL_2026-10-12_PIPELINE_TIMING_LEDGER_PHASE2.md`

## Phase 2 后续

- 修复 retry 场景下 API call `durationMs` 与物理请求合计的口径，禁止负 local overhead。
- 独立评估流式长输出的超时策略：有持续 heartbeat 与流式输出时，600 秒总时长不应触发切断；无输出停滞才进入超时。
- 拿到修正口径后，再评估重复上下文与无效串行等待、受控并发、模型路由与增量校验，禁止用本 run 的单一供应商样本直接改策略。
