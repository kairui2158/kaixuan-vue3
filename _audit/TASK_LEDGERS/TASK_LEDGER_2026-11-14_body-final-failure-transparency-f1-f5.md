# TASK LEDGER · body final failure transparency F1-F5

## 1. 目标与原话

用户原话（2026-11-14）：

> 你诚实的依据经验文件门禁和纪律，把你得找出的根因和得出的结论做一个详细执行可交付方案

上游 trace 证据为 `run-trace-正文层-20261114-102023-deep`：runId `run-1794622823863-1`，seq337/338/339 显示终步结构化失败被吞成 success，seq340 显示终步账本 0 项空转 pass，seq349 显示 trace 状态机 failed 后再跳 success。

最终可感知行为：终步 failed/degraded 不再被降级为字符串 success；终步账本空转不再假通过；run 终态不再被 accepted artifact 短路；失败产物不再写入成功断点；API call 状态不再污染 run 级 trace 状态机。

## 2. 门禁读证

- G0.1：只修终步失败透传、账本空转、终态短路、断点污染、trace 双跳五个已确认根因；不扩大到降AI、供应商、叙事裁判权。
- G0.2：未设置 token/时间/轮次预算。
- G0.4：已复读正文层 LHC、终步对账、run 终态、断点恢复相关 DEV_LOG；生产改法复用既有验收边界，不新增规则。
- G0.6：方案经用户审核确认执行。
- G0.7：正推确认 body orchestrator 能拿到结构化失败并走 targeted repair；反推确认终步账本防空转不会误杀 S2 权威账本为空的合法单步场景。
- G0.9：影响圈覆盖链式执行入口、终步对账、run 终态、断点写入、trace 状态机、测试契约、真实供应商验证。
- G0.10：旧语义「终步 failed 降为字符串」「0 项账本 vacuous pass」「accepted artifact 覆盖 failed」在测试契约中同批退役。
- G0.12：本台账记录门禁读证、路由、影响圈、停止条件、证据与缺陷面。
- G0.13：每项修复都是最小接线或一行条件，不新增预算系统、调度器、UI 或第二裁判。
- G1.4：分层验证覆盖定向回归、type-check、build:vue、Electron 真实供应商 live、全量服务测试。
- G1.11：新契约先迁移旧断言，再增加负向回归。
- G1.14：执行后做改动分支、sibling、写入/读取、旧语义残留、trace 消费面与环境边界枚举。

## 3. 路由判定

纳入：G0.1/G0.4/G0.6/G0.7/G0.9/G0.10/G0.12/G0.13/G1.4/G1.11/G1.14。

排除：

1. 降AI 校准与注入策略：与本缺陷无关，不因本轮放宽或收紧。
2. 叙事裁判权：继续归 SKILL 层，应用只透传裁决不改叙事。
3. 供应商稳定性：已有独立 heartbeat 重试方案，本轮不混入。

## 4. 影响圈与作者反证

打算改的：

- `src/components/pipeline/PipelinePanel.vue`（F1 结构化透传 + F4 断点守卫 + trace 归并）
- `src/services/stepArtifactAcceptance.ts`（F2 内联账本解析 + 防空转闸）
- `src/services/pipelineRunOutcome.ts`（F3 终态优先级）
- `src/stores/runTrace.ts`（F5 ApiCallStatus 生命周期隔离）
- `src/services/stateTransitionGuard.ts`（F5 ApiCallStatus 映射）
- 两个 spec 文件（F2/F3 负向回归）
- 台账、DEV_LOG、主索引、版本与安装包证据

不改但必须对账的：

- `bodyArtifactOrchestrator.ts` 的 `resolveBodyStructuredFailure`（F1 消费端）
- `resolveStepArtifactFlow`（F2 生成步验收路径，不改语义）
- `createChainSuccessBreakpoint` / `createChainFailureBreakpoint`（F4 边界）
- compose 路径终步验收（F4 既有 blocked 守卫）
- 全部 trace 导出消费面

作者反证：

1. 单测绿可能只证明函数层。处置：跑 Electron 真实供应商 live 验证生产接线。
2. F1 提前透传可能漏执行 `executionPlan.onStepOutputs`。处置：确认 orchestrator 接管后续编排；失败路径不需要写成功断点。
3. F4 守卫可能漏 compose 路径。处置：确认 compose 已有 `callerStatus === 'blocked'` 检查；本轮补的链式守卫覆盖的是链式路径独有缺口。
4. F2 内联解析可能与块头格式冲突。处置：两种 pattern 顺序独立，不互相覆盖；spec 双格式覆盖。
5. `npm ci` 可能改变依赖版本。处置：使用既有 `package-lock.json` 锁定版本；修复后重跑全量测试确认 2753 条全绿。

## 5. 停止条件

完成条件：

1. `runStepSkills` 终步 failed/degraded 返回结构化对象，orchestrator 能读到 `callerStatus` 与 `blockingGateFailed`。
2. 终步账本 0 项时返回 `generator_ledger_missing`，不再 vacuous pass。
3. `resolvePipelineRunOutcome` 中 accepted artifact 不能覆盖 failed folder verdict。
4. 链式路径 `callerStatus !== 'success'` 时禁止写成功断点。
5. `finishApiCall` 的事件归入 ApiCallStatus，run 级 trace 状态机不再被单次 API 调用状态污染。
6. 定向回归、type-check、build:vue、Electron live、全量服务测试全部通过。
7. 升版 3.127.7、完整构建、packaging 核验与安装包 hash 归档。

失败条件：任一命令非零；或修复后终步 failed 仍被吞；或 trace 状态机仍出现 failed→success 双跳。

## 6. 执行证据

### F1 · 终步失败透传

- `PipelinePanel.vue` 链式循环改为按 `bodyStepContext` 保留 `callerStatus !== 'success'` 的结构化返回，避免 orchestrator 收到假 success。
- 成功断点写入前加守卫：非 success 候选 throw，不进入 `createChainSuccessBreakpoint`。

### F2 · 终步账本防空转

- `stepArtifactAcceptance.ts` 新增 `FACT_LOCK_INLINE_PATTERN`，支持内联 `FACT_LOCK：key：value`。
- 分段解析 `break` → `continue`，修复提前中断 bug。
- `authoritative.size === 0` 时返回 `generator_ledger_missing`，禁止空转 pass。
- spec 新增：内联账本正常 pass、0 项返回缺失。

### F3 · run 终态短路修复

- `pipelineRunOutcome.ts` 中 `folderStatus === 'failed'` 提前判定失败。
- `finalArtifactAccepted` 成功路径加 `folderStatus !== 'blocked'` 门槛。
- `PipelinePanel.vue` 的 `traceOutcomeFromRun` 改为取 `folderDiagnostics` 最后一条 status。

### F4 · 断点污染守卫

- 链式路径成功断点写入前守卫 `callerStatus !== 'success'`。

### F5 · trace 状态双跳修复

- `runTrace.ts` 的 `finishApiCall` 状态事件从 RunTraceStatus 改为 ApiCallStatus。
- `stateTransitionGuard.ts` 新增 ApiCallStatus 映射，mappings spec 同步。

### 依赖环境修复

npm 切换器导致顶层依赖壳（vue/pinia/marked 等 10 包）和 Electron 二进制缺失。

1. `npm ci --no-audit --no-fund` → 997 packages restored，依赖版本由 package-lock 锁定。
2. `node node_modules/electron/install.js` 从本地缓存解出 `electron.exe`（115 MB zip）。

### 验证结果

| 验证 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run type-check` | exit 0 |
| 定向回归 | 7 files / 118 tests | passed |
| 全量服务 | `npm run test:services` | 251 files / 2753 tests passed |
| Electron IPC | `vitest run electron/ipc` | 8 files / 81 tests passed |
| 前端构建 | `npm run build:vue` | exit 0 |
| 真实供应商 live | `SHENYI_PROVIDER_CHANNEL_LIVE=1` + prov-1793816697590 + glm-5.3 | PASS / 5 requests |
| 真实供应商证据 | `_audit/verification-pipeline-provider-channel-live/report.json` | result=PASS, mode=live-single-supplier |

真实供应商 live 覆盖：UI 选择、持久化、供应商路由、正文层真实请求、模型一致性断言。key 通过 DPAPI 解密桥接，值不落日志。

### 缺陷面枚举（G1.14）

| 面 | 对账结果 |
|---|---|
| F1 变量名错误 | type-check 捕获 `stepArtifactContext` 不存在；已改为 `bodyStepContext` |
| F1 提前 return 副作用 | `onStepOutputs` 与 `clearBreakpoint` 不执行；orchestrator 接管后续编排，失败路径无需写成功断点 |
| F1 echo retry 路径 | echo retry 只在 callerStatus=success 时进入，非 success 已提前透传 |
| F2 块头与内联共存 | 两种 pattern 顺序独立，不互相覆盖；spec 双格式覆盖 |
| F2 0 项防空转误杀 | 单步 S3 输出含 FACT_LOCK 时 authoritative 不为 0，不触发 |
| F2 分段解析提前中断 | `break`→`continue`，后续分号字段全部提取 |
| F3 accepted 覆盖 failed | 负向测试验证 folderStatus=failed 不能被 accepted 短路 |
| F4 compose 路径 | 既有 `callerStatus === 'blocked'` 检查；本轮守卫覆盖链式路径独有缺口 |
| F5 state mappings | mappings spec 同步新增 ApiCallStatus，全量 2753 条过 |
| 依赖壳残留 | npm ci 后 10 包全部恢复实际包内容；Electron dist 完整 |
| 旧测试守护旧行为 | 全量 2753 条通过，无旧断言反噬 |

### Release

版本：3.127.6 → 3.127.7。完整构建与 packaging 核验证据见 DEV_LOG。

### 2026-11-15 回头看校正

对账发现 F3 的接线实现偏离方案：`traceOutcomeFromRun` 曾读取最后一条 `folderDiagnostics`，而方案要求继续使用 `folderDiagnosticsStatus()` worst-of 汇总。该偏差可能让早期 folder failed 被后续 success 诊断遮蔽。已恢复 worst-of 接线并复核全仓 `folderDiagnostics` 读取点，未发现其他 run 终态入口使用 last-entry 语义。定向回归 3 files / 160 tests、全量服务 253 files / 2761 tests、`type-check`、`build:vue` 均 PASS；本轮未重跑真实 Electron 供应商链路。

## 7. 缺口清单与边界

### 已知缺口

1. `deai-model-profile` 仍因 `calibration-not-ready` 未注入，属独立校准门槛，本轮不放宽。
2. `postProcess usage` 未注入，S1 `_perf` 警告仍静默跳过，属独立待办。

### 明确不做的

1. 不新增预算系统、调度器、UI 或第二裁判。
2. 不改 SKILL 模板或叙事裁判权。
3. 不为 trace 观测做二次抑制。
4. 不删除旧兼容层（sanitizeLegacyEnvelopeArtifact 仍服务旧断点迁移）。
