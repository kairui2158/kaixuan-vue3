# 大纲编辑器 V6.3 防卡死与响应保活方案

> 版本：V6.3（供审核，未执行；在 V6.2 覆盖面补账基础上，把七个半成熟断点推到可实现、可验证的接线规格）
> 目标原话：必须在不损失应用功能的前提下保证应用不会失去响应、不会卡死。
> 基线：V4 污染守卫/终态单源/账本 + V5 防冻结六层。V5 结论为“可检测、可提示、可止损”，但不满足“结构性不失去响应”。

## 0. 为什么 V5 不够

V5 的核心仍是渲染进程内自救。真实事故里主线程一旦被长任务压住，渲染进程内的 watcher、PerformanceMonitor、UI 提示全部同时停摆；API 流也在同一个渲染进程，界面冻结时流接收与持久化一起停。因此 V6 必须把“流所有权”和“渲染负载”拆开，而不是继续调阈值。

已钉住的代码证据：

- `src/stores/project.ts:781-821`：`persistProject` 每次把 `outlineChat` 全量并入项目 JSON，`appendOutlineChat` 每次触发 `saveProject`。队列只合并写请求，不缩小序列化体。
- `src/components/common/OutlineWorkspace.vue:3840-3851`：`watch(messages)` 对整个消息容器跑 `enhanceCodeBlocks`；`watch(streamingContent)` 也对流式消息重复高亮。
- `src/components/common/OutlineWorkspace.vue:3000`：流式渲染走 120ms 全量 Markdown 重渲染。
- `src/stores/runTrace.ts:1532-1541`：`addEvent` 每条事件 `run.events.reduce` 扫最大 seq，事件量大时是热点。
- `src/services/performanceMonitor.ts`：现有监控只记录，不降级、不接管、不保活；且位于渲染进程，进程冻结时无法自救。
- `src/components/common/OutlineWorkspace.vue:5146-5185`：`awaiting_user` 会写 routing fallback，但 9.3 小时事故证明“等待用户”可以被 UI 继续呈现为生成中，输入解锁与常驻提示不足。
- `electron/ipc/diag.js:111`：`diag:write` 在主进程 `appendFileSync`；`storage.js:137-143` 在主进程序列化写盘。渲染进程阻塞不会阻止主进程写诊断，但无法救活渲染。

## 1. V6 核心目标

1. 功能零删减：所有现有按钮、SKILL、Agent、直写、终稿、回滚、trace、导出能力保留。
2. 用户输入永远可响应：长生成期间点击、输入、取消、切换页面均不进入不可操作状态。
3. 流不丢：渲染进程卡顿、降级或崩溃时，供应商流仍在主进程/UtilityProcess 缓冲，恢复后接续，不丢字。
4. 假卡死清零：`agent_needs_user`、意图确认、超时、等待人工输入都必须有常驻、明确、非阻塞的 UI 状态。
5. 主线程预算：输入反馈 ≤100ms；任何单次长任务 ≤200ms；冻结必须可见、可诊断、可自动降级。

## 2. 分层方案

### 0. 反推审计结论

V6 的方向成立，但按原文直接执行会引入新的并发缺陷。V6.1 追加 12 条并发防错条款；V6.2 再按“组件、线路、语义、链路”四面复盘，追加 6 条应用覆盖面结论。未满足不得进入对应 Phase。

#### 0.0 V6.2 全应用覆盖面补账

上一轮 V6.1 只覆盖了大纲编辑器主线，未把并行流水线、存储闭包、关闭流程、备份链路全部纳入影响圈。本轮补账如下，均为必须进方案的硬条款：

13. **并发调度与流所有权必须同层迁移**
    - 证据：`src/services/providerScheduler.ts:101-155` 与 `src/services/aiService.ts:2294-2307` 显示供应商并发调度器在渲染进程，默认每供应商并发 2。`electron/ipc/api.js:93-192` 显示 `providerNet:stream` 在主进程直接发起 fetch 并向渲染进程推送 chunk。
    - 风险：只迁流所有权、不迁调度器，会形成“主进程无限并发 + 渲染进程限流语义失效”的双语义系统；V3.3 流水线并行会把物理请求数放大。
    - 防错：主进程 stream registry 必须统一持有 providerId、runId、并发上限与队列状态；renderer scheduler 只保留 UI 队列展示，不再是权限事实源。调度快照与 trace 同源，禁止两套 active/waiting 数字。

14. **journal 化必须覆盖导入导出闭包**
    - 证据：`src/components/settings/AppearanceSettings.vue:188-224` 通过 `storageList + storageRead` 全量导出所有 key，导入逐 key `storageWrite`。journal 若只是新 key 而不进 `storageList`，备份会丢聊天；若进 `storageList` 但仍是全量对象，会继续全量序列化。
    - 防错：journal key 必须进入 `storageList`，导出/导入按 journal 快照 + 增量段原子处理；导入必须与项目主文件版本、messageId、journal checksum 做兼容校验，失败时不得半写。

15. **上下文读取器必须与 journal 同批改造**
    - 证据：`src/services/conversationContextService.ts:453-464` 直接读取 `project_${projectId}`，读取字段为 `outlineText/settingsCollection/memories`，不读 `outlineChat`。当前无直接坏点，但 journal 化同时改主项目文件结构，必须把该读取器纳入回归。
    - 防错：为 defaultProjectReader 增加旧主文件（含 outlineChat）与新主文件（无 outlineChat）双态测试，防止迁移后上下文组装静默变薄。

16. **关闭流程必须同时 flush journal**
    - 证据：`src/services/appShutdown.ts:31-56` 目前顺序为取消流水线 run、flush runTrace、全量 `saveProject`；没有任何 journal flush 概念。`src/components/common/ExitConfirmModal.vue:70-75` 的最终保存也调用 `saveProject`。
    - 防错：journal 化后 `shutdownApplication` 与最终保存都必须显式等待 journal flush ack，并把 journal flush 错误并入返回的 `flushErrors`，否则关闭场景默认丢尾消息。

17. **输入门控三态语义必须收口**
    - 证据：`src/components/common/OutlineWorkspace.vue:2956-2965` 有 `outlineInputUnlockedByAgent`、`outlineSendStarting`、`outlineInputBlocked/outlineExecutionLocked`；`4624-4648` 的 `sendMessage` 只用 `outlineSendStarting + outlineInputBlocked` 防重复；`5849-5858` 的 `interactive_response` 解锁输入；`885-890` 的 `continueOutlineRouting` 又用 `isGenerating` 拦截续跑。
    - 风险：等待态放开输入后，同一输入框可能承载“新任务、续跑 run、agent 交互回复”三种语义，靠零散布尔值组合容易双开 run 或误把回复当新任务。
    - 防错：输入门控收敛为单一 InputGate 模块，显式状态 `new_run/resume_run/agent_reply/free`；每个状态定义允许的动作与 run lease 校验，UI 与执行入口消费同一状态机，trace 记录每次状态迁移。

18. **trace 聚合必须按 run 隔离**
    - 证据：V3.3 已落地 run registry 并支持并行 run；`src/stores/runTrace.ts:1532-1541` 的 seq 记忆化按 run 分桶，但高频 stream 聚合尚未落地。
    - 防错：stream/事件聚合必须带 runId，聚合器不能跨 run 合并；trace 导出器按 run 快照，避免并行时把 A run 的末事件接到 B run 的速度曲线。

19. **双窗口表述修正**
    - 证据：`electron/main.js` 已有同项目 `lockedProjects` 锁，第二窗口会被聚焦回已有窗口；同时 `render-process-gone` 已广播恢复通知。
    - 修正：不新造窗口接管协议。复用现有项目锁，orphan stream 恢复保持“单窗口独占”；`unresponsive/responsive` 监听接入现有主进程事件层，不另建第二套恢复通知。

20. **Memory 备份与项目写队列必须保持边界**
    - 证据：`src/components/common/MemoryPanel.vue:997-1008` 的备份只操作 `memoryBackup_${projectId}`，不触碰 outlineChat；`src/stores/project.ts:834-857` 的保存队列仍会全量写 project key。
    - 防错：journal 化不得把 Memory 写入并入 journal；两者共享主进程按 key 写队列与原子写机制，但 journal 段、压缩段、memory 备份保持独立 key 与独立 checksum，防止一个域的恢复逻辑误恢复另一个域。

#### 0.1 已核实的现状修正

- 应用已经存在主进程网络通道：`electron/ipc/api.js` 的 `providerNet:stream` 在主进程持有 `fetch/ReadableStream`，渲染进程通过 `providerNet:streamChunk` 订阅增量。因此 V6 不是“从零迁移”，而是把“主进程转发流”升级为“主进程拥有可恢复的流状态”。
- 当前主进程流没有 checkpoint、没有渲染进程冻结时的有界缓冲；chunk 直接 `event.sender.send`，渲染进程越忙，IPC 队列和渲染内存越膨胀。
- `project.ts` 的 `persistProject` 每次把 `outlineChat` 全量并入项目 JSON；即使拆成独立 key，只要渲染进程仍把全量聊天通过 IPC 传给主进程，结构化克隆成本仍会压住渲染进程。journal 必须是“单条增量 IPC”，不是“换一个 key 的全量写入”。
- `runTrace.addEvent` 已有 `lastMaxEventSeqByRunId` 记忆化，但失败/回退路径仍会 `reduce` 扫全量 events；方案表述需修正为“关闭回退扫描，在 run 加载/导入时重建 seq 索引”。
- `render-process-gone` 已有主进程监听，但 `unresponsive/responsive` 尚未接入；安全模式不能只依赖渲染进程自救。

#### 0.2 并发坏点与防错条款

1. **等待态解锁不得造成双开任务**
   - 风险：`awaiting_user` 后 `isGenerating=false`，用户输入若被当作新请求，会和暂停中的 run/resume token 形成并发双跑，进而重复写大纲。
   - 防错：等待态消息携带 `runId/resumeToken`；输入框在等待态绑定“续跑当前 run”，不允许静默创建第二个 run。发起前必须通过 run lease 校验，取消/过期/已完成时才降级为新任务，并在 trace 记录决策。

2. **主进程流缓冲必须有界**
   - 风险：渲染进程冻结时，主进程若无限缓存增量，会把“UI 卡死”转换成“主进程/渲染进程 OOM”。
   - 防错：每条流设 ring buffer 上限与字节水位；超限后主进程进入 backpressure 状态，只保留 checkpoint、长度、速度、最近尾部；恢复时显示“显示层曾降级”，但已消费并 checkpoint 的文本不丢。禁止无界数组。

3. **流所有权必须有生命周期租约**
   - 风险：渲染进程崩溃后主进程流可能变成孤儿，继续消耗供应商额度；重启后又可能双窗口消费同一条流。
   - 防错：主进程 stream registry 记录 `streamId/windowId/projectId/createdAt/heartbeat`；渲染进程心跳，窗口关闭或 `render-process-gone` 时进入 orphan 状态，只保留 checkpoint，不继续向供应商请求；恢复消费必须独占锁定，第二窗口只能查看状态，不能接管。

4. **恢复态不得把 partial 直接当 final**
   - 风险：崩溃恢复后把 checkpoint 文本直接追加为 assistant 成品，会重演“旧产物/降级产物被当有效输出”的事故。
   - 防错：checkpoint 文本进入 `recovering/partial` 状态；只有主进程收到供应商 `end` 且渲染完成验收，才允许转 success。恢复界面必须提供“继续接收 / 丢弃本段 / 保存为草稿”三类动作，不允许自动冒充完成。

5. **journal 必须替代索引式突变**
   - 风险：现有 `appendOutlineChat/removeOutlineChatAt/updateOutlineChatAt` 和模板 `:key="i"` 都是索引语义；journal 并发追加、回滚、重开会把索引错位写成数据错位。
   - 防错：消息引入稳定 `messageId`；journal 事件使用 `append/patch/remove/replace` 操作记录，UI 渲染与按钮回调全部改用 messageId。旧项目迁移时为每条消息补 id，保留 `.bak`。

6. **journal 写入必须可确认，不允许静默丢消息**
   - 风险：append journal 只入内存不落盘，进程退出或 IPC 失败时会丢最后几条聊天。
   - 防错：主进程 journal append 返回持久化 ack；未 ack 的消息在 UI 标记 `pending`，批次完成、取消、关闭、崩溃恢复时强制 flush。journal 文件使用原子写/追加段 + checksum，启动时校验并生成恢复报告。

7. **虚拟化不得破坏行内操作**
   - 风险：消息行内存在回滚、续跑、追加预算、终稿控制等按钮；直接虚拟化会让按钮卸载、索引回调错位、滚动定位漂移。
   - 防错：先组件化单条消息，按钮回调绑定 messageId；虚拟化容器维护可见区与锚点，滚动定位、复制全文、回滚、批次 diff 全部列入真实 UI 回归。禁用 `document.getElementById` 式消息定位。

8. **Worker 渲染必须处理竞态与失败回退**
   - 风险：异步 Markdown/高亮结果返回时消息已被更新或组件已卸载，会把旧 HTML 写进新内容；Worker 初始化失败会造成空白消息。
   - 防错：每次渲染携带 `messageId + contentVersion`，返回时校验版本，过期结果直接丢弃；Worker 不可用时回退到同步轻量渲染并记录 trace warning。流式渲染只处理尾窗，不做全量高亮。

9. **安全模式必须可见且可退出**
   - 风险：自动降级会掩盖真实缺陷，也可能在用户复制/操作长文时误触发。
   - 防错：安全模式进入/退出都写 run trace 与诊断日志；UI 常驻状态说明当前被降级的只是显示层，输入、取消、导航保持可用。主进程 `unresponsive` 使用连续阈值 + hysteresis，避免单次抖动误报；恢复后自动退出但保留事件记录。

10. **主进程不得引入新的同步 IO/热点**
    - 风险：把流、journal、checkpoint 全放进主进程后，如果用同步写盘或每 chunk 全量 JSON，会把应用级卡死转换成主进程卡死。
    - 防错：主进程新增路径全部使用异步 IO 与按 key 写队列；checkpoint 按字节水位/时间节流；禁止在流 chunk 路径做同步 `appendFileSync`。providerNet 的 trace 开关默认关闭，开启时也只记录摘要，不逐 chunk 全量序列化。

11. **输入保活优先于消息渲染**
    - 风险：只迁移流所有权仍无法保证输入响应，Vue 主线程仍可能被大 `v-html`、Shiki、全量 watcher 阻塞。
    - 防错：输入区与消息列表组件隔离；流文本使用非深层响应式 buffer，只把尾窗暴露为响应式；任何渲染任务超过 200ms 必须分片让出事件循环。输入框、取消按钮、页面切换不得等待消息渲染完成。

12. **trace 语义不能因聚合丢失审计能力**
    - 风险：高频事件聚合后，事故复盘会丢掉关键时序。
    - 防错：聚合必须保留首事件、末事件、计数、字节量、速度曲线与错误样本；`physical-call` 的状态迁移和终态仍逐条记录。导出器兼容旧字段，新增聚合字段只做扩展，不删除旧语义。

#### 0.3 V6.1 对原方案的执行修正

- A 层目标改为：升级现有 `providerNet:stream` 为主进程 stream owner registry，不重复造第二套网络协议；UtilityProcess 只在 Phase 0 证明主进程存在网络/序列化争用时才启用。
- B 层目标改为：先做“稳定 messageId + 单消息组件”，再做虚拟化与 Worker 渲染；禁止在旧索引语义上直接套虚拟滚动。
- C 层目标改为：journal 走单条增量 IPC + 主进程原子持久化；`persistProject` 彻底移除 `outlineChat` 字段，并同步改造关闭 flush、导入导出、重置对话、回滚。
- D 层目标改为：`addEvent` 以记忆化 seq 为单源，run 加载/导入时重建索引；正常路径禁止全量 reduce。
- E 层目标改为：等待态输入绑定 resume token，不允许双开 run。
- F 层目标改为：主进程 `unresponsive/responsive/render-process-gone` 三事件统一进入 Responsiveness Ledger，安全模式只降显示负载且全程可见。

### A. 流所有权迁移（结构性根修）

把供应商请求与流式接收从渲染进程迁到 Electron 主进程或 `UtilityProcess`：

- 主进程持有请求、AbortController、流缓冲、断流 watchdog、心跳、partial checkpoint。
- 渲染进程只订阅增量，不负责网络与流保活。
- 渲染进程冻结或崩溃时，主进程继续收流并写 checkpoint；恢复后按 `streamId + cursor` 续接。
- 取消、重试、切换供应商仍由 UI 触发，语义不变。
- API key 读取与遮蔽逻辑随迁移保持现有安全语义，trace 仍记录真实物理请求。

迁移策略：先在 `aiService` 增加主进程 stream owner 适配层，渲染路径保留为兼容回退；验证稳定后删除回退并按 G0.10 做旧路径负向断言。

### B. 渲染负载重构（不牺牲显示能力）

1. 消息列表虚拟化：使用已注册的 `vue-virtual-scroller`，历史消息按视口渲染；功能按钮和批次操作仍可用。
2. 流式渲染只画“尾窗”：超过 20K 后不再全量 Markdown，显示尾部窗口 + 长度/速度状态；完成后再完整渲染。
3. Markdown/高亮异步化：`renderMarkdown` 与 Shiki 高亮移入 Worker；`enhanceCodeBlocks` 不再每次对整个容器执行。
4. 历史消息高亮一次完成：`watch(messages)` 改为只处理新增消息，不重刷旧消息。
5. 大消息组件隔离：长消息内部分块渲染，单条消息不再迫使整个列表重排。

### C. 持久化拆分（消灭全量 JSON 放大）

1. `outlineChat` 独立存储 key，改为 append journal；项目主文件不再携带全量聊天。
2. journal 由主进程合并压缩，渲染进程只提交增量消息。
3. 保存节奏：输入即时入内存；journal 增量低频落盘；批次完成、取消、退出强制 flush。
4. 兼容迁移：启动时检测旧项目文件中的 `outlineChat`，迁入 journal 后主文件移除该字段，保留 `.bak`。
5. 回滚、重置对话、导入项目仍按现有功能语义操作 journal。

### D. trace 事件去放大

1. `addEvent` seq 改 O(1) 记忆化，去掉每条 `reduce`。
2. `physical-call` 状态改节流补丁，不做每状态全量事件。
3. 高频 stream 活动聚合为状态行，不逐条入 events。
4. 导出与 diff 序列化移到主进程/Worker，渲染进程不再承担大 JSON 组装。
5. 保留现有 trace 字段语义与导出格式，验证器按新采集频率对账。

### E. 等待状态与假卡死治理

1. `agent_needs_user` 立即进入非阻塞终态：显示常驻“等待你确认/回复”横幅，输入解锁，`isGenerating=false`。
2. run 状态保持可续，不把等待伪装成 running，也不取消上下文。
3. 意图确认、权限确认、预算等待、供应商选择等待统一走同一个 `awaiting_user` UI 协议。
4. 超时和 watchdog 提示必须给出下一步动作，不允许只有“生成中”。

### F. 响应看门狗与安全模式

1. 渲染进程内：`PerformanceMonitor` 升级为 Responsiveness Supervisor，200ms 长任务计数、2s 冻结提示、5s 自动安全模式。
2. 安全模式下自动降级渲染：停止高亮、切换尾窗渲染、暂停 trace 高频事件、保存降频，但输入和取消按钮保持可用。
3. 主进程侧：监听 `webContents.unresponsive/responsive/render-process-gone`。渲染无响应时主进程记录现场并可显示原生提示，不依赖渲染进程自救。
4. 由于 A 层已迁移流所有权，主进程看门狗触发不会丢流，只影响显示。
5. 崩溃恢复：重启后从 checkpoint 恢复流、trace、聊天状态，用户可选择继续或停止。

## 3. 执行阶段

V6.1 对各 Phase 追加以下通过条件：

- Phase 1 增加：等待态输入必须绑定 `runId/resumeToken`，单测覆盖“用户在等待态发送消息不会创建第二个 run”；等待态发出、取消、切页均可操作，且 trace 记录 lease 决策。
- Phase 2 增加：消息必须先有稳定 `messageId` 与单消息组件；虚拟化后回滚、续跑、追加预算、终稿控制按钮逐项真实 UI 回归；journal append 有 ack、有 pending 标记、有崩溃恢复报告；Worker 渲染有 `contentVersion` 竞态测试和同步回退测试。
- Phase 3 增加：stream registry 必须有 `streamId/windowId/projectId/heartbeat/orphan` 生命周期测试；主进程 ring buffer 有水位测试；模拟渲染冻结 1s/5s/30s 时主进程内存增长有上界；模拟双窗口打开同项目时第二窗口不能接管流；崩溃恢复后的 checkpoint 必须处于 `recovering/partial`，不得自动写成 success。
- Phase 4 增加：主进程 `unresponsive/responsive/render-process-gone` 三事件必须写入同一 Responsiveness Ledger；安全模式进入/退出有 trace 事件与 UI 可见状态；注入阻塞的测试必须断言输入延迟和取消按钮可用性，而不是只断言日志存在。
- Phase 5 增加：并发回归必须包含“等待态续跑 + 新任务发起”“渲染冻结 + journal 追加”“渲染崩溃 + 流恢复”“双窗口同项目”“安全模式中复制长文”五类组合场景。

### Phase 0：只读基线与性能采样

产出：

- 100K/300K/1M 字符消息列表、5K/20K 事件、10K/50K 聊天消息的渲染与保存耗时基线。
- 用 CDP 采集 Long Task、帧率、输入延迟、内存。
- 验证脚本具备超时、阶段日志、失败现场保留。

门禁：未建立基线不得开始优化，防止“感觉变快”。

### Phase 1：等待状态与输入保活

改动：

- `awaiting_user` 常驻横幅、输入解锁、`isGenerating=false`。
- 统一等待态来源，禁止 run 继续以 running 语义表示等待。

验证：

- 单测覆盖所有进入 `awaiting_user` 的入口。
- Electron UI 真实验证：真实点击、真实输入、真实选择 SKILL，不允许注入业务状态冒充用户操作。
- 断言等待时发送、取消、切换页面均可用。

### Phase 2：渲染与持久化减负

改动：

- 消息虚拟化、尾窗渲染、Worker Markdown/高亮、新增消息增量高亮。
- `outlineChat` journal 化、主文件瘦身、旧数据迁移。
- `addEvent` O(1) 化、physical-call 节流。

验证：

- 大文本场景输入反馈 ≤100ms。
- 历史消息完整可查、复制、回滚、批次操作不变。
- 重启后聊天与项目数据零丢失，旧项目迁移有 `.bak`。
- trace 导出字段与旧导出器兼容。

### Phase 3：流所有权迁移

改动：

- 主进程/UtilityProcess stream owner、流 checkpoint、崩溃恢复。
- `aiService` 适配层 + 兼容回退。

验证：

- 模拟渲染阻塞 1s/5s/30s，流继续增长且恢复后无丢字。
- 模拟渲染崩溃，重启后可从 checkpoint 接续。
- 真实 API 长流验证：使用应用内置默认供应商与 key，SKILL 通过真实 UI 下拉选择。
- 网络断流、取消、重试、权限拒绝路径全部保留原语义。

### Phase 4：看门狗与安全模式

改动：

- Responsiveness Supervisor、主进程 `unresponsive` 监听、安全模式降级、恢复提示。

验证：

- 人为注入 250ms/1s/5s 阻塞，断言 UI 警告出现、安全模式生效、取消按钮仍可响应。
- 主进程看门狗能记录冻结现场并写诊断。
- 安全模式退出后渲染完整恢复，不丢功能。

### Phase 5：全链路回归与收尾

验证：

- 大纲讨论、SKILL/Agent、直写、终稿、取消、重试、回滚、trace 导出、项目切换、重启恢复全链路回归。
- 真实 UI + 真实 API 长流 + SKILL 加载验证。
- 经验文件、DEV_LOG、任务台账、版本号、工作区清理同步收尾。

## 4. 风险与反证

补充 V6.1 专属反证：

- 若 Phase 3 出现主进程 CPU/内存随流长度线性增长，则证明 stream owner 仍做了逐 chunk 全量处理，必须先修 checkpoint 与 ring buffer，不得进入 Phase 4。
- 若 Phase 2 后消息索引操作出现错位或按钮失焦，则证明虚拟化未完成 messageId 化，必须回退虚拟化开关，不允许带病保留。
- 若等待态放开输入后出现两个 active run，则 Phase 1 视为失败，等待态必须收回“输入即新任务”的语义。
- 若安全模式触发后用户无法复制或取消，则安全模式实现违背“只降显示负载，不删功能”，必须重修。

- 主进程 stream owner 是本方案最大改动，可能触碰 IPC 延迟、key 安全、错误传播、trace 一致性。反证方式：Phase 3 单独设兼容回退与崩溃恢复测试，未通过不得删除旧路径。
- journal 化可能影响项目导出/导入。反证方式：导出导入专项测试，旧项目迁移保留 `.bak`。
- 虚拟化可能影响滚动定位、批次 diff、消息操作按钮。反证方式：功能清单逐项真实 UI 回归。
- Worker 高亮可能引入异步竞态。反证方式：取消、快速切换、完成时刻的截图与 DOM 断言。

## 5. 成熟度评估（G0.6）

- 执行器/工具层：成熟。现有 VueVirtualScroller、PerformanceMonitor、Electron IPC、runTrace 导出均存在，可复用。
- 应用方案/交互闭环：成熟。等待态、安全模式、崩溃恢复均有明确用户可见行为。
- 实现接线：成熟。V6.3 已把 watchdog、SSE 解析、调度器、双协议、journal、InputGate 全部推到“现有函数 + 新函数 + 数据结构 + 双写窗口 + 删除旧路径条件”的接线规格，不存在无入口的架构描述。
- 验证标准：成熟。基线、注入阻塞、真实 UI、真实 API、崩溃恢复、数据零丢失均机器可判定。

结论：V6 原方案会引出 12 类并发坏点；V6.1/V6.2 已将它们全部转成硬门槛与反证条款；V6.3 补齐实现接线断点。方案可执行，仍按 Phase 0-5 推进；未完成 Phase 3 前不得宣称“结构性不失去响应”。

## 5.1 V6.3 接线规格（消除半成熟断点）

上一版“实现接线：半成熟”的实质是七个断点。V6.3 逐项给出落地接线，每项都锚定现有代码入口。

### 断点 1：watchdog 仍在渲染进程

**现状**：`src/services/aiService.ts:1977-2075` 的 idle / progress / first-output / body-absent watchdog 全部是渲染进程 `setTimeout`；渲染冻结时定时器停摆，流会被误判为活着。主进程只有 `electron/ipc/api.js:9` 一个 idle timeout，语义远少于渲染层。

**接线**：

1. 在 `electron/ipc/api.js` 新增 `createProviderNetWatchdog(options)`：输入 `streamId/providerId/runId/slowStreamTolerant/timeoutMs/firstOutputTimeoutMs`；内部维护 idle、progress、firstOutput、bodyAbsent 四类计时器，语义与渲染层同名常量一一对应。
2. `providerNet:stream` 在创建 AbortController 后启动 watchdog；每次 `reader.read()` 返回后调用 `watchdog.markActivity(kind)`，kind 按 SSE 增量分类为 `content/reasoning/tool`。触发时写 `provider-net-watchdog` 事件、abort 流、保留 checkpoint。
3. 渲染层 `mainNetStream` 删除全部 watchdog 定时器，改为消费主进程事件；现有 timeout 参数继续传入，语义不丢。
4. `electron/ipc/api.spec.js` 增加四类 watchdog 触发断言，并断言“渲染侧不消费事件”不影响 watchdog 生效。

### 断点 2：SSE 解析仍在渲染进程

**现状**：`aiService.ts:2099-2275` 在渲染进程做 SSE 拆行、协议 delta 提取、tool-call 聚合、usage 合并；渲染冻结时 `chunkQueue` 停止消费。

**接线**：

1. 主进程只保留 transport：fetch、read、decode、watchdog、ring buffer、checkpoint。协议解析不复制进 Electron 层。
2. 新建 `src/services/streamContract.ts`：`StreamFrame`（streamId/cursor/transportEvent/text/timestamp/checksum）、`ParsedDelta`、`parseStreamFrames(frames, protocolName)` 纯函数。协议仍单源自 `providerProtocols.cjs`，由构建统一打包，禁止第二份协议实现。
3. `mainNetStream` 改为订阅带 cursor 的 `providerNet:streamFrame`，调用 `parseStreamFrames`，解析循环分片执行，单片 ≤16ms；恢复后按最小未消费 cursor 去重续跑。

### 断点 3：调度器在渲染进程

**现状**：`aiService.ts:2294-2324` 在渲染进程 acquire；`providerNet:stream` 对并发无感知。

**接线**：

1. `providerNet:stream` 请求新增 `providerId/runId/concurrencyPolicy`；主进程新增 `createProviderNetScheduler()`，按 providerId 维护 active/waiting/canceled，默认每供应商 2 并发。
2. handler 入口 acquire，排中队列返回 `queued` 状态帧；渲染层收到 queued 只透传 `onProviderQueue`，不判错、不清流。
3. 渲染层 `providerScheduler` 降级为 UI 快照投影，数据来自主进程 snapshot；删除渲染层 acquire 的权限语义。

### 断点 4：流式与非流式双协议

**现状**：`aiService.ts:2377-2455` 中非流式走 `mainNetRequest`，流式走 `mainNetStream`，错误结构、软错误检测、usage 归一化重复且不完全一致。

**接线**：

1. 新建 `normalizeProviderResponse(response, { protocolName, providerId, purpose })`，统一 ok/kind/statusCode/message/providerErrorSummary/text/raw/usage，并单源处理软错误、quota、零 usage。
2. 两个 transport 都经 normalize 产出结果；协议差异用 `transportKind` 标注，不互相冒充。
3. 现有软错误、quota、零 usage、canceled 用例双态运行（stream / non-stream），期望一致。

### 断点 5：双写与旧路径清理

**接线**：

1. 引入 `SHENYI_STREAM_OWNER_V6` 开关，默认 off；on 时 `mainNetStream` 走 stream owner 协议。
2. 双写窗口内 trace 记录 `streamOwner: legacy | v6`；两态错误、取消、usage 语义必须等价。
3. 删除旧路径条件：V6 路径通过 Phase 3 全部验证（含真实 UI + 真实 API 长流），且生产源码 legacy 标记命中 0。

### 断点 6：journal 接线

**接线**：

1. 新建 `src/services/outlineJournal.ts`：`OutlineJournalCommand = append/patch/remove/replace/migrate/clear`，全部携带 `messageId`；`applyOutlineJournalCommands(snapshot, commands)` 纯函数供 UI、导入导出、恢复共用。
2. preload 增加 `outlineJournal:apply/snapshot/flush`；主进程 `electron/ipc/outlineJournal.js` 实现 append 段文件、周期压缩、原子替换、checksum，复用 `storage.js` 的按 key 写队列模式。
3. `project.ts` 三个聊天函数保留签名，内部改发 journal command；调用方零改动是硬约束。`persistProject` 在 V6 开启后不再写 `outlineChat`，迁移命令搬走旧字段并删除主文件字段，保留 `.bak`。
4. 关闭、导出导入、项目切换全部改为 snapshot + commands；`shutdownApplication` 增加 journal flush，并把错误并入 `flushErrors`。
5. 删除旧路径条件：V6 项目主文件不再含 `outlineChat`；旧文件只允许走迁移分支。

### 断点 7：InputGate 接线

**接线**：

1. 新建 `src/services/outlineInputGate.ts`，状态 `new_run/resume_run/agent_reply/free`，输入 `isGenerating/awaitingUser/runLease/resumeToken/interactiveResponseActive/sendStarting`，输出 `inputMode/canSend/sendTarget/disabledReason`。
2. `outlineInputBlocked/outlineExecutionLocked/sendMessage/continueOutlineRouting/interactive_response` 全部消费 InputGate，不再直接拼布尔；`sendMessage` 按 `sendTarget` 分派新 run、续跑、agent 回复，并写 trace。
3. `sendTarget=resume_run` 必须校验 run lease；失败降级 `new_run` 并写 warning，禁止静默双开。
4. 删除旧路径条件：生产源码中零散布尔组合命中 0；InputGate 单测覆盖四状态 × 取消/完成/过期/崩溃恢复。

## 6. 审核决策点

V6.1 追加决策点：

5. 是否批准等待态输入默认绑定“续跑当前 run”，只有 run 已取消/过期/完成时才降级为新任务？
6. 是否批准主进程流使用有界 ring buffer：渲染冻结超限时不保留全量增量，但保留 checkpoint、统计和尾部，恢复时不丢已 checkpoint 内容？
7. 是否批准消息 `messageId` 化作为虚拟化/journal 的前置硬门槛？
8. 是否批准崩溃恢复后的 checkpoint 默认进入 `recovering/partial`，由用户选择继续、丢弃或保存草稿？

1. 是否批准 V6 以“主进程/UtilityProcess 持有流所有权”作为结构性根修方向？
2. 是否批准 `outlineChat` journal 化并从项目主 JSON 拆出？
3. 是否批准安全模式自动降级渲染（只降显示负载，不删功能）？
4. Phase 3 真实验证是否使用应用内置默认供应商 key，并按 G0.11 用真实 UI 选择 SKILL？
