# API 直写系统 100% 闭环最终方案（FINAL）

状态：送审，不执行  
前置调研：[RESEARCH_2026-09-23_API_DIRECT_WRITE_100_CLOSURE.md](RESEARCH_2026-09-23_API_DIRECT_WRITE_100_CLOSURE.md)  
基线版本：3.60.0  
硬约束：不设 token 预算；未真实实测的能力只能写“架构就绪 / 未实测”；执行中任何真实用户测试失败按“失败即停 + 完整重跑”处理。

## 0. 100% 的定义

100% 不是“永远没有模型不配合”，而是以下六条全部有可核查证据：

1. 声明支持的工具面、权限、协议、状态机、日志、UI 全部有自动化回归覆盖。
2. 5K / 100K / 1M 三档文档在可见 Electron 窗口完成真实用户级操作验证。
3. 1M 档按“1M 上下文模型”的真实能力执行：文档地图 + 分段读取 + 分批写入，禁止整篇单次替换。
4. 五类供应商中每条声明支持直写的路径都有真实 live 或协议级验证；未验证路径在 UI 与配置层显式标记。
5. 所有失败、恢复、取消、降级、日志分支都有测试与 trace 证据。
6. 验收前不升版本、不封装；验收后全量回归 + 生产接线 + asar 启动 + 安装包实测。

成熟度声明：本方案是成熟方案，但不是“已执行方案”。其中 1M live 与部分供应商 live 依赖外部模型和密钥，无法用代码或 mock 伪装。

## 1. 执行原则

| 原则 | 来源 | 落地方式 |
|---|---|---|
| 上下文必须显式建模 | headroom、DeepTutor | 请求前计算预算，超窗分流或失败 |
| 长任务必须分批 | ironclaw、go-micro、eino | 大范围操作自动进入 EditTask |
| 权限 fail closed | paperclip、hermes-agent | 未知操作拒绝或升级，不猜测 |
| 工具循环看失败指纹 | moltis | 相同失败分级干预，成功重置 |
| 观测逐事件成对 | crewAI、agentscope-java | Pre/Post 事件、预算事件、双侧对账 |
| 验证真实且失败即停 | ClawX、maka、BrowserSkill | 隔离 Electron、no-retry、迟到结果门控 |

## 2. Phase 1：上下文容量模型

### 社区证据

- DeepTutor 预算描述真实请求：system 块、tool manifest、messages、output reserve 逐项计入，`used_tokens == sum(segments)`。
- WeKnora 中文按约 1.7 chars/token 保守估算，token limit 转字符时再乘 0.9 安全边距。
- headroom 优先官方计数 API，退化近似时显式警告；1M 档必须显式标记。

### 应用差距

- `src/services/providerAdapter.ts:84-85` 只有输出 `maxTokens`。
- `src/services/aiService.ts:2306-2638` 只有输出上限降级，没有输入预算。

### 执行条款

1. 供应商配置新增 `contextWindowTokens`：默认 0 表示未知；未知按保守值处理并在 UI 显示“未声明窗口”。
2. 新增 token 估算器：中英文分语言比例；与会话真实 usage 对账后修正。
3. 新增上下文预算器，输出三态：
   - `fits`：正常发请求。
   - `needs_segmentation`：进入 Phase 2/3 的地图与分批链路。
   - `exceeds_provider`：明确失败，禁止静默截断。
4. trace 新增 `providerContextWindowTokens / estimatedInputTokens / contextBudgetDecision / usageReconciliation`。
5. 设置页、导入导出、配置校验同步支持该字段。

### 验收

- 单测覆盖 0、未知、128K、1M、超窗、null、非法值。
- 每次请求发出前 trace 可见预算决策。
- 5K / 100K / 1M 只读分析各一次，UI 显示窗口与决策，trace 完整。

## 3. Phase 2：文档地图与分段读取

### 社区证据

- LightRAG：token 窗口 + overlap，非法参数直接拒绝，窗口能映射回源文 span。
- caveman：BM25 + recency + pin 确定性打包，记录 TokensUsed / TokensSaved / DeferredCount。
- jarvis：JSON 提取用括号匹配，不用贪婪正则。

### 应用差距

当前读取依赖搜索与局部上下文，缺结构化地图和 range cursor。

### 执行条款

1. 新增 `editor.document_map`：总字符、估算 token、节列表、节范围、节摘要长度。
2. 新增 `editor.read_range`：`cursor` 或 `sectionId` + `maxChars`，返回 `nextCursor / hasMore / range`；默认单次 12000 字符，可被预算器下调。
3. 搜索增强：返回匹配位置、所在节、局部上下文、总数，超多匹配分页。
4. SKILL 协议文档同步：长文档必须先地图后读取，禁止无计划连续读取。
5. 协议防线：非法 cursor、超限读取、一次性全文请求返回结构化错误。

### 验收

- 空文档、无结构、嵌套标题、重复标题、超大节、分页边界、cursor 回绕、非法 cursor 全测。
- 1M 合成文档上记录地图生成时间与内存基准。
- trace 不因分段读取失控膨胀。

## 4. Phase 3：EditTask 自动升级与分批执行

### 社区证据

- ironclaw：checkpoint 先于副作用，payload ceiling 与 process journal 一致。
- moltis：重复失败先 nudge 再禁用工具，成功重置窗口。
- commerce-agents / deer-flow：run 级失败账本与 stop reason。

### 应用差距

`editTaskService.ts` 状态机与 checkpoint 已成熟，但自动升级路由不足：结构移动与整篇请求已识别为 long document，未完全自动进入 EditTask。

### 执行条款

1. 长文档规划器接管：
   - 小范围句段修改：direct tool loop + `editor.write`。
   - 结构移动 / 局部重排：定向读取 + 受限命令。
   - 大范围整理 / 1M 级：自动进入 EditTask。
2. EditTask 计划阶段记录：目标章节范围、批次列表、每批操作类型、风险与校验策略。
3. 每批完成写 checkpoint；批间允许暂停、恢复、取消；失败批次进入 `waiting_user`，自动重试不超过一次。
4. direct loop 增加失败指纹：相同工具 + 相同参数摘要 + 相同错误连续出现即分级干预。
5. UI 显示总批次、当前批次、已完成修改、失败原因；按钮状态与状态机严格一致。

### 验收

- 正常、暂停、恢复、取消、批次失败、checkpoint 不匹配、终态恢复拒绝全覆盖。
- 1M 整理不允许出现整篇 `replace_document`。
- 每批有 `documentVersion + contentHash`。
- 内容守卫两向验证：合法重排通过，人为删节阻断。

## 5. Phase 4：供应商矩阵

### 社区证据

- headroom：1M 档显式标记，官方计数优先。
- nanobot：idle timeout 不当 total timeout；thinking 与 tool delta 分流。
- litellm：Azure Claude 独立路由。
- aisuite：Anthropic/OpenAI 工具协议双向适配。

### 应用差距

- `providerTools.ts:46-75` 五类均 `nativeTools: true`，Gemini streaming 仍 `unverified`。
- live 覆盖目前只有 openai-compatible 形态。

### 执行条款

| 供应商 | 验证方式 | 必测 |
|---|---|---|
| openai-compatible | 真实 live | 工具调用、流式、非流式、收敛、直写 |
| deepseek | 真实 live | 工具调用、长文档、收敛 |
| azure-openai | live；无密钥则协议级 + 配置阻断 | 工具调用、错误映射 |
| anthropic | live；无密钥则协议级 + 配置阻断 | tool_use/tool_result、流式 |
| gemini | live；无密钥则协议级 + 配置阻断 | function call、流式工具调用 |

规则：

1. Gemini streaming 要么真实验证为 `implemented`，要么显式降级为非流式工具调用。
2. 每类至少一次 5K 六步直写。
3. 不支持工具的供应商走 JSON 协议降级并明示协议形态。
4. 上下文窗口未知时按未知处理，不允许按无限上下文。
5. 401 / 408 / 429 / 500 / 流中断 / 伪工具调用 / 空正文全部有测试。

## 6. Phase 5：运行时协议防线与意图语料

### 社区证据

- paperclip：未知操作升级，`approve/deny/escalate` 三态，fail closed。
- jarvis：陈述句也是有效指令；JSON 用括号匹配；evals 独立。
- Azure CLU：confidence、None intent、完整结果下传。

### 执行条款

运行时协议防线：

1. 未知工具名：结构化拒绝，不猜测映射。
2. schema 校验：必填缺失、类型错误、越界、未知字段全部拒绝并返回可修正错误。
3. 权限前置：SKILL 声称需要写工具也要经当前意图与会话状态授权。
4. 范围校验：非法 cursor、超限读取、全文请求返回结构化错误。
5. trace 标记 `native_tool_call / json_protocol / rejected_invalid_protocol`。
6. `unknown_tool / schema_invalid / permission_denied / range_invalid` 写入 run trace 与 DiagLogger。
7. 不试图改写模型意图，不静默修复；目标是可发现、可解释、可阻断。

语料目标：

- train / dev / test 各不少于 100 条；holdout 不少于 200 条；adversarial 不少于 100 条。
- 写入 falseAccept 为 0；不允许放宽写入阈值降误拒。
- EditTask 活动状态优先于单句静态分类；跨轮连续性进入路由上下文。
- 校准输出每组规模、准确率、误拒、误放行、边界样本；holdout 与 adversarial 分开。

## 7. Phase 6：观测与日志

### 社区证据

- agentscope-java：Pre/Post 事件成对、逐行 flush、错误带 class/message/stacktrace。
- crewAI：run/turn/step 三层与 parent 继承语义明确。
- langfuse：trace/span/toolCalls 结构化。

### 执行条款

必记事件：

1. 意图路由：决策、置信、会话状态、降级原因。
2. 上下文预算：窗口、估算、分片决策、usage 对账。
3. 工具循环：轮次、工具名、参数摘要、结果摘要、孤儿调用。
4. 直写批次：命令、目标、结果、版本、hash。
5. EditTask：计划、批次、checkpoint、暂停、恢复、取消、失败。
6. 收敛：伪工具调用、强纠正、本地兜底、未写入明示。
7. 供应商：协议形态、流式状态、错误映射、窗口。

双侧一致：run trace 有而 DiagLogger 无视为缺陷；反向同理；UI 显示成功但 trace 无写入成功为最高级缺陷。

## 8. Phase 7：Electron 级验证基座

### 社区证据

- ClawX：真实 `_electron.launch`、隔离 home/userData、90s 启动超时、close -> app.close -> SIGKILL、环境变量隔离。
- maka：workers=1、retries=0、trace/video retain-on-failure、screenshot only-on-failure、60s timeout。
- LobsterAI：真实 Electron 二进制 + 生产 owner 代码、Windows junction 真实复现、finally 清理。
- BrowserSkill：迟到结果不产生 unhandled rejection、读门控、子会话隔离、恢复条件入错误信息。

### 执行条款

建立统一 `Electron 直写验证基座`，所有 Phase 的用户级抽测复用：

1. 每测试独立 mkdtemp userData 与 home，finally 强制清理。
2. 启动 timeout 90s；窗口与关键 UI 元素等待有明确 deadline。
3. workers=1；本地验证 retries=0，flake 必须失败；CI 可用受控 retry 但本地报告必须 no-retry。
4. trace / video / screenshot retain-on-failure。
5. 关闭兜底链：close -> close event -> timeout -> SIGKILL，测试结束不允许残留进程。
6. 迟到 API/tool 结果必须有 settle 门控，不允许 unhandled rejection。
7. Windows 特有路径、锁、junction 场景单独条件测试。
8. `--dev` 与构建产物两种模式分开记录，报告必须绑定渲染产物版本。

### 三档实测矩阵

| 档 | 字符 | 用途 |
|---|---:|---|
| S | 5K | 快速回归与协议行为 |
| M | 100K | 长文档主线 |
| L | 1M | 1M 能力验收 |

每档操作：改句、增句、删句、移动章节、统一编号整理、多章节连续调整、中途取消后恢复、导出 trace 复盘。

1M 硬断言：

- 不出现整篇 `replace_document`。
- 每次请求估算输入不超过供应商窗口。
- 地图与分段读取可见。
- EditTask 批次全部有 checkpoint。
- 最终内容无丢失、无重复章节。
- UI 全程有状态，无长时间空等。
- trace 可解释每次 API 调用与写入。

失败即停：

- UI 成功但编辑器未变。
- 工具失败但 UI 成功。
- 1M 被单次全文注入。
- 批次绕过完整性校验。
- trace 与 DiagLogger 单侧缺失。
- 明确写入请求被拦成只读。

触发后保留现场 trace 与文档快照，补失败测试，修复后从当前档第一步完整重跑。

## 9. Phase 8：回归、文档与封装

门禁顺序：

1. `npm run test:services` 全绿。
2. `npm run type-check` 通过。
3. `npm run build:vue` 通过且无新 warning。
4. `npm run verify:production-wiring` 0 违规。
5. asar 真实启动。
6. 安装版 S 档六步实测。
7. 安装版导出 trace 并与源码版对账。
8. 更新 DEV_LOG、经验文件、SKILL 协议文档（含版本号从 3.53.x 口径同步到最终版本）。
9. 用户确认后才升版本、封装。

交付物：代码与测试、1M 文稿生成器、三档实测证据目录、供应商矩阵报告、语料校准报告、trace/DiagLogger 对账报告、100% 验收清单。

## 10. 执行顺序与每 Phase 收口

1. Phase 1 容量模型。
2. Phase 2 地图与分段读取。
3. Phase 3 EditTask 自动升级。
4. Phase 4 供应商矩阵。
5. Phase 5 协议防线与语料。
6. Phase 6 观测与日志。
7. Phase 7 三档 Electron 实测。
8. Phase 8 回归、文档、封装。

每 Phase 结束执行：

- 回头看。
- 新旧并存扫描。
- 日志覆盖同步检查。
- Electron 基座真实用户级抽测。
- 经验文件与 DEV_LOG 同步。

## 11. 风险表

| 风险 | 等级 | 对策 |
|---|---|---|
| 1M 模型不可用 | 高 | 能力矩阵显式标记；无模型只交付“架构就绪” |
| 1M 输出上限低于全文 | 高 | 强制分批 EditTask，禁止整篇替换 |
| token 估算不准 | 中 | usage 对账动态修正，保守估算 |
| 供应商密钥缺失 | 中 | 协议级验证 + UI 显式 untested |
| 语料噪声 | 中 | train/dev/test 分离，adversarial 独立报告 |
| 修改面过大 | 中 | Phase 独立验收，关键测试先行 |
| 验证 flake 掩盖缺陷 | 高 | 本地 no-retry，失败即停 |

## 12. 成熟度结论

| 维度 | 方案成熟度 | 依赖 |
|---|---|---|
| 容量模型 | 成熟 | 无 |
| 地图与分段读取 | 成熟 | 无 |
| EditTask 分批 | 成熟 | 无 |
| 供应商矩阵 | 成熟 | 真实密钥 |
| 协议防线 | 成熟 | 无 |
| 语料校准 | 成熟 | 持续真实语料 |
| 观测 | 成熟 | 无 |
| Electron 验证 | 成熟 | 本机可见窗口 |
| 1M live | 架构就绪 / 未实测 | 真实 1M 模型 |

本方案不宣称生产已 100%。它给出的是达到 100% 的唯一路径和每一步的验收证据。执行时如果外部依赖缺失，对应项保持“架构就绪 / 未实测”，不得伪装完成。
