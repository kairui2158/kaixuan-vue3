# 2026-10-12 流水线耗时账本 Phase 1

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
