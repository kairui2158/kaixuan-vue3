# TASK LEDGER — 生成流水线 SKILL 链路全量递归审计 V1

## 1. 目标与原话

用户原话：“你现在重新审查整个生成流水线的SKILL链路还有无残缺的设计缺陷，要求严格遵守执行纪律和经验文件门禁，彻底深入递归到最底层。”

最终可感知行为：产出一版只覆盖应用侧平台合同缺陷、可审核、可执行、防过度设计的修复方案；SKILL 侧问题只列入转达清单，不改 SKILL 包。本轮为纯审计，不改业务代码。

## 2. 门禁读证

- G0.1 目标对齐：`_audit/神意开发经验总结_v9.md:6`
- G0.3 诚实闭环：`_audit/神意开发经验总结_v9.md:36`
- G0.4 门禁复读：`_audit/神意开发经验总结_v9.md:45`
- G0.6 方案成熟度：`_audit/神意开发经验总结_v9.md:54`
- G0.12 门禁执行台账：`_audit/神意开发经验总结_v9.md:114-128`
- G0.13 最小必要性与过度设计禁令：`_audit/神意开发经验总结_v9.md:134`
- G1.3 全局层与同款逻辑统一：`_audit/神意开发经验总结_v9.md:162`
- G1.4 验证真实性与分层：`_audit/神意开发经验总结_v9.md:183`
- G1.14 深层根因追踪：`_audit/神意开发经验总结_v9.md:303`
- G1.30 方案语义复核与执行对账：`_audit/神意开发经验总结_v9.md:516`
- G1.31 SKILL 转达载荷对账：`_audit/神意开发经验总结_v9.md:524`

## 3. 路由判定

加入：G0.1/G0.3/G0.4/G0.6/G0.12/G0.13/G1.3/G1.4/G1.14/G1.30/G1.31。本任务是跨层方案审计，必须诚实区分已验证与未验证，台账强制七节，修复建议必须满足最小必要性和承诺到行为复核。

排除：G1.11 测试契约只在“修复执行方案”层引用，本轮未改生产或测试代码；G1.13 Electron 验证执行标准不在纯审计停止条件内，留给用户批准后的执行轮。G2 层正文/章节领域门禁只作为边界依据，未触发对应领域修复。

## 4. 影响圈与作者反证

影响圈：`chainExecution.ts`、`PipelinePanel.vue` 的链路 attempt 状态、`volumeBatchOrchestrator.ts`、`chapterBatchOrchestrator.ts`、三层级 trace 终态、相关 spec。方案批准前不修改任何业务文件。

最可能错：

1. N1 被误判为正文层已修复。证伪：已检查调用点，外层真实模板结果没有传入 attempt start。
2. N4 被误判为有隐藏交付标志。证伪：全仓搜索 `chapterArtifactDelivered` 无命中，章节 finally 仍默认 `finalArtifactAccepted=false`。
3. N2 被误判为修复循环可达。证伪：数量达标后语义失败直接返回 incomplete，未进入 repair 循环。

## 5. 停止条件

完成：识别缺陷全部有 file:line 证据；排除项有反向证据；七节台账完成；方案成熟度分层且不执行修复。

失败：任何缺陷只有推测、任何排除项无反向证据、台账缺节、方案建议越过“应用管平台合同，SKILL 管叙事质量”边界。

## 6. 执行证据

- 审计起点：分支 `codex/direct-write-negative-verification`；HEAD：`6cda8e21`；P1 执行后工作区包含 N1/N2/N4、新增审计文件、真实供应商验证证据与 3.128.3 收尾产物。
- 修复前定向守护测试：`npm run test:services -- --run src/services/chainExecution.spec.ts src/services/pipelineRunOutcome.spec.ts src/services/stepArtifactAcceptance.spec.ts src/services/bodyArtifactOrchestrator.spec.ts src/services/volumeBatchOrchestrator.spec.ts src/services/chapterBatchOrchestrator.spec.ts src/services/chapterBatchModesWiring.spec.ts` → `Test Files 7 passed (7)`，`Tests 154 passed (154)`。
- N1 证据（修复后）：`src/services/chainExecution.ts:503-540` 优先消费真实 `templates`，形状合成入口独立为 `resolveAttemptStartGeneratorIndexByShape`；真实调用点 `src/components/pipeline/PipelinePanel.vue:6687-6690` 传入 `getStepSkillTemplates(4)`。
- N2 证据：`src/services/volumeBatchOrchestrator.ts:328-349`；语义校验 `src/services/volumeGenerationContract.ts:91-115`；repair 循环 `:226-370`。
- N3 证据：Panel 侧二次校验 `src/components/pipeline/PipelinePanel.vue:6039`、`:6416`；orchestrator 内校验 `volumeBatchOrchestrator.ts:328`、`chapterBatchOrchestrator.ts:205`。
- N4 证据（修复后）：章节 `src/components/pipeline/PipelinePanel.vue:6171,6440,6469-6475` 已加入 `chapterArtifactDelivered` 并传入终态裁决；卷纲与正文原有交付标志保持不变。
- 排除证据：`deaiModelProfile.ts:11` 已发布；`realSkillExecutor.ts:1380-1385` postProcess 已传 usage；`stepArtifactAcceptance.ts:220-331` 内联账本与空账本闸在位；`chapterBatchOrchestrator.ts:40-101` folder-chain 任务边界在位；`runTrace.ts:748-766` 已按尾部恢复语义裁决；`PipelinePanel.vue:6343` 的 `maxRepairAttempts:0` 是显式设计并有 `chapterBatchModesWiring.spec.ts:49` 守护。

## 7. 缺口清单与 DEFECT-SWEEP

缺口：真实 Electron UI 与真实供应商验证未执行，因为本轮纯审计且未批准修复；SKILL 包不在本轮修改边界。属方案批准后执行项。

缺陷面枚举：

| 命中 | 分支 / 调用点 / 协议 | 处置 |
| --- | --- | --- |
| N1 | 同类 sibling：`resolveBodyGeneratorStepIndex` 真实模板与 `resolveAttemptStartGeneratorIndex` 合成模板双口径 | 列入方案 P1 |
| N2 | 卷纲 complete 校验失败分支与 short/error/repair 分支语义不一致 | 列入方案 P1 |
| N3 | 卷/章 Panel 与 orchestrator 双裁判候选 | 列入低优复审，不立即删 |
| N4 | 卷/章/正文三个 finally 的产物交付标志 sibling | 列入方案 P1 |
| 排除 A | legacy 正文交接残留 | 已排除：`chainExecution.ts:191-197` 仅为格式化兼容 |
| 排除 B | folder-chain JSON 协议冲突 | 已排除：卷/章边界注记与 spec 在位 |
| 排除 C | 画像与 usage 注入 | 已排除：代码行见第 6 节 |
| 排除 D | 正文结构化失败吞态 | 已排除：`bodyArtifactOrchestrator.ts:90-104` 与 `PipelinePanel.vue:5000-5033` 在位 |
| 排除 E | 空账本 vacuous pass | 已排除：`stepArtifactAcceptance.ts:312-331` |
| 排除 F | folder 诊断任一 failed 锁存 | 已排除：尾部恢复语义在位 |
| 排除 G | 章节 `maxRepairAttempts:0` | 设计决策，列报告，不修复 |

[DEFECT-SWEEP] 已完成 G1.14 四面枚举：分支、sibling 写入者/读取者、旧协议残留、链式字段三列对账；结果引用本节清单与 `_audit/PROPOSAL_2026-11-16_PIPELINE_SKILL_CHAIN_FULL_AUDIT_V1.md`。

## 8. 批准后执行对账

| 项 | 语义对账 | 结果 |
| --- | --- | --- |
| N1 | attempt-start 不再重新合成 body 模板形状；`meta > fallback`、compose、previous-state 优先级保持。真实 body 调用点传入现役模板。 | 已闭环；非标 meta 负向测试通过。 |
| N2 | 数量达标后的语义失败复用既有有界修复循环；完整卷保留，失败卷释放并加入禁止重用名单；`previousErrors` 进入修复提示；耗尽后不交部分产物。 | 已闭环；执行中发现并补上 rejected 卷名的显式 forbidden 名单，负向测试通过。 |
| N4 | 章节产物通过 Panel 校验、台账校验、持久化与批次边界事件后才置 delivered；finally 用同一终态裁决函数。无产物、显式失败和阻断仍维持 failed/blocked。 | 已闭环；wiring 守护通过。 |
| N3 | 本轮不改。Panel/orchestrator 双裁判仍保留为防线。 | 后续 P3 独立对账。 |

验证：N1/N2/N4 新增/更新负向守护通过；全量 `npm run test:services` 253 files / 2784 tests PASS；`npm run type-check` 通过；`npm run build:vue` 通过；`npm run verify:production-wiring` 通过（593 modules / no violations）；真实供应商 Electron 烟测 PASS，报告为 `_audit/verification-pipeline-provider-channel-live/report.json`，三层 run 均 `succeeded`，5/5 供应商请求成功，模型与 trace/apiCall/provider-request 三面一致为 `glm-5.3`，凭证来源仅记录 `environment`，不落 key；`npm run verify:packaging` 通过，版本 3.128.3。
