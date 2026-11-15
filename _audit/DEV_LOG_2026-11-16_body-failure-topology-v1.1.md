# 正文层失败拓扑收口 V1.1

日期：2026-11-16

## 目标

按商业标准复审 K88 暴露的失败拓扑，把正文层 V1 执行方案升级为 V1.1：失败上游不得进入 targeted 修复与权威账本，repairScope 按现役 LHC 信封形状路由，恢复观测区分 degraded 与 failed。

## V1 复审修正

1. `hasRepairableBody` 从统一 body 判定改为“先信封再取 body”。`src/services/chainExecution.ts:384` 证明 legacy 骨架不能通过信封判定；否则 3177 字 S1 骨架会被误判为可修复正文。
2. 删除 `failedStepRole`。repairScope 只依赖 `hasRepairableBody` 单源；角色字段会被后续消费面当成第二裁判。
3. 删除 `upstreamContract`。`buildPrompt` 在 `runStepSkills` 前执行，无法预知 P0-1 上游裁决；改为失败语义条件化措辞。
4. P0-1 拒绝上游时同步清空 `completedStepOutputs`、`upstreamStepMetadata` 与权威账本。失败装配面当前仍继承 `upstreamStepMetadata`（`PipelinePanel.vue:4975-4983`），这是 K88 污染路径的另一个消费面。
5. `ChainBreakpointStepOutput` 增加可选 `callerStatus`；P0-1 成功/失败装配面写入该字段，旧数据缺字段时按保守 fallback 拒绝 targeted 恢复。
6. targeted 新鲜上游接受后同步 `completedStepOutputs`；生成步权威账本继续来自 `artifactFlow.metadata`，断点恢复路径再按 callerStatus 过滤。
7. 不新增 `body-generator-ledger-authority-rejected`。P0-1 上游拒绝事件与既有 `generator-ledger-missing` 已覆盖，第三种事件会稀释观测单源。
8. `folderDiagnosticsStatus` 保留兼容；新增 `folderDiagnosticsRecoveryKind` 与 `recoveredFromFailed`。当前 tail recovery 已存在（`src/stores/runTrace.ts:748-766`），但卷纲/正文 recovered 事件只按 degraded 描述。

## 交付

1. `_audit/PROPOSAL_2026-11-16_BODY_LAYER_FAILURE_TOPOLOGY_EXECUTION_V1.md` 升级为 V1.1，包含复审核证锚点、七条修正、测试矩阵、真实烟测、E2E、文档与封装顺序。
2. 新增七节执行台账 `_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-16_body-failure-topology-v1.1.md`。
3. 本轮只升级方案与台账，不改生产代码；生产执行等待用户裁决。

## 验证

1. `rg "V1\\.1|hasRepairableBody|folderDiagnosticsRecoveryKind|recoveredFromFailed"` 确认关键修正进入方案。
2. `git diff --check` 通过，无空白错误。
3. 方案阶段核对 `src/services/bodyArtifactOrchestrator.ts:80-105`、`src/components/pipeline/PipelinePanel.vue:4574-4610`、`:4975-4983`、`:5160-5168`、`src/services/chainBreakpoint.ts:13-19`、`src/stores/runTrace.ts:748-766`、`src/services/pipelineRunOutcome.ts:24-64`。
4. P0-P3 生产执行完成。合同级 Electron E2E 使用本地 mock provider 队列完成三个场景：
   - SCENARIO=a：exit 0，4 physicalCalls，`success_with_warnings`，`body-targeted-repair-upstream-rejected`，`recovered_from_failed`，正文写入与产物验收通过，成功链完成清除断点。
   - SCENARIO=b：exit 0，6 physicalCalls，终态 failed，repair exhausted，无终态 success checkpoint。
   - SCENARIO=c：exit 0，6 physicalCalls，短信封恢复为 `success_with_warnings`，成功链完成清除断点。
5. 全量验证：`npm run test:services` 253 files / 2779 tests PASS；`npm run type-check` exit 0；`npm run build:vue:test` exit 0；`npm run verify:production-wiring` 593 modules / no violations；Playwright 定向 3 files / 8 tests PASS；`git diff --check` PASS。
6. 执行期修正登记：调用级 blocked 仅在 `!finalArtifactAccepted` 时阻断，run/owning 级 blocked 仍权威（`src/services/pipelineRunOutcome.ts:52-58`）；该修正是 P0-10 失败拓扑同源语义补全，对应 spec 14/14 PASS。E2E 场景 A/C 的 completed 断点断言改为 breakpoint=null，补产物验收与写入断言；属于脚本过时修正，不改生产语义。
7. G1.21 夹具证据固化在 `_audit/verification-body-failure-topology/fixture-evidence.md`，12 个文件均有 SHA256/字节记录；临时夹具目录已删除。

## 交付

1. 失败上游不再进入 targeted 修复与权威账本；repairScope 以现役 LHC 信封 body 单源路由；恢复观测区分 `recovered_from_failed` 与 `recovered_from_degraded`。
2. 失败 S1 非空骨架、failed/blocked 产物 metadata、失败候选与断点旧数据 fallback 均被拒绝；成功 targeted 上游同步进 `completedStepOutputs`。
3. 本批 E2E 为合同级验证，trace 副本存于 `_audit/verification-body-failure-topology/run-trace-{a,b,c}.json`。真实供应商通道已在 provider-channel live 验证 PASS，本批不重复烧真实长文调用。
4. 版本升级至 3.128.2；`npm run build:vue` exit 0；`npm run build` exit 0；`npm run verify:packaging` PASS。安装包 `dist/神意助手-Setup-3.128.2.exe`，231,670,043 bytes，SHA-256 `ff7df366d0c4353301312bbb7874b7fb61fa20deb662224f47f411bf70c8485b`。旧 3.128.1 安装包与 blockmap 已从 `dist` 清理；`_audit/tmp-k88-trace-evidence.json` 归档。

## 边界

不修改 folder SKILL、历史 trace、历史 DEV_LOG。不新增裁判、预算系统、调度器或 UI。台账 R9/R10 已回填 DONE；版本升级、完整封装、提交与临时证据归档由本日志配套的收尾流程完成。
