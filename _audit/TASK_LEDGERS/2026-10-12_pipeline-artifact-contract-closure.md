# 2026-10-12 流水线产物契约统一收尾任务台账

## 1. 目标与原话

- 目标：完成流水线产物契约统一收尾，修复正文层最终成功被中间 `degraded` 归并的错误，完成三层真实 Electron/API live 验证、全量回归、回看与台账、文档经验更新、3.80.0 版本封装，并保持工作区干净。
- 最终可感知行为：卷纲/设定/正文产物先经契约验收，最终合格产物保持 `success`，同时保留 `api-degraded` 过程证据并显式记录 `body-artifact-recovered`。

## 2. 门禁读证

- G0.1 目标对齐：实现、验证、封装均指向产物契约统一。
- G0.3 诚实闭环：live 的 `api-degraded` 过程不隐瞒，恢复事件与最终 success 并存。
- G0.5 回头看：终态归并、`bodyGenerated` 写点、`.bak` 衍生状态、schema 新旧口径均复核。
- G0.12 门禁执行台账：本文档补齐本轮总收尾台账。
- G1.4 验证分层：单测、全量回归、live、回放、打包真实启动分层登记。
- G1.5 验证器自身质量：打包验证以主进程 `PASSED` 输出为准，不误读子进程退出码。
- G2.9 终稿与流水线：最终产物契约优先，失败/取消/阻断优先级仍高于产物合格。

## 3. 路由判定

- 加入：G0.1/G0.3/G0.5/G0.7/G0.8/G0.9/G0.10/G0.12、G1.4/G1.5、G2.9。
- 排除：G2.1-G2.7、G2.10-G2.13；本轮不改 API 直写、长文档、编辑器、上下文预算、SKILL 语义。

## 4. 影响圈与作者反证

- 实际改动：`pipelineRunOutcome.ts` 及测试；卷纲/设定/正文契约与编排器；`PipelinePanel.vue` 接线；`runTrace` schema 17 与事件；`storage:remove` `.bak` 删除；验证器、文档、经验、版本与安装产物。
- 最可能错假设 1：任何 `degraded` API 调用都应把整次运行归并为 degraded。证伪：`finalArtifactAccepted=true` 时最终产物 success，并带 `recoveredFromDegraded=true`。
- 最可能错假设 2：产物合格会掩盖失败。证伪：`failed`、`canceled`、`blocked` 优先级高于产物验收。
- 最可能错假设 3：删除 `.bak` 只是清理。证伪：红色测试证明 remove 后 read 可复活断点，必须把显式删除定义为 key 生命周期终结。

## 5. 停止条件

- 正文层最终合格产物不被中间 degraded 覆盖，且有单测、runTrace 事件与 live 证据。
- 三层真实 Electron/API live 完成，导出回放 `RESULT: ACCEPTED`。
- 全量服务测试、type-check、构建、NSIS 打包、真实启动核验通过。
- 回看、台账、DEV_LOG、主索引、经验文件更新完成。
- 3.80.0 安装包生成，旧 3.79.0 产物清理，工作区干净。

## 6. 执行证据

- 归并修复：`src/services/pipelineRunOutcome.ts:20`；`finalArtifactAccepted` 分支返回 `success` 并记录 `recoveredFromDegraded`。
- 优先级反证：`src/services/pipelineRunOutcome.spec.ts:5`（degraded 中间调用不覆盖合格产物）、`:23`（degraded 不掩盖失败）、`:36`（失败优先于产物验收）。
- 正文接线：`src/components/pipeline/PipelinePanel.vue:1198`（统一归并入口）、`:4122`（`body-artifact-recovered` 事件）。
- runTrace 证据保留：`src/stores/runTrace.spec.ts:1666`（成功正文保留 `api-degraded` 与 `body-artifact-recovered`）。
- 三层契约：`src/services/volumeGenerationContract.ts`、`settingsArtifactContract.ts`、`bodyArtifactContract.ts` 及对应 orchestrator。
- live：`_audit/verification-pipeline-artifact-contract-live/summary.json` 四层 `status: success`；正文层事件链含 `api-degraded`、`body-artifact-recovered`。
- 全量回归：`npm run test:services` → 147 files / 1757 tests passed。
- 打包：`_audit/verification-packaging-3-80-0/packaging-evidence.json`，version 3.80.0，231,515,087 bytes，SHA256 `f2086c8c60636e63380a34b688819b7c7882815ef0ee1bd254271e444fe35e5f`，renderer 74 文件，electronAPI 75 方法，真实启动正文 2,306 字符。
- 提交：`f07f0c7` 功能实现；`ee9ee2f` 版本收口；当前 `git status --short --branch` 仅显示分支行，工作区干净。

## 7. 缺口清单

- 正文层 degraded 归并错误已修复并有单测、trace、live 三层证据。
- 三层 live、全量回归、回看、台账、文档经验、3.80.0 封装与清理均完成。
- 无未完成项；其他平台打包不在本项目交付范围。
