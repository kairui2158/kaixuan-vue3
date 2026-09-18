# DEV LOG 2026-09-16 API 直写 V2 成熟化修复

> 任务名：大纲工作台 API 直写工具面单源修复
> 前置：09-16 方案成熟度门禁 M18；上一轮 3.50.0 代码已完成但未收尾
> 版本：3.50.0 → 3.51.0
> 状态：已封装交付，3.51.0 安装包已完成产物与配置核验

## 发生了什么

客户用 `run-trace-outline-20260915-220205-deep` 复验时，大纲工作台 API 直写仍未生效。复盘不是执行器缺陷，而是工具面在入口内被两套逻辑分别计算：真实请求走 direct 工具面，trace 记录却走另一套缺 `mode: 'direct'` 和 `applyWrite` 的工具面。于是运行记录看起来工具存在，实际请求与 trace 发生分叉，SKILL 调试方依据 trace 得出的结论也与真实请求不一致。

这正命中 M18 的第四层「验证标准不成熟」：入口、请求、trace 三者没有共享同一事实来源。

## 做了什么

1. `OutlineWorkspace.vue` 的 `askPlainAi()` 改为单源构建：`requestTarget`、`requestedTools`、`tools`、`plainToolSurface` 只计算一次，同一份工具面同时传给 `startOutlineRun()` 和 `startOutlineApiCall()`，从根上消除“真实请求一套、trace 一套”的分叉。
2. `ChatPanel.vue` 补齐实际工具面记录：`startHomeRun()`、`startHomeApiCall()`、`runHomeCoCreationSkills()` 支持并透传 `actualToolSurface`；`sendMessage()` 把 `skillToolSurface` 同时作为 `toolSurface` 与 `actualToolSurface` 传入；`callApi()` 在 turn 与 API call 双层记录实际工具面，保证主页路径的 trace 也不再只写入口声明值。

## 怎么验

验证脚本：`scripts/verify-api-direct-write-v2-e2e.mjs`，真实 Electron + 真实 HTTP 请求工具面，共 14 个场景：

- 主页直写、写入限流、权限拒绝。
- 大纲直写、短批准链、锁定态。
- 流水线工具隔离。
- 兼容供应商降级。
- trace 导出与诊断覆盖。

本轮验证证据：

- `node scripts/verify-api-direct-write-v2-e2e.mjs`：14 场景全部通过。
- `npm run build:vue`：通过。
- `npm run type-check`：通过。
- `npm run test:services`：15 文件 / 216 用例全部通过。

## 封装与产物核验

- `npm run build`：`build:vue` + `electron-builder --win` 通过，退出码 0。
- 安装包：`dist\神意助手-Setup-3.51.0.exe`，123.83 MB，生成时间 2026-09-16 02:51。
- SHA256：`F8D1D147E56D7DBA19AFD62FCFBDE7F0D30601BE7C23EA7D32C7090C3E45A4C6`。
- asar 内 `package.json` 版本：`3.51.0`。
- NSIS 核验：`oneClick: false`、`allowToChangeInstallationDirectory: true`，客户仍可自选安装路径。

同时修复了 E2E 脚本自身三处假失败源：

1. 新增 `setOutlineContent()`，通过 `projectStore.setOutline()` 建立基线并断言同步，替代不可靠的 `locator.fill()`。
2. `sendOutline()` 开头增加 `waitOutlineIdle()`，避免按钮未恢复时点击被吞；短批准链等待持久文案「状态：已应用」，不再等 2.5 秒易失提示。
3. 锁定态 reveal 目标改用基线真实存在的片段，并在用例后恢复 `projectOutlineLocked = false`；锁定态同时断言 trace 中 `editor.reveal` success。

`electron-log renderer bridge failed` 为既有噪音，全部用例在它存在时通过，不作为阻塞。

## 经验回写

经验文件升级到 v5.9：

1. 新增门禁 M19：同一请求内工具面必须单源计算，真实请求与 trace 禁止分别构建；trace 必须记录实际工具面而非入口声明值。
2. E2E 契约升级：直写/工具面类 E2E 必须同时断言 turn 与 API call 的 `actualToolSurface`，且真实请求与 trace 的工具面必须逐项一致。

## 客户复验重点

1. 安装 3.51.0 后，在大纲工作台明确要求“直接写入大纲”，API 应真实写入编辑器，不再只停在文字回复。
2. 导出运行记录后，SKILL 调试方应能在 trace 的 turn 与 API call 双层看到同一份实际工具面，不再出现“记录有工具、请求没工具”的分叉。
3. 主页编辑器同路径复验直写、锁定态与权限拒绝。
