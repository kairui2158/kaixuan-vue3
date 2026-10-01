# API 直写系统 100% 闭环社区深度调研报告

生成时间：2026-09-24  
调研范围：protocol / permission / editing / statemachine / toolloop / observability / longdocument / provider / routing / verification 十个维度  
目标：为《API 直写系统 100% 闭环最终方案》提供可核查的社区证据基线，不允许用 README、star 数或虚构项目充数。

## 0. 结论先行

1. 社区成熟系统没有一条“模型全知全能”的捷径。100% 闭环的共识形态是：**应用侧明确建模上下文窗口、长任务走分批状态机、工具面 schema 严格校验、权限 fail closed、观测层逐事件留痕、验证层用真实 Electron + 失败即停**。我们应用的主体骨架已经接近这个形态，但长文档容量模型、1M 分批链路、供应商真实矩阵、语料统计规模仍是硬缺口。
2. 1M 上下文不是“把 1M 塞进一次请求”。社区实现全部采用“显式建模 1M 档位 + 分段读取 + 分批写入 + checkpoint”。headroom 甚至要求 Claude 的 1M 档必须显式携带模型标记，不允许按基础窗口偷跑。我们的应用当前没有 `contextWindowTokens`，这条链路是最大架构缺口。
3. 工具循环的成熟答案不是简单轮次上限，而是“重复失败指纹 + 分级干预 + 成功重置”。moltis 的实现明确覆盖了“失败后成功、恢复后再失败、同批多次失败”等边界，比纯计数上限成熟得多。我们已有 12 轮 direct 策略与伪工具调用收敛门，但重复失败指纹与跨轮任务状态仍可继续对齐。
4. 意图路由的成熟形态是“规则层 + 会话状态 + 语义兜底 + 完整留痕 + 独立 evals”。jarvis 的 judge 明确规定“陈述句也可以是指令”，Azure CLU 的 None intent 与 confidence 阈值也必须完整进入结果。我们的结构层已成熟，缺的是语料规模与统计置信度，不允许靠放宽写入安全阈值解决。
5. 验证层的社区共识非常一致：**真实 Electron 启动、隔离 userData、明确超时、失败留痕、retries=0 或受控 retry、迟到结果门控、平台条件测试**。ClawX、maka、LobsterAI、BrowserSkill 四个项目在这些点上高度一致，可直接转化为我们的实测门禁。

本报告只做证据与差距分析，不改生产代码。

## 1. 调研方法与数据清点

### 1.1 数据规模

数据目录：`_audit/research-api-direct-write-100-closure-2026-09-23/`

| 指标 | 数值 |
|---|---:|
| 去重仓库 | 644 |
| 去重缓存源码文件 | 2081 |
| 物理缓存文件 | 2671 |
| 登记轮次 | 200（10 维度 x 20 轮） |
| 种子仓库覆盖 | 59/59 |
| 缓存异常 | 0 |
| 搜索到但无源码证据的仓库 | 136 |

### 1.2 轮次口径（诚实声明）

第 1-10 轮是原 V1 方案采集的回放记录：原始脚本同轮 10 个维度互相覆盖，源数据只剩每维度一个仓库集合，query 统一登记为 `legacy-search`。因此这 10 轮只能按“V1 事实基线”计数，不能伪称 10 组不同查询。

第 11-20 轮为 V2 新采集：每个维度 10 个查询词全部换新，按维度独立落盘为 `round-11-{dimension}.json` 至 `round-20-{dimension}.json`，不存在同轮覆盖。

### 1.3 无源码仓库不计入证据

136 个仓库（含 awesome 列表、纯文档仓库、搜索到但未取回源码的项目）不计入有效证据。这是清点口径，不是数据丢失。例如 `sindresorhus/awesome`、`avelino/awesome-go`、`vuejs/awesome-vue` 等高星仓库均因无可核对源码而被排除。

### 1.4 证据格式

本报告引用的证据均为本地缓存源码文件，格式为：

`_audit/research-api-direct-write-100-closure-2026-09-23/cache/{owner}_{repo}__{path}.txt`

行号指缓存文件内的行号，可直接用 `rg -n` 或打开文件复核。

## 2. 十维度证据总表

| 维度 | 代表项目 | 社区成熟模式 | 应用现状 | 结论 |
|---|---|---|---|---|
| protocol | paperclip、cline、DesktopCommanderMCP | canonical operation、语义目录、fail closed | 13 读工具 + editor.write，双协议 | 结构成熟，缺运行时不合规防线 |
| permission | paperclip、hermes-agent、NVIDIA Guardrails | 应用侧决定权限，未知操作升级 | 意图 + 会话状态双授权 | 主体成熟，外部 SKILL 仍需防线 |
| editing | DesktopCommanderMCP、ironclaw、paperclip | diff/checkpoint 先于副作用 | 8 操作、批次原子、60000/10 上限 | 小批次成熟，1M 分批未闭环 |
| statemachine | ironclaw、go-micro、eino | checkpoint 先行、终态不重放 | planning 至终态全链路 + hash | 状态机成熟，自动升级不足 |
| toolloop | moltis、deer-flow、commerce-agents | 失败指纹、分级干预、成功重置 | 12 轮 direct + 收敛门 | 可用，重复失败指纹可增强 |
| observability | crewAI、langfuse、agentscope-java | run/turn/step 三层、事件成对、JSONL flush | run trace 三层 + 双侧对账 | 主体成熟，预算事件待补 |
| longdocument | WeKnora、LightRAG、DeepTutor、caveman | 保守 token 估算、窗口分块、真实请求预算 | 1 万字阈值 + 关键词 | 最大缺口，需任务规划器 |
| provider | headroom、nanobot、litellm、aisuite | 窗口显式建模、idle != total、独立路由 | 5 类 nativeTools，Gemini unverified | 协议层可用，live 矩阵不足 |
| routing | jarvis、Azure CLU、archify | 上下文判定、None intent、可追踪 | 规则 + 状态 + 兜底 + evals | 结构成熟，语料规模不足 |
| verification | ClawX、maka、LobsterAI、BrowserSkill | 真实 Electron、隔离、超时、失败留痕 | mock E2E + 单供应商 live | 需要标准化 Electron 门禁 |

## 3. Protocol：协议与工具面

### 社区模式

paperclip 的 ACPX 权限策略把工具请求归一到 canonical operation，再做权限判定；未知操作保持升级，不猜测映射。证据：

- `cache/paperclipai_paperclip__packages_paperclip-runner_src_drivers_acpx_permission-policy.ts.txt:3`：从 canonical operations 目录导入操作定义。
- 同文件 `:11-13`：无可交互审批时直接拒绝并要求先修改权限配置。
- 同文件 `:40`、`:49`：未知操作保持升级，不默认放行。
- 同文件 `:79`：默认动作只有 `approve / deny / escalate` 三态。
- 同文件 `:86`：`deny-all` 模式直接拒绝。
- 同文件 `:104`：无 delegate 时 fail closed。

DesktopCommanderMCP 的编辑器 diff 测试证明社区同样要求“编辑前后 diff 可验证”，不是盲写。

### 应用现状

- `src/services/editorTools.ts:426`：`editor.write` 已声明为 1-10 条受限编辑命令。
- `src/services/editorTools.ts:475`：超过 10 条命令返回 `too_many_commands`。
- `src/services/editorTools.ts:491-492`：批次内容超过 60000 字符返回 `batch_too_large`。
- `src/services/editorTools.ts:497-499`：`replace_document` 必须单独成批。
- 协议文档已覆盖 13 个读工具与 `editor.write` 的原生 tool call / JSON 双协议。

### 差距

应用对“已声明工具”的校验已较完整，但对外部 SKILL 或模型输出的不合规调用仍主要靠事后 trace 判别。社区模式的答案是运行时防线：未知工具名拒绝、schema 校验、参数越界拒绝、协议形态标记、双侧留证。

成熟度：结构成熟，防线未闭环。

## 4. Permission：权限与安全

### 社区模式

- paperclip：权限由应用侧决定，provider 的交互审批只是二次确认；无审批能力时 fail closed。
- hermes-agent：`smart_approval_policy` 与 `edit_approval` 分层，编辑类操作进入独立审批路径。
- NVIDIA Guardrails：输入护栏与输出护栏分离，权限不是单一布尔值。

### 应用现状

- 意图路由决定 `discuss / analyze / edit / generate` 权限。
- `discuss / analyze / auto` 只读；`edit / generate` 才暴露写工具。
- 服务层对工具面做二次授权，模型自由文本不能直接改变权限。
- `editor.write` 批次有唯一性、版本与锁定校验。

### 差距

应用侧权限模型成熟，但外部 SKILL 若不遵守协议，当前只能在运行记录中看到。需要把权限校验前移到协议入口：即使 SKILL 声称需要写工具，也要经过当前意图与会话状态授权。

成熟度：应用内成熟，外部协议防线未闭环。

## 5. Editing：编辑执行

### 社区模式

- ironclaw：checkpoint 与副作用绑定，写入前先记录可恢复状态。
- DesktopCommanderMCP：编辑必须产出 diff，可人工核对。
- paperclip：编辑操作归入 canonical operation，受权限策略约束。

### 应用现状

- `src/services/editorTools.ts` 支持 8 种编辑操作。
- 批次原子执行，失败批次不会部分写入。
- `replace_document` 必须单独成批，局部修改必须用受限命令。
- `src/services/editorTools.ts:126-128`：上下文窗口、搜索结果、reveal 范围都有上限。

### 差距

小范围编辑成熟。大范围重排与 1M 整理仍依赖模型自觉，EditTask 自动升级未完全自动化。社区方案是“大任务由任务规划器强制进入分批编辑”，不允许 direct loop 硬吃整篇重排。

成熟度：小批次成熟，大任务分批未闭环。

## 6. Statemachine：任务状态机

### 社区模式

- ironclaw：checkpoint 分 BeforeBlock 等类型，gate 身份进入 checkpoint；测试明确锁定 checkpoint payload ceiling。
  - `cache/nearai_ironclaw__crates_kernel_ironclaw_turns_src_checkpoint_state.rs.txt:14-18`：checkpoint id 与 state ref。
  - 同文件 `:26`、`:44`：gate 触发与身份。
  - 同文件 `:58-63`：put/get checkpoint 接口。
  - 同文件 `:73-82`：测试锁定 payload ceiling 与 process journal 一致。
- go-micro：checkpoint 与 stream 状态分离，恢复不依赖单一全局状态。
- eino：cancel 语义与 checkpoint resume 有独立测试。

### 应用现状

`src/services/editTaskService.ts` 已有完整状态链：

- `:2-6`：`planning / awaiting_batch / running_batch / partially_applied / waiting_user`。
- `:20-21`、`:50-60`、`:97-98`：`documentVersion + contentHash` 双校验。
- `:77-81`：状态迁移矩阵。
- `:137-146`：checkpoint 版本或 hash 不匹配即拒绝。
- `:258-273`：重复 checkpoint 事件去重。

### 差距

状态机本身成熟，缺的是“什么时候自动进入这个状态机”。当前长文档判定仍偏阈值与关键词，缺少任务级规划。

成熟度：状态机成熟，自动升级未闭环。

## 7. Toolloop：工具循环

### 社区模式

moltis 的 loop detector 是本轮最值得吸收的实现：

- `cache/moltis-org_moltis__crates_agents_src_tool_loop_detector.rs.txt:1-9`：目标是重复相同失败，不是所有重复调用。
- 同文件 `:23-32`：失败指纹包含工具名、参数、错误与显式 failed 标记。
- 同文件 `:54-73`：无 error 字符串的逻辑失败也算失败。
- 同文件 `:103`：rolling detector。
- 同文件 `:159`：成功会重置窗口。
- 同文件 `:199-235`：明确处理“恢复后单次失败不应立即再次触发”的边界。
- 同文件 `:309-332`：先 nudge，再禁用工具并要求模型用自然语言说明。
- 同文件 `:406-660`：覆盖三次失败触发、第四次升级、成功重置、同批多失败、无 error 字符串失败等测试。

deer-flow 与 commerce-agents 进一步证明：失败账本按 run 重置、每一轮必须有 stop reason，不允许无限循环静默耗尽。

### 应用现状

- direct 默认 12 轮工具循环。
- 已有收敛判定与伪工具调用强纠正。
- 连续只读不写入的策略已存在。

### 差距

当前策略以轮次与行为类型为主，尚未形成“相同失败指纹”的分级干预。对长文档任务，正确答案也不是提高轮次，而是把任务交给 EditTask 分批，减少 direct loop 的负担。

成熟度：可用，指纹化增强可做。

## 8. Observability：观测与日志

### 社区模式

- crewAI：run / turn / step 三层，checkpoint listener 明确区分 parent 继承、显式 opt-out、未配置三种状态。
  - `cache/crewAIInc_crewAI__lib_crewai_src_crewai_state_checkpoint_listener.py.txt:60-61`：显式 False 与 None 分开。
  - 同文件 `:94`：None 表示继承父级。
  - 同文件 `:126-211`：每个事件携带 parent_id snapshot。
- langfuse：trace/span/parentSpan/toolCalls 结构化，不靠拼接文本。
- agentscope-java：JSONL 逐行导出，Pre/Post 事件成对，错误带 class/message/stacktrace。
  - `cache/agentscope-ai_agentscope-java__agentscope-core_src_main_java_io_agentscope_core_hook_recorder_JsonlTraceExporter.java.txt:68-76`：best-effort 但可配置强失败。
  - 同文件 `:94-97`：flushEveryLine。
  - 同文件 `:196-241`：PreCall/PostCall、PreReasoning/PostReasoning、PreActing/ActingChunk/PostActing、Error 全覆盖。
  - 同文件 `:248-249`：逐行 flush。

### 应用现状

- run trace 在 turn / apiCall / event 三层记录 `actualToolSurface`。
- DiagLogger 与 run trace 有双侧对账。
- 能区分“模型说没权限”与“工具面没接上”。

### 差距

上下文预算事件尚未成为 trace 一等公民：窗口、估算、分片决策、usage 对账、预算失败这些事件在社区方案里都是必记项。

成熟度：主体成熟，预算事件待补。

## 9. LongDocument：长文档

### 社区模式

这是本次调研最重要的维度，四个项目给出互补答案。

1. WeKnora：语言感知的保守 token 估算。
   - `cache/Tencent_WeKnora__internal_infrastructure_chunker_tokens.go.txt:1-6`：不引入 tokenizer，用语言比例估算。
   - 同文件 `:23-27`：中文约 1.7 chars/token，且刻意保守。
   - 同文件 `:146-158`：token limit 转字符限制时再乘 0.9 安全边距。
2. LightRAG：固定 token 窗口 + overlap，非法参数直接拒绝。
   - `cache/HKUDS_LightRAG__lightrag_chunker_token_size.py.txt:3-8`：窗口与 overlap 明确。
   - 同文件 `:59-93`：token 窗口映射回源文 span，解码失败有兜底。
   - 同文件 `:114-129`：overlap >= size 或负数直接报错。
3. DeepTutor：预算必须描述真实发出的请求，不是抽象会话。
   - `cache/HKUDS_DeepTutor__deeptutor_agents_loop_context_budget.py.txt:4-6`：预算基于 system prompt 块、tool manifest、messages。
   - 同文件 `:60-64`：messages 必须浅拷贝，因为循环会追加，预算描述的是单次请求。
   - 同文件 `:87-102`：effective window 与 max_tokens 共同决定窗口。
   - 同文件 `:123-139`：conversation token 计数排除已在 system 中计过的部分。
   - 同文件 `:211-229`：used_tokens 等于 segments 总和，free_tokens 有下界。
4. caveman：确定性上下文打包。
   - `cache/JuliusBrussee_caveman__engine_contextwindow_contextwindow.go.txt:2-3`：BM25 + recency/priority，本地确定性，无 embedding。
   - 同文件 `:60-63`：TokensUsed / TokensSaved / DeferredCount 全记录。
   - 同文件 `:107-119`：分数由 BM25、priority、recency、error boost、pin 组成。
   - 同文件 `:173-178`：BM25 参数固定，结果可复现。

### 应用现状

- `src/services/providerAdapter.ts:84-85`：只有 `maxOverride ?? provider.maxTokens ?? 8192`，没有输入上下文窗口字段。
- `src/services/longDocumentPolicy.ts:42-45`：长文档判定主要是字符阈值、字节阈值与关键词。
- `src/services/aiService.ts:2306-2638`：存在 maxTokens 降级链路，但没有输入窗口预算器。

### 差距

当前应用没有回答三个关键问题：这次请求到底要吃多少 token？供应商窗口是多少？超窗后应该分片、降级还是失败？没有这三个答案，1M 只能靠模型自觉，而社区方案从不依赖模型自觉。

成熟度：最大缺口，需要任务规划器 + 预算器 + 文档地图 + 分段读取。

## 10. Provider：供应商

### 社区模式

1. headroom：1M 档必须显式建模。
   - `cache/headroomlabs-ai_headroom__headroom_providers_anthropic.py.txt:3-15`：优先官方 Token Count API，退化为近似时明确警告。
   - 同文件 `:71-82`：Claude 的 `[1m]` 后缀是显式 1M 档标记，必须映射 beta header，不允许按基础窗口处理。
   - 同文件 `:102-117`：不同模型的 context limit 是独立配置。
   - 同文件 `:173-181`：长上下文价格档与窗口档绑定。
   - 同文件 `:376-408`：Token counter 区分 API 精确计数与 tiktoken 近似。
2. nanobot：流式 idle timeout 不等于 total timeout。
   - `cache/HKUDS_nanobot__tests_providers_test_anthropic_stream_idle.py.txt:90-121`：持续产出 chunk 的长流不能被 idle timeout 误杀。
   - 同文件 `:127-149`：真正停滞的流仍要被切断。
   - 同文件 `:154-282`：thinking delta 与 tool input delta 分开回调。
3. litellm：Azure 路由独立建模，Claude-on-Azure 不能混入普通 Azure。
   - `cache/BerriAI_litellm__tests_test_litellm_llms_azure_ai_claude_test_azure_anthropic_provider_routing.py.txt:17-34`：模型识别大小写不敏感且格式非法要可处理。
   - 同文件 `:41-46`：`azure_ai/claude-*` 必须路由到 `azure_ai`。
   - 同文件 `:49-55`：非 Claude Azure 模型不进入该路由。
4. aisuite：Anthropic 与 OpenAI 工具协议双向适配。
   - `cache/andrewyng_aisuite__aisuite-js_src_providers_anthropic_adapters.ts.txt:33-34`：tools 转换。
   - 同文件 `:47-77`：tool result / tool use 消息双向转换。
   - 同文件 `:99-142`：tool schema 与 tool call 转换。

### 应用现状

- `src/services/providerTools.ts:46-75`：五类供应商均标记 `nativeTools: true`，Gemini streaming 为 `unverified`。
- `src/services/providerTools.ts:103-146`：Anthropic 与 Gemini 的工具转换分支存在。
- 09-23 日志显示：openai-compatible 已有真实 live 六步实测；Anthropic / Gemini / Azure / DeepSeek 的 live 覆盖仍不足。

### 差距

协议仿真层可用，但真实矩阵不足。社区方案要求“能力矩阵、协议仿真、mock E2E、真实 live”四层分开报告，这正是经验文件 M38 的门禁。

成熟度：协议层可用，live 矩阵不足。

## 11. Routing：意图路由

### 社区模式

1. jarvis：意图判定必须吃完整上下文，陈述句也是有效指令。
   - `cache/isair_jarvis__src_jarvis_listening_intent_judge.py.txt:1-3`：judge 接收 transcript、历史与状态。
   - 同文件 `:169`：问题、陈述、命令都可能是有效 query。
   - 同文件 `:187`：question 或 statement 都有效。
   - 同文件 `:197`：可在 query 内修正明显口误，但不能改写意图。
   - 同文件 `:205`：明确规定“不是命令或问题”不是否定 directed 的合法理由。
   - 同文件 `:357-362`：JSON 提取用括号匹配，不用贪婪正则。
   - 同文件 `:458-505`：max tokens 与 timeout 分开建模，避免截断和雪崩。
   - `cache/isair_jarvis__evals_test_intent_judge.py.txt`：意图判定有独立 evals。
2. Azure CLU：confidence、None intent、完整结果都要进入下游。
   - `cache/Azure-Samples_Azure-Language-OpenAI-Conversational-Agent-Accelerator__src_backend_src_router_clu_router.py.txt:87-89`：阈值来自配置，confidence 与 topIntent 从预测结果读取。
   - 同文件 `:94-100`：低置信与 None intent 都产生明确 error。
   - 同文件 `:105-109`：完整结构化结果下传，不丢字段。
3. archify：路由决策必须可视化可追踪。
   - `cache/tt-a1i_archify__viewer_intent-trace.js.txt:6-10`：intent trace 独立模块。
   - 同文件 `:40-63`：active、match、selected 状态分层。
   - 同文件 `:149-156`：最终摘要包含 loop 等结构信息。

### 应用现状

- 已有规则层、会话状态、margin gate、LLM 兜底、trace 留痕与独立评估脚本。
- 近期校准报告已做到 train/dev/test 分离与安全硬约束。

### 差距

holdout 28 条偏小，train/dev/test 各不足 10 条，统计置信度不足。经验文件 M52 明确禁止用放宽写入安全阈值来降误拒，唯一正路是扩语料并重跑校准。

成熟度：结构成熟，语料规模不足。

## 12. Verification：验证

### 社区模式

四个项目给出高度一致的 Electron 级验证模式。

1. ClawX：真实 Electron、隔离目录、明确超时、强清理。
   - `cache/ValueCell-ai_ClawX__tests_e2e_fixtures_electron.ts.txt:100`：userDataDir 显式注入。
   - 同文件 `:151-166`：窗口等待与 domcontentloaded 有明确 timeout。
   - 同文件 `:175-206`：关闭链路为 close -> close event -> timeout -> SIGKILL。
   - 同文件 `:212-234`：settings 预 seed，环境变量显式隔离。
   - 同文件 `:264`：启动 timeout 90000ms。
   - 同文件 `:281-291`：home/userData 每测试独立 mkdtemp，finally 清理。
2. maka：真实窗口 + fake backend + no retries。
   - `cache/apache_maka__apps_desktop_e2e_playwright.config.ts.txt:26-28`：每个测试使用独立 throwaway userData。
   - 同文件 `:39`：workers=1。
   - 同文件 `:43-46`：No retries，flake 必须炸出来。
   - 同文件 `:47-53`：60s timeout、10s expect、trace/video retain-on-failure、screenshot only-on-failure。
3. LobsterAI：真实 Electron 二进制执行生产 owner 代码，Windows 边界真实复现。
   - `cache/netease-youdao_LobsterAI__src_main_libs_openclawCompatibilityRepairCore.electron.test.ts.txt:16-18`：真实 junction 与 dangling junction。
   - 同文件 `:43-45`：真实创建 junction。
   - 同文件 `:56-59`：用 electron 二进制执行，windowsHide，20000ms timeout。
   - 同文件 `:63`：finally 清理。
4. BrowserSkill：迟到结果不产生 unhandled rejection，读门控可恢复。
   - `cache/Tencent_BrowserSkill__apps_extension_src_browser-driver___tests___command-deadline.test.ts.txt:73-99`：迟到 reject 不造成 unhandled rejection。
   - 同文件 `:135-162`：区分 caller timeout 与迟到完成。
   - 同文件 `:184-217`：原命令 settle 前阻塞新读，settle 后恢复。
   - 同文件 `:218-251`：子会话隔离与 late completion fencing。
   - 同文件 `:254-269`：区分 deadline 与 refused read，恢复条件写进错误信息。

### 应用现状

- 已有 services 测试、mock E2E、协议仿真、真实 Electron 用户级实测与 asar 启动核验。
- 09-23 已完成 7602 字 live 六步实测与 856 条测试回归。
- 经验文件 M40 已把 Electron 直写实测列为门禁。

### 差距

缺少把上述社区模式固化成统一验证基座：隔离 userData、90s 启动超时、no-retry、失败留痕、迟到结果门控、平台条件测试。当前每轮实测是按任务组织，容易遗漏维度。

成熟度：已有强度，缺标准化基座。

## 13. 应用源码基线核对

| 项 | 位置 | 现状 | 结论 |
|---|---|---|---|
| 输出 token 解析 | `src/services/providerAdapter.ts:81-85` | 只有 maxTokens | 缺输入窗口 |
| finish reason | `src/services/providerAdapter.ts:153-161` | completion 达上限判 length | 输出侧可用 |
| 长文档策略 | `src/services/longDocumentPolicy.ts:4-5`、`:42-45` | char/byte 阈值 + 关键词 | 缺任务规划 |
| maxTokens 降级 | `src/services/aiService.ts:2306-2638` | 输出上限降级链路存在 | 输入预算缺失 |
| EditTask 状态机 | `src/services/editTaskService.ts:2-81` | 全状态 + 迁移矩阵 | 成熟 |
| checkpoint | `src/services/editTaskService.ts:137-146`、`:258-273` | 版本 + hash + 去重 | 成熟 |
| 编辑批次 | `src/services/editorTools.ts:426-499` | 10 条、60000 字符、单独成批 | 小批次成熟 |
| 供应商能力 | `src/services/providerTools.ts:46-75` | 5 类 nativeTools，Gemini streaming unverified | 需 live |

## 14. 外部依赖与不可伪装项

1. 1M 档验收需要真实 1M 上下文模型。没有该模型时只能交付“架构就绪 / 未实测”，不允许用小窗口模型冒充。
2. Anthropic / Gemini / Azure 的真实 live 需要真实密钥。密钥只能经环境变量临时传入，禁止写入仓库、日志、脚本或证据文件。
3. Gemini 流式工具调用必须真实验证；若无法验证，能力矩阵必须显式降级为非流式，不能保留 `unverified` 却默认可用。
4. 意图语料的统计置信度需要持续真实语料。当前 holdout 规模不足以支撑“路由已统计成熟”的结论。

## 15. 成熟度总评

| 维度 | 当前成熟度 | 100% 前必须补齐 |
|---|---|---|
| 工具协议 | 高 | 运行时不合规防线、20 类负样本 |
| 权限安全 | 高 | 协议入口前置授权 |
| 编辑执行 | 高（小批次） | 1M 分批、文档地图 |
| 状态机 | 高 | 自动升级路由 |
| 工具循环 | 中高 | 失败指纹、大任务分流 |
| 可观测性 | 高 | 预算事件一等公民 |
| 长文档 | 中 | 容量模型、预算器、分段读取 |
| 供应商 | 中 | live 矩阵、Gemini streaming |
| 意图路由 | 中高 | 语料规模、统计置信 |
| 验证 | 中高 | 标准化 Electron 基座 |

结论：应用不是“从零补课”，而是“核心链路成熟后补系统级闭环”。最终方案应以长文档容量模型与任务规划器为主线，其他维度围绕这条主线补齐，避免把 100% 变成无边界重写。
