# EditTask 系统性成熟度社区调研报告

日期：2026-09-22  
调研对象：60 个真实开源仓库的源码实现  
证据缓存：`_audit/research-cache/edit-task-maturity-2026-09-22/`  
主台账：`_audit/RESEARCH_2026-09-22_EDIT_TASK_MATURITY_SOURCES.json`  
缺口台账：`_audit/RESEARCH_2026-09-22_EDIT_TASK_MATURITY_GAPS.json`  
主题摘要：`_audit/RESEARCH_2026-09-22_EDIT_TASK_MATURITY_DIGEST.md`

## 结论摘要

1. 本次调研共取得 **60 个去重后的真实仓库源码证据**，主采集 43 个、缺口补采 19 个，缓存源文件 330 个，满足“至少 50 个真实项目”的要求。
2. 社区成熟系统的共同点不是“更强的意图词库”，而是把跨轮编辑当成**有状态任务系统**处理：会话级审批状态、任务级 checkpoint、分批执行器、锚点定位恢复、部分失败终态、可恢复历史，全部是应用层一等状态。
3. 我们当前实现的根本缺陷与此相反：按单句意图静态过滤工具，缺少跨轮任务连续性；长文重排没有任务规划与分批执行；部分写入没有任务级终态；runTrace 用最后一轮快照合成整次运行状态。
4. 事故 trace 证实这不是模型偶发幻觉：第 2 轮长文重排发生锚点失败、修复批次失败、部分写入成功但整轮折叠为无正文；第 3 轮用户追问被路由为 discuss，工具面剥掉 `editor.write`，模型据此声明无写入权限。
5. 因此修复方向必须是 **EditTask 一等公民 + 会话级活动任务 + 长文分批执行器 + 真实终态记录**。词库和提示词只能作为辅助，不能作为根修。

## 调研方法

1. 通过 GitHub Search API 按主题检索候选仓库，不采信 README 描述作为结论依据。
2. 对候选仓库抓取真实源码文件到本地缓存，只在源码存在可核对实现时计入有效仓库。
3. 主采集聚焦 confirmation、state、checkpoint、edit、batch、session、long-context 六类主题；缺口采集针对首轮盲区补采 ProseMirror 三包、OpenHands、goose、Cline diff coordinator、SWE-agent editor 等。
4. 台账保留 repo、focus、stars、language、candidate files、cache path 与源码摘录，便于回溯。
5. 对应用源码做反向核对，避免“社区有、我们没有”或“我们已有、重复造轮子”两类误判。

## 有效仓库清单

60 个有效仓库如下：

AgentOps-AI/agentops, Aider-AI/aider, FlowiseAI/Flowise, OpenHands/OpenHands, PrefectHQ/prefect, ProseMirror/prosemirror-history, ProseMirror/prosemirror-state, ProseMirror/prosemirror-transform, RooCodeInc/Roo-Code, SWE-agent/SWE-agent, aaif-goose/goose, apache/airflow, argoproj/argo-workflows, ast-grep/ast-grep, automerge/automerge, cline/cline, continuedev/continue, crewAIInc/crewAI, dapr/dapr, facebook/lexical, getsentry/sentry-javascript, google-gemini/gemini-cli, huggingface/smolagents, jina-ai/reader, langchain-ai/langgraph, langgenius/dify, llmware-ai/llmware, logseq/logseq, mendableai/firecrawl, microsoft/TypeScript, microsoft/autogen, microsoft/monaco-editor, microsoft/semantic-kernel, microsoft/vscode, mlflow/mlflow, modelcontextprotocol/modelcontextprotocol, modelcontextprotocol/servers, n8n-io/n8n, neovim/neovim, openai/codex, openai/openai-agents-js, openai/openai-agents-python, openai/swarm, openlit/openlit, outline/outline, pydantic/pydantic-ai, restatedev/restate, run-llama/llama_index, semgrep/semgrep, smallcloudai/refact, tabbyml/tabby, temporalio/sdk-typescript, temporalio/temporal, toeverything/AFFiNE, traceloop/openllmetry, tree-sitter/tree-sitter, vercel/ai, wandb/wandb, yjs/yjs, zed-industries/zed。

其中主采集 43 个，缺口补采 19 个；`All-Hands-AI/OpenHands` 已修正为 `OpenHands/OpenHands`，ProseMirror 主仓文档壳问题已替换为三个真实源码包。

## 社区成熟模式

### 1. 会话级审批与任务状态

goose 的 `ApprovalState::from_messages()` 从会话消息重建审批状态，并用 `has_confirmation_request()`、`confirmation_response()`、`has_tool_response()` 三重防护避免同一个请求被重复响应或凭空响应。

证据：

- `_audit/research-cache/edit-task-maturity-2026-09-22/aaif-goose/goose__crates__goose__src__agents__state_machine__ops_tool_approval.rs:164`
- `_audit/research-cache/edit-task-maturity-2026-09-22/aaif-goose/goose__crates__goose__src__agents__state_machine__ops_tool_approval.rs:252`
- `_audit/research-cache/edit-task-maturity-2026-09-22/aaif-goose/goose__crates__goose__src__agents__state_machine__tool_confirmation.rs:27`
- `_audit/research-cache/edit-task-maturity-2026-09-22/aaif-goose/goose__crates__goose__src__agents__state_machine__tool_confirmation.rs:88`

对本应用的启示：跨轮追问不能靠单句意图重新判定权限，必须先判断是否存在活动 EditTask；活动任务的解释、追问、补充约束应路由到任务恢复，而不是直接剥掉写工具。

### 2. 任务级 checkpoint 与降级

Roo Code 使用 task-scoped shadow git checkpoint service。checkpoint 初始化失败时关闭 checkpoint，但不阻塞主任务；checkpoint 事件仍写入任务历史，UI 可选择不渲染。

证据：

- `_audit/research-cache/edit-task-maturity-2026-09-22/RooCodeInc/Roo-Code__src__core__checkpoints__index.ts:16`
- `_audit/research-cache/edit-task-maturity-2026-09-22/RooCodeInc/Roo-Code__src__core__checkpoints__index.ts:57`
- `_audit/research-cache/edit-task-maturity-2026-09-22/RooCodeInc/Roo-Code__src__core__checkpoints__index.ts:112`
- `_audit/research-cache/edit-task-maturity-2026-09-22/RooCodeInc/Roo-Code__src__core__checkpoints__index.ts:164`
- `_audit/research-cache/edit-task-maturity-2026-09-22/RooCodeInc/Roo-Code__src__core__checkpoints__index.ts:218`

对本应用的启示：每批写入前后都应有任务级 checkpoint；checkpoint 失败必须进入 trace，而不是让任务静默失去回滚能力。

### 3. 可恢复会话与失败降级

Vercel AI harness 的 Cline resume state 把会话历史持久化到 sandbox 私有目录，文件名和路径用 schema 防注入；历史缺失或解析失败时返回 `undefined`，恢复链路降级为 fresh conversation，而不是整体失败。

证据：

- `_audit/research-cache/edit-task-maturity-2026-09-22/vercel/ai__packages__harness-cline__src__cline-resume-state.ts:10`
- `_audit/research-cache/edit-task-maturity-2026-09-22/vercel/ai__packages__harness-cline__src__cline-resume-state.ts:41`
- `_audit/research-cache/edit-task-maturity-2026-09-22/vercel/ai__packages__harness-cline__src__cline-resume-state.ts:91`
- `_audit/research-cache/edit-task-maturity-2026-09-22/vercel/ai__packages__harness-cline__src__cline-resume-state.ts:116`

对本应用的启示：EditTask 恢复点必须可校验、可拒绝伪造路径，并且恢复失败时给用户明确降级路径，不允许“卡死在等待 API”。

### 4. 锚点定位的多级恢复

Aider 的 `replace_most_similar_chunk()` 不是一次精确匹配失败就终止，而是按 perfect match、空白兼容、省略号展开、fuzzy edit distance 的层级逐步恢复；仍失败时返回 `None`，避免错误替换。

证据：

- `_audit/research-cache/edit-task-maturity-2026-09-22/Aider-AI/aider__aider__coders__editblock_coder.py:134`
- `_audit/research-cache/edit-task-maturity-2026-09-22/Aider-AI/aider__aider__coders__editblock_coder.py:157`
- `_audit/research-cache/edit-task-maturity-2026-09-22/Aider-AI/aider__aider__coders__editblock_coder.py:168`
- `_audit/research-cache/edit-task-maturity-2026-09-22/Aider-AI/aider__aider__coders__editblock_coder.py:184`
- `_audit/research-cache/edit-task-maturity-2026-09-22/Aider-AI/aider__aider__coders__editblock_coder.py:296`

对本应用的启示：`target_not_found` 后应提供结构定位、范围读取、局部重锚点的协议化恢复，而不是让模型在同一大上下文里反复重试整批命令。

### 5. 编辑协议、批处理与部分失败

Continue 的 multiEdit 与 singleFindAndReplace 均声明 `defaultToolPolicy: "allowedWithPermission"`，并在执行前做参数校验；社区编辑协议普遍把“请求校验、权限、执行、失败响应”分层。

证据：

- `_audit/research-cache/edit-task-maturity-2026-09-22/continuedev/continue__core__tools__definitions__multiEdit.ts:112`
- `_audit/research-cache/edit-task-maturity-2026-09-22/continuedev/continue__core__tools__definitions__singleFindAndReplace.ts:75`

Cline、SWE-agent、OpenHands、Codex 等项目的缓存文件中同样存在编辑器工具、diff coordinator、action validation、tool rejection 截断等实现，详见主题摘要 `confirmation-and-permission`、`edit-protocol-and-anchoring`、`batch-and-partial-failure` 三节。

对本应用的启示：编辑命令不是“一批大 JSON”，而是带目标、版本、锚点、校验结果、失败索引的结构化事务。

### 6. 观测与长上下文

AgentOps、OpenTelemetry、MLflow、LangSmith 类项目把事件、状态迁移、失败原因、耗时作为任务执行记录的一等字段；长上下文系统则普遍采用结构地图、检索、分段读取，而不是一次性把全文塞进模型。

对本应用的启示：runTrace 必须记录 EditTask 生命周期，而不是把 API 轮次、工具轮次、任务终态混在同一条合成快照里。

## 应用反查结果

### 已具备的能力

1. `editor.write` 已存在，支持 1-10 条命令与 60000 字符批次上限：`src/services/editorTools.ts:425`、`src/services/editorTools.ts:473`、`src/services/editorTools.ts:490`。
2. `editor.get_state`、`editor.search`、`editor.locate`、`editor.reveal`、`editor.multi_get_state`、`editor.global_search`、`editor.workspace_summary`、`outline.get_structure`、`outline.read_range` 等只读工具链已存在。
3. `task.update_plan` 已存在，但 policy 为 `read`，只做 UI 状态展示，不参与执行：`src/services/editorTools.ts:771`。
4. `contentVersion` 校验已有单批内雏形：`src/services/editorEditBatch.ts:86`。
5. `crossTurnToolAudit.ts` 会注入“写入事实以上述终态为准”的提示，`conversationContextService.ts` 已有 full/partial/structure_map/reference/selection 覆盖体系。

### 确认存在的缺陷

1. **无会话级活动任务状态**：`authorizeDialogueTools()` 仅按当轮 intent 过滤工具：`src/services/dialogueToolSurface.ts:89`。第 3 轮 discuss 后写工具被剥掉，模型声明无权限是工具面的真实结果。
2. **无长文分批任务执行器**：单批 10 条命令与 60000 字符是硬上限，缺少“结构地图 -> 计划 -> 分批读取 -> 编辑 -> 校验 -> checkpoint”的任务执行链。
3. **无任务级部分完成语义**：`RunTraceStatus` 只有 running/success/degraded/failed/canceled/blocked：`src/stores/runTrace.ts:9`，没有 `partially_applied`、`failed_after_write`、`success_with_warnings`。
4. **runTrace 导出合成终态**：`src/stores/runTrace.ts:1754` 的 `export_snapshot_synthesized_from_last_turn` 会用最后一轮状态合成整次运行快照，掩盖任务真实终态。
5. **版本校验只覆盖单批内部**：跨批、跨轮、恢复点之间没有任务级 document version 与 hash 对账。

## 事故 trace 对照

输入：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20260922-180424-deep/run-trace.json`

1. 第 1 轮：删除“补充钩子七”，edit 意图，locate/search 后 `editor.write` 成功。
2. 第 2 轮：整篇文章重新整理排序，4 条 API 记录中第 1 条停滞 224046ms 后自动隔离重试；工具层发生 9 条命令第 4 条 `target_not_found`，修复批次结构完整性失败，最后 4 条命令写入成功，但整轮终态折叠为 `edit_retry_empty_response`。
3. 第 3 轮：用户追问“你无法对整篇文章整理么”，路由为 discuss，实际工具面没有 `editor.write`，模型回答无写入权限。

结论：模型输出的“没有权限”来自应用真实工具面，不是模型凭空幻觉；长文任务失败则是应用缺少任务规划与分批恢复机制。

## 二轮回补发现的新盲区

1. **恢复点不仅是“记住失败批次”**：社区方案把恢复点、审批状态、工具响应状态、历史文件校验全部纳入会话状态；我们只保留了 failed batch 和最后一轮 snapshot。
2. **部分失败必须显示为部分失败**：社区系统不会把部分写入成功折叠成普通 success 或普通 failed；我们需要任务级 `partially_applied` 终态和“继续 / 回滚 / 放弃”的显式用户动作。
3. **长文执行必须有计划可审计**：用户应能看到任务计划、当前批次、已完成批次、失败批次、恢复策略；否则用户只能看“等待 API 返回”空等。

## 最终判断

半成熟方案七项骨架方向正确，但必须升级为以下六层才达到成熟：

1. EditTask 状态机与会话级活动任务。
2. 意图路由输入从“单句意图”升级为“单句意图 + 活动任务状态”。
3. 长文任务执行器与批次 checkpoint。
4. 锚点定位与版本/hash 校验的任务级协议。
5. 真实终态体系与 runTrace 全生命周期记录。
6. Electron 级真实 UI 验证矩阵。

对应执行方案见 `_audit/PROPOSAL_2026-09-22_EDIT_TASK_SYSTEM_V1.md`。
