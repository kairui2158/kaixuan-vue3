# DEV LOG — 2026-11-14 — 正文层终步失败透传 F1-F5

## 缺陷

trace `run-trace-正文层-20261114-102023-deep`（runId `run-1794622823863-1`）暴露五个根因：

1. **F1** — 终步 failed 被吞成 success：`runStepSkills` 边界层返回字符串丢失结构化失败。
2. **F2** — 终步账本空转 pass：`FACT_LOCK_PATTERN` 不识别内联 `FACT_LOCK：key：value` 格式。
3. **F3** — run 终态被短路：`resolvePipelineRunOutcome` 中 `finalArtifactAccepted=true` 直接返回 success。
4. **F4** — 失败产物存成功断点：无条件 `createChainSuccessBreakpoint`。
5. **F5** — trace 状态双跳：`finishApiCall` 发出 run 级状态迁移事件。

## 修复

- F1：链式循环按 `bodyStepContext` 保留 `callerStatus !== 'success'` 的结构化返回；成功断点写入前加非 success 守卫。
- F2：新增 `FACT_LOCK_INLINE_PATTERN` 支持内联全角格式；分段解析 `break`→`continue`；权威账本 0 项时返回 `generator_ledger_missing`。
- F3：`folderStatus === 'failed'` 提前判定失败；accepted artifact 加 `folderStatus !== 'blocked'` 门槛。
- F4：链式路径成功断点写入前守卫。
- F5：`finishApiCall` 状态事件归入 ApiCallStatus 生命周期；`stateTransitionGuard.ts` 新增映射。

台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-14_body-final-failure-transparency-f1-f5.md`。

## 依赖环境修复

npm 切换器导致顶层依赖壳（vue/pinia/marked 等 10 包）和 Electron 二进制缺失。

1. `npm ci --no-audit --no-fund` → 997 packages restored，依赖版本由 package-lock 锁定。
2. `node node_modules/electron/install.js` 从本地缓存解出 `electron.exe`。

## 验证

- 类型检查：`npm run type-check` → exit 0。
- 定向回归：7 files / 118 tests passed（pipelineRunOutcome / stepArtifactAcceptance / stepArtifactFlow / bodyArtifactOrchestrator / workspaceArtifactAcceptance / stateTransitionGuard / stateTransitionGuard.mappings）。
- 全量服务测试：`npm run test:services` → 251 files / 2753 tests passed。
- Electron IPC：`vitest run electron/ipc` → 8 files / 81 tests passed。
- 前端构建：`npm run build:vue` → exit 0。
- 真实供应商 Electron live：`SHENYI_PROVIDER_CHANNEL_LIVE=1` + `prov-1793816697590` + `glm-5.3` → PASS，5 requests；证据在 `_audit/verification-pipeline-provider-channel-live/report.json`。

## Release

- 版本：3.127.6 → 3.127.7。
- 完整构建：`npm run build` exit 0。
- Packaging：`npm run verify:packaging` exit 0。
- 安装包：`dist/神意助手-Setup-3.127.7.exe`，231,668,756 bytes。
- SHA-256：`2048AB028B5C71B63C2870B33A6F0EC985AC302D01D21BB0D0FD69219C5AE2B2`。

## 边界

1. 不新增预算系统、调度器、UI 或第二裁判。
2. 不改 SKILL 模板或叙事裁判权。
3. `deai-model-profile` 校准门槛与 `postProcess usage` 注入仍为独立待办。
