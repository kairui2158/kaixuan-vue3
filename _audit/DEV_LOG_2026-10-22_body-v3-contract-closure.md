# 2026-10-22 正文层 V3 契约收口

## 任务目标

- 台账：[_audit/TASK_LEDGERS/2026-10-22_body-v3-contract-closure.md](_audit/TASK_LEDGERS/2026-10-22_body-v3-contract-closure.md)
- 目标：把正文层 V3 契约修复从 80% 下限、终步元数据、后处理门、降级语义推进到真实 Electron UI 硬门禁，并完成文档、经验与仓库收口。

## 本轮关键事件

1. 初判“S3 wiring 缺陷”后复核证伪：当时试图通过改 wiring 解决，但重新对账请求序列与终态副作用后发现该判断不成立，相关改动已回滚，未进入交付。
2. 真实缺陷：generator 账本守卫原本只位于 S3 输出之后。S2 无 `bodyHandoff` 元数据时，链路会先调用一次 S3 物理请求，再在输出后丢弃产物并报 `body-generator-ledger-missing`。这是“先付费、后拒绝”的门时序缺陷。
3. 修复：终步派发前即检查非 generator 终步是否已有权威 generator 账本；缺失时立即写配置终态事件并抛错。输出后守卫保留为兜底，用于终步自身就是 generator 的合法形态。
4. 验证器修正：场景 C 的“不持久化”不再断言编辑器为空，而是断言失败运行不覆盖上一有效正文。场景 B 会合法留下 3393 字正文，旧断言会把真实正确行为误判为失败。

## 产品改动

- [src/components/pipeline/PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue)：新增 `requiresGeneratorLedgerBeforeDispatch`，终步派发前拦截无权威 generator 账本的正文链；保留原输出后守卫。
- [src/services/ownerBreakpointClosureWiring.spec.ts](../src/services/ownerBreakpointClosureWiring.spec.ts)：新增 wiring 测试，锁定守卫位于 prompt suffix 之后、模板解析与 S3 派发之前。
- [scripts/verify-body-contract-degraded-electron.mjs](../scripts/verify-body-contract-degraded-electron.mjs)：迁移 80% 下限夹具；新增场景 C；归档旧证据；失败时保存 provider requests；修正场景 C 持久化断言。

## 验证

- `node scripts/verify-body-contract-degraded-electron.mjs` → `===== BODY CONTRACT DEGRADED GATE ELECTRON PASSED =====`
  - 场景 A：failed，4 次物理请求，S2 1640 字在 S3 前拒绝。
  - 场景 B：success，5 次物理请求，正文 3393 字，S3 收到终步账本摘要。
  - 场景 C：failed，4 次物理请求，S3 未调用，上一有效正文保持不变。
- `npm run test:services -- src/services/ownerBreakpointClosureWiring.spec.ts src/services/finalStepMetadataWiring.spec.ts src/services/finalStepMetadataReplay.spec.ts src/services/chainExecution.spec.ts src/services/bodyArtifactOrchestrator.spec.ts` → 5 files / 68 tests passed。
- `npm run test:services -- src/services/de-ai.spec.ts src/services/deaiChainVariantIntegration.spec.ts src/services/finalStepFeedback.spec.ts` → 3 files / 9 tests passed。
- `npm run type-check` → exit 0。
- `npm run test:services` → 188 files / 2126 tests passed。

## 诚实边界

- Electron 验证使用本地 OpenAI-compatible provider，不是外部 live 供应商矩阵。
- `bodyPersisted: false` 表示“本次失败运行未产生新正文”，不是“编辑器必须为空”；上一有效正文必须保持不变。
- 版本保持 3.102.0，未升版、未重新封装；本轮是代码与验证收口，不是发布任务。

## 经验回写

- 经验文件升级 v8.19：在 G1.5 补入“门时序证据”要求——当守卫可在昂贵外呼前求值时，验证器必须把请求次数当契约证据；在 G1.17 补入“副作用断言面”要求——“未持久化”必须区分“为空”与“上一有效产物不变”。
