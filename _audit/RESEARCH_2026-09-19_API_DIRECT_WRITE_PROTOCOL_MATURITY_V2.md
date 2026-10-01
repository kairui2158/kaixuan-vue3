# API 直写协议成熟化社区深挖日志（V2）

日期：2026-09-19  
调研目标：在 V1 已闭环的“严格协议 + 跨轮工具审计 + 意图路由”基础上，把下一阶段推到成熟：真实供应商兼容矩阵、协议版本迁移、长文档工具循环、schema 校验器硬化、验证分层。  
执行要求：只用本机真实仓库/真实源码取证；每轮记录证据来源、成熟做法、适配点、反深挖新问题；禁止把无法实测伪装成已验证。

## 本地基线复核

- V1 方案与 Phase 5 日志确认：协议单源、负向矩阵、跨轮审计、意图评估、兼容 JSON 降级均已闭环。
- `src/services/providerTools.ts:31-38` 声明五类供应商支持原生工具：`openai-compatible`、`deepseek`、`anthropic`、`gemini`、`azure-openai`。
- `src/services/editorEditSemantics.ts:11` 定义 `EDITOR_EDIT_PROTOCOL_VERSION = 1`；无版本协商、迁移矩阵或旧版本拒绝策略。
- `src/stores/runTrace.ts:498` 定义 `RUN_TRACE_SCHEMA_VERSION = 9`；旧 trace 读取兼容存在，但 editor 协议版本未进入导出 schema 兼容层。
- `src/services/skillValidation.ts:85` 使用 `key in objectValue` 判断属性存在，显式 `undefined` 仍会被视为字段存在；V1 Phase 5 是靠解析层物理删除字段规避。
- `scripts/verify-api-direct-write-v2-e2e.mjs:437` 的供应商能力档案目前只有 `openai-compatible` mock；真实供应商矩阵未实测。

## 轮次记录

### Round 1：工具循环上限必须是显式协议，不是隐式容忍

- 证据：`_audit/research-cache/openai-agents-js-v2/docs/guides/running-agents.mdx:42,65`：`maxTurns` 默认 10，达到上限抛 `MaxTurnsExceededError`，可传 `null` 禁用；`packages/agents-core/src/runState.ts:2986-2987` 为 `_currentTurn >= _maxTurns` 上限检查；`packages/agents-core/src/runner/turnPreparation.ts:155-162` 构造超限错误与错误数据。
- 成熟做法：循环上限默认开启、可配置、超限时抛结构化错误，而不是“看起来没进展就继续等”。
- 适配点：应用的 `tool-loop` 已有 write_limit / no_progress / loop_limit 状态，但 V2 需要检查各供应商路径是否统一消费同一上限语义，兼容 JSON 降级路径不能绕过。
- 反深挖新问题：如果用户关闭上限（类似 `maxTurns: null`），应用是否仍有防死循环的请求级超时与取消信号兜底？

### Round 2：strict schema 的 optional / undefined 语义必须由校验器单源定义

- 证据：`_audit/research-cache/openai-agents-js-v2/docs/guides/tools.mdx:150-151` 说明 Zod / Standard Schema 参数自动启用 strict；`packages/agents-core/src/utils/strictToolSchema.ts` 在输入归一化时删除 `undefined` 值，optional 字段的 nullability 必须显式声明，strict schema 自动补 `additionalProperties: false`，开放 schema 无法转 strict 时显式报错。
- 成熟做法：schema 校验器统一负责“物理删除显式 undefined、unknown 字段拒绝、optional 与 nullable 分离”；解析层不必各自防御。
- 适配点：当前 `skillValidation.ts:85` 仍用 `key in objectValue` 把显式 `undefined` 当字段存在，V1 Phase 5 只是在 `parseEditorWriteProtocol()` 物理删除字段，属于入口补丁而不是校验器单源。
- 反深挖新问题：修改校验器语义前必须盘点 `validateSkillInput` 全部消费方，确认没有调用方依赖 `target: undefined` 被拒绝的行为。

### Round 3：工具选择与并行工具调用的供应商兼容不能只靠声明

- 证据：`_audit/research-cache/openai-agents-js-v2/packages/agents-openai/src/openaiChatCompletionsModel.ts:726-744` 处理 `tool_choice` 与 `parallel_tool_calls` 的兼容关系。
- 成熟做法：同一工具意图在不同供应商形态下要经过适配层归一，再交给统一执行器。
- 适配点：应用 `providerProtocols.ts` 已分协议构造请求体，但 V2 需要为五类供应商建立“工具请求字段 -> 响应工具调用 -> 统一执行器入参”的能力矩阵。
- 反深挖新问题：Anthropic / Gemini / DeepSeek / Azure 对 parallel tool calls、tool_choice、空 tools 的拒绝行为是否不同，需要在矩阵中逐项登记。

### Round 4：图执行器默认递归上限分层配置

- 证据：`_audit/research-cache/langgraphjs-v2/libs/langgraph-core/src/constants.ts:95` 定义 `RECURSION_LIMIT_DEFAULT = 25`；`libs/langgraph-cua/src/index.ts:160` 对 computer-use agent 默认 `recursionLimit = 100`，`libs/langgraph-cua/README.md:98` 解释该类 agent 预期更多迭代；`libs/langgraph-core/src/pregel/index.ts:2264-2267` 要求 `recursionLimit >= 1`，`2643-2650` 超限抛 `GraphRecursionError`；`docs/docs/agents/run_agents.md:87-143` 建议用 recursionLimit 控制无限循环并捕获错误。
- 成熟做法：普通对话与工具密集型任务使用不同默认上限，且上限与错误类型绑定，用户可处理。
- 适配点：大纲工作台 direct 对话工具轮用户已确认默认 `retry: false`，V2 应将“普通 direct 对话”和“长文档定位/多工具查询”分成两个预算档，而不是全局一个值。
- 反深挖新问题：应用如何判定当前轮属于“工具密集”？不能靠猜测 token，应以 trace 中的工具轮类型与历史工具密度为证据。

### Round 5：真实供应商测试必须显式 opt-in 且逐供应商配置

- 证据：`_audit/research-cache/cline-v2/sdk/packages/llms/src/tests/provider-live-tools.test.ts:45-48` 只有 `LLMS_LIVE_TOOL_TESTS === "1"` 才启用，`LLMS_LIVE_TOOL_PROVIDERS_PATH` 指向真实供应商配置；默认 provider timeout `90000ms`；`live-providers.tools.example.json` 为每个供应商一个 entry，包含 `settings.provider/model` 与 `requireToolCall: true`，覆盖 Anthropic、OpenAI、Gemini、DeepSeek、Mistral、Qwen、OpenRouter、Vercel 等。
- 成熟做法：live 测试与日常测试分离，按供应商声明能力并断言真实工具调用，不把 mock 通过冒充供应商通过。
- 适配点：应用 V2 应新增 `verify-api-direct-write-provider-matrix.mjs`，默认跑协议仿真；只有提供 `PROVIDER_LIVE_CONFIG` 时才执行真实供应商矩阵，并输出每供应商 pass/fail/untested。
- 反深挖新问题：真实供应商输出有随机性，断言应聚焦“能发出工具、能解析工具调用、能执行、错误可观测”，不应断言固定正文。

### Round 6：VCR 录制回放用于供应商协议回归

- 证据：`_audit/research-cache/cline-v2/sdk/packages/llms/src/tests/provider-vcr.test.ts:13-16` 使用 `LLMS_PROVIDER_VCR_RECORD=1` 录制、`LLMS_PROVIDER_VCR_TARGET` 筛选 cassette；`243-248` playback 设置 `CLINE_VCR=playback` 并保存 cassette 路径；`275-287` playback 前检查 cassette 必须含 `requestBody`；`383-397` 录制后对动态字段脱敏/归一化；`400-415` 录制失败时回滚原 cassette 或删除新 cassette。`package.json:36-37` 将 `test:live` 与 `test:vcr` 分离。
- 成熟做法：协议形态差异用录制回放锁住，动态字段归一化，失败不污染旧 cassette。
- 适配点：无 API key 时可用 VCR 证明五协议请求体与响应解析；有 key 时录制新 cassette 并回放回归。
- 反深挖新问题：应用测试夹具中已有 mock provider，需明确 VCR 是新增层而非重复层；V2 方案必须说明 cassette 存放路径与是否入库。

### Round 7：上下文压缩必须使用 provider 真实 token 计数

- 证据：`_audit/research-cache/cline-v2/CHANGELOG.md:16` 记录旧触发条件用字符估算 token，密集内容会低估真实上下文，修复为同时使用 provider 上报的真实 token 数并按估算偏差缩放保留历史量；`sdk/packages/shared/src/agent.ts:243-251` 中 `overflowRecovery` 表示上一请求超上下文，`inputTokens` 为 provider 实际计数并作为压缩估算下限；`sdk/packages/core/src/runtime/orchestration/session-runtime-orchestrator.test.ts:796-800` 明确测试上一请求真实 input token count 必须传入 prepareTurn。
- 成熟做法：压缩触发信号 = 字符估算 + provider 实际计数 + overflow recovery 事件，不能单靠估算。
- 适配点：应用长文档工具轮如果只按字符估算，容易在工具结果密集时低估；V2 压测要记录估算值与 provider usage 的偏差。
- 反深挖新问题：部分供应商可能不回传 usage；方案需定义“无 usage 时降级估算并留 trace”的分支。

### Round 8：压缩策略保留首尾关键上下文，最终仍有硬截断兜底

- 证据：`_audit/research-cache/cline-v2/sdk/examples/plugins/custom-compaction.ts` 展示自定义压缩保留首条 user message 与近期工作上下文，中间历史压缩为摘要；core 仍执行 API-safe message builder，最终硬截断兜底。
- 成熟做法：摘要压缩是优化层，不是安全边界；最终仍有 message builder 的硬保护。
- 适配点：应用已有 compact tool history 上限，V2 需要把它与模型输入窗口门禁、请求预算、usage 偏差一起对账。
- 反深挖新问题：中间历史折叠后，如果模型再次询问旧工具结果，是否允许从 runTrace 摘要重水合关键事实，而不是重新执行工具？

### Round 9：协议版本协商要有错误码、支持版本列表与降级重试

- 证据：`C:/Users/凯瑞/AppData/Local/Temp/protocol-maturity-research/mcp-spec/schema/draft/schema.ts:450` 定义 `UNSUPPORTED_PROTOCOL_VERSION = -32022`；`483-494` 错误体包含 `supported: string[]`，客户端应选择双方支持版本重试；`655-683` `server/discover` 可查询支持版本与能力；`seps/2575-stateless-mcp.md:165-210` 描述版本协商与 fallback。多个日期版本均有独立 schema 快照。
- 成熟做法：协议演进不是简单改常量，而是“版本声明 -> 不支持错误 -> 支持列表 -> 选择可兼容版本重试”的闭环。
- 适配点：应用当前只有 `EDITOR_EDIT_PROTOCOL_VERSION = 1`，没有 v1 -> v2 迁移矩阵；V2 应先建立版本协商机制与旧 trace 只读兼容，再考虑是否引入 v2 语义。
- 反深挖新问题：编辑器工具由应用自身暴露，不是外部 server；版本协商对象其实是“模型生成的入参版本 + 旧 trace + skill 文档”三方，需要定义谁声明版本、谁负责迁移。

### Round 10：本地消费面盘点：schema 校验器改动有 4 类消费方

- 证据：本轮 `rg -n "validateSkillInput|additionalProperties"` 显示生产消费方为 `src/components/pipeline/PipelinePanel.vue:798,1805,1836,3196`、`src/services/editorTools.ts:17,435,457,960`、`src/services/workspaceSkillEngine.ts:55,535`；测试契约在 `src/services/skillValidation.spec.ts` 与 `src/services/aiService.spec.ts:1173,1183`。
- 成熟做法：改共享校验器前先列出全部消费方，按“pipeline skill 输入、workspace skill 输入、editor 工具输入、测试契约”分层回归。
- 适配点：V2 的 schema 硬化必须新增四组用例：pipeline 输入不受影响、folder skill 输入不受影响、显式 `undefined` 视为不存在、`additionalProperties:false` 继续拒绝未知字段。
- 反深挖新问题：`PipelinePanel.vue` 的校验走 template 自带 schema，不都是工具 schema；不能只跑 editor 工具测试就宣布校验器安全。

### Round 11：本地供应商矩阵是“声明统一、实现分叉”的半成熟状态

- 证据：`src/services/providerTools.ts:31-38` 声明五类供应商全部支持原生工具；`providerProtocols.ts:121-146` OpenAI 兼容分支构造 `tools/tool_calls/tool_call_id`，`211-245` Anthropic 分支构造 `tools/tool_use/anthropicContent`，`278-305` Gemini 分支构造 `functionDeclarations/geminiParts/functionResponse`；DeepSeek 分支 `169-207` 只继承 OpenAI 实现并改 URL；Azure 分支 `307-334` 只继承 OpenAI 实现并改 URL/Header。
- 成熟做法：供应商支持矩阵不只写在类型里，还要有逐供应商请求体、响应解析、工具结果回传三面测试。
- 适配点：V2 需要为五类供应商各建 fixture：请求断言、工具调用响应断言、工具结果下一轮消息断言；DeepSeek/Azure 继承行为必须显式测试，不能靠“继承因此大概一样”。
- 反深挖新问题：Gemini 会把 `editor.write` 转成 `editor_write`，恢复时只替换最后一个下划线；若未来工具名含多段下划线，这个双向映射需要独立测试。

### Round 12：工具结果消息统一构造，但 result 形态跨供应商存在差异

- 证据：`src/services/providerTools.ts:154-213` 中 `buildToolResultMessage()` 对所有非 Anthropic/Gemini 供应商返回 OpenAI 形态；Anthropic 把工具结果作为 `user` message 的 `tool_result` content；Gemini 用 `functionResponse`，且 `response` 直接放对象而非 JSON 字符串。
- 成熟做法：执行器返回统一结构，协议层负责 wire format；但每条协议的工具结果必须可反序列化并进入 trace。
- 适配点：V2 的协议仿真测试应断言第二轮请求中工具结果完整可读，特别是 Gemini 对象与 Anthropic/JSON 字符串的差别。
- 反深挖新问题：如果工具 result 中含 `undefined`，`JSON.stringify` 会丢字段，Gemini 对象路径却可能保留键；这会放大 schema 硬化问题。

### Round 13：runTrace schema 版本已有落盘版本，但 editor 协议版本没有兼容层

- 证据：`src/stores/runTrace.ts:498` 定义 `RUN_TRACE_SCHEMA_VERSION = 9`，`1481` 与 `1699` 写入 schema version；`editorEditSemantics.ts:11` 定义 `EDITOR_EDIT_PROTOCOL_VERSION = 1`，但本轮 `rg` 未发现按 editor 协议版本分支读取旧 trace 的兼容层。
- 成熟做法：观测 schema 与业务协议版本分离；每个业务协议版本声明“可读、需迁移、拒绝”三态。
- 适配点：V2 若引入协议版本机制，run trace 只需记录版本，不应把 editor 协议迁移逻辑塞进 runTrace store。
- 反深挖新问题：旧 trace 导出文件中已有 `version_changed` 等事件；升级版本时必须保留旧事件语义，不能因迁移改变历史事实。

### Round 14：生产接线门禁已有 UI 禁绕规则，但缺 provider 工具面矩阵门禁

- 证据：`.dependency-cruiser.cjs` 已有 `ui-no-direct-tool-executor`、`ui-no-direct-surface`、`ui-no-direct-editor-semantics`、`ui-outline-tools-via-surface`、`orphan-error` 等规则；本轮没有发现“供应商协议测试必须覆盖五类”或“工具面变更必须触发 provider fixture”的机器门禁。
- 成熟做法：架构约束用 dependency-cruiser 固化，行为矩阵用测试脚本固化，两层不能互相替代。
- 适配点：V2 应新增 provider matrix 脚本，并考虑在脚本内断言五类 provider 全部出现在 fixture 中，防止只测触发问题的 openai-compatible。
- 反深挖新问题：dependency-cruiser 只能看依赖关系，不能证明请求体正确；不能把“无违规”说成“协议矩阵通过”。

### Round 15：OpenAI strict schema 还有深度与开放对象防护

- 证据：`_audit/research-cache/openai-agents-js-v2/packages/agents-core/src/utils/strictToolSchema.ts` 定义 `MAX_JSON_SCHEMA_DEPTH = 100`，超过抛 `JsonSchemaDepthError`；无 `type` 且 `additionalProperties !== false` 的开放对象无法转 strict 时显式抛 UserError。
- 成熟做法：schema 校验器要有防递归深度、防开放对象、防歧义归一化的硬失败，而不是静默容忍。
- 适配点：应用 schema 目前较浅，但 V2 硬化时仍应加 schema 深度上限与循环引用检测，至少保证 editor 工具和 folder skill schema 不会因恶意/错误 schema 卡死。
- 反深挖新问题：本应用 folder skill 的 schema 来自第三方文件夹，深度与 `$ref` 不可控；硬化校验器时必须把这些输入当不可信输入。

### Round 16：本地工具循环已有分层语义，但上限与消费面缺机器化矩阵

- 证据：`src/services/aiService.ts:104` 暴露 `maxToolIterations`，`1514` 默认 `Math.max(1, params.toolPolicy?.maxToolIterations ?? 6)`；`1590` 循环执行，`1803` 标记 `hitToolLoopLimit`；`1812-1866` 到上限后先发无工具收敛请求，失败则本地拼接工具摘要并给出 `tool_converged_local`；`1632-1634` 有连续无正文警告；`1883` 终态 `tool_loop_limit`。
- 成熟做法：上限、警告、收敛、兜底摘要和终态是分层语义，OpenAI Agents JS / LangGraph 均把上限视为协议而非偶然实现。
- 适配点：V2 需要建立“上限矩阵”：direct 普通对话、direct 工具密集对话、folder skill 链路、兼容 JSON 降级路径各自的 maxToolIterations、超时、取消、收敛策略逐项登记，并全部进入 trace。
- 反深挖新问题：收敛请求已隔离外层 timeout，但兼容 JSON 降级只有一次重试；若供应商在工具轮中途才失败，降级路径是否会丢失已收集工具结果需要专项验证。

### Round 17：跨轮工具审计已单源，但摘要上限的证据可观测性不足

- 证据：`src/services/crossTurnToolAudit.ts:29-30` 定义 `MAX_ENTRIES=20`、`MAX_SUMMARY_CHARS=240`；`66-103` 生成 latest entries、孤儿调用与截断标记；`114-137` 格式化为模型可读审计；`conversationContextService.ts:361-364,530-531` 将审计注入上下文；`ChatPanel.vue:1972-1977,2284` 与 `OutlineWorkspace.vue:2577-2579,2759` 已接线。
- 成熟做法：上下文摘要必须有上限、截断标记和完整现场 fallback（runTrace）。
- 适配点：V2 长文档压测要记录 `entries、truncated、orphanToolCallIds、注入上下文字符数` 四项指标，证明上限不是靠猜。
- 反深挖新问题：20 条上限对“十几万字大纲 + 多轮定位”可能偏小；如果常触发 truncated，应研究按“写入批次 + 最近读取”加权保留，而不是简单放大上限。

### Round 18：流式工具调用解析已存在，但流式路径缺五供应商覆盖

- 证据：`src/services/aiService.ts:727-773` 已处理 OpenAI `tool_calls` 增量与 Anthropic `input_json_delta` 聚合；`2076-2091` 说明 onChunk 是 delta-only，trace 另行累计；本轮未发现 Gemini 流式 functionCall 增量聚合的对应分支。
- 成熟做法：工具循环不能只在非流式 JSON 响应上验证；流式 delta、工具参数分片、finish reason 也必须矩阵化。
- 适配点：V2 的 provider matrix 应区分 `stream=true/false` 两列；对 Gemini 需先核实实现现状，未实现就明确登记“未验证/不支持”，不得假设可用。
- 反深挖新问题：Anthropic 流式聚合如果遇到不完整 JSON，是否会把半截参数传给 schema 校验，导致错误码误报 `invalid_input` 而非 `stream_parse_failed`。

### Round 19：VCR 也要对响应脱敏与失败回滚

- 证据：`_audit/research-cache/cline-v2/sdk/packages/llms/src/tests/provider-vcr.test.ts:383-397` 录制后对响应 JSON/SSE 做动态字段脱敏；`400-415` 成功才保留 cassette，失败回滚原内容或删除新 cassette。
- 成熟做法：录制供应商真实响应时，脱敏和原子回滚都是测试基建的一部分，不是可选项。
- 适配点：如果 V2 引入 VCR 层，cassette 应放在 `_fixtures`/测试目录，默认排除 Vitest 自动发现；保存前脱敏 API key、URL query、动态 id/时间戳。
- 反深挖新问题：应用已有 mock provider E2E，新增 VCR 可能重复；方案必须先证明“VCR 解决 mock 无法覆盖的协议分叉”，否则只加复杂度。

### Round 20：协议版本协商证据细化：错误体必须携带 supported 列表

- 证据：`C:/Users/凯瑞/AppData/Local/Temp/protocol-maturity-research/mcp-spec/schema/draft/schema.ts:445-494` 定义 `UNSUPPORTED_PROTOCOL_VERSION=-32022` 与 `supported: string[]`；`655-683` 定义 `server/discover` 返回 `supportedVersions` 与能力。
- 成熟做法：版本失败不是泛化 error，而是结构化错误 + 可选版本列表 + 明确 retry 语义。
- 适配点：应用内工具版本协商可以简化为：工具 schema 描述 `protocolVersion`，执行器拒绝不兼容版本并返回 `unsupported_protocol_version` + 支持列表；旧 trace 读取仍按 schemaVersion 兼容。
- 反深挖新问题：模型不一定可靠声明版本；若多数模型不传版本，默认 v1 + “未知版本拒绝”还是“未知版本按 v1 解析”必须由评估集决定，不能拍脑袋。

### Round 21：本地 providerTools 已有单元测试，但矩阵粒度不足

- 证据：`src/services/providerTools.spec.ts:23-73` 覆盖五类供应商的请求体与响应解析，DeepSeek/Azure 用同一 OpenAI 形状断言；`77-119` 覆盖三类协议家族的工具结果回传。
- 成熟做法：单元测试是地基，真实供应商矩阵是放行层；两者都要，且报告必须分层。
- 适配点：现有测试缺少：流式工具调用、多工具并发、非法 JSON arguments、空 tools 请求、Gemini 多下划线工具名、工具结果对象中 `undefined` 字段。
- 反深挖新问题：DeepSeek/Azure 继承 OpenAI 实现意味着 providerProtocols 任何改动都会同时影响三者；矩阵必须包含“继承回归”用例。

### Round 22：上下文审计注入入口双侧存在，但 folder/pipeline 路径需要分层核对

- 证据：`src/services/aiService.ts:201` 定义 toolAudit；`workspaceSkillEngine.ts:739-751,858,901-913,996,1024,1070` 将 adapter 与 folder result 的 toolAudit 写入 apiMeta；`realSkillExecutor.ts:855-959` 收集 folder 链 toolAudit；runTrace `1202-1254` 可写入 API call。
- 成熟做法：审计从执行器到 trace 的传递必须显式，不允许“有数据但没人取”。
- 适配点：V2 要对 direct、folder skill、pipeline 三条路径分别断言 toolAudit 出现在请求上下文或 trace，避免只验证大纲/主页两个 UI 入口。
- 反深挖新问题：`workspaceSkillEngine` 多处写 apiMeta，若某条 folder 分支漏写，trace 会显示无审计但实际有工具调用；需要用孤儿调用反向断言。

### Round 23：Roo Code 的 schema 归一化器提供“第三方 schema 当不可信输入”的成熟样本

- 证据：`_audit/research-cache/roo-code/src/utils/json-schema.ts:88` 默认 `additionalProperties: false`；`118-124` 说明归一化器完成三项转换：强制 object schema 关闭附加属性、把 `type: ["T", "null"]` 转为 `anyOf`、剥离 OpenAI strict 不支持的 `format`；`196-199` 只保留白名单 format；`218-227` 仅对 object 强制 `additionalProperties:false`，非 object 不写该字段；`234-289` 将顶层 `anyOf/oneOf/allOf` 扁平化为 object schema，注释明确原因是 OpenRouter/Claude 不支持顶层组合；`294` 导出 `normalizeToolSchema()`。测试在 `src/utils/__tests__/json-schema.spec.ts:5-329`，其中 `187-218` 断言 `additionalProperties` 为 schema 形态时也被强制替换为 false，`433-580` 覆盖顶层组合扁平化与嵌套组合保留。
- 成熟做法：第三方/外部 schema 归一化是独立工具函数，有递归转换、白名单和专项测试，不把“模型生成的参数校验”和“schema 本身合法性”混在一起。
- 适配点：应用 folder skill 的 `schema.json` 属第三方不可信输入，V2 硬化 `skillValidation` 时应补：schema 深度上限、顶层组合归一策略、`type` 数组归一策略、非法 schema 结构化报错；不建议照抄 format 白名单，应用自建工具 schema 可保持显式声明。
- 反深挖新问题：归一化会改变第三方 schema 语义。若 folder skill 作者声明了开放对象 `additionalProperties: true`，应用必须在 trace 记录归一化结果，禁止静默改写后让作者误判失败原因。

### Round 24：Cline 的会话修复器证明工具配对必须在消息进入 provider 前收口

- 证据：`_audit/research-cache/cline-v2/sdk/packages/core/src/services/session-import/sanitize.ts:62-69` 定义 `sanitizeImportedMessages()`；`82-100` 先收集全部 `tool_use` id 并剔除孤儿 `tool_result`；`110-169` 重建 assistant tool_use 后紧邻的 user message，把该轮全部 tool result 按调用顺序合并，缺失结果补占位文本，重复结果丢弃，Anthropic 三段式结构由该函数统一保证。测试 `session-import.test.ts:803-858` 分别覆盖“孤儿 tool_use 补占位、孤儿 tool_result 剔除”和“跨消息结果合并”。
- 成熟做法：provider 前置消息构造器必须保证 tool_use/tool_result 双向配对；这不是导入会话专属问题，长对话重放、trace 恢复、压缩后重水合同样需要。
- 适配点：应用 V1 已有跨轮工具审计，但 V2 长文档压测必须加“消息构造器配对审计”：每轮请求前断言无孤儿 tool call / tool result；若触发压缩或摘要重水合，修复结果必须写入 trace。
- 反深挖新问题：占位 tool_result 会让模型以为工具已失败。占位内容必须写明原因（上下文恢复缺失），不能伪造成功结果。

### Round 25：错误分类、run history 与供应商选项分桶是成熟工具循环的三个硬件

- 证据：OpenAI Agents JS `packages/agents-core/src/errors.ts:38` 定义 `MaxTurnsExceededError`；`runner/errorHandlers.ts:224-235` 把错误归类为 `maxTurns/modelRefusal/modelBehavior` 并分派处理器，`300-309` 决定错误是否进入 run history；`runState.ts:2986-2987` 是 `_currentTurn >= _maxTurns` 检查。Cline `sdk/packages/llms/src/providers/routing/provider-option-rules.ts:145-170` 对 OpenAI adapter/Codex 显式 `strictJsonSchema:false`；`506-511` 注释规定供应商/模型例外必须加命名规则，不在 composer 加分支；`provider-options.test.ts:268-323` 断言 strict schema 默认不 fanout 到其他供应商 bucket。
- 成熟做法：工具循环上限是结构化错误类型，错误是否进入历史要显式决策；供应商能力差异用命名规则表表达，测试防止默认值跨供应商泄漏。
- 适配点：应用 V2 的供应商能力矩阵应落成单源规则表：每个供应商声明 native tools、streaming tool calls、strict schema、tool result wire format、继承关系；DeepSeek/Azure 继承 OpenAI 的行为必须显式测试。`aiService.ts:1997-1998` 当前原生工具交换默认非流式，是因为兼容供应商会忽略 `stream=true` 返回普通 JSON tool_calls 体；Gemini 流式 functionCall 聚合本轮未找到对应实现，登记为未验证/可能不支持。
- 反深挖新问题：如果未来引入流式工具调用，Anthropic 半截 JSON 参数与 Gemini functionCall 分片需要独立解析状态；未实现前不能在矩阵中标“支持”。
