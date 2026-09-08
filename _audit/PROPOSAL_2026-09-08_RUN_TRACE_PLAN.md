# 运行记录（Run Trace）执行方案

> 版本：v1.0　日期：2026-09-08  
> 状态：待用户审核，未授权执行  
> 经验依据：`_audit/神意开发经验总结_v3.md`（全文按 §1-§9 执行，重点 M1-M5、§2 脚本纪律、§3 验证纪律、§5 UI 纪律、§7 存储纪律）

## 0. 目标与边界

### 目标

把生成流水线顶栏“执行日志”升级为“运行记录”面板：SKILL 制作方可以拿到一次生成任务的完整现场，包括完整提示词、完整 API 返回、流式滚动全文、每一步事件时间线、失败原文和 folder SKILL 诊断，用于低成本调试技能。

### 核心需求

1. **按“次”记录**：一次“开始生成 → 完成/失败/取消”就是一次运行（RunTrace），不是现在这种平铺日志。
2. **完整不截断**：`systemPrompt`、`userPrompt`、API 返回、流式全文在运行记录中保留全量；仅导出与复制时可选择摘要模式。
3. **体量控制**：应用内只保留最近 **20 次**运行；新运行到达后滚动覆盖最旧一次。
4. **按次导出**：默认每次运行导出一个 JSON 文件，不强制一次性导出全部；同时提供“复制为文本”，一键复制本次运行全文。
5. **自由复制**：详情文本区支持鼠标选中复制片段；单条记录可单独复制、单独导出。
6. **安全边界**：API Key 一律脱敏；供应商名称、地址、模型名保留，方便第三方定位配置问题。

### 明确不做（防跑偏）

- 不改变四层生成业务逻辑、模板渲染、Agent/SKILL 选择和执行结果。
- 不替换现有 `executionLog` 的旧功能（点赞点踩、优化建议、绑定导出日志继续可用）。
- 不把运行记录写入项目数据，不影响项目导入导出体积。
- 不新增依赖，不改存储 schema 版本，不引入全局清理。

## 1. 现状与根因

### 1.1 执行日志按钮“点不开”的根因

- 按钮：`src/components/pipeline/PipelinePanel.vue:8`，`showExecLog` 状态切换正常。
- 面板：`src/components/pipeline/PipelinePanel.vue:711-754`，模板存在。
- 根因：全项目没有任何 `.pl-exec-log` 系列 CSS 定义；面板渲染为无定位、无尺寸的裸 div，被流水线遮罩层压住，用户表现为“点击无效”。

### 1.2 旧执行日志无法支撑 SKILL 调试

- `src/stores/executionLog.ts`：纯内存 Pinia store，`maxLogs=200`，平铺单条，无运行分组。
- `PipelinePanel.vue` 的 `runStepSkills()` 写入时对 prompt 和 result 各执行 `substring(0,500)`；调试所需的完整提示词与返回被截断。
- 现有四层滚动日志（`settingsGenerationLogs` 等）只做 UI 展示，没有进入任何 store。
- chain 步骤交接、schema 校验失败、重试、取消、folder SKILL 诊断没有形成同一次运行的完整时间线。

### 1.3 可复用资产

- `callApiWithAgent()`：四层共用 AI 调用入口，`callAi` 结果已含 `providerId/model/durationMs/usage/finishReason`。
- `appendPipelineStream()`：流式 chunk 已经集中进入该函数。
- `lastFolderSkillDiagnostics` 与 `RealSkillDiagnosticsPanel`：folder 诊断已存在。
- `diag:export` + `window.electronAPI.diagExport()`：保存对话框导出链路已有范例。

## 2. 数据结构设计

新建 `src/stores/runTrace.ts`，不改动 `executionLog.ts` 的既有行为。

```ts
interface RunTraceEvent {
  id: string
  ts: number
  level: 'info' | 'warn' | 'error'
  type: string          // started / prompt-built / api-start / stream / parse / validate / write / retry / cancel / failed / finished
  label: string         // 中文展示文案，例如“第 2 次请求开始”
  detail?: string       // 完整原文，不截断
}

interface RunTraceApiCall {
  id: string
  seq: number           // 本次运行内第几次 API 调用
  step: 1 | 2 | 3 | 4
  skillId?: string
  skillName?: string
  agentId?: string
  agentName?: string
  providerId?: string
  providerName?: string
  model?: string
  temperature?: number
  maxTokens?: number
  requestMessages: Array<{ role: string; content: string }>
  responseText: string  // 完整返回
  streamText: string    // 流式累计全文
  finishReason?: string
  usage?: any
  durationMs?: number
  status: 'running' | 'success' | 'failed' | 'canceled'
  error?: string        // 原始错误消息
  startedAt: number
  endedAt?: number
}

interface RunTrace {
  id: string
  step: 1 | 2 | 3 | 4
  stepName: string
  mode: string                  // 设定/逐卷/续生成/AI全卷/章节/正文等业务模式
  projectId?: string
  projectName?: string
  providerId?: string
  providerName?: string
  model?: string
  skillNames: string[]
  skillMode?: string
  status: 'running' | 'success' | 'failed' | 'canceled'
  startedAt: number
  endedAt?: number
  durationMs?: number
  events: RunTraceEvent[]
  apiCalls: RunTraceApiCall[]
  folderDiagnostics?: any[]      // 全量诊断，失败现场不丢
  resultPreview?: string        // 仅供列表展示，非调试数据
  error?: string
}
```

### Store API

- `startRun(input)`：创建运行，若超过 20 次则移除最旧一次；返回 `runId`。
- `currentRunId`：同一时间只允许一个运行；若异常残留 running，新运行前标记其为 failed 并写事件“上次运行未正常结束”。
- `addEvent(runId, event)` / `startApiCall(runId, call)` / `finishApiCall(runId, callId, patch)`。
- `appendStream(runId, callId, text)`：流式 chunk 追加，不触发整棵树响应式扩散（对当前 call 的 `streamText` 做局部更新）。
- `finishRun(runId, status, error?)`。
- `getRun(id)`、`runs`、`clearRuns()`、`removeRun(id)`。
- `exportRunToText(run)`：生成给第三方阅读的纯文本版。
- `maskSensitive(text)`：API Key、`Authorization`、`Bearer` 凭证脱敏。

### 体量控制规则

- `maxRuns = 20`，按 `startedAt` 淘汰。
- 一个运行内部不设条数上限；导出文件才是完整现场。
- 若单次运行检测到超大文本（例如全文超过 20MB），记录一条 warn 事件“本次运行体积较大，建议导出后保存”，但不截断调试数据。

## 3. 数据接入点（最小侵入）

### 3.1 四层生成入口

每个入口在“开始生成”时创建 RunTrace，在 `finally` 或对应完成/失败分支收尾：

- 设定层：`genSettings` 入口（约 `PipelinePanel.vue:2413`）
- 卷纲层：`genVolumes(mode)`（约 `2468`），mode 记录 `single/continue/all`
- 章节层：`genChapters()`（约 `2626`），记录卷名、目标章数、单章字数、断点续跑信息
- 正文层：`genBody()`（约 `2728`），记录章节执行包构建、降AI方法论注入、后处理统计

### 3.2 AI 调用与流式

- `callApiWithAgent()`：在调用 `callAi` 前创建 `startApiCall`，请求参数、完整 messages、Agent/SKILL 元数据全量入 run；成功/失败/取消后 `finishApiCall`。
- `appendPipelineStream(step, text)`：在现有 UI 日志更新之外，把 chunk 同步写入当前运行对应的 apiCall.streamText。实现上通过当前活跃 `apiCallId` 关联，不改函数签名。
- `callChapterApi()`：章节层不走 `callApiWithAgent`，单独按同一 RunTraceApiCall 结构接入，保证四层覆盖一致。
- `SkillExecutionEngine` / chain / compose 的内部调用：在 `_runStepSkillsInner` 每个步骤开始与结束处写事件；若内部直接 `callAi`，补同结构记录，不重算 token 统计。

### 3.3 关键业务事件

以下事件全部写入 events 时间线，全部保留原文：

- 请求构建：大纲锁定状态、设定数量、全书字数、卷数、章数、字数分配、变量替换后的最终 prompt。
- 执行过程：SKILL 列表与顺序、chain 步骤交接、compose 合成结果、schema 校验结果、解析重试、卷数钳制、断点保存/恢复。
- 失败现场：解析失败原始返回、校验 errors、API 错误原文、取消原因、folder SKILL diagnostics。

### 3.4 旧执行日志共存

- `runStepSkills()` 继续写 `executionLog`（点赞点踩、统计建议保留）。
- 新增逻辑只旁路记录 RunTrace，不删除旧调用点，不改变旧字段；旧日志的 500 字截断只影响旧面板，不影响新运行记录。

## 4. UI 方案

### 4.1 入口与容器

- 顶栏按钮文案改为“运行记录”，保留 `#btn-exec-log` 稳定 ID。
- 面板改为全屏遮罩内右侧抽屉或居中大面板（宽 75%，高 85%），高 z-index；修复现有 `.pl-exec-log` 无样式问题。
- 面板结构：左侧运行列表（最近 20 次），右侧运行详情。

### 4.2 运行列表

每行显示：时间、层级、模式、状态、耗时、API 次数、技能数；按开始时间倒序。列表支持“按次导出 JSON”“复制为文本”“删除本次”。

### 4.3 运行详情

分四个 Tab，避免一屏塞爆：

1. **时间线**：events 逐条显示，单条可展开原文、复制原文、单独导出。
2. **API 调用**：按 seq 分组；每条含供应商/模型/参数/耗时/finish_reason/usage；messages 与响应可复制；流式全文独立展示。
3. **技能诊断**：folder SKILL 诊断、schema 校验、chain/compose 事件；复用 `RealSkillDiagnosticsPanel` 的结构化展示。
4. **导出**：按次导出 JSON、复制为文本、复制摘要；导出前执行脱敏。

### 4.4 文本可复制性

- 所有 `pre`/详情区启用 `user-select: text`。
- 不阻止原生右键与 Ctrl+C；按钮复制走 `navigator.clipboard.writeText`，失败时提示改用鼠标选中复制。
- 运行详情使用独立滚动容器，`max-height + overflow-y:auto`，避免长文本撑爆面板。

## 5. 导出方案

### 5.1 按次导出 JSON

新增 IPC `runTrace:export`：

- 入参：`{ runId, content }`；渲染层把脱敏后的 run 传给主进程。
- 主进程调用 `dialog.showSaveDialog`，默认文件名 `run-trace-{stepName}-{yyyyMMdd-HHmmss}.json`。
- 写盘使用 `fs.promises.writeFile`，失败返回 `{success:false, reason}`。
- 一次只导出当前选中的运行，满足“按次导出，不一次性导出全部”。

### 5.2 复制为文本

- 格式：运行概要 → 时间线 → 每次 API 调用（请求/参数/响应/流式全文） → 技能诊断 → 结果。
- 一键复制后用户可在任何编辑器里粘贴；文本同样脱敏。
- 单条事件/单条 API 调用也提供“复制此段”，比整次导出更细。

### 5.3 脱敏规则

- `apiKey`、`api_key`、`Authorization`、`Bearer xxx`、`sk-` 开头长 token 统一替换为 `***MASKED***`。
- 供应商名称、地址、模型名保留。
- 脱敏在导出/复制边界执行，store 内保留原始数据供 UI 展开；避免影响应用内显示。

## 6. 执行步骤

| 阶段 | 内容 | 主要文件 | 验证 |
|---|---|---|---|
| P0 | 新建 RunTrace store 与类型，20 次滚动覆盖、脱敏、文本导出器 | `src/stores/runTrace.ts` | 单测：创建/覆盖/异常残留 running/脱敏/文本格式 |
| P1 | 四层入口与 AI 调用接入，完整 prompt/result/stream/事件 | `PipelinePanel.vue` | 单测或类型检查 + 源 Electron 真实逐卷生成 |
| P2 | 运行记录 UI：修复裸 CSS，列表 + 详情 + 四 Tab + 复制交互 | `PipelinePanel.vue`、组件样式 | CDP 真实点击打开，验证可见性、滚动、复制按钮 |
| P3 | IPC 按次导出：preload 暴露 + 主进程 handler + 保存对话框 | `electron/ipc/runTrace.js`、`electron/preload.js`、主进程注册 | CDP 点击导出，断言文件存在且内容完整脱敏 |
| P4 | 验证矩阵收口：真实 API 或本地 mock，20 次覆盖、取消、失败、导出、复制 | 探针脚本（临时） | 全部断言通过后清理探针 |
| P5 | 收尾：开发日志、经验 v3、版本号 minor、封装 | `_audit/DEV_LOG_*`、经验文件、`package.json` | git status 干净 + 构建产物存在 |

## 7. 验证矩阵（每项必须本轮证据）

1. **类型/单测门**：`npm run type-check`、`npm run test:services` 通过（若 runTrace 新增 spec，需加入该命令或单独执行）。
2. **构建门**：`npm run build:vue` 通过。
3. **真实 UI 门**：源 Electron（`node_modules\electron\dist\electron.exe . --remote-debugging-port=9227`）+ CDP 真实点击。
4. **逐卷生成闭环**：真实/mock API 生成一卷 → 运行记录出现本次运行 → events 含开始/请求/流式/解析/写入/完成。
5. **完整性**：导出的 JSON 中 systemPrompt/userPrompt/responseText/streamText 均为全量，无 `substring(0,500)` 截断。
6. **20 次覆盖**：批量创建 21 次运行（探针直接调用 store），断言数量为 20 且最旧被淘汰。
7. **按次导出**：只导出当前运行，文件含本次全部 events/apiCalls，且 API Key 脱敏。
8. **复制能力**：一键复制文本包含概要/时间线/API 全文；单条事件复制非空。
9. **失败/取消现场**：mock 失败与取消，run 状态与错误原文保留，不出现 running 残留。
10. **旧功能回归**：旧执行日志点赞点踩、优化建议、清空、绑定导出日志、记忆执行日志均仍可用。
11. **性能**：流式生成期间 UI 无明显卡顿；运行记录打开/滚动流畅；无无限 watch 循环。
12. **收尾门**：临时探针清理并用 `Test-Path` 复核；DEV_LOG 写明已验证/未验证；工作区只含本次改动。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| `PipelinePanel.vue` 已超大，直接大改易污染 | M1 先列影响圈；每阶段小 patch；不动无关生成逻辑；diff 逐行自审 |
| 流式 chunk 高频写入导致响应式卡顿 | apiCall 对象局部更新，避免替换整棵树；列表渲染只显示摘要，全文在详情中按需渲染 |
| 新旧日志混用造成状态残留 | RunTrace 与 executionLog 数据结构分离；运行结束必须 finish；异常残留自动标 failed |
| 导出超大文件卡 UI | IPC 传纯对象；主进程异步写盘；渲染层先脱敏；不改现有项目存储 |
| 20 次限制导致用户误解“记录丢失” | 列表标题显示“仅保留最近 20 次运行”；导出文件长期保存 |
| 面板 z-index/遮罩再次被压住 | 使用现有全局弹窗层级 token；CDP 验证 computed display 与点击命中 |

## 9. 经验文件引用承诺

- 改码前：执行 M1 影响圈声明，`rg` 列出 `PipelinePanel.vue` 引用与 store 字段读写面。
- 每次编辑：apply_patch 精准修改，禁止整文件重写。
- 验证：遵守 §3 验证纪律，构建成功不等于完成；必须源 Electron + CDP 真实操作。
- UI：遵守 §5，尤其弹窗层级、滚动容器、文本可选、死按钮扫描。
- 存储/IPC：遵守 §7-8，IPC 三处同步，异步 handler，不 sendSync。
- 收尾：遵守 §6，只清理本轮探针，无关历史文件不动。
- 新经验：若发现新坑（如流式响应式性能、导出路径问题），按 §1-§9 归位写入 v3，不新增尾部日期章节。

## 10. 交付物

1. 源码：RunTrace store、四层接入、运行记录面板、按次导出 IPC。
2. 验证：单测、构建、CDP 探针报告与原始输出（引用 file:line）。
3. 文档：`_audit/DEV_LOG_163_RUN_TRACE.md`（序号接现有索引）。
4. 版本：`package.json` minor 升级（新功能），封装 NSIS 安装包；交付说明标注未签名状态。

## 11. 审核点

1. 面板形态是否采用“左侧运行列表 + 右侧详情四 Tab”（居中大面板）。
2. 导出默认 JSON，是否需要同时提供“导出 Markdown/纯文本文件”。
3. 20 次运行限制是否也限制单次运行内 events/apiCalls 条数（当前方案：不限条数，只提示体积）。
