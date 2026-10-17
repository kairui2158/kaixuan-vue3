# 任务台账：正文层 metadata 契约与物理重试台账收口

## 1. 目标与原话

用户已确认执行修订方案。原始目标：修复 `run-trace-正文层-20261017-200242-standard` 暴露的 6 个暗伤，覆盖正文 metadata 交接丢失、物理重试漏账、trace 同名台账两套公式、token 估算偏低、字数口径混用、`legacy_outline_no_scope` 遗留登记。

最终可感知行为：S1 生成契约中的 metadata 能被结构化传递到 S3；direct/schema/continuation 物理请求在 run trace 中可准确分类；run 级与 step 级 timing ledger 同名指标来自同一计算源；估算校准不放宽任何安全边界；UI 与验收使用同一字数口径。

## 2. 门禁读证

- G0.3 诚实闭环：完成声明必须区分已验证、未验证、历史边界。
- G0.5 回头看：收尾前逐项对账台账、diff、生产入口、验证证据。
- G0.9 影响圈声明：先列“打算改的/可能碰到的”，未列入不碰。
- G0.10 新旧并存清零：旧 `finalBody.length` 口径、旧 metadata 丢失路径必须反查消费面。
- G0.12 门禁执行台账：本文件为执行凭证，七节不可空。
- G1.1 精准编辑与 diff 自审：只改可归因于本轮目标的行。
- G1.4 验证真实性与分层：type-check、单测、回放、Electron 分层声明。
- G1.5 验证器自身质量：断言必须覆盖决策结果与下游副作用，采集器与断言同批升级。
- G1.8 日志与观测同步：trace 字段、schema、导出、验证器同批对账。
- G2.9 终稿与流水线：attempt 指纹、断点产物、物理请求生命周期必须一致。

## 3. 路由判定

加入：G0.1、G0.3、G0.4、G0.5、G0.8、G0.9、G0.10、G0.12、G1.1、G1.4、G1.5、G1.7、G1.8、G2.9。

排除：

- G0.11 真实交互冒充禁令：本轮以生成流水线观测契约为主，但 Electron 验证若执行仍必须真实操作，不降级。
- G1.18 本地确定性路径：本轮不修改本地文件写入契约。
- G1.19 耗时观测先于性能决策：本轮只修观测公式，不用耗时数据做性能取舍。
- G2.11 供应商软错误：本轮不改供应商协议与软错误分类。

## 4. 影响圈与作者反证

打算改：`stepArtifactAcceptance.ts`、`PipelinePanel.vue`、`chainBreakpoint.ts`、`realSkillExecutor.ts`、`aiService.ts`、`runTrace.ts`、`contextBudget.ts`、相关 spec 与 Electron 验证脚本。

可能碰到：chain 与 compose 双入口、断点恢复产物、folder degraded envelope、trace schema/export/验证器、`estimateInputTokens` 全部调用方、字数事件消费面。

作者反证：

- 假设一：metadata 只需拼回 body。证伪：会把 `【正文交接】` 等标签当正文传给 S3，必须走结构化 handoff。
- 假设二：只标记 direct retry 即可。证伪：schema retry 与 continuation 同属物理生命周期，必须分别可辨。
- 假设三：校准 token 估算可以提升可用输入。证伪：安全比与输出保留区禁止跟随校准放宽，否则重开上下文事故。
- 假设四：UI 字数可继续用字符长度。证伪：同一正文在 UI 与验收将出现两个数值，用户可见口径分裂。

## 5. 停止条件

- metadata：验收返回结构化 metadata；S3 真实请求可证明携带继承契约；拒绝路径无旧产物继续消费。
- retry：direct/schema/continuation physical phase 与 trace 计数一致，多物理请求不再漏账。
- ledger：run 级与 step 级 `firstTokenSumMs`/`outputSumMs` 由同一求和函数产出。
- budget：校准只影响估算；默认值、安全比、输出保留区不被放宽。
- words：生产事件与验收统一 `countBodyWords`，旧口径反查为 0。
- 验证：相关单测、type-check、Electron 真实 UI 验证通过；无法执行的面只能登记 `untested`，不得冒充。

## 6. 执行证据

### 6.1 生产代码与 trace 观测

- metadata 受控交接：`src/services/chainExecution.ts:108-151`。`formatUpstreamMetadata` 现在只输出 `count/totalChars` 与有限预览；`summarizeUpstreamMetadataValue` 限制数组最多 8 项、每项 160 字符；`sanitizeUpstreamMetadataText` 将 `【正文交接】` 等 META_SECTION_HEADERS 归一为 `[metadata-section]`，键数量上限 16。before：`extractedMeta` 以 JSON 全文进入 S3 prompt，元数据标签与全文被当作正文上下文滚动携带。after：S3 只收到 `- extractedMeta: count=1,totalChars=6867` 一类的受控摘要，不再携带原文。
- 链式 metadata 状态流转与断点持久化：`src/components/pipeline/PipelinePanel.vue:2942`、`:3056`、`:3325`。S1 验收产物中的 `upstreamStepMetadata` 逐步传递，断点恢复后仍可交给后续步。
- 物理重试分类：`src/services/realSkillExecutor.ts:925-1041`。同一 attempt 内的物理请求 phase 覆盖 `normal/schema_retry/direct_retry/continuation`；schema retry 请求带 `physicalPhase: attempt > 1 ? 'schema_retry' : 'normal'`，直接失败重试与续写分别标记 `direct_retry`、`continuation`。
- run/step timing 单源求和：`src/stores/runTrace.ts:1999-2063`。run ledger 的 `firstTokenSumMs/outputSumMs` 由 `sumNumber(firstTokens)`、`sumNumber(outputDurations)` 产出；step 聚合继续 `sum(ledger => ledger.firstTokenSumMs)`，最终 `physicalCalls.map(call => call.firstTokenMs)` 与 call ledger 同源。before：run 与 step 各自维护同名指标，可能出现口径漂移。after：Electron 报告记录 `timingLedgerConsistency: "call/run/step same-source sums"`。
- token 校准方向：`src/services/contextBudget.ts:84-85`。before：`observedRatio = 1 / correctedRatio`，导致 token 估算修正方向反转；after：`observedRatio = correctedRatio`，再进入既有上下限。`availableContextTokens` 的窗口、输出保留区、安全比未被放宽。
- UI/验收统一字数口径：`src/components/pipeline/PipelinePanel.vue:4646-4845`。验收、attempt、before/after 与终稿均使用 `countBodyWords(finalBody)`；`:4845` 的终稿 UI 字数不再用 `finalBody.length`。before：用户可见字数与验收字数混用字符长度。after：生产事件与 UI 输出同一口径。
- `legacy_outline_no_scope` 如实登记：`src/components/pipeline/PipelinePanel.vue:4450`。历史大纲在缺少 unit closure 上下文时显式写入 `legacy_outline_no_scope`，不再伪装成普通 `unit_closure`。

### 6.2 验证输出

- `npx vitest run`：173 files / 2015 tests 全部通过。
- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0。
- `node scripts/verify-body-contract-degraded-electron.mjs`：PASSED；runtime fingerprint commit `10e1dcb41d5a`，buildTime `2026-10-17T14:41:54.666Z`。
- 拒绝场景 `run-1792248190641-1`：4 次物理请求，phase 序列 `[normal, normal, schema_retry, schema_retry]`，提取 1654 字，`degraded_plus_contract_failure`，S3 零调用，run failed。
- 接受场景 `run-1792248191556-61`：5 次物理请求，提取 2200 字，S3 请求包含 `--- 上一步结构化交接 ---` 与 `extractedMeta: count=1,totalChars=6867`，且断言不含 `【正文交接】` 原文；`s2SchemaRetryPhases=2`；call/run/step timing 同源。
- 证据归档：`_audit/verification-body-contract-degraded-electron/report.json`、`scenario-a-reject/`、`scenario-b-accept/`。

## 7. 缺口清单

1. **`legacy_outline_no_scope` 是历史遗留，不是本轮缺陷。** 缺少结构化 unit closure 的大纲仍无法补出完整上下文；本轮只保证 trace 如实标记，供后续专项治理，不做静默升级。
2. **schema retry feedback 滚动放大仍是同族未修登记项。** `src/services/realSkillExecutor.ts:500` 的 `buildSchemaRetryFeedback` 仍原样回传候选全文。这是当前修复闭环的设计内行为，但在多轮 schema retry 中会放大请求体；本轮未改其语义，避免与 metadata 受控交接混在同一变更面。
3. **Electron 验证为本地 OpenAI-compatible provider。** 已覆盖真实 UI、真实下拉 SKILL 选择、真实请求/验收/S3 链路，但不是外部 live 供应商矩阵。外部 live 供应商在本仓既有验证中仍受 401 凭据状态限制。
4. **无其他未执行或降级项。** 单测、type-check、前端构建、Electron 双场景、生产入口行号复核均完成；旧 `finalBody.length` 生产口径与 timing 双公式已反查清零。
