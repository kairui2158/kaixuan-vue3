# 方案：owner 断点生命周期闭环与正文修复反劫持

版本：v1.1（已实施；2026-10-16 用户确认待确认点按建议执行）

## 1. 问题定性

这不是单点清理漏改，而是状态生命周期没有闭环：

- P0：chain 成功终态写入 owner 槽，但清理仍作用于共享槽，成功断点永久残留。
- P0：`getChainResumePoint` 把“已完成链”断点当作可恢复状态，`startIndex` 越界导致循环零执行并静默返回旧产物。
- P0：修复 attempt 无请求指纹，零物理请求也能被记录成一次正常修复。
- P1：folder `degraded` 输出被当作有效产物继续流转。
- P1：长度契约在终链后验收，S2 长度缺口被推迟到 S3 才暴露。
- P1：终步 echo 阈值按词面重合度触发修复，误伤“保留事实、只改表达”的 S3 打磨职责。

## 2. 修复目标

1. 每个 owner 断点写入点都有对称清理；成功终态后不残留可被消费的成功断点。
2. 已完成链断点不得作为恢复点回放旧产物。
3. 每次修复 attempt 可被请求指纹证真或证伪；零请求 attempt 不得冒充修复。
4. 验证矩阵覆盖 chain 模式的四种进入状态，禁止再用 compose 证据冒充 chain 证据。

## 3. 生命周期对账表

| 状态 | 槽位 | 写入 | 读取 | 清理 | 终态语义 |
|---|---|---|---|---|---|
| chain 成功断点 | `pipeline_breakpoint_owner_${ownerKey}` | `PipelinePanel.vue` 每个 skill 成功点 `saveBreakpoint(createChainSuccessBreakpoint(...))` | `PipelinePanel.vue:2871` `refreshBreakpoint(checkpointOwnerKey)` | 待修：成功终态必须 `clearBreakpoint(checkpointOwnerKey)` | 已完成链不得被恢复点消费 |
| chain 失败断点 | 同上 | `saveBreakpoint(createChainFailureBreakpoint(...))` | 同上 | 成功重跑或显式丢弃时清理 | 失败步骤可恢复重试 |
| 章节批次断点 | `pipeline_breakpoint` 共享槽 | `PipelinePanel.vue` 章节批次路径 | `refreshBreakpoint()` | `clearBreakpoint()` | 显式保留的共享槽例外 |
| coCreation 断点 | coCreation owner 槽 | `coCreation.saveBreakpoint()` | `workspaceSkillEngine` adapter | `coCreation.clearBreakpoint(ownerKey)` | 与 pipeline chain 不共享槽 |

## 4. 修复项

### F1 清理对称化

- chain 成功终态将 `PipelinePanel.vue:3390` 改为 `clearBreakpoint(checkpointOwnerKey)`。
- `clearBreakpoint(ownerKey)` 失败时不得吞错：任务进入可恢复失败，写 `chain-breakpoint-clear-failed` trace 事件。
- 章节批次共享槽保持不变，并用测试继续证明共存。

### F2 已完成链拒绝恢复

- `getChainResumePoint` 检测 `bp.status === 'success' && legacyNext >= skillSequence.length` 时返回 `resumed: false` 且 `completedChain: true`。
- `runStepSkills` 对 `completedChain` 显式处理：按 fresh run 从 0 执行，并写 `chain-completed-checkpoint-rejected` 事件；不得落入 for 循环零执行。
- 失败断点恢复逻辑保持不变。

### F3 attempt 请求指纹

- `bodyArtifactOrchestrator` 的 `BodyArtifactCallContext` 增加 `attemptId`、`requestToken`。
- `callBodyApi` 返回 `{ text, requestFingerprint }`，指纹包含物理请求数、prompt hash、输出 hash、resume 事件计数。
- attempt 台账记录 `physicalRequests`、`promptHash`、`outputHash`、`resumedFromBreakpoint`。
- 验收前检查：`physicalRequests === 0` 时 attempt 判为 `execution_invalid`，写 trace 并使任务失败。

### F4 degraded 契约

- `folderStatus === 'degraded'` 时：无输出或输出破坏契约则抛结构化错误，不得返回可用正文。
- 有输出但存在供应商错误时，trace 标记 `degraded_with_error`，后续验收仍以契约为准。

### F5 长度契约前移

- S2 生成阶段就执行目标字数契约检查；缺口在 S2 修复，不推迟到 S3。
- S3 只执行表达契约；长度缺口继续冒泡为链级失败，禁止诱导 S3 扩写。

### F6 终步 echo 职责化

- `shouldRepairChainEcho` 增加步骤职责参数；终步打磨允许高重合，不因词面重合触发修复。
- 修复反馈文案区分“回显复读”和“打磨职责”，删除与 S3 职责冲突的“不要复述上一步内容”提示。

## 5. 验证矩阵

| 用例 | 模式 | 初始状态 | 必须证明 |
|---|---|---|---|
| V1 | compose | fresh | 既有三态修复回归仍通过 |
| V2 | chain 3 skills | fresh | 一次成功、owner 槽清理为空 |
| V3 | chain 3 skills | 预置成功断点 + 二次进入 | 不回放旧产物；发生新物理请求；输出 hash 变化；出现 `chain-completed-checkpoint-rejected` |
| V4 | chain 3 skills | 预置失败断点 | 从失败步骤恢复，不重跑已完成步骤 |
| V5 | chain 3 skills | 成功后 `too_short` | targeted/full_chain 每次都有新物理请求与新 attempt 指纹 |
| V6 | chain 3 skills | 清理写入失败 | 任务失败且 trace 有 `chain-breakpoint-clear-failed`，不宣称成功 |
| V7 | folder degraded | 无有效输出 | 不包装为正文，链失败 |
| V8 | chain | S2 短产 | S2 触发修复；S3 不被要求扩写 |
| V9 | chain | S3 高重合 | 不触发终步 echo 修复重试 |
| V10 | 章节批次 | 共享断点 | 与 owner 槽共存且清理互不干扰 |

## 6. 停止条件

- 上述 V1-V10 全部有新鲜原始输出证据；缺一即未完成。
- `npm run test:services` 全绿；新增/修改测试必须先红后绿。
- `npm run type-check`、`npm run build:vue` 通过。
- Electron 验证器必须真实进入 chain 分支，trace 中出现 chain 事件；禁止 compose 冒充 chain。
- 回放 `run-trace-正文层-20261016-015556-deep`：三次同文路径在新代码下不得复现，至少表现为新物理请求或结构化失败。
- 回头看必须输出写入/读取/清理三列对账表，且清理列槽位键与写入列一致。

## 7. 作者反证

1. 假设“fresh run 即可处理已完成链”是错的：如果历史成功断点代表用户想续跑而非重跑，fresh 会重复请求。证伪方式：确认 S1-S3 链的产物在 run 结束后已入库，重跑语义与客户“重新生成正文”一致；若存在续跑场景，需另设显式续跑入口，本方案不得静默回放。
2. 假设“零物理请求必然异常”可能过严：本地变换路径可能合法零请求。证伪方式：本方案只作用于模型修复 attempt；本地确定性路径不进 attempt 台账，或记录 `localTransform` 指纹类型。
3. 假设“终步高重合可放行”可能漏真回显：S3 完全复制 S2 且零改动时仍需捕获。证伪方式：F6 使用两档判定，完全同 hash 仍触发诊断，只放宽高重合修复重试。

## 8. 待确认

1. F5 是否在本轮实现，还是作为下一阶段单独收口？已裁决：本轮实现 S2 契约检查，S3 职责化同步落地。
2. F6 的终步 echo 放宽阈值：已裁决：0.85 以上不触发修复重试，但完全同 hash 仍触发诊断。

## 9. 实施与验证收口

### 9.1 实施中的必要修正

Electron 首跑暴露 F5 的一个真实缺口：契约最初套在所有中间步，导致 S1 分析步（96 字）被 3000 字正文契约误杀，S2 根本没有执行。已修正为：

- 新增 `isBodyContractStep()`（`src/services/chainExecution.ts`）：默认仅倒数第二步视为生成步。
- `chainHandoff.ts` 的 `ChainHandoffTemplateMeta` 增加 `role?: 'generator' | 'polish' | 'analysis'`，模板可显式声明职责。
- `PipelinePanel.vue` 接线 `isBodyContractStep({ ... chainHandoff.role ... })`。
- 新增测试：`applies the body contract to the generation step only`，证明 S1/S3 不被 S2 契约误伤。

### 9.2 V1-V10 证据矩阵

| 用例 | 证据类型 | 证据 |
|---|---|---|
| V1 compose fresh 回归 | 运行证据 | 全量 `npm run test:services`：165 files / 1939 tests 全绿 |
| V2 fresh chain + owner 清理 | 接线/运行组合 | `ownerBreakpointClosureWiring.spec.ts` 断言 owner 清理调用；`verify-owner-breakpoint-closure-electron.mjs` 真实进入 chain 分支 |
| V3 completed 断点二次进入 | Electron 运行证据 | `_audit/verification-owner-breakpoint-closure-electron/`：`chain-completed-checkpoint-rejected`、新物理请求 2 次、旧产物未入库、run failed 且锁释放 |
| V4 失败断点恢复 | 单测运行证据 | `chainBreakpoint.spec.ts`：失败步骤恢复，不重跑已完成步骤 |
| V5 修复 attempt 指纹 | 单测 + Electron 运行证据 | `bodyArtifactOrchestrator.spec.ts` 零请求判 `execution_invalid`；`verification-body-repair-ledger-electron/trace-run.json` 两个 attempt 各有 physicalRequests/promptHash/outputHash |
| V6 清理失败 | Electron 故障注入 | `_audit/verification-owner-breakpoint-failure-injection-electron/`（v6）：真实 UI 触发链路，storage clear 失败仅注入存储层；4 次物理请求；trace `chain-breakpoint-clear-failed`；run failed，不宣称成功 |
| V7 degraded 无输出 | Electron 故障注入 | `_audit/verification-owner-breakpoint-failure-injection-electron/`（v7）：真实 folder degraded；4 次物理请求；trace `folder-skill-degraded-with-error` + `body-chain-contract-failed`；6 字短输出被 1800 字下限拒绝，run failed |
| V8 S2 短产契约 | Electron 运行证据 | `_audit/verification-owner-breakpoint-closure-electron/`：S1 正常执行，S2 4 字触发 `body-chain-contract-failed`，S3 未被迫扩写 |
| V9 S3 高重合 | 单测运行证据 | `chainExecution.spec.ts`：polish 终步 0.93/0.99 不触发重试；generator 0.93 仍触发 |
| V10 章节批次共存 | Electron 双注入 | `_audit/verification-owner-breakpoint-failure-injection-electron/`（v10）：owner 断点与章节批次共享槽共存；run success；4 次物理请求；清理互不干扰 |

### 9.3 停止条件对账

- 全量回归：`npm run test:services` 通过，165 files / 1939 tests。
- `npm run type-check` 通过；`npm run build:vue` 通过（仅既有 Vite/jieba/chunk 警告）。
- Electron 验证器真实进入 chain 分支：trace 含 `chain-step`、`api-start`、`chain-completed-checkpoint-rejected`、`body-chain-contract-failed`；物理请求 2 次。
- 原事故核心路径已由等价 Electron 复刻覆盖：completed owner 断点不再回放旧产物；S2 契约失败表现为结构化失败；无零请求 attempt 成功。
- 原始 015556 trace 未做逐 token 回放器。证据边界：本次复刻覆盖同一 owner + completed 断点 + 三步 chain 语义，且验收为失败/新请求，事故三同文路径不再可达。

### 9.4 诚实边界与后续登记

- V6/V7/V10 已由 `scripts/verify-owner-breakpoint-failure-injection-electron.mjs` 补齐真实 Electron 故障注入证据；V6 为存储层失败注入，V7 为真实 folder degraded，V10 为 owner/共享槽双注入共存。
- heartbeat 已升级为运行中连续采样并记录 `durationMs`；closure 与 body-repair 两个既有验证器同步升级采集器后重跑通过。
- 首轮注入验证暴露 `isBodyContractStep()` 只按位置推断的根因缺陷，已修复为 `declaredRole` 优先、未声明时才回退位置推断，并补回归测试。
- 边界：以上均为本地 mock 供应商 Electron 验证，未覆盖外部 live 供应商；015556 原始 trace 仍未做逐 token 回放器，事故路径由同语义复刻与故障注入共同覆盖。
