# API 直写协议成熟化社区深挖日志（V1）

日期：2026-09-19  
调研目标：顺着本次“时能写入 / 时不能写入 / 自称无权限”的爆发点，把 API 直写系统从“功能拼接”推进到“协议级成熟”。  
执行要求：每轮记录证据来源、成熟做法、对我们系统的适配点、反深挖出的新问题；未完成 20 轮或方案未成熟不得终止。

## 事故基线

本次 trace 证明的四个应用层缺陷：

1. `editor.write` 的 `operation`/`position` 未做严格枚举校验，非法 `insertAfter`/`after` 被静默解释。
2. `insert` 携带 `target` 时语义未定义，实际忽略 target，依赖光标位置。
3. 跨轮上下文只保留 assistant 文本，不保留上一轮工具调用与写入结果，模型无法解释自己曾写入。
4. 意图按轮动态开关写权限，但没有把权限变化和上一轮写入事实注入模型。

## 轮次记录

### Round 1：MCP 工具入参必须走 JSON Schema 严格校验

- 证据来源：本机已克隆 `C:/Users/凯瑞/AppData/Local/Temp/protocol-maturity-research/mcp-spec`。
- 行级证据：`docs/specification/draft/server/tools.mdx:290-296` 要求 inputSchema 必须是合法 JSON Schema；无参数工具也推荐 `{"type":"object","additionalProperties":false}`。`schema.ts:364-379` 将 unknown tool / invalid arguments 明确归入 InvalidParams 语义。
- 成熟做法：工具协议层不靠执行器“猜语义”。枚举、必填、组合约束都在 schema 层声明，非法参数要在进入执行器前被拒绝。
- 适配点：我们 `editor.write` 的 `operation` / `position` 必须从自由字符串升级为封闭 enum + 组合校验；非法 `insertAfter`、`after` 不能再被 cast 后静默执行。
- 反深挖新问题：仅有 enum 还不够，`operation + position + target` 是组合语义，需要矩阵式校验，否则枚举合法但组合无定义仍会漂移。

### Round 2：MCP 工具错误属于模型可自纠错结果，不是协议层异常

- 证据来源：MCP spec 本地仓库。
- 行级证据：`schema.ts:1826-1835`、`docs/specification/draft/server/tools.mdx:759-780` 要求工具执行错误（包括输入校验错误）以 `isError:true` 的工具结果返回，让模型看到错误并自纠；协议级 MCP error 用于协议破坏，不用于普通工具失败。
- 成熟做法：错误要作为 tool result 回给模型，且要结构化、可读、带修正提示。
- 适配点：非法 operation、目标多命中、锁定态、权限拒绝都应返回结构化错误体，而不是被吞掉或只写日志。
- 反深挖新问题：我们的权限拒绝目前偏“执行拒绝”，但缺少“模型下一轮能理解为什么被拒绝、当前真实权限是什么”的上下文注入。

### Round 3：OpenAI Agents JS 默认 strict schema 与本地执行前校验

- 证据来源：本机已克隆 `openai-agents-js`。
- 行级证据：`docs/src/content/docs/guides/tools.mdx:150-151` 说明参数 schema 默认 strict，非法参数会返回模型错误；`:171` 要求本地执行前做 schema 校验。`running-agents.mdx:75-76,109-110` 提供 `toolNotFoundBehavior` 与 `toolNameCollisionPolicy`，不允许工具缺失或同名静默漂移。
- 成熟做法：strict 是默认态，不是可选优化；工具不存在与工具名冲突都是显式策略。
- 适配点：`editor.write` 应默认 strict；同轮工具面必须单源；工具缺失/重名不能退化为“无工具继续跑”。
- 反深挖新问题：strict schema 需要 schema 版本管理，否则老会话或旧 trace 里的工具输入在新版本下会被误判非法。

### Round 4：OpenAI Agents JS 将工具调用与结果作为 replay-ready history 保存

- 证据来源：同上仓库。
- 行级证据：`docs/src/content/docs/guides/results.mdx:25-27,68-79` 将 history 视为一等公民，包含完整工具调用与结果，可 replay；`running-agents.mdx:37-42` 要求工具结果追加进对话循环。
- 成熟做法：跨轮记忆不只有 assistant 文本，工具调用、工具结果、状态转移都是会话历史的一部分。
- 适配点：我们 `getChatContextMessages()` 只保留 user/assistant 文本，是事故中模型自称“没写入权限”的直接土壤。下一轮必须携带写入事实与工具结果。
- 反深挖新问题：直接全量携带工具结果会造成长文档滚雪球，需要“完整 trace + 上下文摘要”双层结构。

### Round 5：Anthropic tool_use_id / tool_result 强配对

- 证据来源：本机已克隆 `anthropic-sdk-python`。
- 行级证据：`src/anthropic/types/tool_result_block_param.py:26-29` 的 `tool_use_id` 是必填；`:36` 定义 `is_error` 结构化字段；`tool_use_block.py:16-19` 的 ToolUseBlock 自带 id。
- 成熟做法：工具调用和结果靠稳定 id 配对，错误也是结果块的一部分。
- 适配点：我们 trace 已有 toolCallId，但会话上下文没有消费这层配对；后续上下文注入应保留 toolCallId、工具名、摘要、错误码。
- 反深挖新问题：多 provider 适配时，OpenAI tool_calls、Anthropic blocks、Gemini functionResponse 的 id 语义需要统一到我们的内部 ToolCallRecord。

### Round 6：LangGraph 强制校验工具历史完整性

- 证据来源：本机已克隆 `langgraph`。
- 行级证据：`libs/prebuilt/langgraph/prebuilt/chat_agent_executor.py:243-269` 的 `_validate_chat_history()` 要求每个 tool_call 都有对应 ToolMessage，否则抛 INVALID_CHAT_HISTORY；`tool_node.py:1268-1278` 未注册工具返回 error ToolMessage；`:1455-1485` 要求 Command.update 必须有匹配 tool_call_id 的终止 ToolMessage。
- 成熟做法：工具历史断层是显式错误，不是可忽略的数据清洗结果。
- 适配点：我们当前“过滤掉工具消息”的做法方向相反；应至少提供 compact tool history，并检测孤儿 tool_call / 孤儿 tool_result。
- 反深挖新问题：重生成、重试、失败批次会产生同 toolCallId 的多份现场，必须定义 canonical 结果选择规则。

### Round 7：Cline 的 tool_result 组装、孤儿清理与真实循环防护

- 证据来源：本机已克隆 `cline`。
- 行级证据：`sdk/packages/core/src/session/services/message-builder.ts:546-553` 分离 tool_result 与其他 blocks；`:648-661` 构造只含 tool_result 的 user 消息；`:691-698` 为缺失 tool_call 生成孤儿 tool_result。CHANGELOG 记录真实事故修复：write_to_file 缺 content 参数无限重试、replace_in_file 反复失败循环防护、孤儿 tool_result 清理、diff 失败后防止立即回退 write_to_file、重复工具调用循环检测。
- 成熟做法：补齐配对只是底线，还要针对真实模型的常见失败模式做状态机防护。
- 适配点：我们的 tool-loop 已有次数上限，但缺少“失败后禁止立即重复同类写入”“错误反馈必须指向可修正动作”的分层防护。
- 反深挖新问题：连续 search/read 与连续 write 应使用不同预算与终止条件，不能一个 maxToolIterations 打包所有工具。

### Round 8：Continue 的 tool_call_id 映射与 apply 模式枚举

- 证据来源：本机已克隆 `continue`。
- 行级证据：`packages/openai-adapters/src/openaiToVercelMessages.ts:29-37,114-124` 先建立 tool_call_id → toolName 映射再转换；`packages/apis/Anthropic.ts:242-259` 将每个 tool message 转成 tool_result block 并配对 tool_use_id；`packages/apis/Bedrock.ts:224-277` 做 tool_call_id 去重与 toolUseId 映射；`packages/config-yaml/src/schemas/index.ts:222` 将 apply mode 显式定义为 `z.enum(["insert","replace","diff"])`。
- 成熟做法：跨 provider 的 id 映射是独立层；编辑动作模式是封闭枚举。
- 适配点：我们 providerTools 已承担一部分转换，但编辑操作枚举分布在 editor、workspace skill、OutlineWorkspace 三处，尚未单源。
- 反深挖新问题：编辑器写入需要统一“定位语义”，包括 target、anchor、selection、cursor、position 的组合定义。

### Round 9：Aider 把写入失败变成“可修正的错误教学块”

- 证据来源：本机已克隆 `aider`。
- 行级证据：`aider/coders/editblock_coder.py:42-45` 把 edits 分成 `failed/passed` 两列；`:84-122` 对失败块组装结构化错误：原始 SEARCH/REPLACE、`find_similar_lines` 给出的相近行（`:98-103`）、“REPLACE 已存在”提示、精确匹配规则，并明确告诉模型“成功的块不要重发，只修失败块”；`:258,576` 精确匹配优先；`:602` 定义 `find_similar_lines(search_lines, content_lines, threshold=0.6)`。`editblock_prompts.py:137` 把“只替换第一个匹配”写进模型契约。
- 成熟做法：写入失败不是终态，而是下一轮的自纠输入；错误里要包含失败参数、相近候选、明确的修正规则，并区分“已成功部分”避免重复写入。
- 适配点：我们的 `editor.write` 在目标缺失、锁定、hash 不匹配时，应返回 `Aider 风格` 的结构化 tool result：非法参数枚举、合法枚举列表、相似 target 候选、上一轮已成功写入的 batchId，禁止让模型在无信息状态下重试。
- 反深挖新问题：我们的 outlineIntegrity / hash 校验失败目前是“回滚 + 记日志”，没有回给模型的修正建议；需要定义 `write_failed` 错误码表和候选定位来源。

### Round 10：semantic-router 的路由成熟度来自“样本 + 独立阈值 + 显式 fallback”

- 证据来源：本机缓存 `_audit/research-cache/intent-routing-v4/semantic-router/`。
- 行级证据：`base.py:354` 每条 Route 可有独立 `score_threshold`；`:414-435` 未设置时按 encoder/全局阈值补齐；`:645-653,732-740` 逐 route 判定 `total_score >= current_threshold`，不达标不路由；`:700,787` 无 route 过阈值时返回空 RouteChoice（显式 fallback）；`:1601-1679` 支持按 route 设置/读取阈值；`:1733-1751,1827-1859` 提供 `threshold_random_search` 自动调阈值。
- 成熟做法：路由不是一个全局关键词分数，而是“每类意图自己的样本集 + 自己的阈值 + 未命中时的显式 fallback”，且阈值可被评估集自动校准。
- 适配点：我们 `chainIntentRouter.ts:880` 目前把失败原因折叠成 `low-confidence/no-keyword-overlap` 两类，`chainIntentPhraseCorpus.ts` 是手写短语集；应改为每个意图类别有独立权重/阈值和评估集，`discuss` 的解释、补充、质疑类样本不能再依赖 edit 关键词闸门。
- 反深挖新问题：我们的语料集没有负样本评估输出和阈值校准报告；每次补词都是“哪里漏补哪里”，这正是前几轮路由反复漏词的根源。

### Round 11：Cline compaction 的铁律是工具对永不拆散

- 证据来源：本机已克隆 `cline`（实际路径为 `sdk/packages/core/src/extensions/context/`）。
- 行级证据：`compaction.ts:53,295-302,383-447` 有 auto/manual/overflow_recovery 三种模式与状态命名；`:139` 保留判定只认 `tool_result` block；`:474-522` 自定义压缩失败回落 basic compaction；`:766-768` 二次压缩从 compacted projection + canonical tail 开始，避免每轮全量重摘。测试 `compaction.test.ts:429,460` 验证工具对原子删除/保留；`:502` 多工具 assistant turn 作为原子组；`:1894-1987` 直接写明事故复现：“tool_use 折叠进 summary 而 tool_result 留在尾部”会触发 provider 报错，修复原则是 “Never one without the other”；`:1997-2114` 复现 auto-compaction 永久跳过的事故。
- 成熟做法：跨轮压缩可以把工具现场折叠成摘要，但 `tool_use/tool_result` 必须成对保留或成对折叠；压缩失败要有回落路径；重压缩不能每轮重建全量摘要。
- 适配点：我们下一轮上下文注入写入审计时，不能只注入“我写过”的文本摘要而不带 tool pair；应保留 `toolCallId + tool name + 参数摘要 + result 摘要` 的配对结构，再由摘要层控制长度。
- 反深挖新问题：重试/失败批次会产生同 id 多份现场，配对结构必须声明 canonical 选择规则（最新成功、或最新终态），否则 provider 或模型都会误读。

### Round 12：OpenAI Agents JS 把“工具可见性、参数授权、拒绝消息”分成三层

- 证据来源：本机已克隆 `openai-agents-js`。
- 行级证据：`guides/tools.mdx:160-169` 定义 `needsApproval/isEnabled/inputGuardrails/outputGuardrails`，并明确 `isEnabled` 在模型生成参数前运行，不能替代参数级授权，参数授权必须放在 `execute` 或 input guardrail。`guides/human-in-the-loop.mdx:31-39` 定义审批流程：评估规则、记录 `RunToolApprovalItem`、暂停、批准/拒绝并可携带拒绝 message；格式错误 JSON fail closed，批准后仍走 parse-error 路径，不执行工具。`guides/guardrails.mdx:15-27,68-85` 定义 input/output/tool guardrails：tool guardrails 包住每次函数工具调用，输入前校验、输出后校验，可拒绝或替换输出；`:77` 还支持 pre-approval guardrail，避免无效参数先打扰用户。
- 成熟做法：能力可见性（模型看到什么工具）、参数授权（这个参数能不能执行）、失败反馈（模型收到什么拒绝消息）是三层不同责任，不能互相冒充。
- 适配点：我们的 `evaluateWritePermission` 是“意图决定工具面”，但缺少第二层参数授权（operation/position/target 组合校验）和第三层模型可见反馈（权限现状 + 变化原因 + 上轮写入事实）。
- 反深挖新问题：如果把权限状态注入 system prompt，需要防止 system prompt 与实际工具面不一致；注入层必须消费 M19 的同一份 `actualToolSurface`，否则会造成新的“嘴上说能写，实际没工具”。

### Round 13：协议演进必须显式版本协商，兼容必须双写

- 证据来源：MCP spec 本地仓库 `schema/draft/schema.ts`、`docs/specification/draft/server/tools.mdx`。
- 行级证据：`schema.ts:445-496` 定义 `UNSUPPORTED_PROTOCOL_VERSION = -32022`，错误体必须带 `supported: string[]` 与 `requested`，客户端据此选择共同支持版本重试；`:656-681` 说明初始化时必须协商协议版本，也可通过每次请求的 `_meta` 内联协商；`:422` 说明早期版本错误码永久保留，不得复用。`tools.mdx:498-504` 要求结构化内容返回 `structuredContent`，同时为了向后兼容 SHOULD 再返回一份序列化 JSON 的 `TextContent`。
- 成熟做法：协议不是靠“碰巧兼容”活着。旧输入要么显式迁移，要么显式拒绝并给出支持版本；破坏性演进必须给旧消费者一条可读路径。
- 本仓库对照：`src/stores/runTrace.ts:491` 已有 `RUN_TRACE_SCHEMA_VERSION = 9`，说明 trace 侧已有版本意识；但 editor 直写协议（`EditorEditCommand.version: 1`）没有协商/兼容策略，也没有机器门禁防旧入口绕过。
- 适配点：editor 协议增加 `protocolVersion`，旧字段走显式别名迁移（不是静默解释）；每次升级输出“协议变更清单 + 旧 trace 兼容表”；`.dependency-cruiser.cjs` 增加规则禁止 UI/旁路组件绕过共享协议入口。
- 反深挖新问题：版本必须同时约束“模型侧输入协议”和“trace 侧记录协议”，否则 SKILL 调试方读到的 run trace 与真实请求格式不一致。

### Round 14：验证矩阵必须覆盖非法输入，不能只测“错误权限”

- 证据来源：本仓库验证脚本与测试。
- 行级证据：`scripts/verify-api-direct-write-v2-e2e.mjs` 已覆盖权限拒绝（`:686-689,860-878`）、重复写入（`:881-936`）、锁定态（`:987-1012`）、actualToolSurface 三层一致（`:896-913,954-971`）。但整个脚本没有任何“非法 operation / 非法 position / 非法组合”场景；现有 mock 请求全部使用合法枚举（`:178,184,221-248,259-267`）。
- 成熟做法：工具协议的 E2E 必须同时验证“合法路径成功”和“非法路径被结构化拒绝且编辑器不变”；否则 schema 层再严格，也没有证据证明它被接上。
- 适配点：验证矩阵补充四类负向用例：非法枚举、合法枚举但非法组合（如 insert+target）、必填缺失、类型错误；每类断言 error code、模型可读 message、编辑器内容不变、trace 记录 `invalid_input`。
- 反深挖新问题：还要验证“权限注入一致性”：system prompt 声称的工具面、actualToolSurface、真实 provider request 三者逐项一致，否则会复现“模型以为能写但请求没工具”。

### Round 15：单请求 tool loop 已成熟，跨轮和分类预算是断点

- 证据来源：`src/services/aiService.ts`。
- 行级证据：`callAiWithTools` 在 `:1455-1463` 初始化迭代上限、请求消息副本、工具结果累计、重复写入 guard；`:1557-1562` 连续工具轮无正文时提前向用户预警；`:1625` 每个工具调用先过 `evaluateWritePermission`；`:1651-1658` 连续 3 次完全相同写入被 `duplicate_write_blocked` 拦截并给模型明确修正指引；`:1698` 按执行结果记录重复写入状态；`:1712-1781` 到达上限后构造收敛请求，收敛失败再退回本地工具摘要（`tool_converged_local`），避免空正文。
- 本仓库对照：这套机制解决了“单请求内模型一直读工具不输出”的事故，是已经成熟的部分。
- 断点一：预算不分类。`maxToolIterations` 统一限制 read/write，长文档多轮定位（用户这次“统一大纲时间线”）天然消耗大量 read，容易被同一个上限误伤；社区做法是 read 与 write 分预算、write 失败后禁止立即重复同类写入。
- 断点二：跨轮丢工具现场。`toolRequestDeltas` 只在本次请求内累计；下一次用户请求从 `ChatPanel.getChatContextMessages()` 重建上下文，上一轮工具对不进入请求。
- 适配点：保留现有收敛机制，新增 read/write 分类预算和跨轮工具对注入；不要重写这条已验证的循环。

### Round 16：共享校验器已存在，但 editorTools 没接线

- 证据来源：`src/services/skillValidation.ts`、`src/services/editorTools.ts`、`src/services/workspaceSkillEngine.ts`。
- 行级证据：`skillValidation.ts:36-61` 的 `validateValue` 已支持 type/enum/minItems/maxItems/minLength/maxLength/required；`:101-103` 暴露 `validateSkillInput`。`workspaceSkillEngine.ts:530-539` 已正确消费它校验 folder skill 输入。但 `editorTools.ts:930-943` 的 `validateInput` 只检查 required 字段存在；`:477-481` 把非法 operation/position 直接 cast 成目标类型。
- 成熟做法：同一应用内不该有两套校验强度。工具协议是最靠近“模型自由输出”的边界，必须是校验最强的一层；folder skill 输入来自表单，反而已经比 editor 工具更严格，这是本末倒置。
- 适配点：`editorTools` 接入共享 `validateSkillInput`，`inputSchema` 补 enum、类型、additionalProperties，再加组合校验矩阵；错误反馈按 Aider 模式给“非法值 + 合法枚举 + 相近候选”。
- 反深挖新问题：`JsonSchema` 类型还没有 `additionalProperties` 字段，共享校验器需要同步扩展；扩展后要跑 folder skill 的既有 spec，防止收口破坏已有输入。

### Round 17：定位语义是组合矩阵，不是三个独立字段

- 证据来源：`src/services/editorEditProtocol.ts`、`src/services/editorEditService.ts`、`src/services/workspaceSkillEngine.spec.ts`、`src/components/common/OutlineWorkspace.vue`。
- 行级证据：`editorEditProtocol.ts:3-35` 定义 6 个 operation、4 个 position；`:69-81` 保留 `replace_section/rewrite_section` legacy 别名；`:98-100` 非法 position 静默 fallback 成 `cursor`。`editorEditService.ts:74-85` 的 `insert` 完全不读 `target`，只按 position 取锚点。`workspaceSkillEngine.spec.ts:569,591` 使用 `insert_after`，说明 workspace skill 层存在另一套定位词。`OutlineWorkspace.vue:1167` 又定义第三套 `OutlineEditOperation`，且含 `replace_section`。
- 成熟做法：定位语义必须有一张显式合法组合表。字段级 enum 只能证明单词合法，不能证明 `operation × position × target` 组合有定义；静默 fallback 是事故温床。
- 适配点：新增共享组合矩阵：insert 仅允许 cursor/selection_start/selection_end/end 且禁止 target；replace_selection 仅允许 selection 类 position 且禁止 target；replace_match/delete/rewrite 必须有 target；append 忽略 position 并拒绝 target。三处枚举收敛到共享定义，legacy 别名只允许在协议入口一次性迁移并记录。
- 反深挖新问题：OutlineWorkspace 的 `replace_section` 目前是合法本地操作，如果直接映射到 `replace_match`，必须确认它的 section 定位语义（volume/chapter/sectionTitle）在组合矩阵里有对应列，否则会引入新的静默漂移。

### Round 18：跨轮上下文断点是“一会能写、一会自称无权限”的直接土壤

- 证据来源：`src/components/chat/ChatPanel.vue`、`src/services/aiService.ts`。
- 行级证据：`ChatPanel.vue:684-687` 的 `getChatContextMessages()` 只保留 user/assistant 文本，过滤 fallback 消息，取最近 N 轮；上一轮工具调用、权限判定、写入结果完全不进入下一轮请求。`aiService.ts:349-373` 的 `evaluateWritePermission` 按轮重新计算权限，模型看到的 system prompt 与上一轮实际执行结果没有连续性。
- 成熟做法：结合 Round 4/5/6/11，工具历史是会话历史的一部分；压缩可以折叠工具现场，但 `tool_use/tool_result` 必须成对，且要声明 canonical 选择规则（重试/失败批次取哪一份）。
- 适配点：下一轮请求注入 compact write audit：`toolCallId + toolName + 参数摘要 + result 摘要` 成对保留；写入成功、权限拒绝、参数错误都进入审计；每轮注入当前意图、actualToolSurface、上一轮写入事实、权限变化原因。摘要层控制长度，trace 层保留全文。
- 反深挖新问题：不能把 run trace 全量塞进上下文，否则复现 09-16 的滚雪球事故；摘要格式必须是机器生成，禁止让模型自己改写工具历史。

### Round 19：回头看与全仓反推

- 对账一（非法 operation 静默解释）：`editorEditProtocol.ts:78-81` 仍有 `replace_section/rewrite_section` 别名，`outlineProposal.ts:84-85` 存在同款别名第二入口，`OutlineWorkspace.vue:1167` 存在第三套枚举。方案必须同时收口三处，只改 `editorEditProtocol.ts` 属于 M16 违规。
- 对账二（insert+target 语义未定义）：`editorEditService.ts:74-85` 证明 insert 完全不读 target；方案用组合矩阵显式拒绝，且必须覆盖 batch 与兼容模式两条写入路径。
- 对账三（跨轮丢工具现场）：`ChatPanel.vue:684-687` 证据已核；compact write audit 的工具对必须来自 aiService 实际执行结果，不能由 UI 从聊天文本反推。
- 对账四（权限变化不注入）：`dialogueToolSurface.ts:81-103` 已把实际工具面和 permission 收口在同一函数，注入层必须复用这份 `actualToolSurface`，这满足 M19 前提；禁止在 prompt 层另写一份权限描述。
- 反推新发现一：`aiService.ts:1570-1599` 对“工具不存在但名字像写入”的调用返回 `permission_denied`，即使实际工具面根本没有这个工具。这会让模型把“工具未暴露”误解为“被拒权”，错误码应区分 `tool_not_found` 与 `permission_denied`。
- 反推新发现二：现有负向测试只测 required 缺失（`editorTools.spec.ts:274`），没有任何非法枚举/非法组合测试；`verify-api-direct-write-v2-e2e.mjs` 也没有对应场景，验证矩阵必须补齐。
- 反推新发现三：read 工具已有部分局部参数校验（`editorTools.ts:341,374,407`），但强度分散；收口到共享校验器后这些错误消息要保留用户可读中文与 retryable 语义。
- M12 正推风险：若只加 enum 不做组合矩阵，模型会改发合法枚举的非法组合；若只注入权限不注入工具对，模型仍无法解释上一轮失败；若跨轮摘要过长，长文档场景复现滚雪球。三者在方案中必须绑定交付。
- M12 反推有效性：每个方案项都能反向映射到至少一个本轮真实证据；无一项只来自理论推演。

### Round 20：M18 分层成熟度结论

| 层 | 当前状态 | 结论 |
| --- | --- | --- |
| 执行器/工具层 | 单请求 tool loop、重复写入拦截、锁定态、权限拒绝、trace 记录已经过 E2E；但参数校验只有 required，组合语义未定义 | 半成熟 |
| 应用方案/交互闭环 | direct 写入主链路可用；跨轮写入事实、权限变化、工具对上下文缺失 | 半成熟 |
| 实现接线 | 存在共享校验器未接线、三套枚举分叉、两个 legacy 别名入口、错误码混淆 | 不成熟，禁止直接继续补丁式扩展 |
| 验证标准 | 已有权限/重复/锁定/surface 断言；缺非法枚举、非法组合、跨轮工具对、注入一致性 | 半成熟 |

20 轮结论：当前 API 直写是“执行器局部成熟、协议与上下文连续性不成熟”的系统。继续按单点补丁修，必然复现“修一处坏一处”。必须先执行协议收口（共享 schema + 组合矩阵 + 错误码），再接跨轮工具对，最后用扩展验证矩阵证明，才允许进入实现阶段。
