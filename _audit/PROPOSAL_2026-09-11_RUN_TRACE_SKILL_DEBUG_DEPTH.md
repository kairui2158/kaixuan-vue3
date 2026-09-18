# 运行记录深度化三期方案

> 日期：2026-09-11  
> 状态：待审核，未执行  
> 依据：`_audit/神意开发经验总结_v3.md`、运行记录链路源码复查  
> 目标：把运行记录从“流程摘要”升级为“SKILL 制作方可复现实验现场”，完整记录请求、响应、流式、降级、轮次输出、上下文组装、技能版本和本地处理结果。

## 1. 问题定义

### 1.1 用户反馈

1. API 对话框气泡中能看到工具协议降级，但运行记录没有记录，SKILL 设计层无法判断“模型为什么突然换协议”。
2. 用户和 API 对话时，运行记录只显示用户输入，看不到 API 输出了什么、输出几次、流式滚动了哪些内容。
3. SKILL 制作方需要更完整的信息来判断技能效果，希望运行记录尽可能覆盖每一个关键字符和决策点。

### 1.2 已确认根因

| 缺口 | 位置 | 现状 |
|------|------|------|
| 主页共创请求为空 | `src/components/chat/ChatPanel.vue:805` | `onApiCallStart` 传 `requestMessages: []` |
| 主页共创响应为空 | `src/components/chat/ChatPanel.vue:813` | `onApiCallFinish` 传 `responseText: ''`，未消费 `meta` |
| 大纲共创请求为空 | `src/components/common/OutlineWorkspace.vue:1937` | 同主页问题 |
| 大纲共创响应为空 | `src/components/common/OutlineWorkspace.vue:1941` | 同主页问题 |
| 降级只写气泡 | `src/services/aiService.ts:1019` | `onCompatibilityMode` 只用于 UI 提示 |
| 降级首次失败不落 trace | `src/services/aiService.ts:976` | 失败请求与降级重试合并为一次成功结果 |
| 轮次缺 assistant 侧 | `src/stores/runTrace.ts:58` | `RunTraceTurn` 只有 `userRequest` |
| API 调用缺工具现场 | `src/stores/runTrace.ts:32` | 无 tools/toolCalls/toolResults/downgrade 字段 |
| 上下文组装不可见 | `ChatPanel.vue` / `OutlineWorkspace.vue` | 组装结果只在调用前临时存在 |

### 1.3 已有基础

- `runTrace.ts` 已有 `appendStream/appendCumulativeStream`、按轮次聚合、事件、导出脱敏、近 20 次滚动窗口。
- `workspaceSkillEngine.ts` 已把 `requestMessages/toolCalls/toolResults` 放进 `WorkspaceSkillRunMeta`。
- `RunTracePanel.vue` 已有请求消息、流式输出、完整返回、usage 的展示位。
- 直接对话路径已记录请求和响应，真正断的是共创技能路径与降级细节。

## 2. 设计原则

1. **不推翻现有 schema v3**。全部新增字段可选，旧 JSON 读取不迁移、不报错。
2. **物理请求与逻辑调用分层**。一次逻辑 API 调用下挂多次物理请求（工具循环、降级重试、续生成）。
3. **流式只存增量，不存重复累计全文**。延续 `appendCumulativeStream` 的前缀差量算法，避免重演 37MB 膨胀事故。
4. **敏感信息双侧脱敏**。renderer 导出和主进程保存/导出都必须递归脱敏，API Key 永远不落盘。
5. **近 20 次滚动窗口不变**。单次运行内部不设条数上限，完整现场写入应用数据目录。
6. **第三方可读**。每期附字段说明，导出 JSON 继续按次导出。

## 3. P1：补齐 API 调用现场

### 3.1 数据结构

`RunTraceApiCall` 增量字段：

```typescript
interface RunTraceApiCall {
  // 现有字段全部保留
  tools?: Array<{ name: string; policy: 'read' | 'write'; description?: string }>
  toolCalls?: Array<{ name: string; input: unknown }>
  toolResults?: Array<{ call: { name: string; input: unknown }; result: unknown }>
  compatibilityMode?: 'json-protocol'
  toolsDowngraded?: 'json-protocol'
  downgradeReason?: string
  physicalCalls?: RunTracePhysicalCall[]
}
```

`RunTracePhysicalCall`：

```typescript
interface RunTracePhysicalCall {
  id: string
  seq: number
  phase: 'normal' | 'tool_iteration' | 'downgrade_initial' | 'downgrade_retry' | 'continuation' | 'retry'
  status: RunTraceStatus
  requestMessages: RunTraceMessage[]
  responseText: string
  streamText: string
  finishReason?: string
  usage?: unknown
  startedAt: number
  endedAt?: number
  durationMs?: number
  error?: string
  toolsEnabled?: boolean
  toolsDowngraded?: boolean
  downgradeReason?: string
}
```

### 3.2 共创路径补全

`ChatPanel.vue` 与 `OutlineWorkspace.vue` 的 `onApiCallFinish` 改为消费 `meta`：

```typescript
onApiCallFinish: (callId, meta, durationMs) => {
  if (!callId) return
  runTraceStore.finishApiCall(runId, callId, {
    status: 'success',
    responseText: resultTextFor(meta),
    finishReason: meta.finishReason,
    durationMs,
    usage: meta.usage,
    toolCalls: meta.toolCalls,
    toolResults: meta.toolResults,
    compatibilityMode: meta.compatibilityMode,
    toolsDowngraded: meta.toolsDowngraded,
    downgradeReason: meta.downgradeReason
  })
}
```

由于引擎当前在 `onApiCallFinish` 前不持有最终 `text`，同步实施两项：

1. `WorkspaceSkillRunMeta` 增加 `responseText`、`usage`、`compatibilityMode`、`toolsDowngraded`、`downgradeReason`。
2. `callWorkspaceSkill()` 成功后把最终输出与调用结果写入 meta。

`requestMessages` 修复方式：`onApiCallStart` 先创建空记录，引擎在组装消息后调用 `setApiCallRequest()` 回填；或把回调签名扩展为 `(skillId, skillName, model, requestMessages)`。本方案采用 **回填方案**，避免回调时序耦合。

### 3.3 降级与物理请求记录

`CallAiParams` 增加可选 `onPhysicalCall?: (event: PhysicalCallEvent) => void`。`aiService.ts` 在以下位置发事件：

| 位置 | phase | 说明 |
|------|-------|------|
| `callAiWithToolFallback` 首次失败 catch | `downgrade_initial` | 记录 HTTP 状态、供应商错误摘要、原始请求 |
| 降级重试前 | `downgrade_retry` | 记录去 tools 后的请求 |
| `callAiWithTools` 每轮循环 | `tool_iteration` | 记录该轮 messages 与响应 |
| `callAiWithoutTools` 请求前后 | `normal` | 记录普通请求 |
| 续生成调用 | `continuation` | 由调用层标记 |
| retry 实际重试 | `retry` | 记录第 N 次重试 |

入口层把物理请求事件写入当前 `RunTraceApiCall.physicalCalls`，并在时间线追加 `physical-call` 事件。若降级发生，同时写 `tool-compatibility` 事件，级别为 `warn`。

### 3.4 轮次 assistant 侧

`RunTraceTurn` 增加：

```typescript
interface RunTraceTurn {
  // 现有字段保留
  assistantResponse?: string
  assistantResponseChars?: number
  apiCallIds?: string[]
  toolCallCount?: number
  continuationCount?: number
}
``+

轮次结束时由入口层回填：最终 assistant 文本、字符数、关联 API 调用、工具调用次数、续生成次数。

### 3.5 P1 验收标准

- [ ] 主页共创 chain 一次请求：每技能一条 API 记录，请求消息、响应全文、usage、finishReason 完整。
- [ ] 大纲共创 chain 一次请求：同上。
- [ ] 主页/大纲直接对话：请求、流式、返回、usage 继续完整。
- [ ] 续生成：同一轮内新增 continuation API 记录，不切新轮次。
- [ ] 工具循环：每轮物理请求独立记录，`toolCalls/toolResults` 完整。
- [ ] 降级：首次失败记录 `downgrade_initial`，降级重试记录 `downgrade_retry`，时间线有 warn 事件，气泡提示与 trace 一致。
- [ ] 导出 JSON 双侧脱敏。
- [ ] 旧 v3 JSON 可打开，不报错，不丢字段。

## 4. P2：记录有效提示词与上下文组装

### 4.1 数据结构

`RunTrace` 增量字段：

```typescript
interface RunTrace {
  // 现有字段保留
  promptSnapshots?: RunTracePromptSnapshot[]
}

interface RunTracePromptSnapshot {
  id: string
  apiCallId?: string
  turnId?: string
  skillId?: string
  skillName?: string
  mode?: string
  builtAt: number
  contextBlocks: Array<{
    key: string
    source: string
    chars: number
    content?: string
  }>
  systemPrompt?: string
  userPrompt?: string
  finalMessages: RunTraceMessage[]
}
```

### 4.2 记录内容

每个 API 调用前记录：

1. 模板渲染前文本。
2. 模板渲染后文本。
3. 变量注入表：变量名、来源、字符数、注入值（超大值按原文保存，不截断）。
4. Agent systemPrompt 叠加结果。
5. 上下文块：编辑器内容、设定、记忆、参考大纲、历史对话、上一步 SKILL 输出。
6. 裁剪结果：保留轮数、各块字符数、是否截断、截断策略。
7. folder 技能文件指纹：文件名、hash、mtime、版本。

### 4.3 实施位置

- `workspaceSkillEngine.ts`：渲染模板后、组装 messages 前创建 snapshot，并把 snapshot id 写入 meta。
- `ChatPanel.vue` / `OutlineWorkspace.vue`：直连对话在 `assembleMessages()` 返回后创建 snapshot。
- `realSkillExecutor` / folder 路径：记录技能包指纹和执行协议诊断。

### 4.4 P2 验收标准

- [ ] 每条 API 记录能反查最终 messages 的组装来源。
- [ ] 模板变量可见：变量名、注入值、字符数，不截断。
- [ ] 上下文块可分块查看：编辑器、设定、记忆、大纲、历史、上一步输出。
- [ ] folder 技能记录文件 hash、mtime、版本。
- [ ] chain 每步的 `previousOutput` 在快照中可见。
- [ ] UI 提供按 API 调用查看对应提示词快照入口。
- [ ] 导出 JSON 含 promptSnapshots。

## 5. P3：质量报告与深度调试模式

### 5.1 数据结构

`RunTrace` 增加：

```typescript
interface RunTrace {
  // 现有字段保留
  processingReports?: RunTraceProcessingReport[]
}

interface RunTraceProcessingReport {
  id: string
  apiCallId?: string
  turnId?: string
  stage: 'pre' | 'post' | 'eval'
  processor: 'hard-rules' | 'deai' | 'postProcess' | 'integrity' | 'other'
  status: 'success' | 'warning' | 'failed'
  inputText: string
  outputText: string
  ruleHits?: Array<{ rule: string; count: number; samples?: string[] }>
  issues?: unknown[]
  integrity?: {
    paragraphCountSame: boolean
    sentenceCountSame: boolean
    lengthRatio: number
    rolledBack: boolean
  }
  startedAt: number
  endedAt?: number
  durationMs?: number
}
```

### 5.2 记录内容

1. 硬规则前处理：输入、输出、命中规则、命中次数。
2. 硬规则后处理：DEAI 前后对照、完整性校验、是否回滚。
3. `postProcess.issues`：blocking/error/warning 分级、是否重试、是否降级。
4. 输出协议解析：body/metadata 分离结果、结构降级原因。
5. 技能评测报告：既有 `evalReport` 扩展关联 API 调用。

### 5.3 深度调试模式

设置页新增“深度运行记录”开关，默认关闭。开启后记录：

- 原始 HTTP 请求体（不含 Authorization 和 API Key）。
- 原始响应 JSON。
- 完整 chunk 时间线。

默认关闭时仍记录 P1/P2 的结构化现场；开启后用于第三方 SKILL 深度排查。

### 5.4 P3 验收标准

- [ ] 硬规则处理前后文本与命中规则入 trace。
- [ ] `processBody()` 完整性校验结果与回滚状态入 trace。
- [ ] postProcess issues 不再静默丢弃。
- [ ] 输出协议解析失败有结构化记录。
- [ ] 深度模式开启时记录原始请求/响应，关闭时不记录原始包。
- [ ] 深度模式默认关闭。
- [ ] 导出 JSON 含 processingReports。

## 6. UI 方案

### 6.1 API 调用 Tab

每条 API 调用新增：

- 基本信息行：协议模式、是否降级、物理调用数、工具调用数。
- 折叠区：物理请求列表。
- 折叠区：工具调用与结果。
- 折叠区：提示词快照入口（P2）。
- 折叠区：本地处理报告（P3）。

### 6.2 时间线 Tab

新增事件：

- `physical-call`：第 N 次物理请求开始/完成。
- `tool-compatibility`：降级原因与模式。
- `prompt-built`：提示词快照创建。
- `processing-report`：本地处理完成。
- `turn-assistant`：轮次 assistant 输出已记录。

### 6.3 导出 Tab

- 导出 JSON 继续默认全量结构化。
- 文案更新：说明包含请求、响应、流式、物理调用、提示词快照、本地处理、脱敏策略。

## 7. 实施顺序与任务拆分

### Phase P1-A：store 与类型基础

1. `runTrace.ts` 扩展 `RunTraceApiCall/RunTraceTurn/FinishApiCallInput`。
2. 新增 `appendPhysicalCall/updatePhysicalCall/attachPromptSnapshot/attachProcessingReport`（后两个为 P2/P3 预留，不实现 UI）。
3. 单测：物理调用、轮次 assistant、工具字段、导出脱敏、旧数据兼容。

### Phase P1-B：引擎 meta 补全

1. `WorkspaceSkillRunMeta` 扩展。
2. `callWorkspaceSkill()` 写入 responseText、usage、协议字段、工具字段。
3. `onApiCallStart` 后通过 `setApiCallRequest()` 回填请求。
4. 单测覆盖 chain/compose/folder/text 路径。

### Phase P1-C：入口接线

1. `ChatPanel.vue` 共创路径消费 meta。
2. `OutlineWorkspace.vue` 共创路径消费 meta。
3. 两个入口的直连与续生成路径复用新字段。
4. 时间线补 `tool-compatibility` 事件。

### Phase P1-D：aiService 物理请求事件

1. `CallAiParams` 增加 `onPhysicalCall`。
2. `callAiWithToolFallback` 记录首次失败与降级重试。
3. `callAiWithTools` 每轮记录物理请求。
4. `callAiWithoutTools` 记录 normal 请求。
5. 入口层订阅并写入 `physicalCalls`。

### Phase P2：提示词与上下文快照

1. 引擎在组装 messages 前创建 prompt snapshot。
2. 直连路径在 `assembleMessages()` 后创建 snapshot。
3. folder 指纹写入 snapshot。
4. UI 按调用关联展示。

### Phase P3：处理报告与深度模式

1. 硬规则/DEAI 处理报告接入。
2. postProcess issues 协议化。
3. 深度模式 IPC 与设置 UI。
4. 原始包记录。

## 8. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 大文本导致 trace 膨胀 | 高 | 物理请求只存增量；不保存重复累计流；深度模式默认关闭 |
| aiService 埋点影响主链路 | 高 | 事件回调可选、try/catch 隔离，埋点失败不中断生成 |
| 导出体积变大 | 中 | JSON 按次导出；保持近 20 次；超大字段不截断但避免重复 |
| 双入口重复实现 | 中 | 抽共享 helper，ChatPanel 与 OutlineWorkspace 复用 |
| 主进程保存失败 | 中 | 保留现有 autosave-failed 事件；原子写保护已有 |
| 泄漏敏感信息 | 高 | renderer 与主进程双层递归脱敏；深度模式不记录 Authorization/API Key |
| 旧格式不兼容 | 中 | 全部字段可选；读取 v3 不迁移 |
| UI 被长文本拖慢 | 中 | 折叠区 + `pre` 滚动；不做全量虚拟列表重构 |

## 9. 验证矩阵

### 9.1 单元测试

- runTrace store：新字段、物理调用、轮次 assistant、脱敏、导出。
- workspaceSkillEngine：meta 完整性、chain/compose、folder 路径。
- aiService：降级、工具循环物理事件。
- 入口 helper：meta 映射、请求回填。

### 9.2 构建与类型

- `npm run type-check`
- `npm run build:vue`
- `npm run test:services`（如覆盖范围变化则同步更新）

### 9.3 真实 UI 验证（源 Electron + CDP）

前置：先 `npm run build:vue`，再启动源 Electron。探针必须模拟真实用户路径：

1. 打开主页编辑器，发送共创请求，验证每技能请求/响应/流式/物理调用。
2. 打开大纲工作台，发送共创请求，验证同上。
3. 触发降级场景（模拟供应商拒绝 tools），验证 `downgrade_initial/retry`。
4. 触发工具循环，验证多物理请求。
5. 续生成一次，验证同轮 continuation。
6. 打开运行记录面板，验证四 Tab 展示与导出 JSON 字段。
7. 导出 JSON 检查脱敏与 schema。

若 Electron/CDP 域假死，按经验文件规则降级为：构建产物扫描 + type-check + vitest + UI 用户实测说明，不得伪称 CDP 已通过。

## 10. 待用户确认项

1. **P1 是否直接实施到源码？** 本方案目前只审核，不执行。
2. **轮次 assistant 摘要是否保存全文？** 建议保存全文，因为这是 SKILL 复现的核心现场。
3. **提示词快照是否包含编辑器全文？** 建议包含最终注入内容，不截断；这会明显增加导出体积。
4. **深度调试模式是否 P3 一起做，还是后续单独做？** 建议一起做，但默认关闭。

## 11. 收尾要求

1. 全部阶段完成后更新 `_audit/神意开发经验总结_v3.md`。
2. 新增 `_audit/DEV_LOG_2026-09-11_RUN_TRACE_SKILL_DEBUG_DEPTH.md`。
3. 更新 `_audit/DEV_LOG_MASTER_INDEX.md`。
4. 清理临时脚本和临时验证文件。
5. 封装只在用户明确要求后执行。

## 12. 明确不做

- 不改变近 20 次滚动窗口。
- 不取消按会话聚合。
- 不取消按次导出。
- 不让模型绕过写入确认安全壳。
- 不把 API Key 写入任何运行记录。
- 不在本方案中重写运行记录 UI 架构，只做增量扩展。
