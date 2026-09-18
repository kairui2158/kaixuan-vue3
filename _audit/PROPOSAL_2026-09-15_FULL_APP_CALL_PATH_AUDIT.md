# PROPOSAL 2026-09-15: 全应用调用路径递归审计

> 目标：递归审计全应用 AI 调用路径、错误传播、Trace 生命周期、取消/覆盖链路和隐藏分支，输出可执行修复方案。  
> 当前阶段：静态递归审计完成，尚未修改代码。  
> 审计产物：`_audit/call-graph.json`（1137 个模块、3130 条依赖）、`_audit/call-graph.dot`。

## 1. 审计范围

本次不是只查 OutlineWorkspace 单点，而是按以下五层递归：

1. **统一 AI 入口层**：`aiService.callAi()`、供应商模型拉取、连接测试。
2. **业务服务层**：`workspaceSkillEngine`、`realSkillExecutor`、`folderSkillEval`、`namingService`、`memoryExtractor`、`continuationService`。
3. **组合层**：`useAiTools`、`useAiNaming`、`useDeAi`、`useSkillTest`、`useAiCallTrace`。
4. **界面入口层**：主页 ChatPanel、大纲工作台 OutlineWorkspace、生成流水线 PipelinePanel、主页编辑器 EditorPanel、设置页 ApiSettings。
5. **横切链路**：RunTrace / API Call / Turn / 取消 / 重试 / 续生成 / 意图路由 / 工具写入 / folder skill 前后处理。

## 2. 已确认的真实缺陷

### P0-A：folder skill 链式输入滚雪球

**证据**

- `src/services/workspaceSkillEngine.ts:563-566`：folder 模式下，`previousOutput` 被完整拼进下一步的 user prompt。
- `src/services/workspaceSkillEngine.ts:482-491`：`contextPolicy()` 已能把超长大纲降级为结构地图，说明应用已有“少重复注入”的基础，但 folder 链的 `previousOutput` 没有进入同一约束。

**实际后果**

用户之前看到的 `微场景` 数千次重复、S4 输入巨大、耗时超过上游，就是这条路径的直接放大器。它不会每次立刻产生语义错误，但会持续稀释模型注意力，让上游中间产物反复污染后续步骤。

**修复方案**

引入统一的 chain handoff 协议，不允许把上一步完整输出继续原样拼进下一步。

1. 每一步输出后生成本步 `HandoffArtifact`：
   - `artifactId`
   - `sourceStep`
   - `outputHash`
   - `fullTextPath`
   - `summary`
   - `structuredFacts`
   - `keyConstraints`
   - `openQuestions`
   - `nextStepHint`
2. 下一步默认只注入：
   - 最终定稿类内容：全文。
   - 中间过程类内容：结构化 handoff + 必要片段引用。
   - 需要完整原文时：按需挂载路径，不重复内联。
3. 同一 `outputHash` 在一次运行内不得重复注入；重复出现必须进 Trace 事件。
4. Trace 新增 `chain-handoff` 事件，记录每步的原文长度、实际注入长度、摘要长度、丢弃片段数，SKILL 调试时可完整对账。

### P0-B：OutlineWorkspace finally 仍会把异常路径“宣告成功”

**证据**

三处 finally 在异常后仍尝试执行 success。当前 store 层 `finishRun()` 已有终态保护（`run.status !== 'running'` 则直接返回），所以不会真的覆盖 failed，但属于冗余/误导代码：

- `src/components/common/OutlineWorkspace.vue:2590-2610`：技能链 catch 已 `finishOutlineRun('failed', ...)`，finally 又按 `success` 收尾。
- `src/components/common/OutlineWorkspace.vue:3140-3160`：直接对话路径同样存在。
- `src/components/common/OutlineWorkspace.vue:3237-3240`：续生成路径同样存在。

**澄清**

当前 `runTrace.ts` 的 API Call 与 Turn 已有终态保护，所以多数情况下不会真的把 failed turn 覆盖成 success；但这不是可以保留的理由。finally 的意图错误会让运行状态、UI 状态、日志语义和未来扩展产生偏差。正确语义应该是：**catch 已设置终态，finally 只负责清扫，不负责改判**。

**修复方案**

1. 抽取统一的 Outline Trace 收尾器，例如 `outlineTraceLifecycle`。
2. 增加状态机字段：
   - `pending`
   - `running`
   - `terminal-success`
   - `terminal-failed`
   - `terminal-canceled`
   - `awaiting-user`
   - `budget-blocked`
3. `finishOutlineRun()` 只允许从 `running` 或 `awaiting-user` 进入终态；终态后只能补充事件，不能改判。
4. 所有 finally 只调用 `sealOutlineTrace()`：
   - 已有终态：不覆盖。
   - 仍 running：按异常状态或用户取消收尾。
   - API call 未闭合：取消并写明原因。
5. 删除三处 finally 的固定 success。

### P0-C：部分隐藏 AI 调用没有 Trace 覆盖

**已确认入口**

| 入口 | 当前状态 |
|---|---|
| `useAiTools.callAi()` | 有 API 调用，无 RunTrace。 |
| `provider.fetchModels()` / `testConnection()` | 有外部请求，无 RunTrace。 |
| `memoryExtractor.unifiedMemoryAiCall()` | 只在有外部 trace 传入时记录，否则脱轨。 |
| `folderSkillEval` 基线调用 | 只依赖 `useSkillTest` 包裹，service 单独调用时无 run 级记录。 |
| `continuationService` | 作为子调用参与主链路，但自身来源和调用序号不够独立。 |

**后果**

这些调用一旦失败、超时、降级或重试，用户和 SKILL 调试者无法判断“为什么没结果”，也不能和主链路对账。这正是之前“用户空等、Trace 少记录”的同类根因。

**修复方案**

1. 建立唯一的 `AiInvocation` 分类：
   - `primary`：用户可见的主生成。
   - `subtask`：主流程内的子任务。
   - `background`：记忆、命名、评测、检查。
   - `infra`：模型列表、连通性测试。
2. 所有 AI 外呼都必须生成至少一条 RunTrace API Call。
3. `useAiTools.callAi()` 改为接受可选 parent trace；无 parent 时创建 `background` run。
4. `provider.fetchModels()` / `testConnection()` 新增 `infra` 级轻量 Trace，记录 URL 模式、状态、耗时、脱敏错误。
5. `memoryExtractor`、`folderSkillEval` 强制接收 trace context，禁止无主外呼。
6. Trace 增加 `invocationKind`、`parentRunId`、`parentApiCallId`，保证子任务可追到主任务。

## 3. 加固项，不是当前事故根因

### P1-A：`useAiCallTrace.finish()` 依赖调用方传对状态

`finish(status, error)` 目前只是透传。PipelinePanel 已经用 `traceStatusFromRun()` 反推，EditorPanel 和 useDeAi 语义正确，但 composable 本身没有终态防覆盖。

修复：

1. `finish()` 内部先读取当前 run 的 API Call 汇总状态。
2. 如果已有 failed/canceled，调用方 success 只能变成 `degraded`，同时记录 `status-conflict` 事件。
3. 如果存在未闭合 API Call，先关闭再 finish。

### P1-B：运行互斥缺统一策略

主页工具、AI 命名、Outline、Chat 都有“新运行挤掉旧运行”的逻辑，但各写各的。

修复：

统一到一个 `runTraceLifecycle` helper：

1. `evictPreviousRun(source, reason)`
2. `beginRun(source, config)`
3. `finishRun(source, status, error)`
4. `sealRun(source, fallbackStatus, fallbackError)`

禁止组件直接对 previous run 执行 cancel + finish 组合。

### P1-C：成功/失败判定应来自统一结果分类器

目前不同入口分别看 `isGenerating`、`generationStatus`、`evalError`、`result.text`、异常类型。

修复：

新增 `classifyRunOutcome({ exception, result, finishReason, signal, writeBudget, routingState })`，输出唯一状态。UI 只消费结果，不再自行推断。

## 4. 需要保留的现有机制

以下不是问题，不能顺手重构掉：

1. `finishApiCall()` 的终态保护：防止取消后迟到 success 覆盖。
2. `finishTurn()` 的终态保护：chat 会话按 turn 保留多次结果。
3. ChatPanel 的会话式 run：同一会话共用 run，逐 turn 记录。
4. PipelinePanel 的 `traceStatusFromRun()`：虽然绕，但方向正确，后续可替换为统一分类器。
5. 3.45.0 的 continuationSlim、ContextPack 去重：本次不能回滚。

## 5. 修复顺序

### 第一阶段：终态状态机

1. 修改 `runTraceLifecycle` 状态机。
2. 改造 OutlineWorkspace 三处 finally。
3. 给 `finishRun` / `finishTurn` / `finishApiCall` 补终态冲突事件。
4. 新增单测：failed 后 finally success 不覆盖；canceled 后迟到 success 不覆盖；awaiting_user 不会被 finally 改成 success。

### 第二阶段：folder chain handoff

1. 实现 HandoffArtifact 生成器。
2. 改造 `workspaceSkillEngine` folder 链输入。
3. 保留全文原件到运行目录。
4. Trace 记录注入对账。
5. 用真实超长 folder skill 链验证注入长度和去重率。

### 第三阶段：隐藏 AI 调用归一

1. 增加 `invocationKind`。
2. 接入 useAiTools、provider infra、memoryExtractor、folderSkillEval。
3. 增加无主外呼告警。
4. 验证所有 AI 外呼都有 RunTrace。

### 第四阶段：调用方状态统一

1. 引入 `classifyRunOutcome()`。
2. 替换 Outline / Chat / Pipeline / Editor 的分散判断。
3. 保留原有 UI 文案，不改视觉结构。

### 第五阶段：验证与收口

1. `npm run type-check`
2. `npm run test:services`
3. `npm run build`
4. 真实 Electron 手工路径：
   - 大纲 skill 链失败。
   - 大纲取消后迟到回调。
   - folder 长链。
   - 主页工具失败。
   - 去AI味失败。
   - 命名失败。
   - 记忆抽取超时。
   - 供应商连通失败。
5. Trace 对账：每条真实外呼至少一条 API Call，终态正确，成功/失败/取消不被覆盖。

## 6. 风险控制

1. 不删除 chat session run 机制。
2. 不改变 UI 结构和用户流程。
3. 不修改 3.45.0 已验证的 continuationSlim。
4. 不用一次性重构替换所有调用点；先补状态机和 handoff，再逐入口迁移。
5. 每阶段后运行测试；Trace 相关修复必须用 RunTrace JSON 对账。

## 7. 验收标准

1. OutlineWorkspace 三条路径失败后，Trace 终态为 failed，不是 success。
2. folder chain 每步输入中，同一输出片段不得重复内联。
3. 超长 chain 的后置步骤注入字符量显著下降，且关键约束可追溯。
4. 所有 AI 外呼均能在运行记录找到，包括隐藏工具、供应商测试、记忆、命名、评测。
5. 所有 finally 不改判终态。
6. 新增测试覆盖成功、失败、取消、降级、等待确认、预算耗尽、迟到回调七种状态。


