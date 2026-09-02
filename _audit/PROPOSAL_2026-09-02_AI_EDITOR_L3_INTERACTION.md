# AI-编辑器等级三交互方案（左右手协同）

> 日期：2026-09-02  
> 状态：待审核，未执行  
> 版本基线：3.15.0（建议实施版本 3.16.0 minor）  
> 范围：统一 AI 服务层、工具调用层、主页编辑器、大纲工作台、AI 对话气泡  
> 约束来源：`_audit/神意开发经验总结_v2.md` §1、§2、§3、§5、§6、§7、§8

## 结论

等级三不是把编辑器交给 API，而是把等级二的“单命令编辑”升级为“可多步协同的受限编辑任务”：

`用户意图 -> AI 读取工具（只读） -> AI 提出编辑批次 -> 应用生成安全 EditPlan -> 用户预览确认 -> 编辑器原子写入 -> 批量撤销/回滚 -> 上下文记录`

核心决策：

1. **模型永远不直接控制编辑器**。所有写入由应用侧执行，模型只能返回受限指令或工具调用参数。
2. **左手是 AI 侧工具调用**：新增统一的工具描述、请求归一化、工具执行循环、结构化错误回传。
3. **右手是编辑器侧执行底座**：多编辑暂存区、批次原子应用、定位导航、批量撤销、会话回滚、大文本 diff。
4. **原生 tools 与 JSON 协议并存**。OpenAI 兼容/DeepSeek 走原生 tools；Anthropic、Gemini 做协议映射；不支持 tools 的供应商自动降级到等级二 JSON 协议。
5. **写入永远需要用户确认**。只读工具可自动执行；写入工具只生成待确认批次，不允许 AI 绕过预览。

## 社区调研结论

调研时间：2026-09-02，使用 GitHub API 与官方文档重新取证。

| 项目 | 状态 | 可借鉴机制 | 对本应用等级三的落地映射 |
|---|---|---|---|
| Cline | 67.3k stars，活跃 | `createTool` + JSON Schema + `AgentToolContext`；`toolPolicies` 支持 `enabled/autoApprove`；工具错误返回结构化数据而不是 throw；长工具尊重 `abortSignal` | 我们复用现有 `ToolRegistry`，但补上 JSON Schema、上下文对象、策略表和结构化错误；取消编辑任务时同步中止工具循环 |
| Aider | 48.7k stars，活跃 | architect/editor 分离；edit formats 分 whole/diff/diff-fenced/udiff；编辑器模型负责把方案变成具体编辑指令 | 等级三增加“规划模型/编辑模型”分离：对话模型负责方案与定位，编辑指令生成继续走受限协议，避免长文大改时一次性重写 |
| OpenHands | 85.9k stars，活跃 | 事件流、多 Agent、工具可视化、automation server | 工具调用结果必须作为事件进入气泡/诊断日志，用户能看到“AI 正在读哪里、改哪里、为什么” |
| Open WebUI | 150.7k stars，活跃 | 工具审批层、内置工具、函数扩展 | 工具权限分级：只读自动、写入确认；权限策略保存为用户可理解配置，而不是硬编码 |
| Continue | 35.7k stars，仓库仍活跃 | 流式 diff 与新旧内容对齐 | 大文本不做全量渲染 diff；只渲染变更窗口，完整文本留在内存中 |
| Roo Code | 24.3k stars，已归档 | `apply_diff`、精确搜索块、先读后改 | 只作历史参考，不作为主依据；精确 `target` 匹配原则已在等级二落地 |

共同原则：高星项目都把“读、搜、定位”设为低风险工具，把“写入”设为审批工具；工具循环里应用负责执行和记录，模型只能看到工具结果，不能拿到编辑器对象。

## 应用承载能力对账

| 现有模块 | 当前能力 | 等级三差距 |
|---|---|---|
| `src/services/aiService.ts` | 统一入口、流式/非流式、超时、重试、日志、`finish_reason` 归一化 | 无 `tools` 请求字段，无 tool call 响应抽取，无工具循环，无 tool 结果消息回传 |
| `src/services/providerProtocols.ts` | OpenAI 兼容、DeepSeek、Anthropic、Gemini、Azure OpenAI 五类协议 | `buildRequestBody` 未接收 tools；Anthropic/Gemini 工具调用结构未映射 |
| `src/services/providerAdapter.ts` | `normalizeFinishReason` 已将 `function_call` 归一化为 `tool_calls` | 只归一化 finish reason，未抽取 tool calls 本体 |
| `src/services/tool-registry.ts` | 已有 register/execute/list 和 4 个本地纯函数工具 | 无 JSON Schema，无策略，无上下文，无结构化错误约定，无编辑器工具 |
| `src/services/mcp-protocol.ts` | 占位实现，只返回本地 ToolRegistry | 等级三不接真实 MCP 服务；只复用注册表概念，防止范围膨胀 |
| `src/services/editorEditProtocol.ts` | 等级二单命令协议，六种操作，解析失败降级普通回复 | 无多命令批次，无编辑意图/计划/完成状态 |
| `src/services/editorTarget.ts` | 内容快照与 `locked/version_changed` 校验 | 校验是全内容比较，需扩展批次级校验与目标描述 |
| `src/services/editorEditService.ts` | 单命令纯函数 EditPlan | 无批次串行规划、冲突检测、原子应用/回滚 |
| `src/components/common/DiffModal.vue` | 逐行接受/拒绝、全部接受/拒绝 | 无多编辑批次视图、无定位跳转、无大文本窗口化 |
| `src/stores/editor.ts` | 单 tab 50 步撤销栈 | 需要批次级 undo 单元，一次撤销回滚整批 |
| `src/services/conversationContextService.ts` | 项目/工作区/用途/SKILL 上下文，200 条消息 | 需要记录工具调用轮次和编辑批次摘要，避免上下文丢失“刚才 AI 改了什么” |

## 总体架构

```text
用户输入
  ↓
ChatPanel / OutlineWorkspace
  ├─ 组装上下文（conversationContextService）
  ├─ 注入等级三工具协议
  └─ callAi({ tools, toolPolicy })
         ↓
   aiService 统一入口
   ├─ providerProtocols.buildRequestBody(tools)
   ├─ 原生 tools / JSON 协议降级
   ├─ 工具循环（最多 N 轮，可取消）
   └─ 诊断日志
         ↓
   ToolGateway（新增，应用侧唯一执行入口）
   ├─ 只读工具：editor.get_state、editor.search、editor.locate
   └─ 写入工具：editor.propose_edits、task.update_plan
         ↓
   EditBatchService（新增）
   ├─ 生成暂存区虚拟文档
   ├─ 串行生成 EditPlan
   ├─ 冲突检测 / 快照校验
   └─ 用户确认后原子应用
         ↓
   编辑器 / 大纲工作台
   ├─ 批量 undo 单元
   ├─ 定位导航
   ├─ dirty / 保存链路
   └─ 会话回滚
```

## 左手：AI 侧升级

### 1. 统一工具定义

新增 `src/services/editorTools.ts`，不把工具直接塞进 `ToolRegistry` 的旧全局注册表。旧 `ToolRegistry` 继续服务本地纯函数，避免污染现有能力。

```ts
interface AiToolDefinition {
  name: string                       // editor.get_state / editor.search / editor.propose_edits
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  policy: 'read' | 'write'
  timeoutMs?: number
  execute(input: unknown, context: AgentToolContext): Promise<ToolResult>
}

interface AgentToolContext {
  projectId: string
  workspace: 'main' | 'outline'
  targetId: string
  sessionId: string
  iteration: number
  abortSignal?: AbortSignal
}

interface ToolResult {
  ok: boolean
  data?: unknown
  error?: { code: string; message: string; retryable?: boolean }
}
```

工具错误遵循 Cline 经验：返回结构化错误，不 throw；模型可据此调整定位或收窄编辑。

### 2. 初始工具集

| 工具 | 类型 | 作用 | 权限 |
|---|---|---|---|
| `editor.get_state` | 只读 | 返回目标、字数、章节/大纲标签、光标与选区摘要、快照版本 | 自动执行 |
| `editor.search` | 只读 | 按关键词返回匹配位置、上下文窗口、命中次数 | 自动执行 |
| `editor.locate` | 只读 | 给定候选片段，返回是否唯一匹配及位置 | 自动执行 |
| `editor.propose_edits` | 写入 | 提交 1-10 条受限编辑命令，只进入暂存区，不写编辑器 | 需要用户预览确认 |
| `task.update_plan` | 只读写状态 | 更新任务阶段说明，展示“AI 当前计划”，不修改正文 | 自动执行，仅 UI 状态 |

明确不做：执行 shell、读写磁盘任意文件、DOM 操作、模型生成 JS 代码执行、真实 MCP 外部服务。这些不属于小说编辑器等级三。

### 3. 供应商 tools 归一化

新增 `src/services/providerTools.ts`，职责是把统一 `AiToolDefinition[]` 转成供应商请求体，并把响应归一化：

| 供应商 | 请求映射 | 响应映射 | 说明 |
|---|---|---|---|
| OpenAI 兼容 / DeepSeek / Azure OpenAI | `tools: [{ type: 'function', function: { name, description, parameters } }]`，结果消息 `role: 'tool'` | `choices[0].message.tool_calls[]` | 主路径 |
| Anthropic | `tools: [{ name, description, input_schema }]`，结果 `tool_result` content block | `content[]` 中 `type: 'tool_use'` | 需要扩展 `buildRequestBody` |
| Gemini | `functionDeclarations`，结果 `functionResponse` | `functionCall` | 需要扩展 `buildRequestBody` |
| 不支持 tools 的供应商 | 不发送 tools 字段，继续注入等级二 JSON 协议 | 从文本解析 `editor_edit` / `editor_edit_batch` | 兜底路径，不报错 |

降级规则：

1. 供应商请求 tools 失败且返回 4xx 工具不支持类错误时，仅本次自动降级为 JSON 协议，并写诊断日志。
2. 降级必须在气泡内提示“当前供应商未启用原生工具调用，已使用兼容模式”。
3. 连续 3 次降级后，在供应商卡片上显示能力标记，不修改用户配置。
4. 禁止为了 tools 能力自动改写用户的 baseUrl 或模型名。

### 4. 工具循环

`callAi` 新增可选参数：

```ts
tools?: AiToolDefinition[]
toolPolicy?: {
  maxToolIterations: number   // 默认 6
  maxWriteProposals: number   // 默认 1
  onToolCall?: (event: ToolCallEvent) => void
}
```

循环规则：

1. 最多 6 轮，防止上下文无限膨胀。
2. 只读工具自动执行；写入工具只生成待确认批次，返回给模型 `pending_user_confirmation`。
3. 每轮工具调用必须写诊断日志：工具名、参数摘要、结果状态、耗时、迭代号。
4. 外部 `AbortSignal` 中止时，立即停止工具循环，已生成的暂存批次保留给用户处理，但不应用。
5. 工具执行失败不伪装成功，返回结构化错误给模型；模型可选择收窄搜索或结束。
6. 不把完整正文反复塞入上下文。第一次 `editor.get_state` 只返回摘要；需要局部内容时用 `editor.search` 拿窗口。

### 5. Architect / Editor 分离

借鉴 Aider，但不做成双模型硬要求：

1. 对话模型作为 architect：理解用户意图、读取工具结果、制定编辑计划。
2. 编辑指令生成保持受限协议：明确 operation、target、content、position、reason。
3. 用户可选择“使用当前模型完成编辑指令”，不做强制双供应商配置。
4. 上下文服务记录 plan 摘要与编辑批次摘要，后续对话能知道“刚才改了哪里、为什么改”。

## 右手：编辑器侧升级

### 1. 批量编辑协议

扩展 `editorEditProtocol.ts`：

```ts
interface EditorEditBatchCommand {
  type: 'editor_edit_batch'
  version: 1
  target: { workspace: 'main' | 'outline'; targetId: string; contentVersion: number }
  commands: EditorEditCommand[]  // 1-10 条
  reason?: string
}
```

限制：

- 单条命令沿用 20000 字符上限；批次总内容上限 60000 字符。
- 批次最多 10 条，防止长事务不可审。
- 所有 `target` 必须基于同一快照；用户手动改动后整批拒绝并提示重新生成。
- 解析失败整批降级为普通回复，不允许部分应用。

### 2. 多编辑暂存区

新增 `EditStagingDocument`：

1. 以快照原文为 base，串行应用每条命令生成中间版本。
2. 每条命令记录 `before/after/range/reason`，可单独接受或拒绝。
3. 暂存区不写 Pinia、不写项目文件、不改变 dirty 状态。
4. 关闭预览即丢弃；用户确认后一次性原子应用。

### 3. 批次应用与撤销

1. 应用前重新校验快照版本、锁定状态和目标匹配。
2. 应用时把整批写入作为一个 undo 单元压入 editor store；一次 `Ctrl+Z` 回滚整批，不需要按条撤销 10 次。
3. 大纲工作台使用自己的撤销栈，但同样以批次为单位。
4. 应用失败时立即停止，不出现半批状态；失败详情写入诊断日志。

### 4. 会话回滚

每个编辑批次生成 `batchId`，保存：

- 快照原文 hash 与 contentVersion
- 每条命令与 EditPlan
- 接受/拒绝状态
- 应用时间、tabId、workspace

在编辑器侧提供“回滚此 AI 批次”入口：

1. 只允许回滚快照之后没有人工修改过的批次；若已有手动修改，提示用户走 diff 预览，不自动覆盖。
2. 回滚同样是一次 undo 单元，可再撤销恢复。
3. 批次记录进入上下文服务，后续对话知道当前文本处于哪个批次之后。

### 5. 定位导航与 Diff 性能

1. 预览列表按命令分组；点击某条编辑时编辑器滚动到对应 range。
2. Diff 只渲染变更前后上下文窗口，完整文本保留在内存。
3. 超大文本按命令分页，不一次性渲染全部行。
4. UI 遵守 `tokens.css`，不新增孤立颜色；弹窗必须做小视口和长文本回归。

## P0-P8 执行计划

### P0 影响圈冻结

任务：

1. `rg` 列出 `aiService`、`providerProtocols`、`ChatPanel`、`OutlineWorkspace`、`DiffModal`、`editor store` 的引用关系。
2. 列出等级三会触碰的字段：编辑器 tabs/undo、大纲 text/undo、上下文 sessions、诊断日志、工具注册表。
3. 明确不改：生成流水线业务逻辑、SKILL 编辑器、供应商基础路由、去 AI 味、续生成状态机。
4. 写入影响圈声明文件或方案附录，后续 diff 逐行对照。

验收：

- [ ] 影响圈清单完成
- [ ] 禁改清单完成
- [ ] 所有改动点都能归入本需求

### P1 工具定义与 ToolGateway

任务：

1. 新增 `editorTools.ts` 定义 5 个初始工具。
2. 新增 `ToolGateway`：校验 inputSchema、执行工具、返回结构化错误、记录工具事件。
3. 只读工具接入主页编辑器与大纲工作台的目标快照。
4. `editor.propose_edits` 只写暂存区，不触发编辑器变更。

验收：

- [ ] schema 校验单测通过
- [ ] 只读工具返回摘要而不是全文
- [ ] 非法参数返回结构化错误
- [ ] AbortSignal 可中断

### P2 供应商 tools 归一化

任务：

1. 新增 `providerTools.ts`。
2. `CallAiParams` 增加 `tools/toolPolicy`。
3. 扩展五类协议的 `buildRequestBody` 与响应抽取。
4. 实现 JSON 协议降级与能力提示。

验收：

- [ ] OpenAI/DeepSeek tools 请求体单测
- [ ] Anthropic tool_use 映射单测
- [ ] Gemini functionCall 映射单测
- [ ] 不支持 tools 时降级为等级二 JSON，不报错
- [ ] 流式路径不因 tools 产生双请求（回归 §8 规则 18）

### P3 aiService 工具循环

任务：

1. callAi 支持工具循环与 tool result 消息回传。
2. 工具轮次写统一诊断日志。
3. 循环上限、取消、失败分类、空输出处理。
4. 降级协议复用等级二解析器。

验收：

- [ ] 6 轮上限生效
- [ ] 写入工具不直接应用
- [ ] 取消后无残留请求
- [ ] 失败不伪装成功
- [ ] 诊断日志包含 providerId/purpose/model/tool/iteration/durationMs

### P4 批量编辑协议与暂存区

任务：

1. 扩展 `editorEditProtocol` 支持 `editor_edit_batch`。
2. 新增 `EditStagingDocument` 串行规划 1-10 条命令。
3. 冲突检测：target 失配、范围重叠、重复删除、超限。
4. 保留等级二单命令兼容，不迁移旧配置。

验收：

- [ ] 批次解析单测
- [ ] 串行应用单测
- [ ] 部分失败整批拒绝
- [ ] 旧单命令行为不变

### P5 EditReviewModal 批次 UI

任务：

1. DiffModal 升级为批次预览：命令分组、单条接受/拒绝、全部接受/拒绝。
2. 点击编辑项跳转编辑器位置。
3. 大文本窗口化渲染。
4. 空批次、失败批次、锁定目标、版本变化四种状态。

验收：

- [ ] 10 条命令预览不卡顿
- [ ] 拒绝某条后其余命令仍可独立应用
- [ ] 弹窗小视口无溢出
- [ ] 预览阶段 store/dirty/文件零变化

### P6 主页与大纲工作台接入

任务：

1. ChatPanel 接入工具循环、批次预览、批次 undo。
2. OutlineWorkspace 接入同一协议与工具集。
3. 上下文服务记录工具轮次和批次摘要。
4. 气泡展示“AI 读取了哪里、提出了哪些编辑、等待确认”。

验收：

- [ ] 主页正文多命令编辑闭环
- [ ] 大纲工作台多命令编辑闭环
- [ ] 后续对话能引用上一批次摘要
- [ ] 旧单命令编辑不回归

### P7 诊断日志与能力标记

任务：

1. 日志新增 `ai-service/tool-call/editor-batch` 分类维度。
2. 供应商能力标记：native_tools / json_protocol。
3. 错误导出包含工具参数摘要与批次 ID。
4. 诊断面板支持按工具名与批次 ID 过滤。

验收：

- [ ] 每次工具调用可从日志还原
- [ ] 降级原因可见
- [ ] 批次 ID 可关联预览、应用、回滚

### P8 验证、经验回写与交付

#### 8.1 验证等级定义

本方案不允许用“构建成功”或“单测通过”替代功能验收。所有阶段必须按以下四级记录证据，任何一级缺失都不能勾选：

| 等级 | 名称 | 证据要求 |
|---|---|---|
| V1 | 静态验证 | `npm run type-check`、`npm run test:services`、定向 vitest 原始输出 |
| V2 | 服务级验证 | 协议解析、工具 schema、供应商映射、批次规划的定向单测输出；必须包含失败用例 |
| V3 | 源应用真实验证 | `npm run build:vue` 后，用仓库内 `node_modules\electron\dist\electron.exe . --remote-debugging-port=9227` 启动，CDP 真实点击、输入、断言 store/DOM/日志 |
| V4 | 交付验证 | 持久化重启恢复、安装包烟测路径、客户实操入口、未签名状态说明 |

执行规则：

1. V2 通过不代表 V3 通过；V3 通过不代表 V4 通过。
2. 每个用例必须输出一个 JSON/文本证据文件，包含 `allStepsOk`、`runtimeErrors:[]`、断言明细。
3. 探针必须遵守三段式：前置快照 → 业务操作断言 → finally 恢复原状；成功路径也必须恢复。
4. CDP 长事务超时不少于 360 秒；流式、重试、取消类用例不得使用短超时制造假失败。
5. 任何“预期失败”用例必须断言失败原因分类，不允许只断言抛错。

#### 8.2 高风险专项验证矩阵

| 高风险 | 必测场景 | 必须证明的现象 | 验证等级 |
|---|---|---|---|
| AI 绕过确认写入 | 伪造模型返回 `editor.propose_edits`；直接派发 `show-diff`；批量命令含危险 rewrite/delete | 编辑器内容、dirty、项目文件三者在确认前完全不变；无法通过事件总线或旧入口绕过预览 | V2 + V3 |
| 批次部分应用 | 第 1 条成功、第 2 条 target 失配；应用中触发异常；10 条中拒绝 3 条 | 失败整批拒绝；确认后只应用被接受项且 undo 一次回滚整批；无半批状态 | V2 + V3 |
| 版本冲突/切 tab | 预览打开后手改正文；切 tab；自动保存触发；大纲锁定 | 整批拒绝并给出明确原因；不会写入旧快照内容；锁定状态不可应用 | V3 |
| 工具循环失控 | 模型连续要求工具；工具持续返回错误；用户中途取消 | 最多 6 轮；错误结构化回传；取消后无新请求、无残留暂存应用 | V2 + V3 |
| 供应商 tools 差异 | OpenAI/DeepSeek 原生、Anthropic 映射、Gemini 映射、JSON 降级 | 同一批编辑任务四种路径语义一致；降级有气泡提示和日志；无流式双请求 | V2 + V3 |
| 旧功能回归 | 等级一上下文、等级二单命令、续生成、普通聊天 | 请求参数、消息结构、气泡行为、持久化均不回归 | V3 |
| 大文本性能 | 10 万、30 万、50 万字符各一档；10 条命令批次 | 预览渲染、点击跳转、应用、撤销均有性能阈值记录，无界面冻结 | V3 |
| 隐藏组件激活 | 改动前后组件树对比、diff 自审、未引用样式扫描 | 只出现等级三应出现的 UI；旧隐藏弹窗、按钮、样式不被激活 | V3 |

#### 8.3 负向与边界用例

协议负向：

- [ ] 非法 JSON、截断 JSON、JSON 外混正文
- [ ] 空命令数组、超过 10 条命令、单条超 20000 字符、批次超 60000 字符
- [ ] operation 非法、target 缺失、position 非法
- [ ] 同一批次 target 重叠、重复删除同一片段
- [ ] `type` 是旧 `outline_edit` 仍按等级二兼容处理

工具负向：

- [ ] 工具名不存在、必填参数缺失、参数类型错误
- [ ] 工具执行抛异常，返回结构化错误而非崩溃
- [ ] 迭代达到 6 轮上限后正常收尾
- [ ] AbortSignal 取消时当前工具停止、后续工具不执行
- [ ] 写入工具返回 `pending_user_confirmation`，模型不能把它当成已应用

编辑器负向：

- [ ] 无 activeTab、空正文、只读模式、大纲锁定
- [ ] target 出现多次但不唯一
- [ ] 选区在预览期间丢失
- [ ] 批次应用前内容 hash 变化
- [ ] 会话回滚时已有用户手动修改

#### 8.4 并发与时序用例

1. 预览打开期间用户继续输入，然后点击应用。
2. 预览打开期间切换 tab，再切回原 tab。
3. 工具循环执行中用户点击取消。
4. 流式输出未完成时用户关闭气泡。
5. 两个编辑批次先后生成，用户先应用后一个。
6. 自动保存与批次应用同时触发。
7. 应用批次后立刻撤销、再重做。
8. 大纲工作台与主页编辑器同时存在待预览批次。

每个用例必须断言最终内容版本、undo 栈、dirty 状态、项目文件和诊断日志，不允许只看 UI 不崩。

#### 8.5 性能阈值

在 50 万字符正文、10 条命令批次下：

| 指标 | 阈值 |
|---|---|
| 协议解析 + 批次规划 | ≤ 500ms |
| 预览弹窗首次渲染 | ≤ 1000ms |
| 单条命令切换/定位跳转 | ≤ 200ms |
| 批次应用 | ≤ 300ms |
| 批次撤销 | ≤ 300ms |
| 工具循环单轮只读工具 | ≤ 100ms |
| 主线程长任务阻塞 | ≤ 200ms |

阈值以开发机三次运行中位数为准；超阈值不算失败缺陷，但必须记录并进入性能清单，由用户决定是否阻塞交付。界面冻结、无响应、内存持续增长则直接阻塞。

#### 8.6 供应商矩阵

| 供应商路径 | 原生 tools | 工具结果回传 | JSON 降级 | 流式 | 必测 |
|---|---:|---:|---:|---:|---|
| OpenAI 兼容 | 是 | 是 | 自动 | 是 | 完整批次 + 降级 + 双请求断言 |
| DeepSeek | 是 | 是 | 自动 | 是 | 完整批次 |
| Anthropic | 映射 | 映射 | 自动 | 是 | tool_use 请求/响应/结果回传 |
| Gemini | 映射 | 映射 | 自动 | 是 | functionCall 请求/响应/结果回传 |
| Azure OpenAI | 是 | 是 | 自动 | 是 | endpoint 组合 + tools |
| mock 不支持 tools | 否 | 否 | 强制 | 是 | 降级提示 + 等级二语义 |

供应商验证必须使用请求体快照断言，不能只断言“调用成功”。每次网络调用次数必须与预期完全相等，防止流式双请求回归。

#### 8.7 安全不可绕过证明

1. 源码扫描：`editor.propose_edits` 之外的路径不得写编辑器内容；旧直写入口必须引用闭包后关闭。
2. 事件扫描：`show-diff`、编辑批次应用事件不能由模型响应直接派发为“应用”语义。
3. 权限扫描：写入工具没有任何 auto-apply 分支；只读/写入策略不可由 prompt 覆盖。
4. 运行时证明：伪造 10 种恶意响应，包括要求直接应用、要求跳过确认、伪造系统消息、伪造工具结果，编辑器均不变化。
5. 磁盘证明：确认前项目 JSON 的相关字段 hash 不变。

#### 8.8 验证命令与交付门

- [ ] `npm run type-check`
- [ ] `npm run test:services`
- [ ] 新增定向 vitest：`editorTools.spec.ts`、`providerTools.spec.ts`、`editorEditBatch.spec.ts`
- [ ] `npm run build:vue`
- [ ] 源 Electron + CDP：主页编辑器完整闭环
- [ ] 源 Electron + CDP：大纲工作台完整闭环
- [ ] 源 Electron + CDP：供应商矩阵 + JSON 降级
- [ ] 源 Electron + CDP：并发与时序 8 用例
- [ ] 源 Electron + CDP：恶意响应 10 用例
- [ ] 持久化重启恢复
- [ ] UI 小视口与弹窗递归扫描
- [ ] 安装包生成 + 解包程序启动烟测

收尾：

1. 单测：工具 schema、供应商映射、协议解析、批次规划、冲突检测。
2. `npm run type-check`。
3. `npm run build:vue`。
4. 源 Electron + CDP 真实操作：
   - 主页多命令编辑：确认、单条拒绝、批量撤销、会话回滚。
   - 大纲工作台同路径。
   - 只读工具调用、搜索定位、批次预览。
   - 不支持 tools 的供应商降级路径。
   - 目标失配、版本变化、锁定、取消、非法 JSON。
5. 持久化：应用后保存重启恢复；取消预览不产生 dirty；批次记录重启后仍在。
6. UI 回归：气泡按钮、弹窗、小视口无溢出。

收尾：

- [ ] 更新 `_audit/神意开发经验总结_v2.md`
- [ ] 更新开发日志
- [ ] 工作区只包含本任务文件
- [ ] 版本号升级 3.16.0
- [ ] `npm run build`
- [ ] 交付说明标注未签名状态与客户实操入口
- [ ] 每个高风险项在交付报告中给出证据文件路径，无证据按未完成处理

## 风险清单

| 风险 | 等级 | 对策 |
|---|---|---|
| 供应商不支持原生 tools | 高 | 三路统一：OpenAI 原生、Anthropic/Gemini 映射、JSON 协议降级 |
| 工具循环失控或上下文膨胀 | 高 | 最多 6 轮；只读工具只返回摘要/窗口；每次工具调用写日志 |
| AI 绕过确认直接写入 | 严重 | 写入工具只进暂存区；应用层强制预览确认；无隐藏 auto-apply |
| 批次部分应用造成半成品 | 高 | 串行规划全部成功才允许应用；应用失败立即停止并提示 |
| 版本冲突/用户切 tab | 高 | 快照 contentVersion + 内容校验；冲突整批拒绝 |
| 大文本 diff 卡顿 | 中 | 变更窗口渲染 + 命令分页 |
| 流式双请求回归 | 高 | P2 明确复用现有主进程网络桥；验收包含网络调用次数断言 |
| 旧等级二行为回归 | 高 | P4 保留单命令兼容；P6/P8 回归旧路径 |
| 隐藏组件被激活 | 高 | P0 影响圈冻结 + diff 逐行自审 |
| 权限配置过度复杂 | 中 | 初始不暴露工具策略设置，只分只读/写入两级 |

## 明确不做

1. 不接入外部 MCP 服务器。
2. 不允许模型执行 shell、任意文件读写或 JavaScript。
3. 不做自动应用写入，即使用户说“直接改”，也必须经过预览确认。
4. 不改动生成流水线、SKILL 执行引擎、去 AI 味、续生成状态机。
5. 不迁移或破坏等级一/等级二已有配置。

## 总验收标准

总验收拆成六组，每组都必须通过；任何一组失败，整体不得标记完成。

### A. 权限与不可绕过

- [ ] 只读工具能返回编辑区摘要、搜索结果、定位结果，但工具上下文中不存在编辑器 DOM/store 写方法
- [ ] 写入工具只能生成暂存批次，返回值为 `pending_user_confirmation`
- [ ] 伪造模型响应、伪造事件、伪造系统消息共 10 类攻击样本，确认前编辑器内容不变
- [ ] 确认前编辑器内容、dirty 状态、项目文件 hash 三项均为零变化
- [ ] 源码扫描确认无模型响应直写编辑器的新路径，旧直写入口已引用闭包

### B. 批次一致性与回滚

- [ ] 1、3、10 条命令批次均可解析、预览、应用、撤销
- [ ] 单条拒绝后，其余被接受命令正确应用，拒绝项不进入正文
- [ ] 任意一条规划失败时整批拒绝，不出现半批状态
- [ ] 应用后一次撤销回滚整批，重做可恢复整批
- [ ] 会话回滚能恢复批次前状态；已有用户手动修改时拒绝自动回滚
- [ ] 应用失败、异常中断、自动保存并发三种场景下无脏状态残留

### C. 版本与目标保护

- [ ] 预览期间手改正文后应用，批次被拒绝并提示重新生成
- [ ] 预览期间切 tab 后应用，批次被拒绝，不写入旧目标
- [ ] 大纲锁定时只能预览，不能应用
- [ ] target 多次出现且不唯一时拒绝执行并说明原因
- [ ] 选区丢失、无 activeTab、空正文均有明确提示且不写入

### D. 工具循环与供应商兼容

- [ ] OpenAI/DeepSeek 原生 tools 请求体与响应解析正确
- [ ] Anthropic `tool_use` 与结果回传映射正确
- [ ] Gemini `functionCall` 与 `functionResponse` 映射正确
- [ ] Azure OpenAI endpoint 与 tools 组合正确
- [ ] 不支持 tools 的供应商自动降级为等级二 JSON 协议，气泡显示兼容模式
- [ ] 同一编辑任务在原生 tools 与 JSON 降级两条路径产生等价编辑结果
- [ ] 每条路径网络调用次数与预期完全一致，无流式双请求
- [ ] 工具循环最多 6 轮，取消后不再发出新请求

### E. 性能与 UI

- [ ] 50 万字符、10 条命令批次达到 8.5 阈值或已记录性能清单
- [ ] 预览弹窗无界面冻结、无内存持续增长
- [ ] 批次预览、气泡按钮、编辑器工具栏在小视口无溢出
- [ ] 弹窗递归验证：主页 → 批次预览 → 单条编辑详情 → 错误提示
- [ ] 未引用样式和隐藏组件激活扫描通过

### F. 回归与持久化

- [ ] 等级一上下文记忆多轮对话不回归
- [ ] 等级二单命令编辑在主页和大纲工作台均不回归
- [ ] 续生成按钮和状态机不回归
- [ ] 普通聊天、SKILL 聊天、无 SKILL 聊天行为不回归
- [ ] 应用后保存并重启，编辑内容与批次记录完整恢复
- [ ] 取消预览后重启，不产生 dirty、不写入批次记录
- [ ] 诊断日志能还原每次工具调用、降级、预览、应用、回滚

### 最终判定

1. A-F 六组全部勾选，且每项至少有一条本轮证据。
2. 高风险专项矩阵中每一行必须有证据文件路径。
3. 证据文件必须包含原始断言输出，不允许只有结论字符串。
4. 发现新缺陷时，进入“根因定位 → 最小修复 → 构建 → 杀进程 → 源应用重启 → 真实操作 → 递归验证”循环；连续三轮被外部环境阻断才可标记 BLOCKED。
5. 任何无证据的“已完成”按未完成处理，不得进入版本封装。
