# DEV_LOG：物理请求供应商诊断观察闭环

日期：2026-11-04
关联台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-04_physical-call-provider-diagnostics.md`

## 目标与边界

用户批准只做观察闭环：把供应商物理请求的 `statusCode`、`providerErrorSummary`、`finalUrl`、`transport` 穿透到运行记录、详情 UI、diff 与导出。本修复不改变供应商选择、重试、终态或降AI行为，不新增 preflight、健康系统、自动切换或等待状态。

## 交付

- `PhysicalCallEvent` 与 run trace 物理调用结构新增四个诊断字段；网络失败不伪造 HTTP 状态，HTTP 200 软错误也会保留真实状态与供应商错误摘要。
- 新增共享投影 `projectPhysicalCallEvent`，8 个生产 `appendPhysicalCall` 调用点全部消费同一事实源：PipelinePanel 6 处、OutlineWorkspace 2 处、ChatPanel 1 处。
- run trace 新建与 running → terminal 更新均保留诊断字段；JSON/text 导出显示四个字段，敏感文本继续脱敏。
- RunTracePanel 物理请求详情卡显示 HTTP 状态、供应商错误、最终 URL 与传输通道；run trace diff 同批比较四个字段。
- run trace schema 与 export schema 升级为 21，两个 Electron 验证脚本断言同步升级。

## 验证

- 定向链路测试：`npx vitest run src/services/aiService.spec.ts src/services/runTraceDiff.spec.ts src/components/common/RunTracePanel.spec.ts src/services/physicalCallTraceProjection.spec.ts src/stores/runTrace.spec.ts src/services/runTraceExportService.spec.ts` → 6 files / 324 tests passed。
- 全量服务测试：`npm run test:services` → 247 files / 2649 tests passed。
- 类型检查：`npm run type-check` → exit 0，无错误。
- Vue 构建：`npm run build:vue` → 主构建与 protocols 构建均成功。
- 空白检查：`git diff --check` → 无 whitespace error。
- 旧 schema 残留：`rg -n "schemaVersion=20|schemaVersion: 20|RUN_TRACE_SCHEMA_VERSION = 20|exportSchemaVersion\), 20|exportSchemaVersion=20" src electron scripts` → 0 匹配。

## 回头看

- 生产入口对账：`rg -n "appendPhysicalCall\(" src --glob '!**/*.spec.ts'` → 8 个调用点全部传入 `projectPhysicalCallEvent(event)`。
- 存储对账：`src/stores/runTrace.ts:1870-1873` terminal 更新使用 `?? existing` 保留诊断字段；`:1938-1941` 新建记录写入四字段。
- 导出对账：`src/services/runTraceExportService.ts:123-126` 输出四字段，供应商错误与最终 URL 经过脱敏。
- UI 对账：`src/components/common/RunTracePanel.vue:204-207` 显示四字段；组件测试先切换到“API 调用”页再断言真实 DOM。
- diff 对账：`src/services/runTraceDiff.ts:434-437` 比较四字段。
- schema 对账：`src/stores/runTrace.ts:933`、`src/services/runTraceExportService.ts:3` 均为 21；两个验证脚本同步为 21。

## 边界与未验证

- 真实外部供应商的 401、429、网络错误与 HTTP 200 软错误未在本轮发起，状态为 `untested`；mock/单元/组件测试只证明应用内事件、存储、UI、diff 与导出链路。
- 本轮不升版、不封装、不提交 git；应用版本保持 3.112.0。
- 不修改 folder SKILL，不改变降AI方法论注入，不把供应商观测升级为自动决策。
