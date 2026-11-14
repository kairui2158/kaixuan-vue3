# TASK LEDGER · Body generator failure wiring V1

> 状态：方案待审核；未批准前不改产品代码。

## 1. 目标与原话

用户原话（2026-11-14）：

> 我看方案里还留有Phase B的后续项目，你根据经验文件里的相关门禁和执行纪律来做方案

目标：修复 Phase B 观测运行登记出的 W1/W2 两个应用侧接线缺陷，让失败步留下结构化验收账本，并让 S2 targeted 修复正确消费 S1 legacy 骨架。

## 2. 门禁读证

已读：`_audit/神意开发经验总结_v9.md`（v10.4.1）G0.6/G0.7/G0.9/G0.12/G0.13/G1.4/G1.14/G1.17/G1.21/G1.30；已读 Phase B 台账第 6/7 节与相关代码锚点。

## 3. 路由判定

只改 `src/components/pipeline/PipelinePanel.vue` 中 W1/W2 两个接线点；不改 folder SKILL；不改叙事裁判权；不新增预算、调度、UI、第二裁判或新修复体系。

## 4. 影响圈与作者反证

影响圈：body step 失败路径、targeted-from-generator 上游形态判定、相关测试。

反证范围：失败空串、失败验收拒绝、失败 S2 误当 S1、非生成层 targeted、checkpoint replay、`onStepOutputs` 重复调用、终态反转。详细七条见方案第 5 节。

## 5. 停止条件

完成须通过 W1/W2 聚焦 spec、`npm run test:services`、`npm run type-check`、`npm run build:vue`、真实 Electron trace 对账、台账收尾与单独提交；任一失败则登记缺口，不宣称闭环。

## 6. 执行证据

待执行。批准后逐项回填：

1. W1 聚焦 spec 命令与关键断言输出。
2. W2 聚焦 spec 命令与关键断言输出。
3. 全量服务测试/类型检查/构建输出。
4. 真实 Electron 运行 trace 关键事件。
5. 文件与行号 diff 摘要。

## 7. 缺口清单与边界

登记缺陷：

1. **W1**：`PipelinePanel.vue:4934-4938` 失败早退跳过 `resolveStepArtifactFlow`、trace、`rememberBodyStepAcceptance`、`completedStepOutputs.concat` 与 `executionPlan.onStepOutputs`。
2. **W2**：`PipelinePanel.vue:4571-4583` targeted-from-generator 将 S1 legacy 骨架误套 `isGeneratorEnvelopeArtifact`，实测降级全链重跑。

独立保留项：

1. glm-5.3 deep 单步 723 秒以上与供应商 503 稳定性，属独立观测项，不混入本修复。
2. Phase D 三项观测仍保持 `untested`，需成功或失败证据链完整后另行回填。
3. 叙事质量与 S2/S3 收敛归 SKILL；本方案不越界。

