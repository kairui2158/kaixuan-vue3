# 2026-10-22 正文层 V3 契约收口任务台账

## 1. 目标与原话

- 用户原话：`确认执行`，对应上一轮 V3 方案：正文生成下限、终步元数据、后处理契约门、降级语义、FACT_LOCK、降AI 提示词分权与验证收口。
- 最终可感知行为：正文链提示词与验收使用同一 80% 下限；终步回填不吞掉非 FACT_LOCK 字段；后处理改稿必须过同一契约门；降级候选不得伪装成功；FACT_LOCK 只做确定性归一。
- 交付物：`proseWordContract` 单源、受控合并、后处理契约门、测试迁移、trace 观测、DEV_LOG 与经验回写。

## 2. 门禁读证

- G0.9（影响圈声明）：动手前列七面矩阵，本轮见第 4 节。
- G0.10/v8.18（新旧并存清零）：生成下限 60% 必须从生产、测试、共享实现清零，并保留负向断言。
- G0.12（门禁执行台账）：本文件七节执行，缺节不得完成。
- G1.8（观测同步）：后处理契约门新增事件必须覆盖生产事件、入口回填、存储导出链路。
- G1.11（测试契约）：旧 2100 断言同批迁移，不得为绿灯固化双口径。
- G1.15（系统层递进诊断）：每个缺陷按症状/链路/组件组合/机制四层对账。
- G1.17（执行者自盲区）：先跑作者反证证伪用例，验证默认证伪。
- G2.9（终稿与流水线）：attempt 单账、唯一生成步、终步反馈禁携候选全文。
- G2.10（真实 trace 回放）：Phase 7 使用最近客户 run-trace 双语义断言。
- G2.13（SKILL 中立）：有/无 SKILL 双态仅允许 guidance 差异。

## 3. 路由判定

- 加入：G0.1、G0.3-G0.5、G0.9、G0.10、G0.12、G1.1、G1.5、G1.8、G1.11、G1.15、G1.17、G2.9、G2.10、G2.13。
- 排除：G0.11 本轮不以 UI 交互作为完成声明，Electron 真实 UI 验证按硬门禁留给 Phase 7；G2.11 本轮不改变供应商协议与额度终态。

## 4. 影响圈与作者反证

- 打算改：`src/services/proseWordContract.ts`、`bodyArtifactContract.ts`、`chainExecution.ts`、`stepArtifactAcceptance.ts`、`realSkillExecutor.ts`、`de-ai.js`、`PipelinePanel.vue`、`useDeAi.ts`、相关测试、trace schema、DEV_LOG、经验文件。
- 可能碰到：compose 与 chain 的生成提示词、正文验收、workspace 包装层、运行记录导出、客户 trace 回放、UI 进度显示。
- 作者反证：80% 下限假设用历史 trace 回放统计；后处理门假设用耗时对比；受控合并假设用含 `sourceRefs/status/coveredItems` 的回放样稿证伪。

## 5. 停止条件

- Phase 1：`rg` 生产源码无 60% 默认残留；提示词与验收测试同值；全量服务测试与 type-check 通过。
- Phase 2：回填只改 FACT_LOCK 键，非 FACT_LOCK 字段保留；账本缺失在正文终步阻断。
- Phase 3：所有正文改写路径过契约门，失败回滚并写 trace；不覆盖已验收 attempt。
- 后续 Phase 依次独立验证；任一失败停在上一提交点。

## 6. 执行证据

- Phase 1 RED：`npm run test:services -- src/services/bodyArtifactContract.spec.ts` → 1 failed，旧 60% 断言在 80% 下判 `too_short`。
- Phase 1 迁移：`chainExecution.spec.ts` 断言 3500/2800/7000，并负向断言 `不低于2100字`；`bodyArtifactContract.spec.ts` 迁移为 80%/200%，新增单源一致性测试。
- Phase 1 横向清零：全量测试暴露 `bodyArtifactOrchestrator.spec.ts` 仍断言 `要求不低于6字`，已迁到 `要求不低于8字`。
- 验证：`npm run type-check` → exit 0。
- 验证：`npm run test:services -- src/services/proseWordContract.spec.ts src/services/bodyArtifactContract.spec.ts src/services/chainExecution.spec.ts src/services/stepArtifactAcceptance.spec.ts src/services/stepArtifactFlow.spec.ts src/services/finalStepMetadataReplay.spec.ts` → 6 files / 58 tests passed。
- 验证：`npm run test:services -- src/services/bodyArtifactOrchestrator.spec.ts` → 21 tests passed。
- 清零扫描：`rg -F "不低于2100字"`、`rg -F "要求不低于6字"`、`Select-String 'target \* 0\.6','default 60%'` 生产源码均 0 命中；`chainExecution.spec.ts:290` 的 2100 仅作为负向断言保留。
- 执行纪律自检：Phase 1 实现先于 RED 测试落地一次，随后用真实旧测试取得 RED 证据并补单源测试；多轮工具调用携带空可选参数导致 shell 路径错误，已改为最小调用块并登记为本轮自盲区证据。
- Phase 2 RED：`npm run test:services -- src/services/finalStepMetadataReplay.spec.ts` → 1 failed，历史回放证明受控合并后 `无法核对` 占位残留。
- Phase 2 根因：终步 FACT_LOCK 存在行式 `FACT_LOCK:Key=Value` 与块式 `FACT_LOCK:` 后跟 `Key: Value` 两种合法形态；`目标字数/生成下限` 是字数契约字段而非事实锁，旧整段替换碰巧清掉了它们。受控合并改为：剥离全部终步 FACT_LOCK 事实（含占位与标签漂移），从 S2 权威账本重放；同时从 S2 账本文本回填 `targetWords/minimumWords` 并改写标签行，其他元数据原样保留。
- Phase 2 RED：`recordBodyArtifactPostProcess` 失败后仍保留 `complete`，证明后处理失败可伪装为有效 attempt。
- Phase 2 修复：后处理 `success: false` 时 attempt 状态改为 `execution_invalid`，错误去重保留；不伪造成功。
- Phase 3 RED：`ownerBreakpointClosureWiring.spec.ts` 先断言 `body-post-process-contract-rejected` 事件，初始 0 命中。
- Phase 3 修复：`runProseHardSignalNet`、`legacy-auto` 清洗、`deep-fix` 三条改写路径全部复用 `validateBodyArtifact(finalBody, bodyChainContract)`；失败时记录 attempt、写 `body-post-process-contract-rejected` trace，并阻断交付。
- 验证：`npm run type-check` → exit 0。
- 验证：`npm run test:services` → 188 files / 2124 tests passed。
- 作者反证：历史 trace 回放证明受控合并不吞 `status/sourceRefs/coveredItems/【来源覆盖】`，同时清除 `无法核对` 占位并回填 3500/2800 契约；后处理失败不再能以 `complete` 状态交付。
- Phase 4 RED：`npm run test:services -- src/services/ownerBreakpointClosureWiring.spec.ts` → 1 failed，断言字面量与真实机制不匹配（helper 用 `type` 参数，且实现使用 `templates.length/bodyChainTotalSteps`）。
- Phase 4 语义收窄：终步 generator 账本 guard 补 `templates.length > 1`。该 guard 位于 `mode === "chain" && templates.length > 1` 循环内，单步 compose 走 `composeArtifactContext` 自建 generator 验收，不被强制多步账本语义误伤。
- Phase 4 验证：`npm run test:services -- src/services/ownerBreakpointClosureWiring.spec.ts` → 10 tests passed。
- Phase 4 验证：`npm run type-check` → exit 0。
- Phase 4 验证：`npm run test:services` → 188 files / 2125 tests passed。
- Phase 5 对账：`schemaRetryFeedback.ts/spec.ts` 已由 `4ecfe341` 落地；测试断言 `not.toContain(candidate)`、无 `<<<上一版候选输出开始>>>`，并输出锚点/有界预览/抑制字符数。本分支不重复改动，只修正台账状态。

## 7. 缺口清单

- Phase 1-3 已完成并全量验证。
- Phase 4（无契约静默放行与 generator ledger 正文终步阻断语义）已实现并全量验证，待提交。
- Phase 5（schema retry 反馈不携带候选全文）已由历史提交 `4ecfe341` 完成，本轮经全量测试确认未回归。
- Phase 6（降AI提示词与 SKILL 分权）待开工。
- Phase 7（真实 trace 双语义回放 + Electron UI 硬门禁）待开工。
