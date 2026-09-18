# 运行记录深度化 V2 执行方案

> 日期：2026-09-11  
> 状态：待审核，未执行  
> 前置方案：`_audit/PROPOSAL_2026-09-11_RUN_TRACE_SKILL_DEBUG_DEPTH.md`  
> 调研依据：`_audit/research-cache/run-trace-depth-2026-09-11/research-log.md`  
> 目标：把运行记录升级为第三方 SKILL 制作方可独立复现实验的“完整现场”，同时保持应用轻量、导出可控、敏感信息永不落盘。

## 1. 调研结论摘要

本轮调研了 5 类真实来源：Langfuse、OpenTelemetry GenAI 语义规范、Phoenix、Codex rollout-trace、Anthropic managed agents events。结论是：

1. V1 的三层结构正确：物理请求、提示词快照、本地处理报告。
2. V1 缺的是成熟系统的工程护栏：标准语义、稳定 ID、大对象外置、事件不变量、UI 门控。
3. 不需要引入 OTel、Langfuse、Phoenix 依赖。它们的价值是设计模式，不是运行时依赖。
4. OTel 的流式 chunk 规范仍是 TODO，因此本项目继续采用“增量预览 + 最终权威快照”的自有方案。
5. 大内容不截断，但也不能无限塞进主 JSON。采用 payload 外置 + 引用回指。

## 2. V1 与 V2 差异

### 2.1 社区有、V1 缺失

| 能力 | 社区来源 | V2 补充 |
|------|----------|---------|
| 标准语义命名 | OTel GenAI、Phoenix | 导出增加 `semantic` 映射层 |
| usage 细分 | OTel GenAI | cache、reasoning、input、output token 标准字段 |
| 稳定 tool_call_id | Phoenix | 每次工具调用生成唯一 ID |
| prompt 版本与依赖 | Langfuse、OTel | promptSnapshots 记录版本、hash、mtime、变量 |
| 大对象外置 | OTel、Codex | `payloads/*.json` + `RunTracePayloadRef` |
| 事件 seq 与不变量 | Codex | 全局单调 seq + 导出完整性校验 |
| 流式预览分层 | Anthropic | streamText 只做预览，responseText 是权威结果 |
| UI 大 JSON 门控 | Langfuse | 字符/行数阈值 + 懒加载 + 下载 |
| 上下文压缩标记 | OTel、Anthropic | `context-compacted` 事件 |
| 工具统计摘要 | Langfuse、Phoenix | 次数、失败率、耗时、关联跳转 |

### 2.2 我们有、社区同样坚持

| 能力 | 说明 |
|------|------|
| 近 20 次滚动窗口 | 不无限保留运行列表 |
| 按会话聚合 | 不把一次讨论切碎成多个导出 |
| 双侧脱敏 | renderer 与主进程都递归脱敏 |
| 按次导出 | 用户自由选择导出哪一次 |
| 增量流式 | 只保存 delta，避免重复累计全文 |
| 写入确认安全壳 | 运行记录只观测，不改变写入审批机制 |

### 2.3 我们有、社区不一定提供

| 能力 | 说明 |
|------|------|
| 生成流水线五层语义 | 大纲、设定、卷纲、章节、正文有明确业务含义 |
| folder SKILL 诊断 | 文件指纹、执行协议、诊断信息 |
| 本地硬规则/DEAI 处理报告 | 属于应用内后处理现场 |
| 中文写作场景的上下文块 | 编辑器、设定、记忆、参考大纲、历史对话 |

## 3. 数据模型增强

以下类型全部新增为可选字段，schema 版本升级到 `4`，旧 v3 JSON 仍可直接打开。

### 3.1 语义映射层

```typescript
export interface RunTraceSemantic {
  conversationId: string
  turnId?: string
  prompt?: {
    name?: string
    version?: string
    variables?: Record<string, unknown>
  }
  usage?: {
    inputTokens?: number
    outputTokens?: number
    cacheReadInputTokens?: number
    cacheWriteInputTokens?: number
    reasoningOutputTokens?: number
  }
  timeToFirstChunkMs?: number
  conversationCompacted?: boolean
}
```

规则：

1. `semantic` 只做映射，不替代本地字段。
2. 本地字段优先：遇到同义字段冲突时，`semantic` 以本地字段计算结果为准。
3. 第三方可以直接读 `semantic`，本地调试仍可读原始字段。

### 3.2 工具现场

```typescript
export interface RunTraceToolDefinition {
  name: string
  policy: 'read' | 'write'
  description?: string
  parameters?: unknown
}

export interface RunTraceToolCall {
  id: string
  name: string
  input: unknown
  result?: unknown
  status: 'success' | 'failed' | 'canceled'
  startedAt: number
  endedAt?: number
  durationMs?: number
  error?: string
}
```

规则：

1. `toolCalls[].id` 由应用生成，稳定唯一，贯穿请求、结果、时间线。
2. 工具定义、调用、结果分开记录，不合并成模糊数组。
3. 工具失败不中断运行记录写入。

### 3.3 物理请求

```typescript
export interface RunTracePhysicalCall {
  id: string
  seq: number
  phase: 'normal' | 'tool_iteration' | 'downgrade_initial' | 'downgrade_retry' | 'continuation' | 'retry'
  status: RunTraceStatus
  requestMessages: RunTraceMessage[]
  responseText: string
  streamText: string
  finishReason?: string
  usage?: RunTraceSemantic['usage']
  startedAt: number
  endedAt?: number
  durationMs?: number
  error?: string
  toolsEnabled?: boolean
  toolsDowngraded?: boolean
  downgradeReason?: string
}
```

规则：

1. 一次逻辑 API 调用可挂多次物理请求。
2. 降级首次失败必须记录 `downgrade_initial`，不能被后续成功覆盖。
3. 工具循环每一轮都是独立物理请求。

### 3.4 轮次 assistant 侧

```typescript
export interface RunTraceTurn {
  // 现有字段保留
  assistantResponse?: string
  assistantResponseChars?: number
  apiCallIds?: string[]
  toolCallCount?: number
  continuationCount?: number
}
```

### 3.5 提示词快照

```typescript
export interface RunTracePromptSnapshot {
  id: string
  apiCallId?: string
  turnId?: string
  skillId?: string
  skillName?: string
  skillVersion?: string
  mode?: string
  builtAt: number
  promptName?: string
  variables?: Array<{
    key: string
    source: string
    chars: number
    value: unknown
  }>
  folderFingerprint?: Array<{
    file: string
    hash: string
    mtime: number
    bytes: number
  }>
  contextBlocks: Array<{
    key: string
    source: string
    chars: number
    truncated: boolean
    strategy?: string
    payloadRef?: string
    preview?: string
  }>
  systemPrompt?: string
  userPrompt?: string
  finalMessages: RunTraceMessage[]
}
```

规则：

1. 常规大小内容直接内联，超大内容走 payload 外置。
2. 变量注入表记录变量名、来源、字符数、完整值或引用。
3. folder 技能必须记录文件 hash、mtime、字节数，避免“同名不同版”误判。

### 3.6 处理报告

```typescript
export interface RunTraceProcessingReport {
  id: string
  apiCallId?: string
  turnId?: string
  stage: 'pre' | 'post' | 'eval'
  processor: 'hard-rules' | 'deai' | 'postProcess' | 'integrity' | 'other'
  status: 'success' | 'warning' | 'failed'
  inputRef?: string
  outputRef?: string
  inputPreview?: string
  outputPreview?: string
  ruleHits?: Array<{ rule: string; count: number; samples?: string[] }>
  issues?: Array<{
    level: 'error' | 'warning' | 'info'
    code: string
    message: string
    blocking: boolean
    retried?: boolean
  }>
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

### 3.7 Payload 外置

```typescript
export interface RunTracePayloadRef {
  id: string
  kind: 'request' | 'response' | 'stream' | 'prompt' | 'tool-input' | 'tool-result' | 'processing-input' | 'processing-output' | 'raw-http'
  file: string
  bytes: number
  chars: number
  sha256: string
  createdAt: number
}
```

规则：

1. payload 文件先写，事件后写引用。
2. 主 JSON 保存 `RunTracePayloadRef`，不保存超大原文。
3. **不设体积阈值**（用户定稿）。凡属于完整现场的字段一律按类型外置：请求全文、响应全文、流式全文、提示词、工具输入输出、处理前后文本、raw-http 全部进入 payload，避免“低于阈值就留在主 JSON”导致格式漂移和导出不一致。
4. 导出必须校验 payload 文件存在且 sha256 匹配。
5. `raw-http` 随 V2 实现，默认开启；仍必须先完成脱敏再落盘，Authorization、API Key、Cookie 一律移除。

### 3.8 事件不变量

`RunTraceEvent` 增加：

```typescript
export interface RunTraceEvent {
  // 现有字段保留
  seq: number
  payloadRefs?: string[]
}
```

不变量：

1. `seq` 在单个 run 内全局单调递增。
2. 事件引用 payload 时，payload 必须先存在。
3. API 调用、物理请求、工具调用、提示词快照、处理报告之间的关联 ID 必须能互相反查。
4. 导出时执行完整性校验，缺 payload 或 hash 不匹配时导出警告，不得静默通过。

## 4. 事件模型

新增事件类型：

| 事件 | 级别 | 说明 |
|------|------|------|
| `physical-call` | info/warn/error | 物理请求开始或结束 |
| `tool-compatibility` | warn | 工具协议降级 |
| `prompt-built` | info | 提示词快照创建 |
| `tool-call` | info/warn/error | 工具执行 |
| `processing-report` | info/warn/error | 本地处理完成 |
| `turn-assistant` | info | 轮次 assistant 输出已记录 |
| `context-compacted` | info | 上下文压缩或清空 |
| `payload-missing` | warn/error | payload 引用异常 |

上下文压缩规则：

1. 用户点击“清空记忆”或系统执行上下文压缩时记录 `context-compacted`。
2. 事件记录压缩前 token 或字符规模、策略、发生时间。
3. 对应后续 API 调用的 `semantic.conversationCompacted = true`。

## 5. 大对象与导出策略

### 5.1 分层存储

1. 主 JSON：结构化索引、摘要、普通大小文本、引用。
2. payload 文件：超大请求、响应、流式全文、提示词、工具输入输出、处理前后文本。
3. 运行记录目录：每次 run 一个目录，主 JSON 与 `payloads/` 同级。

### 5.2 导出模式

| 模式 | 内容 | 用途 |
|------|------|------|
| 标准导出 | 主 JSON + 被引用 payload | 默认模式，SKILL 调试首选 |
| 轻量导出 | 主 JSON + 摘要 | 快速交流，不用于复现 |
| 深度导出 | 标准导出 + raw-http | 第三方排查协议问题，随 V2 实现，默认开启 |

深度导出仅记录脱敏后的原始 HTTP 结构，Authorization、API Key、Cookie 一律移除。

### 5.3 导出校验

导出前检查：

1. payload 文件存在。
2. sha256 匹配。
3. 事件 seq 连续。
4. 关联 ID 可反查。
5. 递归脱敏完成。

校验失败时导出 `manifest.warnings`，UI 明确提示缺失项。

## 6. UI 增强

### 6.1 API 调用 Tab

新增：

1. 语义摘要行：协议模式、降级状态、物理请求数、工具调用数、TTFC。
2. 物理请求折叠区。
3. 工具调用折叠区，支持按 `tool_call_id` 跳转。
4. 提示词快照入口。
5. 本地处理报告入口。
6. usage 标准字段展示。

### 6.2 大文本门控

借鉴 Langfuse：

1. 单个文本节点渲染上限：`200,000` 字符。
2. 单个 JSON 树渲染上限：`3,000` 行。
3. 超过后显示“加载全文”按钮。
4. 超过 `2,000,000` 字符提示改用下载或打开 payload 文件。
5. 禁止打开运行记录时急切渲染全部 API 调用全文。

### 6.3 时间线 Tab

新增事件展示，并提供筛选：

1. 按级别筛选：info / warn / error。
2. 按类型筛选：physical-call、tool-call、processing-report 等。
3. 点击事件跳转对应 API 调用或 payload。

### 6.4 工具统计

每次 run 顶部增加摘要：

1. 工具调用次数。
2. 失败次数与失败率。
3. 平均耗时与中位耗时。
4. 降级次数。
5. 每个工具的调用分布。

## 7. 实施阶段

### Phase V2-0：类型与不变量基础

任务：

1. `runTrace.ts` schema 升级到 v4。
2. 增加所有新增类型。
3. 增加 `appendPhysicalCall`、`appendToolCall`、`attachPromptSnapshot`、`attachProcessingReport`、`registerPayload`。
4. 事件增加全局 seq。

验证：

1. 单测：新字段写入、旧 v3 JSON 兼容。
2. 单测：seq 单调递增。
3. `npm run type-check`。

### Phase V2-1：API 调用现场

任务：

1. 共创路径回填 requestMessages、responseText、usage。
2. 记录 tools、toolCalls、toolResults、降级字段。
3. `aiService.ts` 发物理请求事件。
4. 轮次记录 assistantResponse 与关联 apiCallIds。

验证：

1. 主页共创 chain：每个技能一条完整 API 记录。
2. 大纲共创 chain：同上。
3. 工具循环：每轮物理请求独立可查。
4. 降级：首次失败与降级重试都在 trace 中。

### Phase V2-2：语义映射与 usage

任务：

1. 生成 `semantic` 映射。
2. 补齐 input、output、cache、reasoning token 字段。
3. 记录 TTFC。
4. 记录 `conversationCompacted`。

验证：

1. 单测：不同供应商 usage 归一化。
2. 单测：无 usage 供应商不产生假数据。
3. UI 能显示标准 usage。

### Phase V2-3：提示词快照

任务：

1. `workspaceSkillEngine.ts` 在组装 messages 前创建快照。
2. 记录模板前后文本、变量表、folder 指纹。
3. 记录上下文块来源、字符数、截断策略。
4. 直连对话路径创建快照。

验证：

1. 每个 API 调用能反查最终 messages 组装来源。
2. chain 上一步输出在快照中可见。
3. folder 文件改动后 hash 变化可见。

### Phase V2-4：本地处理报告

任务：

1. 硬规则前处理、后处理报告接入。
2. DEAI 处理报告接入。
3. postProcess issues 结构化。
4. 完整性校验与回滚状态入 trace。

验证：

1. 命中规则、次数、样例可查。
2. 回滚状态可查。
3. issues 不再静默丢弃。

### Phase V2-5：Payload 外置与导出

任务：

1. run 目录结构调整。
2. 完整现场字段按类型全量外置与引用，不设体积阈值。
3. 标准导出、轻量导出、深度导出，其中深度导出默认开启。
4. 导出完整性校验。
5. 主进程 IPC 保存与导出路径更新。

验证：

1. 超大文本不再导致主 JSON 爆炸。
2. payload 缺失时 UI 有警告。
3. sha256 校验通过。
4. 双侧脱敏有效。

### Phase V2-6：UI 与统计

任务：

1. API 调用 Tab 增强区。
2. 大文本门控。
3. 时间线筛选与跳转。
4. 工具统计摘要。
5. 上下文压缩事件展示。

验证：

1. 面板打开速度不明显劣化。
2. 大文本不卡死 UI。
3. 所有新增信息有入口。

### Phase V2-7：真实 UI 验证与收尾

任务：

1. 源 Electron + CDP 模拟真实用户。
2. 主页共创、大纲共创、生成流水线、续生成、降级、工具循环逐一验证。
3. 导出 JSON 用脚本校验 schema、payload、脱敏。
4. 更新经验文件与开发日志。
5. 清理临时脚本。

## 8. 验收标准

### 8.1 结构化验收

- [x] schema v4 导出可读。
- [x] 旧 v3 JSON 打开不报错、不丢字段。
- [x] 每个逻辑 API 调用有完整 requestMessages、responseText、usage、finishReason。
- [x] 工具调用有稳定 ID。
- [x] 物理请求可区分 normal、tool_iteration、downgrade、continuation、retry。
- [x] 提示词快照能复现最终 messages。
- [x] folder 技能有文件 hash、mtime。
- [x] 硬规则与 DEAI 处理报告完整。
- [x] 大字段外置且有 sha256。
- [x] 请求、响应、流式、提示词、工具输入输出、处理前后文本、raw-http 全部进入 payload，没有体积阈值分流。
- [x] 深度导出默认开启，且 raw-http 先脱敏再落盘。
- [x] API Key 与 Authorization 不出现在任何导出文件。

### 8.2 性能验收

- [x] 10 万字大纲参与对话时，运行记录面板仍可流畅打开。（源 Electron 实测 355ms，阈值 3000ms）
- [x] 主 JSON 保持结构化索引与摘要，完整现场全部进入 payload，不因体积阈值产生漏记。
- [x] UI 不急切渲染超过 20 万字符文本。（21 万字符响应实测：聊天气泡走统一 Markdown 门控，运行记录面板 812ms 打开）
- [x] 近 20 次滚动窗口不变。

### 8.3 真实 UI 验收

- [x] 主页共创：每技能请求、响应、流式、物理调用可查。
- [x] 大纲共创：同上。（源 Electron 实测 chain 2 技能、2 API 调用、2 物理请求、turn success）
- [x] 生成流水线：五层运行记录不回退。（设定/卷纲/章节/正文四层实测：4 runs、每层 1 API 调用、1 物理请求）
- [x] 续生成：同轮 continuation 记录正确。
- [x] 工具循环：多物理请求与工具结果对账正确。
- [x] 降级：气泡提示与 trace 一致。
- [x] 上下文清空：`context-compacted` 事件出现。
- [x] 导出：标准/轻量/深度三种模式可用。
- [x] payload 缺失模拟：UI 出现警告。

### 8.4 验收遗留

- 原 5 项遗留已于 2026-09-11 用 `scripts/verify-run-trace-depth-v2-remaining.mjs` 补齐实测：大纲共创 chain 独立 UI、生成流水线四层运行记录、降级气泡与 trace 一致性、10 万字大纲面板流畅度、21 万字符渲染门控。
- 本轮已通过 `scripts/verify-run-trace-depth-v2.mjs` 覆盖主页共创、续生成、工具循环、上下文清空、三种导出、payload 校验与滚动窗口；已通过 `src/stores/runTrace.spec.ts` 覆盖旧 v3 兼容；已通过 `scripts/verify-run-trace-depth-v2-remaining.mjs` 补齐上述 5 项真实 UI 验收。

## 9. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| trace 写入影响生成主链路 | 高 | 所有埋点 try/catch 隔离，记录失败只加事件，不中断生成 |
| payload 文件被用户移动或删除 | 中 | sha256 校验 + UI 警告，不伪装完整 |
| 主 JSON 仍过大 | 中 | 完整字段按类型全部外置；主 JSON 只保留索引、摘要和引用 |
| UI 渲染卡顿 | 中 | Langfuse 式门控 + 懒加载 + 下载替代 |
| 敏感信息泄漏 | 高 | renderer 与主进程双层脱敏；raw-http 默认开启但必须先脱敏再落盘 |
| 供应商 usage 字段差异 | 中 | 归一化映射，未知字段保留原样，不造假 |
| 旧 JSON 兼容 | 中 | 全部字段可选，读取不迁移 |
| 与既有按会话聚合冲突 | 低 | run 结构不变，只在 run 内增强 |

## 10. 明确不做

1. 不引入 OTel、Langfuse、Phoenix 运行时依赖。
2. 不改变近 20 次滚动窗口。
3. 不取消按会话聚合和按次导出。
4. 不把 API Key 写入任何运行记录。
5. 不让模型绕过写入确认安全壳。
6. 不用截断破坏 SKILL 复现现场，超大内容一律外置保存。
7. 不在本方案中重构运行记录 UI 架构，只做增量扩展。

## 11. 已确认决策

用户已于 2026-09-11 定稿：

1. **外置阈值**：不设阈值。完整现场字段按类型全部外置，避免漏记和格式漂移。
2. **深度导出**：随 V2 一起实现，默认开启；raw-http 必须先脱敏再落盘。
3. **payload 保留策略**：与 run 同生命周期，run 滚出 20 次窗口时同步删除。
4. **UI 文本门控**：20 万字符内联渲染，超过后懒加载，200 万字符改用下载。
