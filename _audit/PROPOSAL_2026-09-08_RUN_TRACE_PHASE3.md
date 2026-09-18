# 运行记录三期：复现到大纲工作台与主页编辑器方案

> 版本：v1.0　日期：2026-09-08  
> 状态：待用户审核，未授权执行  
> 经验依据：`_audit/神意开发经验总结_v3.md`（M1 影响圈、§2 脚本纪律、§3 验证纪律、§5 UI 纪律、§7 存储纪律、§9 根因沉淀）

## 0. 目标与边界

### 目标

把已经在生成流水线验证成功的“运行记录”能力，复现到：

1. **大纲工作台**：记录共创对话、SKILL/Agent 组合、API 请求与流式输出、工具调用、编辑器写入批次、Diff 接受/拒绝。
2. **主页编辑器 API 对话框**：记录章节纲要/正文对话、上下文引用来源、续生成、技能执行、AI 编辑器操作、工具调用与审批结果。

客户价值不变：第三方 SKILL 制作方能拿到一次运行的完整现场，判断“SKILL 写错了”还是“应用传参错了”。

### 非目标

- 不改变大纲工作台、主页编辑器、生成流水线的业务逻辑和生成结果。
- 不把运行记录写入项目文件，不影响项目导入导出体积。
- 不新增依赖，不引入后台服务。
- 不做网页测试、开发者模式验证；验证必须使用源 Electron 启动真实应用。

## 1. 现状与结论

### 1.1 已验证资产

- `src/stores/runTrace.ts`：已实现 RunTrace / Event / ApiCall 三层结构，最近 20 次滚动窗口，单次运行内部不限条数。
- `src/components/pipeline/PipelinePanel.vue`：已实现左侧运行列表 + 右侧详情四 Tab。
- `electron/ipc/runTrace.js`：已实现按次导出 JSON、API Key 递归脱敏。
- 单测、类型检查、构建、源 Electron + CDP UI 验证均通过。

### 1.2 当前限制

1. `RunTrace.step` 绑定流水线 1-4 层，无法表达“大纲工作台”“主页编辑器”。
2. `currentRunId/currentApiCallId` 是单值，若未来两个来源并发运行会串线。
3. 运行记录 UI 内嵌在 `PipelinePanel.vue`，不能直接给其他工作台复用。
4. 全量落盘目前发生在手动导出时；自动保存完整运行还未形成统一机制。
5. 大纲工作台与主页编辑器的工具调用、编辑器 Diff、上下文来源尚未进入 trace。

## 2. 总体设计

### 2.1 通用来源模型

`RunTrace` 增加字段：

```ts
type RunTraceSource = 'pipeline' | 'outline' | 'home'

interface RunTrace {
  source: RunTraceSource
  sourceName: '生成流水线' | '大纲工作台' | '主页编辑器'
  step?: number
  stepName?: string
  target?: {
    type?: 'outline' | 'chapter-outline' | 'chapter-body' | 'settings' | 'volume' | 'chapter' | 'body'
    id?: string
    name?: string
    activeTab?: string
    locked?: boolean
  }
  context?: {
    turns?: number
    referencedDocuments?: string[]
    contextStrategy?: string
  }
}
```

兼容策略：

- `source` 缺省时按 `pipeline` 处理，保证旧调用不炸。
- `step` 从必填改为可选，流水线仍写入 1-4。
- 导出 JSON schema 升级为 `version: 2`，同时保留 `version: 1` 字段读取兼容。

### 2.2 并发安全

把单值当前运行改为来源隔离：

```ts
currentRunIdBySource: Record<RunTraceSource, string | null>
currentApiCallIdBySource: Record<RunTraceSource, string | null>
```

规则：

1. 每个来源同一时间只允许一个 running run。
2. 同来源新运行开始时，自动把异常残留 running 标记为 failed。
3. 不同来源可以并行记录，互不覆盖。
4. 保留现有 `currentRunId/currentApiCallId` 兼容 API，内部转发到 pipeline 来源，减少流水线改动。

### 2.3 通用 UI 组件

从 `PipelinePanel.vue` 抽出：

- `src/components/common/RunTracePanel.vue`
- `src/components/common/RunTraceList.vue`
- `src/components/common/RunTraceDetail.vue`

面板形态沿用已定稿：

- 居中大面板。
- 左侧运行列表。
- 右侧详情四 Tab。

四 Tab 调整为通用版：

1. **时间线**：开始、上下文构建、API、流式、解析、工具、编辑器、失败、取消、完成。
2. **API 调用**：完整 messages、参数、响应、流式全文、usage、finish_reason。
3. **技能与工具**：SKILL 诊断、chain/compose、工具调用、编辑器批次、Diff 审批。
4. **导出/复制**：按次导出 JSON、复制全文、复制摘要。

入口：

1. 流水线顶栏：保持现有“运行记录”按钮。
2. 大纲工作台编辑器工具栏：放在“撤销 / 重做 / 复制 / 剪切”这一栏，按钮位于“剪切”之后，默认筛选 `outline`。
3. 主页主编辑器工具栏：放在“去AI味 / AI命名”这一栏，按钮位于“AI命名”之后，默认筛选 `home`。

面板内提供来源筛选：全部 / 生成流水线 / 大纲工作台 / 主页编辑器。这样三个入口共用一个组件，但各自默认看到自己的运行。

## 3. 大纲工作台接入点

### 3.1 按钮位置

`OutlineWorkspace.vue` 的编辑器工具栏：

```text
撤销 · 重做 · 复制 · 剪切 · 运行记录 · 粘贴 · 查找 · .md · .txt
```

放置在“剪切”之后、“粘贴”之前，理由：

- 与编辑操作在同一视觉组，表示“查看刚才这次大纲共创运行”。
- 不占用工作台顶部标题区，避免挤压关闭按钮。
- `id="btn-ow-run-trace"`，样式复用 `btn-sm btn-secondary`。

### 3.2 运行生命周期

入口：`OutlineWorkspace.vue` 的 `sendMessage()`。

开始运行时记录：

- 大纲锁定状态。
- 当前编辑目标与 activeTab。
- Agent/SKILL 配置、技能模式。
- 上下文组装结果：引用了哪些消息、哪些项目资料、上下文策略。
- 用户输入原文。

结束规则：

- 正常完成：`finishRun(success)`。
- 用户取消：`finishRun(canceled)`。
- API/解析/工具失败：`finishRun(failed)`，保留原始错误。
- 组件卸载时若仍有 running：标记 failed，并写事件“运行因页面切换中断”。

### 3.3 API 与流式

接入两类调用：

1. `aiService.callAi()` 直接调用。
2. `workspaceSkillEngine` 内部的 SKILL 调用。

每次调用记录：

- 完整 requestMessages。
- provider/model/temperature/maxTokens。
- Agent/SKILL 元数据。
- 流式累计全文。
- responseText、usage、finishReason、durationMs。
- 失败原始错误。

### 3.4 工具与编辑器事件

必须记录：

- `tool_start`：工具名、读写策略、iteration、input。
- `tool_call`：结果、耗时、成功/失败。
- 兼容模式：是否降级 JSON protocol。
- `editor.propose_edits` 批次：命令数量、目标 hash、危险操作标记。
- Diff 展示、接受、拒绝、部分接受。
- 批次回滚。

这些事件进入时间线，结构化数据进入“技能与工具”Tab。

## 4. 主页编辑器接入点

### 4.1 按钮位置与覆盖范围

按钮放在 `EditorPanel.vue` 的主编辑器工具栏，与“去AI味 / AI命名”同一组：

```text
去AI味 · AI命名 · 运行记录
```

`id="btn-editor-run-trace"`，样式复用 `btn-sm btn-secondary`。

这个位置带来一个能力扩展：`home` 来源不只记录 API 对话框，也记录主编辑器触发的 AI 操作：

1. API 对话框：普通对话、SKILL 共创、续生成。
2. 去AI味处理：完整 prompt、技能组合、处理后文本、失败现场。
3. AI 命名：请求、返回、插入编辑器的结果。
4. 提取记忆：请求、返回、写入记忆的结果。
5. 生成按钮：主编辑器触发生成时的入口事件。

这样客户在大纲/章节/正文任何一个编辑现场，都能从同一栏找到“刚才 AI 到底怎么跑的”。

### 4.2 运行生命周期

入口：

- `ChatPanel.vue` 的 `sendMessage()` 与续生成入口。
- `useDeAi.ts` 的去AI味处理。
- `namingService` / AI 命名入口。
- 记忆提取入口。

开始运行时记录：

- 当前编辑器 activeTab 与目标类型：大纲纲要 / 章节纲要 / 正文 / 其他。
- 目标内容 hash，不记录整段正文进列表摘要，但完整 prompt 里自然保留现场。
- 共创配置：Agent、SKILL 列表、chain/compose 模式、每个 SKILL 的 Agent 绑定。
- 上下文引用来源：当前编辑器内容、卷纲、章节、记忆、历史对话。
- 续生成标记与断点信息。

结束规则与大纲工作台一致。

### 4.3 API 与流式

接入：

- 普通对话 API。
- SKILL chain/compose 每一步 API。
- 续生成 API。

记录内容与大纲工作台一致，另加：

- 续生成前后文本衔接点。
- finishReason 为 length 时的事件标记，方便调试长文续生成。

### 4.4 编辑器操作事件

必须记录：

- 只读工具调用。
- 写入提案批次。
- 内容 hash 校验失败。
- 锁定拒绝。
- Diff 接受/拒绝/部分接受。
- AI 批次创建、更新、回滚。

## 5. 全量落盘与导出

### 5.1 自动保存

运行结束时，自动把本次完整运行写入应用数据目录：

```text
{userData}/run-trace/{source}/run-trace-{sourceName}-{yyyyMMdd-HHmmss}.json
```

规则：

1. 自动保存与手动导出内容一致，均递归脱敏 API Key。
2. 单次运行内部不限条数、不截断。
3. 应用内 UI 仍只保留最近 20 次，避免内存膨胀。
4. 磁盘文件不自动删除，由用户自行管理；面板提供“打开运行记录文件夹”入口。
5. 写盘失败写入事件，但不打断业务对话。

### 5.2 手动导出

保持现有能力：

- 默认 JSON。
- 按次导出。
- 复制全文。
- 单条事件/API/工具记录复制。

三期新增：

- 导出文件带 `source/sourceName/target/context`。
- 大纲工作台与主页编辑器的导出同样走 `runTrace:export` IPC。

## 6. 执行步骤

| 阶段 | 内容 | 主要文件 | 验证 |
|---|---|---|---|
| P0 | 类型泛化：source、target、context、来源隔离 current ID；兼容流水线旧调用 | `runTrace.ts`、`runTrace.spec.ts` | 单测覆盖三来源并发、旧调用兼容、异常残留 |
| P1 | 抽出通用 RunTracePanel/List/Detail；流水线改为复用组件 | `RunTracePanel.vue` 等、`PipelinePanel.vue` | 流水线 UI 回归，四 Tab、导出、复制不变 |
| P2 | 大纲工作台接入按钮、生命周期、API、流式、工具、Diff | `OutlineWorkspace.vue`、`workspaceSkillEngine.ts` | 源 Electron 真实发送一条消息，trace 完整 |
| P3 | 主页编辑器接入按钮、普通对话、续生成、去AI味、AI命名、提取记忆、工具、编辑器批次 | `ChatPanel.vue`、`EditorPanel.vue`、`useDeAi.ts`、相关 editor 服务 | 源 Electron 真实对话 + 续生成 + 去AI味 + 编辑器提案 |
| P4 | 自动全量落盘、打开记录文件夹、导出字段升级 | `runTrace.js`、`preload.js`、UI | 检查磁盘 JSON 完整、脱敏、无截断 |
| P5 | 验证矩阵收口：三来源回归、失败/取消、并发、导出复制、性能 | 临时 CDP 探针 | 全部断言通过后清理探针 |
| P6 | 文档、经验、版本、封装 | DEV_LOG、经验 v3、`package.json` | git 干净 + 构建产物存在 |

## 7. 验证矩阵

1. `npm run type-check` 通过。
2. `npm run test:services` 通过，并新增/扩展 runTrace 三来源用例。
3. `npm run build:vue` 通过。
4. 源 Electron 启动，不使用网页模式、开发者模式、安装版。
5. 流水线回归：四层任一层生成后，运行记录仍完整。
6. 大纲工作台：发送一条真实/mock API 消息，trace 包含开始、上下文、API、流式、完成。
7. 大纲工作台工具路径：触发编辑器提案，trace 包含 tool_start、tool_call、Diff 结果。
8. 主页编辑器：发送一条对话，trace 包含 activeTab、上下文来源、SKILL 配置、API、流式。
9. 主页编辑器续生成：trace 包含断点、续生成请求、衔接结果。
10. 主页编辑器 AI 工具：去AI味、AI命名、提取记忆各跑一次，trace 均包含请求、返回、写入结果。
11. 失败与取消：错误原文保留，无 running 残留。
12. 三来源并发：pipeline、outline、home 可同时 running，互不覆盖。
13. 按钮：`btn-ow-run-trace`、`btn-editor-run-trace` 真实点击可打开居中面板，无死按钮。
14. 导出：三个来源均可按次导出 JSON，API Key 脱敏，全量无截断。
15. 复制：全文复制、单条复制非空，`pre` 可鼠标选中。
16. 自动落盘：运行结束后磁盘文件存在，内容与导出一致。
17. 性能：流式期间 UI 无明显卡顿，无 watch 死循环。
18. 收尾：临时探针清理，开发日志与经验文件更新，工作区干净。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| `ChatPanel.vue` 与 `OutlineWorkspace.vue` 体量大，易误伤 | P0 先做类型与组件抽取，业务接入只加旁路记录，不改生成主链路 |
| 三来源并发导致 current ID 串线 | 来源隔离 current 状态，单测覆盖并发 |
| 流式高频写盘造成卡顿 | 磁盘只在运行结束时写一次；流式仍走局部对象更新 |
| 磁盘记录无限增长 | 不静默删除；提供打开文件夹入口和体积提示，用户自行管理 |
| 自动落盘泄露密钥 | 主进程写盘前统一递归脱敏，单测验证 |
| UI 抽取后流水线回归失败 | P1 只做组件搬移，不改数据结构；CDP 验证原按钮与四 Tab |
| 新增按钮再次成为“死按钮” | 使用全局弹窗层级 token，CDP 验证可见性与真实点击 |

## 9. 经验文件执行承诺

- 改前执行 M1：`rg` 列出 `runTrace`、`sendMessage`、`callAi`、工具事件影响圈。
- 只用 `apply_patch` 精准修改，禁止整文件重写。
- 不激活无关组件，不改无关 CSS。
- 验证必须源 Electron + CDP，网页测试不算完成。
- IPC 三处同步：`runTrace.js`、`main.js`、`preload.js`。
- 收尾更新 `_audit/神意开发经验总结_v3.md` 与 DEV_LOG，再升版本封装。

## 10. 审核点

1. 是否同意按本方案放置两个新按钮：大纲工作台“剪切”后、主页编辑器“AI命名”后？
2. 是否同意 `home` 来源扩展为覆盖 API 对话 + 去AI味 + AI命名 + 提取记忆？
3. 是否同意应用内仍保留最近 20 次，磁盘自动保存完整运行且不自动删除？
4. “技能与工具”合并为一个 Tab，还是拆成五个 Tab？
