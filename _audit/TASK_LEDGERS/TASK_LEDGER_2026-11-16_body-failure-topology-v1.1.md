# 正文层失败拓扑收口 V1.1 执行台账

## 1. 任务目标

把 `_audit/PROPOSAL_2026-11-16_BODY_LAYER_FAILURE_TOPOLOGY_EXECUTION_V1.md` 升级为 V1.1 可执行方案：失败上游不得进入 targeted 修复与权威账本，repairScope 按现役 LHC 信封形状路由，恢复观测区分 degraded 与 failed。本台账先覆盖方案升级阶段；代码执行完成后逐项回填。

## 2. 门禁读证

| 门禁 | 读证 |
| --- | --- |
| G0.13 | `_audit/神意开发经验总结_v9.md:134-138`：五问齐全；V1.1 删除 `failedStepRole`、`upstreamContract`、第三种账本事件三个多余面 |
| G0.6 | 经验文件应用开发层级要求分层成熟度，方案保留执行器、应用闭环、接线、验证四级 |
| G1.5 | `_audit/神意开发经验总结_v9.md:204`：验证必须对账决策值、消费面与后续物理调用；方案 P2-1/P2-3 覆盖 |
| G1.17 | `_audit/神意开发经验总结_v9.md:335-348`：补入产物来源盲区与断点旧数据 fallback；验证含成功/失败终态后再次进入 |
| G2.9 | `_audit/神意开发经验总结_v9.md:600-618`：targeted-first、三层状态、结构化失败透传、候选账本均不推翻 |
| G0.1 | 经验文件 116-119 行：新增本七节台账；DEV_LOG 完成后追加链接 |

## 3. 执行动作

| 编号 | 动作 | 状态 |
| --- | --- | --- |
| R1 | 读当前方案与源码，对账 V1 假设 | DONE |
| R2 | V1.1 复审结论写入方案 | DONE |
| R3 | P0-2 修正为信封 body 单源，删除 `failedStepRole` | DONE |
| R4 | P1-1 删除 `upstreamContract`，改为失败语义条件化措辞 | DONE |
| R5 | P0-1/P1-2 同步 `completedStepOutputs` 与失败分支 metadata 置空 | DONE |
| R6 | P1-2 补 `ChainBreakpointStepOutput.callerStatus` | DONE |
| R7 | P1-3 新增恢复来源函数与 `recoveredFromFailed` | DONE |
| R8 | 新增七节执行台账 | DONE |
| R9 | P0-P3 生产代码执行 | DONE |
| R10 | P2-1 至 P3-2 验证、文档、版本、封装 | DONE |

## 4. 证据

| 证据 | 结果 |
| --- | --- |
| `src/services/bodyArtifactOrchestrator.ts:80-105` | 当前 structuredFailure 无信封 body 判定 |
| `src/components/pipeline/PipelinePanel.vue:4574-4610` | targeted 上游只看形状不看来源 |
| `src/components/pipeline/PipelinePanel.vue:4975-4983` | failed/blocked 产物继承 `upstreamStepMetadata` |
| `src/services/chainBreakpoint.ts:13-19` | 产物无 callerStatus |
| `src/components/pipeline/PipelinePanel.vue:5160-5168` | accept 产物写入权威账本 |
| `src/stores/runTrace.ts:748-766` | tail recovery 存在，来源未细分 |
| `src/services/pipelineRunOutcome.ts:24-64` | 只有 recoveredFromDegraded |
| `rg "V1\.1|hasRepairableBody|folderDiagnosticsRecoveryKind|recoveredFromFailed"` | 关键修正已入方案 |
| E2E SCENARIO=a | exit 0；4 physicalCalls；`success_with_warnings`；upstream-rejected；`recovered_from_failed`；成功链后 breakpoint=null |
| E2E SCENARIO=b | exit 0；6 physicalCalls；终态 failed；repair exhausted；无终态 success checkpoint |
| E2E SCENARIO=c | exit 0；6 physicalCalls；短信封恢复为 `success_with_warnings`；成功链后 breakpoint=null |
| `npm run test:services` | 253 files / 2779 tests PASS |
| `npm run type-check` | exit 0 |
| `npm run build:vue:test` | exit 0 |
| `npm run verify:production-wiring` | 593 modules，no violations |
| Playwright 定向 E2E | body-generator-failure-wiring、body-layer-failed-step-routing、body-resume-artifact-gate：3 files / 8 tests PASS |
| blocked 裁决修正 | `src/services/pipelineRunOutcome.ts:52-58`：调用级 blocked 仅在 `!finalArtifactAccepted` 时阻断；run/owning 级仍权威；pipelineRunOutcome.spec 14/14 PASS |
| E2E 脚本断点修正 | `scripts/verify-body-failure-topology-electron.mjs:569-578`：成功链完成清除断点；场景 A/C 增加 body-artifact-validated 与 write 各 1 次断言 |
| G1.21 夹具 | `_audit/verification-body-failure-topology/fixture-evidence.md` 12 文件 SHA256/字节表登记；临时夹具目录已删除 |

## 5. 影响圈

生产入口：正文链 body orchestration；服务层：orchestrator、chainBreakpoint、runTrace、runOutcome；测试：对应 spec 与 E2E；文档：摸底文档、SKILL spec、DEV_LOG、台账；trace：一个窄事件与恢复来源语义；不改 folder SKILL。

## 6. 回滚

方案文档按本文件 git 版本回滚；生产代码执行后按提交边界逐文件回滚，不触碰历史 trace、DEV_LOG、SKILL 包和既有成功断点数据。

## 7. 缺陷清零

方案阶段残留已清零：P0-P3 生产执行、A/B/C 合同级 E2E、全量服务测试、类型检查、测试构建、production wiring、定向 Playwright、文档同步均已完成。本批 E2E 使用本地 mock provider 队列做合同级验证；真实供应商通道已在 provider-channel live 验证中 PASS，本次未重复烧真实长文调用。blocked 裁决修正登记为 P0-10 同源语义补全，不属于偷偷扩面。无已发现但跳过的缺陷。
