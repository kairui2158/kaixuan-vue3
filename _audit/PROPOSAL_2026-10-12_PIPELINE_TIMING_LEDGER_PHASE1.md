# 流水线耗时账本 Phase 1 方案

## 状态

已确认执行。本阶段只增加观测，不改变生成、重试、写入和审批行为。

## 目标

回答三个问题:

1. 单次 API 调用的时间是花在模型首 token、流式输出、物理重试，还是应用本地处理。
2. 一次 run 里物理请求总耗时和 API 调用总耗时的差额有多大，差额就是编排、组装、校验和等待的候选优化空间。
3. 后续优化必须有前后对比数据，不允许凭感觉优化。

## Schema 设计

Schema 版本从 17 升到 18。旧 trace 不回填，缺字段保持缺字段。

### RunTracePhysicalCall

- `firstTokenMs`: 本物理请求从开始到第一个正文/思考增量之间的耗时。
- `outputMs`: 首个增量之后的流式耗时，`durationMs - firstTokenMs`。

### RunTraceApiCall.timingLedger

- `physicalCallCount`
- `retryPhysicalCallCount`
- `physicalDurationSumMs`
- `minFirstTokenMs`
- `maxFirstTokenMs`
- `localOverheadMs`: API call 总耗时减物理请求耗时合计; 因同一起点的重试可能被重复计入，只能作为候选等待线索，不能直接当结论。
- `requestBuildMs`
- `schemaValidateMs`
- `retryMs`
- `postProcessMs`

### RunTrace.timingLedger

- `apiCallCount`
- `physicalCallCount`
- `retryPhysicalCallCount`
- `physicalDurationSumMs`
- `firstTokenSumMs`
- `outputSumMs`
- `localOverheadSumMs`
- `requestBuildSumMs`
- `schemaValidateSumMs`
- `retrySumMs`
- `postProcessSumMs`

## 实现切片

1. runTrace schema: 类型、写入、汇总和导出; 先写失败测试。
2. aiService: 每个物理请求记录首个正文或思考增量时间; 通过 PhysicalCallEvent 传出。
3. realSkillExecutor: 记录请求构建、schema 校验、直出/续写重试和 postProcess 耗时; 通过 apiMeta 传出。
4. PipelinePanel: 把 apiMeta.timingLedger 接到 finishApiCall。
5. run 级汇总在 finishRun 时自动生成。

## 验证

- 新增 runTrace 单测: physical call 分段、API call 汇总、run 汇总、旧数据不回填。
- aiService 单测: 流式首 token、无流式回调、重试共享事件。
- realSkillExecutor 单测: 校验耗时、重试耗时、无 schema 路径。
- 回归: `npm run test:services`、`npm run type-check`、`node scripts/verify-pipeline-repair-feedback-replay.mjs`、`npm run build:vue`。

## 非目标

- 不调整上下文策略、批次并发、模型路由和校验门禁。
- 不用计时结果直接做任何优化决策; 必须先拿真实运行数据。
