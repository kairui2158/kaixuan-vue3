# 2026-09-16 大纲工作台 tool-loop 悬死与观测黑洞修复方案

## 方案成熟度

**方案成熟度：成熟可执行。**

依据：

1. 根因已追到“物理请求未记录开始、运行级 watchdog 无执行权、await 悬死绕过组件 catch/finally”三层真实断点，不是基于现象猜测。
2. 社区机制已用 OpenAI Agents SDK、LangGraph、MCP Lifecycle 三份官方文档对齐：`max_turns`、`ModelTimeoutError / ToolTimeoutError`、`error_handlers`、`recursion_limit`、interrupt/resume、请求超时必须取消、进度可重置时钟但必须有最大上限。
3. 修复范围按 P0 生命周期闭合、P0 请求级停滞接管、P1 自纠错与收束、P2 长文档检索分层，不在本次混入产品级索引大改造。
4. 每个改动点已落到现有真实接点：`aiService.reportPhysical()`、`callAiWithTools()` 工具结果循环、`OutlineWorkspace.askPlainAi()`、`runTrace.startStateWatchdogForRun()`、`startApiCall/finishApiCall`。
5. 验证标准包含真实 Electron + mock 供应商 + CDP 用户路径，覆盖悬死、超时接管、重复参数错误、取消传播、导出对账，不使用 mock 强制终态冒充闭环。

本方案只做方案审核，不写业务代码。

## 事故结论

事故 run：`run-1789562457279-1`，来源大纲工作台，模式 direct，用户请求“我想你统一一下全大纲的时间线”。

这不是“模型多轮工具调用”一个原因，而是三层问题叠加：

1. **物理请求观测黑洞**：trace 里第 1-5 个物理请求有完成记录，第 6 个请求发出后没有任何开始记录；run、turn、API call 永远 `running`。证据：trace `status: running`，API call `physicalCalls` 无第 6 条记录。
2. **运行级 watchdog 无执行权**：`stateWatchdog` 触发 `state-stuck-detected` 后只写 warn，不 abort、不收终态、不通知 UI，也不写 DiagLogger。更关键的是：chat run 是长容器，300 秒从 run/turn 开始计时，不能代表当前请求的真实停滞时长。
3. **长文档检索策略失败**：十几万字大纲由模型反复 `editor.search / outline.search`，后面连续 6 次 `editor.reveal` 传错参数；首次失败到全部失败间隔不到 10ms，说明模型是在同一响应内连续打同样格式，工具返回结果没有提供足够自纠错信息。

## 根因矩阵

| # | 缺陷 | 现有代码证据 | 危害 |
|---|---|---|---|
| R1 | 物理请求只报成功/失败，不报开始 | `aiService.ts:1731-1750` `reportPhysical()` 只在结果路径调用；`runTrace.ts:800-841` 只在结果到达时 append | 悬空请求在运行记录不可见，SKILL 层无法判断卡在哪一轮 |
| R2 | watchdog 只有观测权，没有执行权 | `runTrace.ts:658-671` 只 `addEvent`；`stateWatchdog.ts` 只 setTimeout | 停滞后用户仍空等，请求和终态都不闭合 |
| R3 | await 悬死绕过组件级异常兜底 | `OutlineWorkspace.askPlainAi()` 中 `await aiService.callAi()` 无返回时，catch/finally 均无法执行 | 应用层所有现有失败处理形同虚设 |
| R4 | 非流式工具轮默认 300 秒且最多 3 次重试 | `aiService.ts:218-221`、`:1704-1706` | 对话场景单个物理请求最长可等 15 分钟，且用户不知道是否在重试 |
| R5 | 无进展判定只警告一次 | `aiService.ts:1335-1352` 仅连续 2 轮零正文 warning | 连续失败工具、重复查询、无新信息不会被收束 |
| R6 | reveal 参数错误无自纠错反馈 | `editorTools.ts:596-654` 校验失败只返回 `target 必须是定位对象` | 模型连续 6 次同类错误，浪费轮次 |
| R7 | 长文档无结构化预筛 | 现有工具为 search/reveal/locate | 模型只能多轮盲查，成本高且容易跑偏 |
| R8 | 停滞状态 UI 不可见 | watchdog 事件不进 `OutlineWorkspace` UI | 用户只能看到“正在等待 API 返回” |
| R9 | 日志单侧 | watchdog/物理请求开始事件未同步 DiagLogger | 诊断日志无法复现完整现场 |

## 社区机制对齐

### OpenAI Agents SDK

- `max_turns` 硬上限：超限抛 `MaxTurnsExceeded`，不允许无界循环。
- 错误族区分 `ModelTimeoutError`、`ToolTimeoutError`、`ModelBehaviorError`，失败必须可分类。
- `error_handlers` 可把 max turns、模型拒绝、无效最终输出转成受控最终输出，而不是裸异常或挂死。

映射到本应用：工具循环必须有硬上限；超时/无进展/重复错误要成为可分类终态；终态要能被入口层翻译成用户可读结果。

### LangGraph

- `recursion_limit` 超限抛 `GraphRecursionError`，默认 1000 步，运行时可配置。
- `interrupt() + Command(resume=...)` 提供人机协作暂停/恢复；interrupt 前的副作用必须幂等。
- 不建议节点内 while 循环多次 interrupt，复杂控制流应外置到图结构。

映射到本应用：不要把“长文档任务”塞进无限工具轮；到达复杂度边界时应暂停并交给用户，而不是继续盲查。

### MCP Lifecycle

- 所有请求 SHOULD 设置超时。
- 超时应发出 cancellation 通知，并停止等待。
- 进度通知可以重置超时时钟，但 MUST 保留最大超时上限，防止失控客户端或服务器。
- 关闭使用阶梯：关输入流 → 等待 → 终止。

映射到本应用：物理请求开始必须可见；工具执行和流式输出可重置停滞时钟，但必须有总上限；超时必须主动取消并闭合记录。

## 修复目标

1. **任何物理请求发出即可见**：开始、阶段、attempt、超时配置、请求摘要进入 runTrace 与 DiagLogger。
2. **停滞必须被接管**：请求级 watchdog 达到上限时 abort 当前请求、闭合 API call/run/turn、UI 显示可读原因和下一步。
3. **重复错误必须自纠错**：reveal 失败返回正确格式示例和结构候选；连续同类错误触发收束，不再无限重试。
4. **无进展必须收束**：连续纯工具轮、重复失败、零新信息时注入“基于已有信息总结”的收束消息；再失败则终止。
5. **长文档能力补底座**：新增只读结构地图/区间读取，减少模型多轮盲查。此为 P2，单独立项，不与本次卡死修复混算。

## 修复方案

### Phase 0：门禁与基线

1. 复读 `神意开发经验总结_v5.md` M8/M12/M17/M18/M22/M23/M24。
2. 建立基线测试：固化当前悬死行为，要求修改后同一 mock 场景从永 running 变为可观测、可闭合。
3. 影响圈声明：`aiService.ts`、`runTrace.ts`、`stateWatchdog.ts`、`OutlineWorkspace.vue`、`editorTools.ts`、相关测试与 E2E 脚本。可能受影响入口：大纲工作台、主页编辑器、流水线。入口处先加保护性默认值，不直接改流水线生成策略。
4. 建立本任务 DEV_LOG，执行前后同清单对账。

### Phase 1：物理请求生命周期记录（P0）

改动点：

1. `PhysicalCallEvent.status` 增加或等价映射 `running`。
2. `aiService.callAiWithoutTools()` 在每次真实网络请求发出前调用 `reportPhysical(attempt, 'running')`；同一 attempt 的后续结果通过唯一 `physicalCallId` 更新原记录，避免开始/结束被拆成两条。
3. `runTrace.appendPhysicalCall()` 支持按 `physicalCallId` 更新；保留现有 append 兼容语义，不破坏旧导出。
4. 记录字段：phase、attempt、timeoutMs、toolsEnabled、actualToolSurface、requestMessages 摘要、startedAt。
5. trace 与 DiagLogger 双侧写入 `physical-call-started`；结果到达写入现有成功/失败事件。
6. 空载荷守卫保留：空请求不允许把 running 物理记录写黑。

验收：

- Mock 悬死请求在发出 0-2 秒内出现 `physical-call-started`，事件包含 phase、attempt、timeoutMs。
- 悬死结束后 API call 不再是 running；导出 deep trace 无 `running` API call。
- `physicalCalls` 数量与事件 start/finish 对账一致。

### Phase 2：请求级停滞接管（P0）

改动点：

1. 新建统一 `ToolRunSupervisor`（建议位置 `src/services/toolRunSupervisor.ts`），不把执行器写进 runTrace store；runTrace 仍是观测层。
2. Supervisor 持有：
   - `AbortController` 引用；
   - `startedAt`、`lastProgressAt`、`timeoutMs`、`hardDeadlineMs`；
   - `progressToken` 判定：工具调用开始/结束、流式 chunk、reasoning 均可重置 `lastProgressAt`；
   - `hardDeadlineMs` 为总上限，进度不重置。
3. 触发条件：
   - idle 超过请求级 idle timeout；
   - 或到达 hard deadline；
   - 或连续同类失败达到阈值。
4. 觫发动作：
   - `abort()` 当前请求；
   - 抛出可分类 `ToolRunTimeoutError` / `ToolRunNoProgressError` / `ToolRunRepeatedToolError`；
   - 写入 `state-stuck-aborted` 事件与 stateHistory；
   - 通知 UI 状态；
   - 写 DiagLogger；
   - 组件 catch 按用户语言显示“已超时中止，请缩小范围或分段处理”。
5. 观测层 run 级 watchdog 保留，只做兜底观测；不得承担业务终态改动。
6. 取消传播链路检查：`cancelGeneration()` abort → main-process fetch abort → runTrace 闭合。
7. 对话入口 retry 策略收敛：
   - 大纲工作台 direct 对话工具轮默认 `retry: false`；
   - 或单轮 timeout 收敛到可解释配置（例如 120-180 秒），需与用户确认。

验收：

- 悬死场景：mock 不返回时，在请求级 idle timeout 内 UI 显示停滞并自动中止，不再无限等待。
- hard deadline 场景：即使持续有工具活动，到达总上限也会中止。
- 中止后 run/turn/apiCall/physicalCall 全部闭合，导出无 running。
- 事件顺序：`physical-call-started` → `state-stuck-aborted` → 终态。
- DiagLogger 与 runTrace 事件类别/数量对账一致。

### Phase 3：工具错误自纠错与无进展收束（P1）

改动点：

1. `editor.reveal` 参数校验失败返回：
   - 正确格式示例；
   - `target` 支持类型的说明；
   - 结构摘要或候选结构锚点（例如卷/章/节标题摘要）；
   - 连续失败计数。
2. `callAiWithTools()` 维护：
   - `consecutiveToolOnlyRounds`；
   - 同一工具同错误码连续次数；
   - 读取内容 hash 集合，识别零新信息；
   - 收束 injection：一轮 warning，下一轮强制 summary 指令；再失败即终止。
3. 终态原因不折叠：
   - `no_progress`；
   - `repeated_tool_error`；
   - `tool_loop_limit`；
   - `stuck_timeout`；
   - `hard_deadline`。
4. 状态同步 API 对话框、runTrace、DiagLogger，符合 M22。

验收：

- reveal 连错 2 次内，下一轮参数正确或触发收束。
- 同工具同错误 3 次触发 `repeated_tool_error` 终止。
- 连续纯工具轮不再只有一次 warning，会进入收束。
- 所有终态原因在 UI、trace、诊断日志三处一致。

**长文档结构底座（P2，本轮只立项不实施）**

新增只读工具：

- `outline.structure_map`：卷/章/节标题、层级、字符区间、字数。
- `outline.read_range`：按区间或节点读取，严格限制单次返回长度。

后续与意图路由、长上下文共创底座配合，先以结构地图预注入/按需读取减少盲查。

### 已识别但本轮不修的边界

1. **outline/主页对话输入区复用与 UI 微调**：本轮只做生命周期、停滞接管和可读状态，不改输入区布局与发送模式。
2. **主页编辑器同款入口的全量 UI 呈现**：本轮只验证生命周期记录不回归；主页如果要获得同款停滞接管和请求级状态展示，作为下一批“同款折叠统一”立项，不在本次混改。
3. **长期记忆/对话上下文压缩**：不在本轮修改范围，防止与 tool-loop 生命周期修复相互干扰。
4. **模型/供应商自身不返回**：无法由应用保证返回，应用目标改为“可见、可中止、可诊断、可给出下一步”，不承诺模型一定成功。

### Phase 4：UI 与日志补齐

改动点：

1. 大纲工作台 API 对话框显示：
   - 当前物理请求序号、阶段、attempt、已等待时间；
   - 停滞提示与自动中止结果；
   - 可读下一步建议。
2. 停滞/超时/无进展事件同步 DiagLogger。
3. 运行记录面板能看到每个物理请求开始与结束，悬空请求不再黑洞。
4. 保留现有工具过程流，不回退 09-14 已交付的可见性。

验收：

- 悬死场景用户不用打开运行记录即可看到等待阶段和超时接管。
- trace 导出后每个物理请求 start/finish 或 start/abort 对账完整。
- 主页编辑器入口同款生命周期记录不回归。

## 影响范围矩阵

| 模块 | 文件 | 是否修改 | 说明 |
|---|---|---|---|
| 物理请求生命周期 | `src/services/aiService.ts` | 是 | running 事件、attempt 唯一 ID、工具轮收束 |
| 运行记录 | `src/stores/runTrace.ts` | 是 | 物理记录 upsert、导出文案、事件 |
| 状态看门狗 | `src/services/stateWatchdog.ts` | 是 | 请求级参数与 run 级观测保留 |
| 执行器 | 新增 `src/services/toolRunSupervisor.ts` | 是 | 停滞接管与强制闭合 |
| 大纲工作台 | `src/components/common/OutlineWorkspace.vue` | 是 | supervisor 接线、UI 状态、retry 策略 |
| 编辑器工具 | `src/services/editorTools.ts` | 是 | reveal 自纠错反馈 |
| 主页编辑器 | 相关入口 | 可能 | 只做不回归验证，除非生命周期 API 形状要求显式适配 |
| 流水线 | 相关入口 | 否 | 不改策略，跑既有回归确认无破坏 |
| 测试 | 单测 + E2E | 是 | 新增悬死/超时/重复错误/取消/导出对账 |

## 执行顺序

1. Phase 0：门禁复读、基线测试、影响圈声明、DEV_LOG。
2. Phase 1：物理请求开始记录与 trace/DiagLogger 双侧覆盖。
3. Phase 2：ToolRunSupervisor 生命周期接管。
4. Phase 3：reveal 自纠错、无进展收束、状态机细分。
5. Phase 4：UI 与运行记录展示补齐。
6. 全量验证矩阵。
7. M17 回头看与收尾。

## 验证矩阵

| 场景 | 验证方法 | 通过标准 |
|---|---|---|
| 悬死请求 | 真实 Electron + mock hold 不返回 + CDP | 请求开始可见；idle timeout 内中止；run/turn/apiCall/physical 全闭合 |
| hard deadline | mock 持续工具活动但无正文 | 到达总上限终止，原因 `hard_deadline` |
| reveal 重复错误 | mock 连续返回非法 target | 第 2 次内自纠；否则 `repeated_tool_error` 终止 |
| 无进展收束 | mock 连续 tool_calls 且零新信息 | warning → summary 注入 → 终止或收束回答 |
| 用户取消 | 真实点击取消 | canceled 终态保留，物理记录闭合，无 success 覆盖 |
| 工具轮重试 | timeout/429 mock | 对话入口不静默 15 分钟等待，attempt 与 reason 可见 |
| 三层对账 | deep trace 导出 | turn/apiCall/event/physical 工具集合一致，无 running |
| DiagLogger | 日志文件或诊断面板 | 与 runTrace 事件类别和数量对账一致 |
| 回归 | 三入口 E2E | 大纲、主页、流水线主链路不回归 |
| 构建 | type-check/build | exit 0 |

## 不改变项

1. 不设 token 预算，不以省 token 为由削减上下文。
2. 不把观测层 runTrace 变成执行层。
3. 不删除或回退 09-14 工具过程可见性修复。
4. 不在本次实施 P2 长文档结构索引。
5. 不改变流水线生成策略，只做回归验证。

## 风险与防跑偏

| 风险 | 等级 | 缓解 |
|---|---|---|
| Supervisor 抢业务终态，与统一归并函数冲突 | 高 | 只通过 abort + 可分类错误让既有 catch 收终态；watchdog 仍观测；终态仍由 finishRun/finishApiCall 收口 |
| running 物理记录残留 | 高 | physicalCallId upsert + finish 时清理；导出前完整性检查 |
| 大纲入口改动影响主页/流水线 | 高 | 生命周期改动放服务层共享，入口只接线；三入口 E2E 必跑 |
| 收束指令污染正常多工具任务 | 中 | 先 warning，再 summary 注入；工具成功和流式输出重置 idle；hard deadline 保护总时长 |
| 超时参数过短误杀长生成 | 高 | 默认只影响 direct 对话工具轮；流水线不受影响；配置需用户确认 |
| reveal 候选返回过大 | 中 | 候选只返回标题/区间摘要，不返回全文 |

## 回头看清单

1. 用户原始目标：tool-loop 悬死必须可见、可中止、可闭合，不允许用户盲等。
2. 生产入口全量盘点：`rg` 全仓 `callAiWithTools / onPhysicalCall / startStateWatchdogForRun / editor.reveal`，确认大纲、主页、流水线没有第三入口漏接。
3. 同款逻辑双向扫描：`src` 与 `scripts` 均搜 running 物理请求、watchdog abort、reveal 错误反馈，避免只修当前触发点。
4. 日志对账：runTrace + DiagLogger 类别和数量一致。
5. 导出对账：deep trace 无 running API call/turn/run，payload 数量一致。
6. 回归证据属于本轮：单测、type-check、build、三入口 E2E、真实 Electron 悬死/超时/取消场景。
7. 经验文件与 DEV_LOG 回写。
