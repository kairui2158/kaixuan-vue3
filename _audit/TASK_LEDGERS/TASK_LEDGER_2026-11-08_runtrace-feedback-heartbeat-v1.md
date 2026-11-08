# TASK LEDGER - runtrace-feedback-heartbeat-v1

日期：2026-11-08
版本：3.118.0
范围：runTrace 审计事件保留、心跳事件洪水抑制、schema 版本同步、封装收尾。

## 1. 背景

实测 trace `run-trace-正文层-20261108-074151-deep` 显示 `eventLedger.totalEvents=518`、`droppedInfoEvents=390`。诊断反馈事件 `schema-retry-feedback-composed` / `final-step-feedback-composed` 不在审计白名单，128 条上限压缩时被淘汰；同时长请求的 15 秒心跳每个周期追加一条 `physical-call` 与一条 `run-activity`，失败 trace 中心跳类事件占比约 68%，污染了裁决证据面。

## 2. 目标与非目标

- 目标：关键反馈与终步审计事件在事件压缩中保留；心跳运行中更新只刷新物理记录、推进 watchdog，不再追加事件；schema 版本与验证脚本同步。
- 非目标：不改心跳间隔、不双写 user message、不改生成链路语义、不碰 folder SKILL、不重试裁决规则。

## 3. 实施

- `src/stores/runTrace.ts`：`RUN_TRACE_SCHEMA_VERSION` 22 -> 23；`RETAINED_AUDIT_EVENT_TYPES` 追加两类反馈事件；`appendPhysicalCall` 已存在记录的 running 心跳分支改为只更新 `heartbeat=true` / `lastExecutionActivityAt` / watchdog，终态仍发事件。
- `scripts/verify-pipeline-artifact-contracts-electron.mjs`：本地 schema 常量 21 -> 23，修复既有滞后。
- `src/stores/runTrace.spec.ts`：新增反馈事件压缩保留用例与心跳抑制用例；修正上一条测试缩进，不改测试语义。

## 4. 验证

- 定向：`npx vitest run src/stores/runTrace.spec.ts`，120/120 passed。
- 全量：`npm run test:services`，249 files / 2686 tests，全部 passed。
- 类型：`npm run type-check`，exit 0。
- 回归锚点：非心跳 running+success 仍产生 2 条 `physical-call`；心跳更新后 `lastExecutionActivityAt` 前进、`heartbeat=true`；长请求 2 次的 `long-request-in-progress` 语义不变。

## 5. DEFECT-SWEEP

- 事件保留面：检查 `evictExcessEvents`，非 info 或白名单事件保留；新增两类为 info 必须显式白名单。
- 心跳兄弟面：检查 `appendPhysicalCall` 新记录分支保留既有事件语义，抑制只作用于已存在记录的 running heartbeat；终态分支未改。
- watchdog 面：心跳直接调用 `stateWatchdogByRunId.get(runId)?.reportProgress()`，保留活性判定；不写 `run-activity`。
- 长请求面：`reportLongRequestInProgress` 自身按物理 id 去重，语义不变。
- 消费面：`RunTracePanel.vue` 的 physical-call 展示不受事件抑制影响，物理记录仍保留心跳事实；run-activity 心跳不再刷屏。
- 导出面：physical 记录继续携带 `heartbeat=true`，计时账本对 heartbeat 字段的依赖不受影响。
- 脚本面：artifact contracts 验证脚本 schema 常量同步到 23，避免滞后断言。

## 6. 风险与边界

- 历史导出 trace 仍为 schema 22，是旧版本产物；新运行记录为 schema 23。
- 心跳事件不再作为 trace 事件流证据，但物理记录心跳字段与 watchdog 活性仍保留。
- 未做 Electron GUI 真实供应商重测；本轮仅验证记录器行为，生成失败根因已定案为 SKILL/模型层。

## 7. 收尾

- 升版 3.118.0，构建 NSIS 安装包；`npm run verify:packaging` 输出 `PACKAGING 3.118.0 VERIFICATION PASSED`，安装包 SHA-256=`0876ff18cae5ed2d787d9c765b90b20767e4bb0ad173938fcbf8ae6eec633ae4`，electronAPI methods=94。
- 清理 `dist` 旧交付物：3.116.0 / 3.117.0 安装包及 blockmap 已删除。
- 清理残留：`dist/神意助手-Setup-3.110.6.exe` 移动到 retired-installers 返回 Access denied；`takeown` / `icacls` 同样被系统拒绝。按既有门禁不强删、不改权限强行处理，登记为历史锁定残留。
- 提交本任务相关文件，不回退用户脏文件。
