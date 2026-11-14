# 方案 · 正文层生成步失败接线与定点修复形态（V1）

状态：待用户审核
日期：2026-11-14
上游证据：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-14_phase-b-observation-closure-v1.md`
规则基准：`_audit/神意开发经验总结_v9.md`（v10.4.1）

## 1. 目标与原话

用户对当前缺陷线的目标原话：

> 我看方案里还留有Phase B的后续项目，你根据经验文件里的相关门禁和执行纪律来做方案

Phase B 观测运行失败后登记出两个应用侧接线缺陷。本方案只修这两处：

1. **W1 · 生成步失败不落验收账本**：`runStepSkills` 内层在 `bodyStepContext && callerStatus !== 'success'` 时提前 `return stepResult`，跳过 `resolveStepArtifactFlow`、`body-step-acceptance` trace、`rememberBodyStepAcceptance` 与 `completedStepOutputs.concat`。结果是失败步产物不进 `stepAcceptanceDecisions` 和 `completedStepOutputs`，后续状态机看不到结构化失败证据。
2. **W2 · 定点修复把 S1 骨架误判为不合格上游**：`disableBreakpointReplay + reuseArtifacts + startSi > 0` 统一查找 `skillIndex === startSi - 1`，并要求上游产物通过 `isGeneratorEnvelopeArtifact`。当 `startSi === resolvedGeneratorIndex`（S2 定点修复）时，查找对象是 S1 的 legacy 行合同骨架，必然 `upstream_artifact_invalid` 并降级 `startSi=0` 全链重跑。

## 2. 现状读证

| # | 事实 | 证据 |
|---|---|---|
| 1 | 失败步在进入验收流程前提前返回 | `src/components/pipeline/PipelinePanel.vue:4934-4938` |
| 2 | 结构化失败承载字段存在且当前未被消费到 artifact flow | `src/services/stepArtifactAcceptance.ts:46-52` |
| 3 | 定点修复固定取上游 `startSi - 1` | `src/components/pipeline/PipelinePanel.vue:4571-4579` |
| 4 | 上游产物必须通过生成器信封结构闸 | `src/components/pipeline/PipelinePanel.vue:4580-4583` |
| 5 | `isGeneratorEnvelopeArtifact` 要求 JSON body 与非空 `extractedMeta` | `src/services/chainExecution.ts:384-398` |
| 6 | S1 现役是 legacy 字符串 + `【正文交接】`，不是 S2/S3 JSON 信封 | `Task Ledger` 已登记 + `parseGenerationResult` 双形态边界 |
| 7 | 观测 trace 实测失败 S2 后 `stepAcceptanceDecisions=[]`，随后 targeted 降级全链 | `_data/deai-stage-guidance-live-exports/20261114-064747/.../run-trace.json` seq 226/227 |

## 3. G0.13 最小必要性五问

1. 用户目标必须依赖什么？——真实失败步必须留下验收账本，定点修复必须能从合法上游形态重跑。
2. 不新增什么？——不加预算系统、调度器、UI、第二裁判、新修复策略、新 trace 字段。
3. 为什么只改两处接线？——失败不是“需要新验收器”，而是已有 artifact flow 被早退绕过；也不是“需要新路由策略”，而是 S1 骨架被错误套用 S2/S3 信封合同。
4. 是否产生新状态？——否。只把已有结构化结果送入既有 artifact flow，并按已有步骤索引区分上游形态。
5. 删除什么？——无。不退役协议，不改叙事裁判，不改平台合同。

## 4. 修复承诺（到行为）

### W1 · 失败步记录后透传（`PipelinePanel.vue`）

触发路径：`bodyStepContext` 存在且 `stepResult.callerStatus !== 'success'`。

行为承诺：

1. 先执行与成功路径同源的 `resolveStepArtifactFlow`。验收应返回 `reject`，`errors` 含 `caller_failed`，并保留原始 `callerStatus/blockingGateFailed/errors`。
2. 写入 `body-step-acceptance` trace，`level=error`。
3. 执行 `rememberBodyStepAcceptance`。
4. 将该步结构化输出并入 `completedStepOutputs`。
5. 不写成功断点；`PipelinePanel.vue:5229` 的成功断点 guard 保持不动。
6. 不进入 echo-retry 或 deai-stage-guidance；这些路径继续由 `callerStatus === 'success'` guard 控制。
7. 在返回前调用 `executionPlan.onStepOutputs(completedStepOutputs)`，让 body orchestrator 收到失败验收账本。
8. 返回原 `stepResult` 不变，不把 failed/degraded 伪装成 success。

不可接受：早退仍跳过 trace/账本；把失败包装成 success；写入成功断点；新增第二次失败修复。

### W2 · 定点修复区分 S1 骨架与生成器信封（`PipelinePanel.vue`）

触发路径：`executionPlan?.disableBreakpointReplay` 且 `executionPlan.reuseArtifacts` 且 `startSi > 0`。

行为承诺：

1. 保留按 `skillIndex === startSi - 1` 查找上游产物，避免把失败 S2 信封误当 S1 骨架。
2. 当 `startSi === resolveBodyGeneratorStepIndex(templates).index`（即从生成步定点开始）时，S1 上游是 scaffold/context，不是生成器信封：
   - 接受条件：`parseGenerationResult(upstream.output).body.trim().length > 0`；若 legacy 解析无 body，则 `upstream.output.trim().length > 0` 兜底。
   - 接受后 `current = upstream.output`，`upstreamStepMetadata = upstream.metadata || null`，允许从生成步 targeted 开始。
3. 只有 `startSi` 等于生成步自身 index 且复用生成步自身产物时，才继续要求 `isGeneratorEnvelopeArtifact`。断点 replay 路径不动。
4. 不满足对应形态时，仍按现行为降级 `startSi=0`，并写 `body-targeted-repair-artifact-missing`。

不可接受：无索引查找导致失败 S2 被误消费；给 S1 增加信封合同；把上游质量当应用裁判；修改 checkpoint replay 语义。

## 5. G0.7 正反推研磨

正推：W1 把已存在的结构化失败接进既有 artifact flow；W2 按步骤角色区分合同形态。两处均为接线修复，不新增体系。

反推 1：失败步没有 output 怎么办？——`output` 类型为字符串；空串也会 concat 并入账本。验收失败不依赖 output 非空。若后续函数对空串有断言，用现有 `String(stepResult.output || '')` 传入，不改字段语义。

反推 2：`resolveStepArtifactFlow` 对 failed/degraded 会不会通过？——调用点保留 callerStatus；验收边界已知 `caller_failed` 为不可接受，预期 `reject`。测试必须复制该失败形状，不允许 mock 成 success。

反推 3：失败 S2 信封会不会被 W2 误当 S1？——不会。查找条件是 `skillIndex === startSi - 1`；从 S2 targeted 开始时 startSi 是 S2 index，只能找到 S1。

反推 4：非生成层 targeted 会不会被改动？——只有 `startSi === generatorIndex` 分支放宽 S1 scaffold；其他 targeted 仍走原信封/原逻辑。影响圈收敛在同一代码块。

反推 5：checkpoint replay 会不会被 W2 影响？——checkpoint replay 在 `!disableBreakpointReplay` 分支；本改动只限 `disableBreakpointReplay + reuseArtifacts`。

反推 6：W1 里调用 `onStepOutputs` 后上游会不会重复接收？——返回后由既有 orchestrator 生命周期接一次；若现有 success 路径已在其后调用同一回调，则失败路径复用同一出口，不新增双调用点。实现前以测试锁定调用次数。

反推 7：验收拒绝会不会反向影响终态？——不会。W1 返回原结构化结果；终态仍由 body orchestrator 结构化验收决定，不因账本记录变 success。

## 6. G0.9 影响圈

| 面 | 判定 | 说明 |
|---|---|---|
| 应用平台合同 | 改 | 失败步保留结构化验收证据，符合应用管合同 |
| SKILL 叙事裁判 | 不动 | 不读改 folder SKILL，不新增叙事判断 |
| 正文主链 success 行为 | 不动 | W1/W2 只覆盖非 success 与 targeted-from-generator 输入形态 |
| checkpoint replay | 不动 | 影响圈只限 `disableBreakpointReplay` |
| trace | 只增事件语义 | 复用 `body-step-acceptance` 与 `body-targeted-repair-artifact-missing`，不新增字段 |
| UI | 不动 | 不加徽章、按钮、状态卡 |
| folder SKILL | 不动 | 不修改模板/meta |

## 7. G1.4 验证分层

| 层 | 范围 | 方式 | 判定 |
|---|---|---|---|
| 聚焦 spec | W1 失败步 | 复制 B2 失败形状：`bodyStepContext + callerStatus='failed' + blockingGateFailed=true`，断言 trace、acceptance、completedStepOutputs、onStepOutputs、返回值保持 failed | 新增/扩展聚焦测试全过 |
| 聚焦 spec | W2 targeted-from-generator | S1 legacy 骨架 + `startIndex=generatorIndex`，断言不降级 startSi=0；失败 S2 信封按索引查找不会替代 S1 | 新增/扩展聚焦测试全过 |
| 回归 | 现有成功路径与 checkpoint replay | `npm run test:services` | 全绿 |
| 静态 | 类型与构建 | `npm run type-check && npm run build:vue` | exit 0 |
| 真实 Electron | 真实 folder-chain / 真实供应商 | 用既有 live 验证器或人工复跑失败路径，产出 trace | `stepAcceptanceDecisions` 非空；不再出现 S2 targeted 误降级全链；失败不被吞 |

真实供应商稳定性不作为本修复的发布门禁；若 deep 供应商超时导致业务失败，只要失败证据链完整且 W1/W2 行为可见，即验证通过并登记供应商观测项。

## 8. 机器可判定停止条件

完成条件：

1. W1/W2 聚焦 spec 全过。
2. `npm run test:services` 全绿。
3. `npm run type-check` exit 0。
4. `npm run build:vue` exit 0。
5. 真实 Electron 复跑导出 trace 中：failed/degraded 步有 `body-step-acceptance` 且 `stepAcceptanceDecisions` 非空；targeted-from-generator 不再因 S1 legacy 骨架报 `upstream_artifact_invalid`。
6. 台账七节补齐、DEV_LOG/STACK 索引收尾。
7. 单独 git commit，工作区干净。

失败条件：任一不满足则不宣称闭环；登记具体缺口，不改判定标准。

## 9. 过度设计自检（G0.13）

只改两个既定接线点，不新增策略、预算、调度、UI、第二裁判、兼容层或迁移。W1 复用既有 artifact flow；W2 只加一个按生成步 index 的形态分支。没有“修一件事建一套系统”。

## 10. 成熟度结论（G0.6）

| 层 | 结论 | 说明 |
|---|---|---|
| 执行器/工具层 | 成熟 | 现有测试/构建/live 验证链路可复用 |
| 应用方案/交互闭环 | 成熟 | 行为边界、影响圈、负向样本已定义 |
| 实现接线 | 待执行 | 方案已读证并承诺到行为，未获批准前不改产品代码 |
| 验证标准 | 成熟 | 分层验证与机器可判定停止条件齐备 |

结论：可执行，待批准。

## 11. 经验文件对账

| 门禁 | 对账 |
|---|---|
| G0.1 | 目标只锚定 Phase B 登记的两个接线缺陷 |
| G0.2 | 不设预算 |
| G0.4 | 已读上游台账与相关代码锚点 |
| G0.6 | 第 10 节 |
| G0.7 | 第 5 节 7 条反推 |
| G0.9 | 第 6 节七面影响圈 |
| G0.11 | 真实验证使用真实 UI/folder-chain，不冒充 SKILL |
| G0.12 | 台账骨架同步创建 |
| G0.13 | 第 3/9 节 |
| G1.4 | 第 7 节 |
| G1.14 | 第 6 节 + 7 条反推 |
| G1.17 | 真实 Electron 复跑为发布证据，不以 mock 代替 |
| G1.21 | 不引入临时散脚本，聚焦 spec 走现有测试体系 |
| G1.30 | 第 4/8 节 |
| G2.10 | 不改 SKILL 叙事边界；应用只修平台合同接线 |

