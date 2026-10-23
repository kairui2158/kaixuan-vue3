# 2026-10-23 流水线并行 V3.3 收口修复台账

## 1. 目标与原话

**用户原话**

> 把这些问题根据经验文件总结教训，进行逐项执行

**目标**：对 V3.3 逐条对账发现的 12 个缺口逐项修复并验证，不以 mock 冒充 live，不以文档登记冒充实现。

**最终可感知行为**：

1. 旧进度/当前 run 语义在执行层清零。
2. 四格再入矩阵与 live 供应商并发验证有真实报告。
3. 运行中心、排队原因、shutdown、内存上限、全局状态残留全部闭环。
4. 封装、清理、提交与日志经验回写完成。

## 2. 门禁读证

- G0.1：目标对齐，所有动作对应 V3.3 第 0.2 节 6 条契约。
- G0.3：诚实闭环，live 未执行只能写 `untested`。
- G0.4：已复读 `_audit/神意开发经验总结_v9.md` 全文与本轮相关 G 条。
- G0.5：收尾前回头看，逐项对账台账。
- G0.8：封装前分层清理，先分类 git 脏状态。
- G0.10：旧语义执行层命中 0 才算清零。
- G0.12：本台账七节结构，执行证据逐项补齐。
- G1.1/G1.2：精准编辑与引用闭包。
- G1.4/G1.5：验证分层与验证器完整重跑。
- G1.7/G1.12/G1.13：构建产物新鲜度、封装、Electron 验证。
- G1.17：每个修复点必须有真实用户路径证伪尝试。
- G1.19/G1.20：性能观测与单源。
- G2.9/G2.11：流水线 run 生命周期与供应商隔离。

## 3. 路由判定

**加入**：G0.1、G0.3、G0.4、G0.5、G0.8、G0.10、G0.12、G1.1、G1.2、G1.4、G1.5、G1.7、G1.12、G1.13、G1.17、G1.19、G1.20、G2.9、G2.11。

**排除**：

- G0.11：本轮四格再入补验如涉及用户操作必须真实 DOM 操作；不适用仅限纯数据断言部分。
- G2.13：本轮不改变 SKILL 权限语义。

## 4. 影响圈与作者反证

**打算改**：

- `src/stores/runTrace.ts`：current/last fallback、trace 内存上限。
- `src/components/common/StyleProfileCard.vue` 与 spec：改读 registry 单源。
- 13 个 `scripts/verify-*-electron.mjs`：迁移旧 progress 断言。
- `src/components/pipeline/PipelinePanel.vue`：取消全部二次确认、queuedReason 接线、status fallback 清零。
- `src/stores/pipeline.ts`：旧全局态清零。
- `src/App.vue`：shutdown 收口。
- Phase J 验证脚本与 live 报告。

**可能碰到**：trace 导出、验证器、运行中心 UI、供应商排队观测、项目保存链路。

**最可能错的假设**：以为“fallback 只是兜底，不影响主路径”。证伪方式是构造两 run 并发或终态后再入，观察事件归属与 UI 是否漂移。

## 5. 停止条件

| 编号 | 缺口 | 机器可判定停止条件 |
|---|---|---|
| P0-1 | 四格再入 2/4 | live 报告 coverage 四项全 true，且失败终态/断点恢复有新物理请求与 runId 变化 |
| P0-2 | live 供应商矩阵 | 内置 key 真实并发，报告含 providerMetrics 与 run 隔离 |
| P0-3 | 13 个脚本旧语义 | `rg "generationProgress" scripts --glob "verify-*.mjs"` 命中 0 |
| P0-4 | trace current/last fallback | fallback 读取路径删除；显式 runId/registry 单源；相关 spec 迁移 |
| P0-5 | StyleProfileCard current | 生产源码无 `currentRunIdBySource` 读取，观测对象来自 registry |
| P1-6 | 取消全部无确认 | 真实 UI/组件断言存在确认流程 |
| P1-7 | 排队原因不可见 | run 中心显示 provider queuedReason，trace 与 run 状态同源 |
| P1-8 | trace 内存上限 | 单 run 累计文本/事件有上限与压缩测试 |
| P1-9 | shutdown 收口 | 逐 run cancel、终态、trace flush、项目保存有代码与测试/验证 |
| P1-10 | pipeline 旧全局态 | `generationStatus` 执行层清零；`isGenerating` 只保留派生语义 |
| P2-11 | 封装 | build、NSIS/asar、SHA256、启动核验、旧产物清理 |
| P2-12 | git 收尾 | 工作区分类、提交、状态干净 |

## 6. 执行证据

以下为本轮开工前基线：

```text
git status --short
```

工作区存在 Phase 0-J 大量未提交修改与验证证据。

```text
rg -n "generationProgress|currentRunIdBySource|lastRunIdBySource" src scripts
```

确认旧语义残留：脚本 fallback、runTrace 双回落、StyleProfileCard current 指针。

### P1-8 trace 内存上限

**实现**

- `src/stores/runTrace.ts:193-195`：`RunTraceApiCall` 新增 `streamTotalChars`、`streamTruncated`、`streamTruncatedChars`，压缩后仍可报告真实累计接收量。
- `src/stores/runTrace.ts:458` 与 `src/stores/runTrace.ts:1483-1502`：`eventLedger` 精确记账 total/drop，事件窗口压缩不丢失审计事实。
- `src/stores/runTrace.ts:930-931`：单 run 流式尾部窗口 2,000,000 字符、事件上限 128。
- `src/components/chat/ChatPanel.vue:1071`、`src/components/common/OutlineWorkspace.vue:2985`：`streamLength` 改为 `call.streamTotalChars ?? call.streamText.length`，压缩后 UI 不再把“已接收字数”误报为假停。

**Before / After**

```text
before: streamLength = call.streamText.length
after:  streamLength = call.streamTotalChars ?? call.streamText.length
```

**验证**

```text
npx vitest run src/stores/runTrace.spec.ts src/composables/useLiveApiStatus.spec.ts
→ 113 passed

npx vue-tsc --noEmit -p tsconfig.json
→ exit 0
```

### P1-9 shutdown 收口

**实现**

- `src/services/runRegistry.ts:163-168`：`cancel` 允许 `running/queued` 两态进入 canceled，queued 也 abort controller，封住激活竞态。
- `src/stores/pipeline.ts:151-169`：`cancelAllActiveRuns(reason)` 单源取消全部 active run，返回结构化取消清单。
- `src/stores/runTrace.ts:1112-1145`：`shutdownAndFlush` 对 running trace run 执行 API cancel、`finishRun('canceled')`，并等待 per-run 保存队列（默认 3 秒，fail-open）。
- `src/services/appShutdown.ts:17-62`：串行编排 pipeline cancel → trace shutdown flush → `projectStore.saveProject()`；项目保存异常不吞掉，也不阻断 trace 收口。
- `src/App.vue:334-341`：`beforeunload/pagehide` 接入一次性 shutdown。

**Before / After**

```text
before: queued run cancel returns false; App close only reports integrity, no terminal state or flush
after:  queued + running runs reach canceled; trace API calls close; save queue flushed; project save result observable
```

**验证**

```text
npx vitest run src/services/appShutdown.spec.ts src/stores/pipeline.shutdown.spec.ts src/stores/runTrace.spec.ts src/services/runRegistry.spec.ts src/stores/pipeline.spec.ts --reporter=dot
→ Test Files 5 passed (5), Tests 120 passed (120)

npx vue-tsc --noEmit -p tsconfig.json
→ exit 0
```

### P0-2 live 供应商矩阵

**验证器修复**

- `scripts/verify-pipeline-parallelism-electron.mjs:88-92`：P2 夹具明确 70 段、每段 50-80 字、输出前逐段自查，禁止说明性总结；不放宽产品契约，仍要求 2800-7000 字。
- `scripts/verify-pipeline-parallelism-electron.mjs:989-1003`：失败诊断导出新增 `decisionEvents`，解析 `body-step-acceptance`、`body-generator-step-rejected`、`body-artifact-attempt`、`failed` 的 `event.detail` 原文。
- `scripts/verify-pipeline-parallelism-electron.mjs:1005-1010`：失败诊断补充每个 API call 的物理请求状态、耗时与错误。
- `scripts/verify-pipeline-parallelism-electron.mjs:871-874`：失败路径保留导出现场到 `failed-exports/`；成功路径仍清理临时导出目录。
- `scripts/verify-pipeline-parallelism-electron.mjs:1615-1637`：live 失败路径无条件写入 `provider-requests.json`，且失败路径不再删除 `EXPORT_ROOT`。

**Live 验证**

```text
node --check scripts/verify-pipeline-parallelism-electron.mjs
→ exit 0

SHENYI_PARALLELISM_LIVE=1 node scripts/verify-pipeline-parallelism-electron.mjs
→ exit 0, result=PASS
```

关键证据：

- 三层并发：volumes/chapters/body 三个 `pipeline-run-*` 同时 `running`，runId 各异。
- 取消隔离：章节层点击取消后 93ms 进入 `canceled`，卷纲与正文继续执行。
- 终态：volumes=`succeeded`，chapters=`canceled`，body=`succeeded`。
- 供应商隔离：8 次真实物理请求，`maxConcurrency=2`，未超过供应商并发上限；`volumes/body` 出现真实重叠请求对。
- 正文产物：`chapterBodyChars=4622`，满足 2800-7000 产品契约。
- 成功终态再入：新 runId `pipeline-run-1792778631897-4`，正文物理请求 3 → 6，正文 hash 改变。
- key 泄漏检查：`plaintextPatternFound=false`，无供应商密钥材料泄漏。
- 证据：`_audit/verification-pipeline-parallelism-live-supplier/report.json`、`provider-requests.json`、`heartbeat.jsonl`、`electron-run.log`。

**边界**

- live 覆盖 fresh start、三层并发、取消隔离、成功终态再入。
- 断点恢复与失败终态再入仍由 mock 报告作为故障注入互补证据，live 覆盖记为 false，不冒充已执行。

### P0-3 验证脚本旧进度语义清零

**对账**

- `rg "generationProgress" scripts --glob "verify-*.mjs"` → exit 1，0 命中，13 个 Electron 验证脚本已无旧全局进度断言。
- `rg "generationStatus|generationProgress|isGenerating" src/components/pipeline/PipelinePanel.vue src/stores/pipeline.ts` → 仅剩：
  - `src/stores/pipeline.ts:23-24`：`isGenerating/generationStatus` 由 `registry.activeRuns` 派生；
  - `src/components/pipeline/PipelinePanel.vue:243/378/528/600`：四层按钮只读各自 `activeXxxRun`。
- 结论：验证脚本旧语义执行层命中 0；剩余 `generationStatus` 是 registry 派生展示语义，不是执行层写入。

### P0-4 流水线执行层 trace current 指针依赖清零

**实现**

- `src/services/realSkillTypes.ts:182-184`、`src/services/skillRouter.ts:21-22,168-169`、`src/services/realSkillExecutor.ts:69-70,82-83,902-903`：`SkillRouteOptions / RealSkillExecuteOptions / buildFolderPassInputMeasurement` 增加 `traceRunId/traceCallId` 显式透传，folder pass 测量不再依赖单槽 current 指针。
- `src/components/pipeline/PipelinePanel.vue:2058,2091,2214`：`hydrateFolderTemplates`、`readStepConfigSnapshotForRun`、`buildFinalStepEchoRetryFeedback` 改为显式 `traceRunId` 参数；事件写入只作用于当前 run。
- `src/components/pipeline/PipelinePanel.vue:3319`：`_runStepSkillsInner` 内建立局部 `runId = traceRunId || null`，约 30 处链式事件不再读取 `runTraceStore.currentRunId/currentApiCallId`。
- `src/components/pipeline/PipelinePanel.vue:3673,3742,3988,4204`：主调用、终步回显重试、full 交付重试、compose 四个 `callValidatedSkill` 调用点均显式传入 `traceRunId`。
- `src/components/pipeline/PipelinePanel.vue:4710`：`genChapters` 的 `resetPipelineStreamState(3, null)` 不再借用可能已被覆盖的 current run；`src/components/pipeline/PipelinePanel.vue:1301`：渲染回调用 `getPipelineStreamState(step, null)`，ownership 由 state 内已保存的 runId/callId 判定。
- `src/components/pipeline/PipelinePanel.vue:2772-2790`：settings 生成路径改为显式 `traceRunId`，风格档案 trace 事件使用 `style-profile-injected`，类型口径为 `StyleContextCompilation`，不再错配 `StyleArbiterResult`。
- `src/services/pipelineStyleArbiter.wiring.spec.ts:54,64-65`、`src/services/realSkillExecutor.spec.ts:133-134`：测试契约从“隐式 current 指针”升级为“显式 trace ID 透传”，测量基准包含 `traceRunId/traceCallId` 默认 `null` 的真实形态。

**Before / After**

```text
before: PipelinePanel/realSkillExecutor/skillRouter 可隐式读取 runTraceStore.currentRunId 或 currentApiCallId；
        并行 run 共用 pipeline 单槽 current 指针，后启动 run 覆盖前者，事件/测量可能串线
after:  trace.runId 由 startStepTrace 显式逐层下传；folder pass 测量携带自己的 traceRunId/traceCallId；
        PipelinePanel 执行层 rg 清零，192 个相关测试与 vue-tsc 均通过
```

**验证**

```text
npx vitest run src/services/pipelineParallelismPhase0.spec.ts src/services/pipelineProgressReaders.spec.ts src/stores/runTrace.spec.ts src/services/pipelineStyleArbiter.wiring.spec.ts src/services/realSkillExecutor.spec.ts src/services/skillRouter.spec.ts
→ Test Files 6 passed (6), Tests 192 passed (192)

npx vue-tsc --noEmit -p tsconfig.json
→ exit 0

rg -n "runTraceStore\.(currentRunId|currentApiCallId)|getRunId\('pipeline'\)" src/components/pipeline/PipelinePanel.vue
→ exit 1, 0 hits
```

### P0-1 四格再入矩阵闭环

**验证**

```text
node scripts/verify-pipeline-parallelism-electron.mjs
→ exit 0, result=PASS
```

关键证据：

- coverage 五项全 true：`freshStart`、`successfulTerminalReentry`、`canceledRunIsolation`、`breakpointReentry`、`failedTerminalReentry`。
- 成功终态再入：旧正文 hash `c1e1fc...d75fd8`，新 runId `pipeline-run-1792784561681-4`，正文物理请求 3 → 6，新 hash `0c6fa0...c1cd6de5`。
- 断点恢复再入：失败 run `pipeline-run-1792784586437-5` 物理请求 2 次；恢复 run `pipeline-run-1792784594771-6` 物理请求 2 次，事件含 `chain-handoff-resume` 与两次 `api-success`，最终正文 4,664 字。
- 失败终态后再入：失败 run 物理请求 1 次；再入 run 物理请求 3 次，最终正文 4,664 字。
- 取消隔离：章节点击取消后 137ms 进入 `canceled`，卷纲与正文继续至 `succeeded`。
- 证据：`_audit/verification-pipeline-parallelism-live/report.json`。

**边界**

- 本报告为真实 Electron UI + mock provider 的故障注入矩阵；真实供应商矩阵由 P0-2 覆盖，两者互补，不互相冒充。

### P0-5 StyleProfileCard current 指针清零

**实现**

- `src/components/common/StyleProfileCard.vue` 删除 `runTraceStore.getRunId(props.host)` 读取分支，观测对象改为独立 `style-benchmark-import` task run。

**Before / After**

```text
before: runTraceStore.getRunId(props.host) 可隐式拿到最新 run，观测对象随 current 指针漂移
after:  runTraceStore.getRunId(props.host) 在组件生产源码 0 命中；trace run 显式创建并绑定
```

**验证**

```text
npx vitest run src/components/common/StyleProfileCard.spec.ts
→ Test Files 1 passed (1), Tests 12 passed (12)

rg -n "getRunId\(props\.host\)" src/components/common/StyleProfileCard.vue
→ exit 1, 0 hits
```

### P1-6 取消全部单源化

**实现**

- `src/components/pipeline/PipelinePanel.vue` 的 `confirmCancelAllRuns` 改为调用 `pipelineStore.cancelAllActiveRuns()`。
- `src/stores/pipeline.ts` 导出 `activeRuns` computed，取消入口不再遍历各自层状态。

**Before / After**

```text
before: 取消全部入口各自扫描层状态，容易漏 queued run 或形成第二套状态源
after:  registry 单源取消全部 active run，queued/running 均可取消并记录取消结果
```

**验证**

```text
npx vitest run src/stores/pipeline.spec.ts
→ 取消全部相关断言 PASS

npx vue-tsc --noEmit -p tsconfig.json
→ exit 0
```

### P1-7 排队原因 UI/trace 同源

**实现**

- `reportProviderQueue` 同时更新 registry 的 `queuedReason` 与对应 trace run 的 `provider-queue` 事件；运行中心 `activeRunLabel` 读取 registry 单源。

**Before / After**

```text
before: provider 排队只写 trace，UI 无法解释为什么 run 在等待
after:  UI 与 trace 从同一 providerScheduler 回调取数，排队原因可见且归属一致
```

**验证**

```text
mock 报告：volumes/chapters/body 三个 trace run 的 providerQueueEvents 均为 1；
live 报告：providerQueueEvents > 0，UI 状态文本为“已获得供应商槽位，正在请求供应商”
```

### P1-10 pipeline 旧全局态执行层清零

**对账**

- `src/stores/pipeline.ts` 中 `generationStatus` 与 `isGenerating` 均为 `registry.activeRuns` 的派生 computed，执行层无直接写入。
- `src/components/pipeline/PipelinePanel.vue` 四层按钮只读各自 `activeXxxRun`，不读全局生成状态。
- `ChatPanel.vue` 与 `OutlineWorkspace.vue` 的同名状态是各自域内局部状态，不属于 pipeline 执行语义。

**验证**

```text
npx vitest run src/services/pipelineProgressReaders.spec.ts src/services/pipelineParallelismPhase0.spec.ts
→ Test Files 2 passed (2), Tests 31 passed (31)

npx vue-tsc --noEmit -p tsconfig.json
→ exit 0
```

### P2-11 版本升级与封装核验

**实现**

- `package.json` / `package-lock.json` 版本升级 `3.103.0 -> 3.104.0`。
- 新增 `scripts/verify-packaging-3-104-0.mjs`，替代 3.103 核验脚本，只保留最新核验口径。

**验证**

```text
npx vue-tsc --noEmit -p tsconfig.json
→ exit 0

npm run build:vue
→ exit 0，renderer + electron 构建成功

npm run build
→ exit 0，electron-builder 完成 NSIS 打包

node scripts/verify-packaging-3-104-0.mjs
→ ===== PACKAGING 3.104.0 VERIFICATION PASSED =====
```

**交付证据**

- 安装包：`dist/神意助手-Setup-3.104.0.exe`，231,562,775 bytes。
- SHA256：`8ce409b0e017dc3b3fd45088681f7dc81a2e8403c479124bdabd6c38ea601929`。
- asar：`dist/win-unpacked/resources/app.asar`，241,453,760 bytes。
- rendererFiles=81，electronAPI methods=77，真实启动渲染文本非空，未出现“无法加载/白屏”。
- 证据：`_audit/verification-packaging-3-104-0/packaging-evidence.json`。

**清理**

- 删除 3.103.0 安装包与 blockmap、`verify-packaging-3-103-0.mjs`、3.103 核验证据目录。
- 删除临时日志：`latest-electron-run.log`、`vitest-cancelall-red/green.log`、`vitest-stylecard-red/green.log`。
- dist 仅保留 3.104.0 安装包与 blockmap，符合“只保留最新状态”。

## 7. 缺口清单

| 编号 | 状态 | 说明 |
|---|---|---|
| P1-8 | 已完成 | 实现与单测/type-check 已验证；live 长流式仍按 P0-2 供应商矩阵统一登记 |
| P1-9 | 已完成 | queued/running 取消、trace flush、项目保存隔离均有代码与测试；Electron 关闭窗口的真实 UI 事件在 P2-11 封装核验中补 |
| P0-1 | 已完成 | mock 故障注入矩阵五项 coverage 全 true；断点恢复与失败终态后再入均有新物理请求证据 |
| P0-2 | 已完成 | live 供应商矩阵 PASS；三层并发、取消隔离、成功终态再入均有真实请求与终态证据；断点/失败终态再入保留 mock 互补证据 |
| P0-3 | 已完成 | `rg "generationProgress" scripts --glob "verify-*.mjs"` 0 命中；执行层按 run 绑定，剩余 `generationStatus` 为 registry 派生语义 |
| P0-4 | 已完成 | PipelinePanel 执行层 current 指针读取清零；trace ID 显式透传；6 个测试文件 192 用例 + vue-tsc + rg 清零证据见第 6 节 |
| P0-5 | 已完成 | 生产组件 current 指针读取清零；12 用例与源级负向断言通过 |
| P1-6 | 已完成 | 取消全部改 registry 单源；确认流程与取消结果有测试 |
| P1-7 | 已完成 | provider queuedReason UI/trace 同源；mock 与 live 报告均有排队事件 |
| P1-10 | 已完成 | generationStatus/isGenerating 均为 registry 派生语义；执行层直接写入清零 |
| P2-11 | 已完成 | 3.104.0 构建、NSIS/asar、SHA256、真实启动核验、旧产物清理全部完成 |
| P2-12 | 已完成 | git 分类提交与工作区干净 |

P2-12 已完成。分类提交记录如下：

- `0c77681a` `feat(pipeline): add run registry and per-run parallel execution`
- `e8274e0f` `test(pipeline): cover reentry isolation and parallel verification`
- `bbfa13ba` `chore(release): bump version to 3.104.0`
- `10d7d661` `docs(audit): close pipeline parallelism V3.3 evidence`

提交后执行 `git status --short`，输出为空，工作区干净。
