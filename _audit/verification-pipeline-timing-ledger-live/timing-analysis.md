# 流水线耗时账本 Phase 2 真实运行分析

- Run ID: run-1793095165641-1
- 状态: success
- API call: 12
- 物理请求: 13（重试 1）
- 失败 API call: 0

## Top 3

1. 模型流式输出: 3,025,560ms，占物理耗时+本地候选合计的 97.5%（口径: 结论）
2. 模型首 token 等待: 78,005ms，占物理耗时+本地候选合计的 2.5%（口径: 结论）
3. 本地/编排等待候选: 557ms，占物理耗时+本地候选合计的 0.0%（口径: 候选线索）

## 全量指标

- 模型流式输出 (outputSumMs): 3,025,560ms — 结论
- 模型首 token 等待 (firstTokenSumMs): 78,005ms — 结论
- 本地/编排等待候选 (localOverheadSumMs): 557ms — 候选线索
- 后处理 (postProcessSumMs): 61ms — 结论
- 请求构建 (requestBuildSumMs): 8ms — 结论
- schema 校验 (schemaValidateSumMs): 0ms — 结论
- 重试处理 (retrySumMs): 0ms — 候选线索

## 解释边界

- firstTokenSumMs 与 outputSumMs 是模型侧耗时结论。
- localOverheadSumMs 是候选线索：物理重试可能被重复计入，且混合编排等待，不能直接当本地浪费结论。
- retrySumMs 需与 retryPhysicalCallCount 一起读，一次合法修复重试不算空转。
- 本次数据只描述该 run，不直接推出并发或路由改动。