# 2026-10-10 全文上下文一次成型重构任务台账

## 1. 目标与原话

用户原话：「决策点按你的建议走，开始执行」。

最终可感知行为：在大纲工作台对窗口可容纳全文的长文档执行整理/重排/去重/标点归一时，应用一次注入全文、模型一次输出整篇结果、应用本地原子写入编辑器；不再出现读取循环、`读取 x/y` 进度或滚动膨胀的多轮物理请求。

本轮交付物：

- `single-pass` 执行计划模式及全链路接线。
- 整篇原子结果协议与专用写入入口。
- 权限三元组授权、trace、UI 状态同步。
- 旧 `fits 仍强制 edit-task`、读取放大预算、旧提示词、旧测试契约清理。
- 真实 Electron UI + 真实 API 验证证据。

## 2. 门禁读证

读证文件：`_audit/神意开发经验总结_v7.md`（内部版本 v8.4）。

- G0.1 目标对齐，L20：方案、实现、验证、交付物必须对应同一目标。
- G0.3 诚实闭环，L36：mock/离线证据不得冒充真实链路，完成声明区分已验证/未验证/无法验证。
- G0.5 回头看，L52：收尾前必须对账目标、diff、入口、旁路、日志、测试与真实证据。
- G0.6 方案成熟度，L60：用户已审核通过并批准三个决策点。
- G0.7 正反推研磨，L68：锚定真实用户路径与真实代码入口。
- G0.9 影响圈声明，L84：本任务影响 planner、上下文、协议、工具、授权、UI、trace、测试、脚本、文档。
- G0.10 新旧并存清零，L92：旧 edit-task 假设、读取引导、旧断言不得与新语义并存。
- G0.11 真实交互冒充禁令，L102：UI 验证必须真实点击/输入/选择，不得注入业务状态冒充。
- G0.12 门禁执行台账，L110：七节齐全，禁止口头合规。
- G1.8 日志与观测同步，L192：新执行语义必须进入 runTrace。
- G1.9 状态机与终态收敛，L206：成功/失败/取消终态必须收敛，不得伪装。
- G1.10 权限与安全门，L214：写入授权仍由意图+操作+执行计划三元组单源计算。
- G1.14 深层根因追踪，L248：沿入口→意图→工具面→执行器→服务层→文案→循环→trace→测试追踪。
- G1.15 系统层递进诊断，L256：修复组件组合层互相改写假设的机制层缺陷。

## 3. 路由判定

加入门禁：G0.1、G0.3、G0.5、G0.6、G0.7、G0.9、G0.10、G0.11、G0.12、G1.1、G1.4、G1.5、G1.6、G1.8、G1.9、G1.10、G1.11、G1.13、G1.14、G1.15。

排除项及理由：

- G0.2 无预算铁律：用户此前已明确不设预算；本轮不设置 token/时间/轮次预算，持续按目标完成度推进。
- G0.8 收尾清理：进入收尾阶段执行；当前仅登记，不在实现阶段清理无关脏改。
- G1.7 构建产物新鲜度：在 Electron/build 验证前执行，当前未到该阶段。
- G1.12 封装：用户本轮未要求重新封装；封装另行立项。

## 4. 影响圈与作者反证

打算改：

- `src/services/longDocumentExecutionPlanner.ts`
- `src/services/editorContextPipeline.ts`
- `src/services/conversationContextService.ts`
- `src/services/longDocumentWriteProtocol.ts`
- `src/services/toolRunBudget.ts`
- `src/services/editorTools.ts`
- `src/services/dialogueToolSurface.ts`
- `src/services/aiService.ts`
- `src/components/common/OutlineWorkspace.vue`
- 对应 spec 与真实链路验证脚本。

可能碰到：

- `src/components/chat/ChatPanel.vue`（首页执行模式分支）
- `src/services/agentOrchestrator.ts` / `agentDialogueRuntime.ts`
- runTrace schema 与消费面板
- SKILL handoff 文档
- 既有验证脚本的旧 edit-task 假设。

最可能错的假设与证伪方式：

1. 假设 1M 窗口一定允许一次成型。证伪：planner 决策必须仍是 `fits` 才路由；`needs_segmentation`/`exceeds_provider` 不得进入。
2. 假设模型能一次性输出整篇结果。证伪：协议解析失败时不得落半成品；需保留续写/重试边界并显式失败。
3. 假设专用整篇入口天然安全。证伪：失败、取消、完整性校验失败时编辑器内容必须保持不变。
4. 假设只改大纲即可。证伪：主页编辑器同批对齐，否则违反 G0.10。

## 5. 停止条件

完成条件（全部满足才可声明完成）：

1. `fits` + 整篇整理类操作生产 planner 输出 `single-pass`，超窗文档不进入该模式。
2. 一次成型上下文包含全文标记，不再包含旧读取引导。
3. 一次成型写入入口可提交超过 60,000 字符的整篇结果，且原子成功或失败不落盘。
4. 权限三元组对新模式授权写入；discuss/analyze 仍只读。
5. trace 记录一次成型模式、窗口事实、写入结果与完整性校验结果。
6. 单测、相关全量测试、type-check 通过，输出新鲜可引用。
7. 真实 Electron UI + 真实 API 用 74,293 字大纲完成整理验证，无读取循环，全文发生变化，物理请求显著下降。
8. 回头看扫描旧语义残留清零或分类为历史资料。

失败条件：

- 任一停止条件无法满足且需要改变产品语义时，停止并向用户报告。
- 真实 API 验证发现供应商行为与本方案不兼容且无法通过协议解析/重试收敛时，停止并报告证据。

## 6. 执行证据

（执行中填写，禁止提前填 PASS。）

### 2026-10-11 用户硬性禁令与执行记录

用户原话：「你不要改成只传必填字段重试，API 的输出模式是整段替换和整文重构，你只传必填字段这不是自己给自己绑住手脚么？」

结论：禁止在 single-pass 重试/续写中裁剪请求字段。`messages` 必须继续携带完整大纲全文、完整用户指令、会话上下文与 SKILL 领域能力；`tools=[]` 只用于清除模型侧编辑工具面，不得削减任何上下文字段。已废弃方案：「只传必填字段」式请求精简。

执行证据：

- `npx vitest run src/services/editorTools.spec.ts --reporter=verbose` → 53 passed / 0 failed。
- 修复真实缺口：single-pass 单条 `replace_document` 已在编辑命令白名单处放行；仅该上下文放行，其他编辑命令仍受计划约束。
- 4 个 EditTask 用例不再使用 `100/50`、`90/45` 等假窗口。现在构造真实 `needs_segmentation` 内容，并显式断言 `plan.mode === 'edit-task'`、`plan.decision === 'needs_segmentation'`。

### 2026-10-11 finalDraftService 授权语义修复

失败现象：真实整篇重排在本地完整性门被误拦，导致全文未写入。根因不是权限或工具接线，而是 `finalDraftService` 仍用单一保守假设校验所有终稿：重排/去重/层级归一被当成疑似丢失标题，模型输出中的大段重复也没有按用户授权清理。

修复语义：

- `validateFinalDraft` 接入 `instruction`，按操作与指令计算授权，不再只看单一操作类型。
- `rewrite_segments`、`restructure`、`restructure_and_cleanup` 授权结构性重排；`deduplicate`、`deduplicate_and_normalize` 授权删除重复内容；明确指令才授权标题层级归一。
- 标题边界校验改为比较标题文字；授权重排只拦截缺失标题，未授权操作仍同时拦截缺失与新增。
- `restructure_and_cleanup` 等授权操作可在写前清理大段重复块，并记录 `draft_deduplicated` 事件。
- continuation、整篇写入、segment、structure retry 四条调用链均传入 instruction。
- `heading_boundary_lost` 与 `paragraph_structure_lost` 同样进入一次性结构重试。

离线证据：`npx vitest run src/services/finalDraftService.spec.ts --reporter=verbose` → 59 passed / 0 failed；相关回归 174 passed / 0 failed；`npm run type-check` 通过；`npm run build:vue` 通过（仅既有 Vite warning）。

### 2026-10-11 主页终稿流 OOM 根因与修复归档

失败现象：主页终稿流在长文生成过程中 renderer 内存与持久化写入被持续放大，最终出现崩溃/OOM 风险。

根因（两层叠加）：

1. 聊天消息持久化层直接持有 `FinalDraftTask` 的三份全文字段：`sourceContent`、`completedText`、`accumulatedText`。单个 74K 级任务会让每条 assistant 消息都携带多份全文，流式更新期间放大为持续增长的堆占用。
2. `src/stores/chat.ts` 旧版 `saveSessions` 在每次流式更新时同步执行 `JSON.parse(JSON.stringify(sessions))`，对整个会话数组做深克隆再写盘。全文字段、高频流式事件、全量序列化三者叠加，构成内存与 IO 双重放大，这是 OOM 的系统层根因。

修复（三层）：

1. `src/services/finalDraftService.ts:78-125` 新增 `FinalDraftTaskView` 与 `toFinalDraftTaskView`。持久化层只保存 taskId、状态、分段、字符数、hash 等瘦身字段，永久移除三份全文字段。
2. `src/stores/chat.ts:228` 在 `updateMessageFinalDraftTask` 中将任务转为 view 后写入消息；`src/stores/chat.ts:78-114` 将全量写盘改为 250ms 合并窗口，同一窗口内所有流式更新共享一次快照和一次 `storageWrite`，窗口结束后新窗口可重新开启。
3. `src/services/finalDraftCheckpoint.ts:64-98` 新增 `isFinalDraftTask` 与 `resolveFinalDraftTaskFromView`。continue/resume/retry 三个入口（`ChatPanel.vue:1289-1295`、`1379-1387`、`1453-1461`）均经 checkpoint 恢复完整任务，旧会话中的完整任务仍可兼容。

验证：

- `npx vitest run src/stores/chat.spec.ts src/services/finalDraftCheckpoint.spec.ts src/services/crashMonitor.spec.ts src/services/finalDraftRunner.spec.ts` → 4 files / 40 tests passed（2026-10-11 11:01 本轮新鲜输出）。
- `npm run type-check` → exit 0（2026-10-11 11:02 本轮新鲜输出）。
- 真实 Electron + 真实 API 四场景内存证据：`_audit/verification-single-pass-live-replay/verification-result.json`（2026-10-11T02:27:53.848Z），renderer heap 峰值 total 37.5-39.0MB，无 crash、无 pageErrors。
- `src/stores/chat.spec.ts` 断言持久化对象不包含 `sourceContent`、`completedText`、`accumulatedText`，并覆盖 rapid-update 合并、项目桶定向写入、状态迁移快照、跨窗口二次写入。

### 2026-10-11 真实 Electron + 真实 API 全链路复核

执行方式：`node scripts/verify-single-pass-live-replay.mjs`。供应商 `https://openapi.cloud-ai.cn/v1`，模型 `deepseek-v4-pro`，输入为 74,293 字真实大纲。完整证据与四份 trace 保存于 `_audit/verification-single-pass-live-replay/`。以下为 2026-10-11 02:27 最新全量重跑结果；该结果取代 2026-10-10 23:37 与 2026-10-11 01:12 的旧复核记录。

- outline-no-skill：`success / final_draft_complete`，1 次物理请求，0 次工具调用，`stop`，74,293 -> 74,146，486 秒，heap 峰值 37.8MB。
- outline-with-skill：`success / final_draft_complete`，1 次物理请求，0 次工具调用，`stop`，74,293 -> 74,323，638 秒，heap 峰值 39.0MB；真实 UI 选择 `folder:L1-B`，首字延迟约 40 秒。
- home-no-skill：`success / final_draft_complete`，1 次物理请求，0 次工具调用，`stop`，74,293 -> 74,146，510 秒，heap 峰值 38.5MB。此前 2 次物理请求、1,261 秒的重复生成现场已被本结果取代，效率疑点关闭。
- home-with-skill：`success / final_draft_complete`，1 次物理请求，0 次工具调用，`stop`，74,293 -> 74,282，541 秒，heap 峰值 38.6MB；真实 UI 选择 `folder:L1-B`，首字延迟约 68 秒。
- 请求载荷包含完整大纲与完整指令，`user` 消息约 74,589 字；带 SKILL 场景 `system` 从 304 字升至 1,891 字。
- 四份 runTrace 复核：`seq` 连续、无错误 `turnId` 归属、无 payload 完整性警告；除 `started` 与 `session-active` 外全部归属当前 turn。
- runTrace 回归：显式 `turnId: undefined` 不覆盖 active turn 兜底值，`src/stores/runTrace.spec.ts` 覆盖。
- 双入口终稿事件接线复核：`describeFinalDraftEvent` 是单源映射，`OutlineWorkspace.vue` 的 `recordOutlineFinalDraftTaskEvent` 与 `ChatPanel.vue` 的 `recordHomeFinalDraftTaskEvent` 均把全部终稿事件写入 runTrace，`heading_boundary_repaired` / `draft_deduplicated` 覆盖到位。
- 历史 73K / 74,841 字失败轨迹反事实回放已加入 `src/services/finalDraftService.spec.ts`：长文全文入参、模型输出丢失标题、授权去重与整段重放同场景验证，断言 1 次请求、0 工具面、1 次写入、本地标题修复、授权去重事件落账且不触发结构重试 / 回滚。

## 7. 缺口清单

已关闭效率疑点 1 项：`home-no-skill` 曾触发 2 次物理请求、2 个全文流；2026-10-11 02:27 最新重跑为 1 次物理请求、510 秒。以 `_audit/verification-single-pass-live-replay/verification-result.json` 为唯一当前口径，不得继续引用旧 1,261 秒结果宣称当前缺陷。

登记观察项 1 项：outline-with-skill 首字延迟约 40 秒、home-with-skill 约 68 秒，流式吞吐正常。需后续按供应商侧首 token 延迟与 system 提示规模继续观察，不得将其归因于应用读取循环。

边界：live 证据覆盖单轮整篇重构请求；多轮会话上下文连续性由代码契约与单测保证，未构造真实多轮 live 会话。
