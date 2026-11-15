# 正文层失败拓扑收口执行方案 V1.1

日期：2026-11-16（V1.1 复审后）  
上游依据：`_audit/PROPOSAL_2026-11-16_BODY_LAYER_DESIGN_REAUDIT_V1.md`  
性质：修复方案。只收口既有机制的消费面与装配语义，不新增裁判、调度器、预算系统或 UI 面板。

## 目标

把正文层从“成功路径可用”推进到商业标准的“失败路径可审计、不可污染”：失败骨架不再作为生成权威，targeted prompt 不再与链式注入互相矛盾，S2/S3 权威账本只来自结构化成功产物，恢复观测能明确区分“曾失败后恢复”，并补齐真实代码级回归。

## V1.1 复审结论

V1 的方向成立，但四处实现假设在当前代码中不成立：legacy 骨架会被误判为可修复 body；失败装配面继承上游 metadata；targeted 新鲜上游没有进入权威账本源；prompt 契约字段无法在时序上预知上游裁决。V1.1 修正如下，全部收敛为更小实现：

1. `hasRepairableBody` 先用 `isGeneratorEnvelopeArtifact` 限定 S2/S3 信封，再取信封 body；不新增 `failedStepRole`。
2. P0-1 不新增 `upstreamContract` 字段；失败语义由 P0-1 在真实执行点收口，prompt 措辞只做条件化。
3. P0-1 接受上游后同步 `completedStepOutputs` 与权威账本；失败分支 metadata 置空，断点产物补 `callerStatus`。
4. 恢复语义新增 `folderDiagnosticsRecoveryKind` 与 `recoveredFromFailed`；不推翻已有 tail recovery，也不引入第三套状态。

V1.1 同时删除了三个 V1 多余面：`failedStepRole`、`upstreamContract`、`body-generator-ledger-authority-rejected`。理由分别是路由已有 body 单源、字段在 buildPrompt 时序不可靠、P0-1 事件已覆盖账本拒绝。删除不是缩小目标，而是把同一语义压回已有消费面。

## 方案成熟度

| 层 | 结论 |
| --- | --- |
| 执行器/工具层 | 成熟（V1.1 修正已对账） |
| 应用方案/交互闭环 | 成熟 |
| 实现接线 | 成熟（含可检阻断，见 P0-2） |
| 验证标准 | 成熟（分两级：可立即执行与需真实模型烟测） |

## 复审核证锚点

| 修正点 | 当前代码锚点 | 结论 |
| --- | --- | --- |
| legacy 骨架形状 | `src/services/bodyArtifactOrchestrator.ts:87`；`src/services/chainExecution.ts:384` | V1 的统一 body 判定确实会把 S1 骨架误判为可修复 |
| 失败装配继承 | `src/components/pipeline/PipelinePanel.vue:4975-4983`、`:5285-5305` | failed/blocked 分支当前写入 `metadata: upstreamStepMetadata || undefined` |
| 断点形状 | `src/services/chainBreakpoint.ts:13` | 当前产物无 `callerStatus`，下游只能靠 output 形状猜来源 |
| targeted 上游 | `src/components/pipeline/PipelinePanel.vue:4574-4610` | 上游选择只看 envelope/非空，不看 callerStatus |
| 权威账本 | `src/components/pipeline/PipelinePanel.vue:4560-4573`、`:5160-5168` | 生成步只从 artifactFlow 赋值，targeted 新鲜上游未同步到 resume 输出 |
| 恢复裁决 | `src/stores/runTrace.ts:748-766`；`src/services/pipelineRunOutcome.ts:24-64` | tail recovery 已存在；恢复来源未细分 |

放行条件：执行期间任一 Phase 出现“现有消费面与假设不符”，必须停止本 Phase，登记发现并重对影响圈，不得顺手扩大改动。

## 门禁结论

### G0.13 最小必要性五问

1. 用户目标是否必须依赖：是。失败骨架污染事实账本、prompt 双语权，都直接导致“成功但内容错了”。
2. 现有机制为什么不够：`acceptStepArtifact` 已拒失败下游 payload，但 targeted 修复仍按产物形状消费失败上游；prompt 组装层与执行计划缺少共同声明。
3. 是否增加延迟、状态纠缠或冲突：无。判定复用 `callerStatus`、`extractedWordCount`、`parseGenerationResult`，最多增加常量时间检查。
4. 删除会不会损失用户价值：会。删除后 K88 污染路径复发，S2/S3 可对失败事实做打磨。
5. 有无更小实现：本方案即最小面。不引入产物状态机、第三套验收器、新重试策略或独立修复编排器。

### G0.7 正反推

正推：`acceptStepArtifact` 在 `src/services/stepArtifactAcceptance.ts:452-487` 对 failed/blocked 返回 `downstreamPayload:null`；但 targeted 修复在 `src/components/pipeline/PipelinePanel.vue:4587-4608` 只查产物形状，`buildChainSkillPrompt` 仍把上游 raw 注入 S2。K88 EVT23/EVT35/EVT118 证实失败 S1 账本被 S2/S3 继承并 9/9 对账。

反推：仅修 repairScope 路由不够，因为 targeted 成功时仍需复用成功上游；仅拦 S1 不够，因为失败可发生在任一前置步；仅拦 prompt 不够，因为 `authoritativeGeneratorMetadata` 还会直接继承 `upstreamStepMetadata`。因此必须同时覆盖路由、注入、权威账本三条消费面。

爆炸半径：真实生成主链、恢复重跑、断点恢复、structured failure、trace 对账、终态裁决。预计爆炸半径为 7 文件/目录内，不需要全仓重构。

## P0-1 失败上游不得直接消费

**文件**：`src/components/pipeline/PipelinePanel.vue:4567-4608`

**改动**：

1. targeted 上游选择前，只允许两类上游：
   - `executionPlan.upstreamStepOutputs` 中非失败步，且 `output` 通过现有产物形状检查；
   - 或 `acceptStepArtifact` 裁决为 `accept` 且 `callerStatus` 为 success/degraded。
2. 新增局部 helper `isFailureArtifactSource(output: ChainBreakpointStepOutput, fallbackStepIndex?: number)`：优先读 `callerStatus`；缺字段时按保守 fallback 判定，避免旧断点数据误恢复。legacy 骨架在任何 targeted 上下文都不得作为可修复正文。
   `callerStatus` 读取顺序：`ChainBreakpointStepOutput.callerStatus`；旧数据缺字段时，S2/S3 非信封按失败来源处理，S1 非空骨架在 targeted 上下文也按失败来源处理。
3. 失败上游命中时，`startSi = 0`、`current = prompt`、`upstreamStepMetadata = null`、`authoritativeGeneratorMetadata = null`，并发出 `body-targeted-repair-upstream-rejected` 事件，携带 `sourceStepIndex/callerStatus/reason`。
4. 拒绝上游时同时清空 `completedStepOutputs`，禁止旧 resume 输出在整链重跑时继续存在。
5. 不改变 G2.9 targeted-first：失败产物无 body 走本条兜底整链；失败产物有 body 且后续裁决给出 targeted 时，仍按 targeted 重写。

## P0-2 repairScope 精确路由

**文件**：`src/services/bodyArtifactOrchestrator.ts:80-105`、`:300-354`

**改动**：

1. `structuredFailure` 补充最小字段：`hasRepairableBody: boolean`。不新增 `failedStepRole`：路由由 body 形状单源判定，多余角色字段会被后续消费面当成第二裁判。
2. `resolveBodyStructuredFailure` 接收该可选值；返回类型向后兼容，旧调用继续成立。
3. `hasRepairableBody` 只按现役形态判定：S2/S3 LHC 信封取 `parseGenerationResult(output).body`；legacy 骨架即使非空也不是可修复正文。实现为：
   ```ts
   const hasRepairableBody = isGeneratorEnvelopeArtifact(output)
     ? parseGenerationResult(output).body.trim().length > 0
     : false
   ```
4. `structuredFailure.hasRepairableBody` 是 S2/S3 信封正文形状判定；legacy 骨架不参与这条 targeted 重写路径。
5. 路由规则：
   - `handoff_not_ready` 保持 targeted；
   - `quality_failed + hasRepairableBody=true` 保持 targeted；
   - `quality_failed + hasRepairableBody=false` 直接 full_chain；
   - 其余按现有 targeted-first。
6. 解析器复用现有生产口径，不引入第二个解析器；可检阻断不变。

**可检阻断**：无信封 body 一律按 full_chain 处理。此条不改变 P0-1。

## P1-1 prompt 组装语义单源

**文件**：`src/services/bodyArtifactOrchestrator.ts:230-267`

**改动**：

1. 不新增 `upstreamContract` 字段：`buildPrompt` 在 `runStepSkills` 前执行，无法预知 P0-1 是否已接受上游，新增契约字段会制造第二份时序声明。
2. `buildPrompt` 按本次修复语义措辞条件化：失败/整链明确“若上游不可用，请从头重新生成完整正文；本请求不授权任何旧稿为事实权威”。成功上游 targeted 场景继续依赖链式注入既有全文，不重复声明相反语义。
3. `buildChainSkillPrompt` 不改模板 API；P0-1 保证失败上游不进入 current 后，prompt 双语权消失。

## P1-2 权威账本只来自结构化成功步

**文件**：`src/services/chainBreakpoint.ts:13`、`src/components/pipeline/PipelinePanel.vue:4567-4576`、`:5160-5168`、`:4949-4984`、`:5285-5305`

**改动**：

1. 生成步在 `resolveStepArtifactFlow(...).decision === 'accept'` 且 continueChain 为真时，权威账本取 `artifactFlow.metadata`；`acceptStepArtifact` 已对 caller failed/blocked 返回 reject，不需要重复过滤。
2. `disableBreakpointReplay + reuseArtifacts` 分支接受新鲜上游后，先把 `completedStepOutputs` 同步为新鲜列表；权威账本再从最终列表按生成步索引解析。
3. 断点恢复路径只有该步 callerStatus 为 success/degraded 且 `resolveStepArtifactFlow(...).continueChain === true` 时才作为权威账本；失败/未知一律 null。
4. `ChainBreakpointStepOutput` 增加可选 `callerStatus`；P0-1 的成功/失败装配面必须写入该字段。
5. 空账本继续走既有 `generator-ledger-missing`，不新增错误码。
6. 不新增 `body-generator-ledger-authority-rejected`：P0-1 的上游拒绝事件与既有账本缺失事件已覆盖该语义，新增第三种事件会稀释观测单源。

## P1-3 恢复观测补齐

**文件**：`src/services/pipelineRunOutcome.ts:17-58`、`src/stores/runTrace.ts:748-766`、UI 消费点

**改动**：

1. `folderDiagnosticsStatus` 返回保持兼容；新增独立导出 `folderDiagnosticsRecoveryKind`：`none`、`recovered_from_degraded`、`recovered_from_failed`。不改变现有聚合裁决函数。
2. `resolvePipelineRunOutcome` 增加返回字段 `recoveredFromFailed`；保留 `recoveredFromDegraded` 兼容现有消费面。新增可选输入 `folderRecoveryKind`，传入时优先于从 degraded API 推断。
3. 只迁移 `PipelinePanel.vue:2030-2036` 与卷纲/正文两个 recovered 事件消费点；禁止全仓重命名旧字段。
4. `PipelinePanel.vue:6087` 卷纲与 `:6979` 正文 recovered 事件按来源分别写 `recovered_from_failed` 或 `recovered_from_degraded`，正文事件文案必须明确“曾失败后恢复成功”。

## P2-1 测试矩阵

**新增/修改文件**：

- `src/services/bodyArtifactOrchestrator.spec.ts`
- `src/services/stepArtifactAcceptance.spec.ts`
- 新增 `src/stores/pipelineRunOutcome.recovery.spec.ts`（若现有 spec 已含同面，则并入现文件）

必须覆盖且逐项有断言：

1. failed S1 + 3177 字骨架：S1 被拒，S2 不注入骨架与账本，走 full_chain。
2. blocked S1 + 非空骨架：同上，且 reason 保留 blocked 来源。
3. failed S2 + LHC body：targeted 重写；S2 成功后 S3 消费成功信封。
4. failed S2 + 无 body：full_chain。
5. success S2 + 正常 LHC：targeted 场景复用成功上游；失败/整链 prompt 明确不授权旧稿。
6. 失败步 metadata 不得成为 authoritative，触达终步必须 generator-ledger-missing。
7. inline FACT_LOCK 提取非空；0 项仍 generator_ledger_missing，不得 pass。
8. final body 与权威 FACT_LOCK 分歧：divergence + body-final-step-fact-divergence。
9. recoveredFromFailed 与 recoveredFromDegraded 分开。
10. historical failed + 最终产物通过：终态仍 success_with_warnings，不回退旧锁存。

## P2-2 真实 Electron 模型烟测

**预置**：用户提供现役 API key 与 endpoint；选用正文层 deep 模式。

**顺序**：

1. 构造失败注入夹具（临时配置或测试开关，不污染真实 SKILL 包）触发 S1 failed + 非空骨架。
2. 验证 trace：`body-targeted-repair-upstream-rejected`、S2 prompt 无失败账本、无失败 FACT_LOCK、repairScope=full_chain。
3. 人工成功样章跑 targeted：验证成功 S2 信封仍作为 authoritative。
4. 导出 trace 核对恢复语义：终态、`folderRecoveryKind`、recovered 事件。

**烟测不通过时**：修复缺陷、重跑矩阵，不做降级豁免；供应商不可用只重试轮换不临时放宽合同。

## P2-3 合同级 E2E

使用现有 Playwright/Vue 测试基建：

1. 正常生成链：终态 success_with_warnings、断点不含失败候选、成功正文可写入。
2. S1 failed 夹具：终态 failed、无成功断点、UI 失败原因含 caller_failed。
3. targeted 恢复夹具：终态 success_with_warnings、正文写入、`recoveredFromFailed=true`。

## P3-1 文档与经验同步

1. 更新 `docs/应用全维度摸底文档_V3.128.md` 新架构正文失败拓扑节。
2. 更新 `_audit/SKILL_HANDOFF_BODY_LAYER_FULL_PIPELINE_SPEC_2026-11-14.md` §9 现役指纹。
3. 更新 `_audit/DEV_LOG_MASTER_INDEX.md` 与新增 DEV_LOG，登记七面影响圈与证据。
4. 不修 SKILL；涉及 SKILL 责任的发现只做边界明确的交接记录。

## P3-2 交付收尾

1. `npm run test:services`
2. `npm run type-check`
3. `npm run build:vue:test`
4. `npm run verify:production-wiring`
5. Playwright E2E 对应目录
6. Electron 真实模型烟测
7. 版本升级、提交、封装、清理临时产物；归档 `_audit/tmp-k88-trace-evidence.json`

## 执行台账

本任务按 G0.1 产出七节台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-16_body-failure-topology-v1.1.md`；执行完成后新增 DEV_LOG 并由总索引追加链接。台账未关闭前不得宣称交付完成。

**命令失败处理**：任何一级失败禁止跳到下一级。非本方案触发的既有失败先复现、隔离、登记；确属本方案引入必须先修。

## 执行顺序与闭环

1. P0-1 + 定向回归 → 通过后 P0-2。
2. P0-2 + 定向回归 → 通过后 P1-1。
3. P1-1 + 定向回归 → 通过后 P1-2。
4. P1-2 + 定向回归 → 通过后 P1-3。
5. 全量服务测试 → type-check → build:vue:test → dependency-cruiser。
6. Playwright 合同级 E2E → Electron 真实供应商烟测。
7. 文档/DEV_LOG/版本/封装收尾；归档临时证据。

## 影响圈七面

| 面 | 改动 |
| --- | --- |
| 生产入口 | 正文层 body orchestration 与 targeted 修复 |
| 服务层 | orchestrator、stepArtifactAcceptance、runTrace、runOutcome |
| UI | PipelinePanel 主链；恢复标签由现有状态显示承担，不新增面板 |
| 测试 | bodyArtifactOrchestrator、stepArtifactAcceptance、pipelineRunOutcome、Playwright |
| 脚本 | 仅复用现有验证脚本；临时夹具按 G1.21 处理 |
| 规格/文档 | 交接 spec、摸底文档、DEV_LOG |
| trace/日志 | 新增 1 个窄事件；细化 recovered 语义；不加第三套状态 |

## 外部参考说明

已按要求尝试外部协作检索。GitHub 检索命中的仓库与本应用失败拓扑无关，不作为实现依据；本方案仍以本地代码与 K88 trace 证据为准，不引入外部模式造成额外语义负担。

## V1.1 执行期登记

P0-10：执行期确认调用级 blocked 只在 finalArtifactAccepted=false 时阻断终态；run/owning 级 blocked 仍权威。该补全属失败拓扑同源语义，已由 pipelineRunOutcome.spec 14/14 PASS 覆盖。
