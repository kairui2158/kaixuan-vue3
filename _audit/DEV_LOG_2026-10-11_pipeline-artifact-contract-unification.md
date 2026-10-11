# 2026-10-11 流水线产物契约统一（卷纲 / 设定 / 正文）

## 范围

将章节层已验证的 `Contract + Orchestrator + Trace Event` 架构推广到剩余三层，并修复统一过程中暴露的存储断点复活缺陷：

1. 卷纲层：计划数量守恒、全量卷事实清单、短产修复、auto 总账校验。
2. 设定层：结构合法性、非空内容、分类归属、部分拒绝落盘与拒绝原因记录。
3. 正文层：目标字数区间、空正文禁止落盘、`bodyGenerated` 只在合格产物后置真、DeAI 后处理不改契约结论。
4. runTrace schema 16 → 17，新增 `volume-batch-*`、`settings-artifact-*`、`body-artifact-*` 事件。
5. 存储层：`storage:remove` 同步删除主文件、`.bak` 与 legacy 文件，显式删除后断点不再复活。

## 核心改动

- 新服务：`src/services/volumeGenerationContract.ts`、`volumeBatchOrchestrator.ts`、`settingsArtifactContract.ts`、`settingsArtifactOrchestrator.ts`、`bodyArtifactContract.ts`、`bodyArtifactOrchestrator.ts`。
- 统一终态：`src/services/pipelineRunOutcome.ts`，四层 success/degraded/failed 归并单源。
- Pipeline 接线：`src/components/pipeline/PipelinePanel.vue` 三层生成入口消费契约与编排器。
- 存储修复：`electron/ipc/storage.js` 的 `storage:remove` 删除 `.bak`；`recoverBakIfPrimaryMissing` 保留崩溃恢复语义。
- 验证器：`scripts/verify-pipeline-artifact-contracts-electron.mjs`（真实 UI + 真实 API）、`scripts/verify-pipeline-artifact-contracts-replay.mjs`（历史/live trace 复核）。

## 验证

- 存储：红色测试先失败后通过；`npx vitest run electron/ipc/storage.spec.js` → 3/3 passed。
- 全量回归：`npm run test:services` → 147 files / 1757 tests passed。
- 类型与构建：`npm run type-check` → exit 0；`npm run build:vue` → exit 0（仅既有 warning）。
- live：四层真实 Electron UI + 真实 API 运行完成，`summary.json` 四层 `status: success`；SKILL 均通过真实下拉选择，无注入冒充。
- live 导出复核：volume / settings / body 三层 `RESULT: ACCEPTED`。
- 历史回放：三条旧 schema 记录为 `EXPECTED-FAIL`，证明新契约能识别旧版本缺少应用层验收事件。
- 证据边界：`electron-run.log` 只记录 Electron 子进程输出；`PASSED` 由验证器主进程输出，`ELECTRON CLOSE code=1` 是主动关闭子进程的退出码。

## 回头看结论

1. `.bak` 风险面：`agentState.js` 同为 atomicWrite+`.bak` 但无删除入口，无同类风险；`storage:remove` 是唯一显式删除入口且已修复。
2. `bodyGenerated` 写点：生产代码只剩契约验收后的 `genBody` 与用户手动确认入口两处置真，空正文旁路已清零。
3. 终态归并：旧内联 `traceStatusFromRun` 已删除，四层统一走 `resolvePipelineRunOutcome`；设定/卷纲/章节失败路径先 `failGeneration`，并有 `failed` 前缀兜底。
4. schema：导出与测试同批升至 17，无 16/17 双执行口径。

## 经验文件回写

`_audit/神意开发经验总结_v7.md` 升级至 v8.7：G1.17 增补“组件组合层反证”，要求删除/归档/恢复类修改必须检查同文件衍生状态（`.bak`、legacy、副本、索引）；G1.5 增补“验证证据载体核对”，完成声明前必须确认日志确实承载通过行。来源为本次 `.bak` 复活事故与 `electron-run.log` 误判风险。
