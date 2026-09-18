# API 对话工具面与 Folder SKILL 执行说明（交付给 SKILL 层）

日期：2026-09-17  
适用版本：神意助手 3.53.x  
适用位置：主页 API 对话、大纲工作台 API 对话、大纲/主页共创 SKILL 链路  
不适用：生成流水线正文/卷纲/章节等 pipeline 层（该层禁止交互式工具）

本文只描述当前应用真实状态，不描述未来计划。所有行为都以 `src/services/` 与 `src/stores/` 现行代码为准。

## 一图看懂

```text
用户一句话
  -> 意图路由（chainIntentRouter，七层判定）
  -> 工具面授权（dialogueToolSurface，单源入口）
       discuss/analyze/auto -> 只读工具
       edit/generate        -> 只读工具 + editor.write
  -> AI 请求（aiService）
       原生工具供应商 -> tool loop
       非原生/被拒绝   -> JSON 协议降级（仅支持 editor.write）
  -> ToolGateway/工具定义执行
  -> run trace 记录 turn / apiCall / event 三层
```

## 1. 工具清单

基础编辑器工具在 `src/services/editorTools.ts` 中定义（`createEditorTools`，从约 286 行开始）；大纲扩展工具在 `src/services/outlineTools.ts` 中定义（`createOutlineTools`，从约 87 行开始）。

### 1.1 读工具（所有意图都可见）

| 工具 | 权限 | 参数 | 返回 | 用途 |
|---|---|---|---|---|
| `editor.get_state` | read | 无 | workspace、targetId、label、contentLength、240 字预览、contentVersion、选区信息 | 读当前编辑目标摘要，不返回全文 |
| `editor.search` | read | `query` 必填；`caseSensitive` 可选 | 最多 20 个命中，每个带 start/end/context | 当前目标内关键词定位 |
| `editor.locate` | read | `fragment` 必填 | 唯一命中返回位置；模糊命中返回 Top-3 候选 | 验证原文片段是否唯一存在 |
| `editor.reveal` | read | `target` 必填（fragment / paragraphIndex / anchor / range 四选一）；`focus`、`highlightDuration`、`reason` 可选 | start/end/line/structurePath/context | 定位并高亮编辑器位置，不改内容 |
| `task.update_plan` | read | `stage`、`steps` 必填 | stage 与截断到 20 条的 steps | 更新 UI 任务计划，不改正文 |
| `editor.multi_get_state` | read | `targetIds` 可选数组 | 最多 5 个目标摘要 | 多打开文档时跨目标读取摘要 |
| `editor.global_search` | read | `query` 必填；`caseSensitive` 可选 | 每个目标最多 5 个命中 | 跨所有打开目标搜索 |
| `editor.workspace_summary` | read | 无 | 所有打开目标的列表与摘要 | 工作区结构概览 |
| `outline.get_structure` | read | `offset`、`limit` 可选 | 卷/章/节数量、节点 id、标题、字符区间；默认 160 行、最大 500 行，分页 | 读大纲结构地图 |
| `outline.read_range` | read | `nodeId` 或 `start+end` 二选一；`offset`、`limit` 可选 | 节点信息、区间、内容；默认 4000 字、最大 12000 字，分页 | 读大纲局部全文，不截断 |
| `outline.search` | read | `query` 必填；`caseSensitive`、`maxResults` 可选 | 命中节点、位置、上下文；默认 20、最大 50 | 大纲内词法检索 |
| `outline.get_summary` | read | `nodeId` 必填 | 节点摘要头、长度、直接子节点 | 导航用摘要，不能替代 read_range |

### 1.2 写工具（仅 edit/generate 意图可见）

| 工具 | 权限 | 参数 | 返回 |
|---|---|---|---|
| `editor.write` | write | `commands` 必填（1-10 条）；`reveal`、`reason` 可选 | 成功返回 `status: "written"`、batchId、commandCount、writtenLength、reveal、rollbackAvailable |

`editor.write` 的 command 结构：

```json
{
  "operation": "insert | replace_selection | replace_match | append | delete | rewrite",
  "content": "插入/替换后的内容；delete 不需要",
  "target": "replace_match/delete/rewrite 必填，必须是原文唯一片段",
  "position": "cursor | selection_start | selection_end | end",
  "reason": "本条修改说明"
}
```

操作语义来自 `src/services/editorEditProtocol.ts`：

- `insert`：在 position 处插入 content。
- `replace_selection`：替换当前选区；无选区时不可用。
- `replace_match`：用 content 替换 target 精确匹配的唯一片段。
- `append`：追加到文档末尾。
- `delete`：删除 target 精确匹配的唯一片段。
- `rewrite`：重写 target 精确匹配的唯一片段为 content。

硬限制（`src/services/editorTools.ts:412` 起的 `editor.write`）：

- 单批 1-10 条命令。
- 批次总内容（content + target 字符数）不超过 60000。
- 目标校验：工具 workspace/targetId 必须与当前编辑目标一致，禁止跨目标写入。
- 批次校验失败时原文不变，返回结构化错误供模型修正重试。
`replace_match`、`delete`、`rewrite` 的 target 必须唯一命中；不唯一会失败，不会猜测写入。

## 2. 意图与权限

权限矩阵在 `src/services/dialogueFoundation.ts:59` 的 `resolveDialoguePermission()`：

| 意图 | 读工具 | `editor.write` |
|---|---|---|
| discuss | 可见 | 禁止 |
| analyze | 可见 | 禁止 |
| auto | 按 discuss 处理 | 禁止 |
| edit | 可见 | 可见 |
| generate | 可见 | 可见 |

意图值来自 `src/services/chainIntentRouter.ts:1` 的 `ChainIntent`。生产路由入口是 `routeChainIntent()`（`src/services/chainIntentRouter.ts:710`），内部使用饱和词库与七层判定，显式规则优先于阈值。

关键产品语义：

- “告诉我插入点在哪里”是位置咨询，路由为 discuss + 只读定位（`editor.reveal` / `outline.*`），不给写工具。
- “把这段插入第三段 / 写入 / 改到”是显式写入，路由为 edit，才暴露 `editor.write`。
- 模型即使伪造 `editor.write` 调用名，`src/services/aiService.ts:272` 的 `evaluateWritePermission()` 也会在缺少意图或意图无写权限时拒绝。
- 生成流水线 workspace 禁止交互式工具与写工具（`src/services/dialogueFoundation.ts:74` 的 `validateDialogueToolSet()`）。

## 3. 调用方式

### 3.1 原生 tool call

工具会以模型原生 tools 形式随请求发送。模型返回 `tool_calls` 后，应用执行工具，把结果作为 tool 消息追加，再请求下一轮，直到模型输出正文。

Tool loop 控制在 `src/services/aiService.ts:1326` 的 `callAiWithTools()`：

| 控制项 | 值 | 含义 |
|---|---|---|
| `maxToolIterations` | 默认 6 | 单次 AI 调用的工具轮上限 |
| 相同写入守卫 | 连续 3 次 | 连续 3 次完全相同的写入输入会被拦截；拦截一次后守卫重置，模型可继续输出总结 |
| 连续纯工具轮告警 | 第 2 轮 | 提示“模型连续只调用工具、未输出正文” |
| 收敛请求 | 达到上限后 | 追加 system 指令：停止调用工具，基于已有工具结果直接输出最终回答 |
| 收敛完成标记 | `finishReason: "tool_converged"` | 表示这是 tool loop 后的救场正文 |

所以 SKILL 不需要追求“永不触发收敛”；需要避免的是无意义反复读同一位置。长文档应按 `outline.get_structure -> outline.search -> outline.read_range` 分页消费。

### 3.2 非原生供应商：JSON 协议降级

如果供应商不支持原生工具，或请求时返回 tools unsupported，应用会走 JSON 协议：

1. 请求前注入 `src/services/editorEditProtocol.ts:270` 的 `buildEditorWriteProtocolPrompt()`。
2. 模型在正文里输出固定 JSON：

```json
{
  "tool": "editor.write",
  "commands": [
    {
      "operation": "append",
      "content": "尾声内容",
      "reason": "追加尾声"
    }
  ],
  "reveal": { "mode": "instant", "firstChange": false },
  "reason": "整批写入说明"
}
```

3. `src/services/aiService.ts:299` 的 `executeCompatibilityEditorWrite()` 解析并统一走 `editor.write` 执行器。

降级路径只支持 `editor.write`，不支持读工具。读能力仍依赖上下文注入，所以长文档分析建议使用支持原生工具的供应商。

### 3.3 工具执行网关

`ToolGateway` 在 `src/services/editorTools.ts` 后段，负责：

- 按工具 schema 校验必填参数。
- 捕获执行异常，转成 `tool_execution_failed`。
- 尊重 `AbortSignal`，用户取消返回 canceled。
- 发出工具事件供诊断日志与 run trace 消费。

## 4. 写入后的编辑器形态

`editor.write` 的 `reveal` 参数控制写入后的呈现：

| 字段 | 值 | 行为 |
|---|---|---|
| `mode` | `stream`（默认） | 按流式呈现写入内容 |
| `mode` | `instant` | 一次性呈现 |
| `firstChange` | `true`（默认） | 定位到第一处变更 |
| `firstChange` | `false` | 不强制跳到首处变更 |

`editor.reveal` 用于不改内容的定位：支持原文片段、段落索引、卷/章/节结构锚点、精确字符范围四种目标，只能四选一；定位后滚动、聚焦并高亮。

## 5. Folder SKILL 与工具的关系

Folder 协议完整规范见 `_audit/FOLDER_SKILL_SPEC_V1.md`，这里只讲与工具面相关的边界：

1. Folder SKILL 由六个文件组成：`SKILL.md`、`template.md`、`meta.json`、`script.js`、`samples.txt`、`schema.json`。
2. `script.js` 只提供 `preProcess(input)`、`postProcess(output)`、`plan(input)`、`afterStep(state)` 钩子，运行在 Electron 主进程隔离 VM，单钩子 5 秒超时。
3. `preProcess` 的输入是字符串，不能读取章节变量，也不能自己调用编辑器工具；变量解析必须留给 `template.md` 的 `{{变量}}`。
4. 动态模板只能用 `api.setTemplate(text)`，最长 20000 字符；`preProcess` 返回 `template` 是旧协议兼容。
5. `postProcess` 合法字段是 `output`、`valid`、`message`、`errors`、`issues`；blocking issue 会让该步失败，warning 会进入诊断。
6. 当前 `meta.json` 没有任何“注册工具”的字段。工具面由应用根据 workspace + intent 统一构建，SKILL 不能声明新增工具、改变权限或绕过授权。
7. chain 模式下每个 folder 步骤独立一次 API 调用，脚本、schema、预算、技能级 Agent 生效；compose 多 folder 只有第一个 folder 的 script/schema 参与。

### 5.1 SKILL 模板应写的工具规则

给 SKILL 制作方的建议模板条款：

1. 需要编辑器内容时，优先调用 `outline.get_structure`，再 `outline.search` / `outline.read_range`，不要要求应用把全文塞进 prompt。
2. 需要写入时必须调用 `editor.write`，不要只输出“修改后文本”或【修改预览】。
3. 只有 `editor.write` 返回 `status: "written"` 才能说“已写入/已插入”。
4. 写入失败时按错误码回复：目标不唯一、目标不存在、版本冲突、编辑器锁定、连续重复写入，都表示本次未写入。
5. discuss/analyze 意图下不要尝试写入；即使模型输出写入调用，应用也会拒绝。
6. 达到工具轮上限后应用会发收敛请求；SKILL 不需要为此设计额外逃生话术，但应避免“重复读取同一节点”的无效循环。

## 6. 运行记录怎么读

Run trace 分三层，都记录实际发送的工具面：

| 层 | 字段 | 含义 |
|---|---|---|
| turn | `intent`、`toolSurface`、`actualToolSurface` | 一轮用户对话的入口声明与实际授权面 |
| API call | `actualToolSurface`、`toolCalls`、`toolResults`、`toolRequests` | 单次 AI 调用实际发送的工具、模型调用、执行结果、每轮请求消息 |
| event | `api-start`、`tool-call`、`turn-intent-updated`、`routing_result`、`chain_handoff` | 事件流，供 SKILL 调试定位 |

关键定义在 `src/stores/runTrace.ts`：

- `actualToolSurface` 出现在 turn、API call、event 三层，约 55/169/364/370/387 行。
- `recordToolCall()` 约 922 行，会追加 `tool-call` 事件。
`updateTurnIntent()` 约 771 行，用于大纲工作台“意图路由晚于 turn 创建”的场景，保证三层一致，并追加 `turn-intent-updated` 事件。

调试建议：

1. 先看 turn 的 `actualToolSurface`：写意图却没有 `editor.write`，说明路由或授权断了。
2. 再看 API call 的 `toolCalls/toolResults`：有调用但失败，看错误码；完全没有调用，看模型输出与兼容模式。
3. 最后看 `toolRequests`：它保留 tool loop 中每一轮真实发送的消息，能判断模型是否在重复读同一内容。
4. 如果 trace 显示连续纯工具轮，第 2 轮会有 warning；达到 6 轮后应有 `tool_convergence` 阶段和 `tool_converged` finishReason。

## 7. 失败码速查

| 错误码 | 来源 | 含义 |
|---|---|---|
| `permission_denied` | aiService | 意图无写权限或缺少意图上下文，写入被拒 |
| `duplicate_write_blocked` | aiService | 连续 3 次完全相同的写入输入被拦截，模型应基于已写入结果总结或调整参数 |
| `too_many_commands` | editorTools | 单批超过 10 条命令 |
| `batch_too_large` | editorTools | 批次超过 60000 字符 |
| `write_target_mismatch` | editorTools | 工具目标与当前编辑目标不一致 |
| `ambiguous_target` | editorTools / locator | 片段多次出现，需扩展片段 |
| `target_not_found` | editorTools / locator | 片段不存在，需重新复制原文 |
| `invalid_input` | 工具通用 | 参数结构或必填项错误 |
| `tool_execution_failed` | ToolGateway | 工具执行异常 |
| `tool_not_found` | ToolGateway | 模型调用了不存在的工具名 |
| `canceled` | ToolGateway | 用户或监督器取消 |

另有请求级守卫 `src/services/toolRunSupervisor.ts`：150 秒无进展自动中止，300 秒总上限自动中止，同一工具连续失败 3 次自动中止。

## 8. 与旧确认预览的关系

旧的 `editor.propose_edits` / 待确认编辑链路已删除。现在写入只有两条路：

1. 原生 tool call 调 `editor.write`。
2. 兼容模式输出 JSON 协议，由应用转成 `editor.write`。

SKILL 不要再输出“待确认编辑”或等待按钮确认的协议；那不会被执行。

## 9. 快速自检清单

给 SKILL 制作方发布前自查：

1. discuss 场景：模板是否只引导读取和分析，没有写入承诺？
2. edit 场景：模板是否明确要求调用 `editor.write`，而不是输出修改后全文？
3. 长文档：是否使用 outline 工具分页，而不是要求全文注入？
4. 写入结果：是否以 `status: "written"` 为唯一成功依据？
5. 失败路径：是否按错误码告知用户“本次未写入”？
6. 工具循环：是否避免重复读取同一节点、同一关键词？
7. run trace：turn/API/event 三层的 `actualToolSurface` 是否一致？

## 10. 证据索引

| 事实 | 位置 |
|---|---|
| 基础工具定义 | `src/services/editorTools.ts:286` 起 |
| 大纲工具定义 | `src/services/outlineTools.ts:87` 起 |
| 权限矩阵 | `src/services/dialogueFoundation.ts:59` |
| 工具集校验与 pipeline 禁写 | `src/services/dialogueFoundation.ts:74` |
| 单源工具面构建 | `src/services/dialogueToolSurface.ts:56` |
| 单源授权函数 | `src/services/dialogueToolSurface.ts:89` |
| 写权限二次校验 | `src/services/aiService.ts:272` |
| 兼容模式写入 | `src/services/aiService.ts:299` |
| tool loop 与写入预算 | `src/services/aiService.ts:1326` |
| 收敛请求 | `src/services/aiService.ts:1591` |
| 直写 JSON 协议 | `src/services/editorEditProtocol.ts:270` |
| folder 钩子执行 | `src/services/realSkillExecutor.ts:115` |
| folder 模板覆盖 | `src/services/realSkillExecutor.ts:321` |
| 意图路由入口 | `src/services/chainIntentRouter.ts:710` |
| turn intent 回写 | `src/stores/runTrace.ts:771` |
