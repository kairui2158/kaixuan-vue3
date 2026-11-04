# TASK_LEDGER_2026-11-04_physical-call-provider-diagnostics.md

## 1. 目标与原话

- 用户原话：`那你就只做观察闭环吧`
- 本轮目标：把真实供应商物理请求的 `statusCode`、`providerErrorSummary`、`finalUrl`、`transport` 从 `aiService` 穿透到 run trace 存储、事件详情、JSON/text 导出。
- 最终可感知行为：用户导出或查看运行记录时，不依赖渲染日志也能判断 401、429、网络错误等供应商物理请求根因。
- 本轮交付物：共享物理请求投影、8 个生产入口接线、run trace 存储与导出、测试、DEV_LOG 与总索引登记。

## 2. 门禁读证

- G0.1 目标对齐（`_audit/神意开发经验总结_v9.md:20`）：只做观察闭环，不修供应商、不新增自动决策。
- G0.3 诚实闭环（`:36`）：区分单元/集成验证与真实供应商边界；不把测试 mock 冒充真实外呼。
- G0.5 回头看（`:52`）：收尾前逐行审 diff、对账入口、事件、存储、导出、测试和未验证边界。
- G0.9 影响圈声明（`:84`）：影响圈覆盖生产入口、服务层、trace 存储、导出、测试、日志七面。
- G0.12 门禁执行台账（`:114`）：非平凡跨文件改动必须七节留证。
- G0.13 最小必要性与过度设计禁令（`:132`）：不新增配置、状态、等待机制、供应商预检或健康系统。
- G1.1 精准编辑与 diff 自审（`:144`）：只用 apply_patch 逐行修改，禁止顺手重构。
- G1.3 全局层与同款逻辑统一（`:160`）：8 个 `appendPhysicalCall` 入口必须共享单源投影，禁止只修流水线。
- G1.4 验证真实性与分层（`:168`）：源码字符串断言只能作为接线守护；运行时链路用服务/store/导出测试证明。
- G1.8 日志与观测同步（`:226`）：新增 trace 字段必须同批覆盖存储类型、服务事件、入口回填、导出与测试。

## 3. 路由判定

- 加入：G0.1、G0.3、G0.5、G0.9、G0.12、G0.13、G1.1、G1.3、G1.4、G1.8。
- 排除：G0.10 新旧并存清零：本轮是新增可选观测字段，不删除或替换旧执行语义；旧 trace 缺字段按旧数据兼容处理。
- 排除：G0.11 真实交互冒充禁令：本轮目标不是用户 UI 交互行为验证。
- 排除：G1.2 删除与引用闭包：不删除函数、组件或旧入口。

## 4. 影响圈与作者反证

- 打算改的：`src/services/aiService.ts`、`src/services/physicalCallTraceProjection.ts`、`src/stores/runTrace.ts`、`src/services/runTraceExportService.ts`、8 个 `appendPhysicalCall` 生产入口、相关 spec、DEV_LOG 与总索引。
- 可能碰到的：`electron/ipc/runTrace.js` 与 `runTraceDiff.ts` 消费整对象，预期自然兼容，但必须由类型检查与测试确认。
- 不修改：供应商配置、folder SKILL、降AI机制、版本号、安装包、git 提交、既有用户脏改动。
- 方案最可能错的假设：假设所有入口都消费 `PhysicalCallEvent`。证伪方式是全仓搜索 `appendPhysicalCall(`，逐个核对入参来源；若存在非事件入口，共享投影不能覆盖该入口。
- 作者反证：若新增字段在 running → terminal 更新时被空值覆盖、网络错误被伪造 HTTP 状态、或任一直接入口漏接，则观察闭环不成立。

## 5. 停止条件

- 完成：4 个字段从真实 `aiService` 事件进入共享投影；8 个直接入口全部消费共享投影；新建与更新路径均持久化；事件详情与 JSON/text 导出可见；指定测试、type-check、服务测试、Vue 构建全部通过；DEV_LOG 与总索引登记。
- 失败：任一入口漏接；网络错误被伪造 `statusCode`；terminal 更新丢失诊断字段；导出 schema 未升级；验证未跑或失败；把源码字符串断言冒充运行时链路验证。

## 6. 执行证据

- Before：3.112.0 两次正文层失败只能靠渲染日志判断供应商 401；`PhysicalCallEvent` 与 run trace 物理调用缺 `statusCode/providerErrorSummary/finalUrl/transport`。
- After：四个字段从 `aiService` 事件进入共享投影、8 个生产入口、run trace 新建/更新、详情 UI、diff、JSON/text 导出。
- 事件定义：`src/services/aiService.ts:350-359`、`:3881-3884`；HTTP 200 软错误诊断写入 `:4138-4145`。
- 共享投影：`src/services/physicalCallTraceProjection.ts:45-48`。
- 8 个入口：`src/components/chat/ChatPanel.vue:932`；`src/components/pipeline/PipelinePanel.vue:3379`、`:3802`、`:4095`、`:6646`、`:6898`；`src/components/common/OutlineWorkspace.vue:2000`、`:2842`。
- 存储保留：`src/stores/runTrace.ts:1870-1873`；新建写入 `:1938-1941`。
- UI 显示：`src/components/common/RunTracePanel.vue:204-207`；组件断言 `src/components/common/RunTracePanel.spec.ts:53-56`。
- 导出显示：`src/services/runTraceExportService.ts:123-126`。
- diff 比较：`src/services/runTraceDiff.ts:434-437`。
- schema：`src/stores/runTrace.ts:933`、`src/services/runTraceExportService.ts:3`、`scripts/verify-run-trace-audit-electron.mjs:596-597`、`scripts/verify-pipeline-artifact-contracts-electron.mjs:32`。
- 定向验证：`npx vitest run src/services/aiService.spec.ts src/services/runTraceDiff.spec.ts src/components/common/RunTracePanel.spec.ts src/services/physicalCallTraceProjection.spec.ts src/stores/runTrace.spec.ts src/services/runTraceExportService.spec.ts` → `6 files / 324 tests passed`。
- 全量验证：`npm run test:services` → `247 files / 2649 tests passed`；`npm run type-check` → exit 0；`npm run build:vue` → 主构建与 protocols 构建成功；`git diff --check` → 无 whitespace error。
- 旧 schema 清零：`rg -n "schemaVersion=20|schemaVersion: 20|RUN_TRACE_SCHEMA_VERSION = 20|exportSchemaVersion\), 20|exportSchemaVersion=20" src electron scripts` → 0 匹配。

## 7. 缺口清单

- 真实外部供应商 401/429/网络错误/HTTP 200 软错误：`untested`。本轮 mock 与组件测试只证明应用内链路，不冒充真实外呼。
- 本轮不升版、不封装、不提交 git；应用版本保持 3.112.0。
- 不修改 folder SKILL，不改变降AI方法论注入，不新增供应商 preflight、健康系统、自动切换或重试策略。
- 除上述明确边界外，本轮无登记缺口。
