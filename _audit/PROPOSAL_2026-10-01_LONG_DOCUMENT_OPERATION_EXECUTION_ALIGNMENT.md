# 长文档操作执行体系对齐方案（2026-10-01）

## 0. 结论先行

本轮 `run-trace-outline-20261001-140113-deep` 暴露的不是“API 直写工具缺失”，而是长文档操作的计划层与执行层语义断裂：

1. `buildLongDocumentExecutionPlan()` 目前只有二值逻辑：`operation !== 'targeted_edit'` 一律进入 `final-draft`，`edit-task` 模式生产不可达。证据：[longDocumentExecutionPlanner.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentExecutionPlanner.ts:331)。
2. EditTask 执行链已经完整存在：多批状态机、批次原子写入、`reorder_sections`、`delete`、`replace_match`、结构不变量、UI Banner 都在，但 planner 从不发出 `mode: 'edit-task'`。证据：[useEditTaskSession.ts](/D:/codex/novel-workshop-vue3/src/composables/useEditTaskSession.ts:259)、[editorTools.ts](/D:/codex/novel-workshop-vue3/src/services/editorTools.ts:607)、[longDocumentWriteProtocol.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentWriteProtocol.ts:1)。
3. 9/30 加入的终稿完整性门把“授权删除/授权重写”也当“内容丢失”拦截。证据：[finalDraftService.ts](/D:/codex/novel-workshop-vue3/src/services/finalDraftService.ts:347)、`DEV_LOG_2026-09-30_final-draft-a5-integrity-gate.md`。
4. 测试契约把断点藏住了：`agentOrchestrator.spec` 的 EditTask 用例通过手工把 `mode` 覆写为 `edit-task` 造出绿灯；planner 自身测试反向固化“normalize/deduplicate/restructure 必须终稿”。证据：[agentOrchestrator.spec.ts](/D:/codex/novel-workshop-vue3/src/services/agentOrchestrator.spec.ts:274)、[longDocumentExecutionPlanner.spec.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentExecutionPlanner.spec.ts:42)。

因此本方案不做补丁式加词，而是把“操作语义 -> 执行模式 -> 校验策略 -> 会话延续 -> 测试契约 -> 真实 UI 证据”整链对齐。

## 1. 目标与不做什么

### 目标

1. 用户的四类真实诉求都有稳定执行路径：
   - 局部修改/删除/插入：direct 工具循环。
   - 去重：EditTask 多批 `delete`。
   - 标点/格式整理：EditTask 多批 `replace_match` / `rewrite`。
   - 结构重排/排序：EditTask 单条原子 `reorder_sections`。
   - 明确要求整篇重写/新生成：final-draft，且完整性门按 operation 分级。
2. 大纲工作台与首页编辑器同矩阵，有 SKILL 与无 SKILL 同矩阵；SKILL 只影响提示词，不影响执行协议与权限语义。
3. 每个操作模式都有对应校验策略，禁止“为了绿灯放宽”或“为了防复读把授权删除拦死”。
4. 验证必须包含真实 Electron UI + 真实 API 复刻用户 trace，不允许 mock 冒充闭环。

### 不做

1. 不改 SKILL 包协议，不给 SKILL 增加执行权。
2. 不恢复已删除的旧工具面/旧确认流。
3. 不用补关键词替代计划层重构；词库只做意图识别输入，不再承担执行模式决策。
4. 不引入新的用户确认弹层；多批 EditTask 沿用既有 Banner 与批次恢复交互。

## 2. 根因链与证据

| 层 | 事实 | 证据 |
|---|---|---|
| 用户意图 | 第 1 轮明确“按 Word 文档形式重构大纲，不要缩减”；第 3 轮明确“清理错误标点、删除重复项，未重复的游离段落不动” | `run-trace-outline-20261001-140113-deep/export.json` 事件流 |
| 路由结果 | 第 1 轮 `edit / explicit-write-directive`；第 2 轮 `discuss / await-user-contextual-reply`；第 3 轮 `final-draft-mode-selected` | 同上 |
| 计划层 | `operation !== 'targeted_edit'` 即 final-draft，edit-task 不可达 | [longDocumentExecutionPlanner.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentExecutionPlanner.ts:331) |
| 策略层 | `large-scope-edit` 被定义为 final draft 操作 | [longDocumentPolicy.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentPolicy.ts:150) |
| Agent 旁路 | 未传入 `document.executionPlan` 时重建计划，并把 `operationHint` 重新映射回同一错误矩阵 | [agentOrchestrator.ts](/D:/codex/novel-workshop-vue3/src/services/agentOrchestrator.ts:280) |
| 校验层 | 终稿 leaf multiset 必须完全一致，授权删除必然失败 | [finalDraftService.ts](/D:/codex/novel-workshop-vue3/src/services/finalDraftService.ts:347) |
| 执行器 | EditTask 分支、原子校验、多批追加已存在 | [editorTools.ts](/D:/codex/novel-workshop-vue3/src/services/editorTools.ts:607)、[useEditTaskSession.ts](/D:/codex/novel-workshop-vue3/src/composables/useEditTaskSession.ts:259) |
| 测试 | 生产不可达模式被手工构造；错误契约被双向固化 | [agentOrchestrator.spec.ts](/D:/codex/novel-workshop-vue3/src/services/agentOrchestrator.spec.ts:274)、[longDocumentPolicy.spec.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentPolicy.spec.ts:151) |
| 污染 | 源文 74841 字中混入上一轮对话的插入说明文本，启动前无检测 | `074-prompt.json` |

## 3. 执行模式矩阵

| operation | 用户语义 | 默认模式 | 写命令 | 完整性策略 |
|---|---|---|---|---|
| `targeted_edit` | 修改/插入/删除某句某段 | `direct`；窗口不足时 `edit-task` 分段 | `insert` / `replace_match` / `delete` 等 | 批次原子；目标唯一；批次失败原文不变 |
| `normalize` | 标点、空白、格式整理 | `edit-task` | `replace_match` / `rewrite`，每批最多 10 条、60000 字符 | 叶子集合与语义文本保持；仅允许标点/空白差异 |
| `deduplicate` | 删除重复项，未重复内容不动 | `edit-task` | `delete`，目标必须唯一或携带结构标题 | 删除目标必须来自只读确认；未确认候选禁止顺手删除 |
| `restructure` | 重新排序、统一编号、调整顺序 | `edit-task` | 单条 `reorder_sections` | order 与结构 ID 集合完全一致；叶子正文 multiset 不变 |
| `rewrite_segments` | 明确要求整篇重写/替换 | `final-draft` | 无编辑命令，终稿 runner 写回 | 按 operation 分级；授权重写允许内容变化，但仍防残缺复读 |

说明：

1. `provider_configuration_conflict` 不再把任务推入终稿；它只是窗口声明异常，计划必须显式落 `warning` 并走可执行的分段路径。
2. `exceeds_provider` 时优先 EditTask + `read_range` / 分批；仅当操作本身要求整篇一次性重写且分段编辑无法表达时，才进入 final-draft 分段生成。
3. 保留 final-draft 的场景是“用户明确要一份新的完整文本”，不是“应用觉得整文操作麻烦”。

## 4. 修复阶段

### Phase 1：计划层单源重构

修改：

1. [longDocumentExecutionPlanner.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentExecutionPlanner.ts:326)
   - 删除 `const finalDraft = operation !== 'targeted_edit'`。
   - 新增 `resolveExecutionMode(operation, decision, requestText)` 单源函数。
   - 为各 operation 填充 `invariants`：
     - `restructure`: `leaf-body-multiset-unchanged`。
     - `normalize`: `leaf-set-preserved`（标点/空白归一后正文集合一致）。
     - `deduplicate`: `planned-deletion-only`。
     - `rewrite_segments`: `authorized-rewrite`。
2. [longDocumentPolicy.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentPolicy.ts:125)
   - `shouldAutoRouteToEditTask()` 与 planner 同源；`large-scope-edit` 不再等价 final-draft。
   - `isFinalDraftOperation()` 只描述“是否可能需要整稿产物”，不再决定执行模式。

验收：

- `normalize` / `deduplicate` / `restructure` 三个操作在生产 planner 输出 `mode: 'edit-task'`。
- `rewrite_segments` 输出 `final-draft`，且校验策略带 `authorized-rewrite`。
- `targeted_edit` 保持 direct，不引入新弹层。

### Phase 2：终稿校验分级

修改 [finalDraftService.ts](/D:/codex/novel-workshop-vue3/src/services/finalDraftService.ts:347)：

1. `validateFinalDraft` 增加 `operation` 输入。
2. 校验策略：
   - `rewrite_segments`：允许叶子内容变化；仍检查标题边界、残缺复读、段落断崖、拒答文本。
   - `normalize`（若进入终稿兼容路径）：标点/空白归一后正文集合必须一致。
   - `restructure`（若进入终稿兼容路径）：叶子 multiset 不变。
   - 未知 operation：保留当前保守门。
3. 失败 issue 必须携带 operation 与具体差异样本，写入 runTrace，供 SKILL 制作方定位。

验收：

- 真实重复删除不再被 `leaf_body_integrity_lost` 误拦。
- 复读残缺终稿仍被阻断，不允许为修复误拦而撤销 A5 防复读能力。

### Phase 3：会话延续与授权连续性

修改双入口：

1. [ChatPanel.vue](/D:/codex/novel-workshop-vue3/src/components/chat/ChatPanel.vue:2440)
2. [OutlineWorkspace.vue](/D:/codex/novel-workshop-vue3/src/components/common/OutlineWorkspace.vue:2146)

规则：

1. 建立会话级 `pendingLongDocumentOperation`：任务创建后，直到成功、失败终态、取消或用户明确换目标前，不因短答复（例如“A”、“确认”、“继续”）降级为 discuss。
2. 批准轮继续消费原 execution plan 的 `operationHint`，但 hint 只作为“延续任务”信号；最终模式仍由 planner 单源计算。
3. `agentOrchestrator` 不再自行重建计划。生产入口必须传入 `document.executionPlan`；缺失时输出 `plan-origin: agent-fallback` 并按只读处理，不允许 fallback 修改写权限。
4. EditTask 批次间允许暂停/恢复，恢复只重试当前批次，不重放历史批次。

验收：

- “A / 确认 / 继续”不会把已授权写入任务路由成纯讨论。
- EditTask 多批期间工具面持续可见 `editor.write`，终态后恢复普通工具面。

### Phase 4：源文污染检测

新增服务级检测，不自动改用户正文：

1. 在 final-draft 启动与 EditTask 首批前执行 `detectSourceContamination(source, conversationMarkers)`。
2. 命中时：
   - runTrace / DiagLogger 记录 `source-contamination-detected`，带命中位置与片段。
   - UI 提示“源文疑似包含上一轮对话说明文本”。
   - 默认继续执行用户当前目标，但不把污染片段当作结构事实。
3. 检测只做告警与 trace，不静默删除内容，避免误删用户正文。

验收：

- 074 类“插入说明文本混入源文”能被事件捕获。
- 未命中正常正文时不产生误报阻塞。

### Phase 5：测试契约重建

同批修改：

1. [longDocumentExecutionPlanner.spec.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentExecutionPlanner.spec.ts:1)
   - 删除“normalize/deduplicate/restructure 必须 final-draft”的旧断言。
   - 增加模式矩阵全量断言：operation × decision × mode。
2. [longDocumentPolicy.spec.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentPolicy.spec.ts:88)
   - 更新 `shouldAutoRouteToEditTask` / `isFinalDraftOperation` 契约。
3. [agentOrchestrator.spec.ts](/D:/codex/novel-workshop-vue3/src/services/agentOrchestrator.spec.ts:274)
   - 删除手工改 `mode` 的生产不可达用例，改为真实 planner 输出。
   - 补 `document.executionPlan` 缺失时 fallback 只读、不改权限的断言。
4. [editorTools.spec.ts](/D:/codex/novel-workshop-vue3/src/services/editorTools.spec.ts:13)
   - 删除 helper 中强制覆写 `mode: 'edit-task'` 的测试捷径。
5. 新增生产链路测试：deduplicate 多批 delete、normalize 多批 replace_match、restructure 单条 reorder_sections。

验收：

- 全库搜索不得存在“手工构造 edit-task 模式冒充生产路径”的测试捷径。
- `npm run test:services` 全绿，且新断言覆盖失败路径与恢复路径。

### Phase 6：观测同步

1. runTrace 事件补：
   - `execution-mode-selected`: `operation` / `mode` / `decision` / `reason` / `invariants`。
   - `edit-task-batch-planned`: 批次 ID、范围、命令类型、预计批数。
   - `source-contamination-detected`。
2. DiagLogger 同步以上事件。
3. `actualToolSurface` 与真实请求同源；final-draft 工具面为空，EditTask 工具面含 `editor.write`。

验收：

- 从 trace 能直接回答：为什么进入该模式、哪些批次、哪些命令、为何失败或恢复。

### Phase 7：Electron 真实 UI + 真实 API 复刻

#### 7.1 测试对象与前置

1. 测试文档：`C:/Users/凯瑞/Desktop/测试/《绿潮》大纲总纲.md`，共 74,841 字；导入前在头部、卷三之后、尾部各插入 1 条标点探针，探针含半角逗号/分号/句号，必须被归一为全角且不允许被删除。
2. 复刻 trace：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20261001-140113-deep/export.json`；脚本启动时逐字断言 3 轮用户输入，不得自行改写客户原句。
3. 供应商：真实 OpenAI-compatible API（默认 `deepseek-v4-pro`），真实流式调用，禁止 mock、禁止离线脚本冒充。
4. Electron：可见窗口，独立 profile + `SHENYI_DATA_DIR` + `SHENYI_ALLOW_TEST_ISOLATION=1`，登记 PID 与运行日志；每 15 秒写入 heartbeat。
5. 构建：执行前校验 `dist-renderer` 新于全部源码与构建配置，旧 bundle 直接拒绝执行。

#### 7.2 SKILL 加载与生效证明

测试矩阵为 4 个 case：大纲×无SKILL、大纲×有SKILL、首页×无SKILL、首页×有SKILL。

加载步骤（有 SKILL case）：

1. 读取 `D:/codex/玄武规划SKILL/L1-大纲层/L1-B-大纲共创主编`，断言 `SKILL.md` / `template.md` / `meta.json` / `script.js` 四件齐全。
2. 解析 `SKILL.md` 的 `id:`，生成应用内 ID `folder:{sourceId}`。
3. 通过 `electronAPI.storageWrite` 写入：
   - `wa_skills`：完整 folder SKILL 定义（template、folderPath、intents、bindTarget 等）。
   - `wa_pipeline_step_config`：`skills[0] = [skillId]`，`modes[0] = 'compose'`。
   - `wa_co_creation_config`：首页配置 `skillIds = [skillId]`。
4. 重载页面后，断言 UI 侧选择器状态：大纲 `#ow-skill-select` / `#ow-selected-skills`，首页 `#co-skill-select`；无 SKILL case 断言为空。
5. 请求级证明：该 case 的 runTrace 必须出现 `final-draft-skill-guidance` 事件，且 `payload.skillGuidancePresent === true`；无 SKILL case 必须为 `false`。

判定：store 存在、UI 选中、guidance 事件命中，三重同时满足才算“SKILL 已生效”；只写 store 不算。SKILL 只改变提示词，断言不得因有无 SKILL 改变执行模式与权限语义。

#### 7.3 每轮测试内容

复刻起点对齐用户 trace：

1. 输入测试文档（使用用户桌面测试大纲或等价 7 万字文档）。
2. 依次执行三句原始指令：
   - “按照 Word 文档的形式重构大纲，不要缩减内容。”
   - “A”
   - “重新整理排序就是清理错误的标点符号，和大纲里的重复项；重复项删了就行，未重复的游离段落不动。”

每轮契约：

| 轮次 | 测什么 | 必须发生 | 禁止发生 |
|---|---|---|---|
| Turn 1 | 范围确认与只读定位 | 有 response 或只读工具活动；长文策略事件出现；确认“不要缩减、先定位重复项/标点” | 任何 `editor.write` 写入；正文变化；进入 final-draft 生成整稿 |
| Turn 2 | 会话延续 | 任务状态保留，`A` 作为承接/确认，不重开任务 | 被降级成纯 discuss；写权限丢失；无 response 无工具的空转 |
| Turn 3 | 授权执行 | `execution-mode-selected` 为 `edit-task`，operation 为 `deduplicate` / `deduplicate_and_normalize`；工具面暴露 `editor.write`；出现 `edit-task-batch-planned`；`editor.write` 成功；三处确认重复项删至 ≤1；3 条标点探针保留并归一；未重复正文 `unplannedRemovedLines.length === 0` | `final-draft-mode-selected`；`final-draft-task-failed`；4.6 万字终稿生成；重复项残留；非重复段落被顺手删除 |

每轮还必须满足：turn 有 API call 且绑定 `turnId`；API call 终态非 `running`；`responseChars > 0 || toolCalls.length > 0`；trace 事件能解释该轮发生了什么。

#### 7.4 卡死判定与阶段表

卡死判定独立于单步超时：

1. `stalled`：连续 5 分钟 turn/api/event/response/tool 计数全部无变化，输出当前 heartbeat 与最后 12 条事件。
2. `dead`：连续 15 分钟无变化，判定 case 失败，保留截图、partial turns、failure.json，主动结束该 case 的 Electron 进程。
3. 挂起不算“运行中”；验证器必须显式报告 `stalled/dead`，不允许无限等待后仍宣称未卡。

阶段表按 case × turn 输出 `PASS / FAIL / NOT-RUN`：

| case | skill-seeded | skill-ui-selected | guidance-hit | turn1 | turn2 | turn3 | mode | editor.write | content | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| outline-no-skill | NOT-RUN | PASS(空) | PASS(false) | 待跑 | 待跑 | 待跑 | 待跑 | 待跑 | 待跑 | 待定 |
| outline-with-skill | PASS | PASS | PASS(true) | 待跑 | 待跑 | 待跑 | 待跑 | 待跑 | 待跑 | 待定 |
| home-no-skill | NOT-RUN | PASS(空) | PASS(false) | 待跑 | 待跑 | 待跑 | 待跑 | 待跑 | 待跑 | 待定 |
| home-with-skill | PASS | PASS | PASS(true) | 待跑 | 待跑 | 待跑 | 待跑 | 待跑 | 待跑 | 待定 |

任何一格 `FAIL/NOT-RUN` 时整体验证不得通过；不允许用部分 case 绿灯封装。

3. 验收终点：
   - 重复项删除。
   - 标点/格式整理。
   - 未重复游离段落保留。
   - 编辑器真实发生内容变化。
   - 不出现 46356 字终稿生成后被完整性门拦截的路径。
6. 测试窗口可见，登记 PID、窗口标题、句柄；真实供应商调用，不做 mock 冒充。
7. 至少覆盖矩阵：
   - 首页 × 无 SKILL。
   - 首页 × 有 SKILL。
   - 大纲 × 无 SKILL。
   - 大纲 × 有 SKILL。
   - 四类操作：修改、删除、去重、重排；标点整理与长文重写各补一轮。

#### 7.5 证据落盘

每个 case 输出到 `_audit/verification-long-document-operation-phase7/{caseId}/`：

1. `turns.json`：每轮 request、turnStatus、intent、actualToolSurface、apiStatuses、responseChars、toolCalls、longDocumentEvents、before/after 正文。
2. `final-state.png` 或失败时 `failure-state.png`。
3. 失败时 `failure.json`：断言信息、已完成轮次、run/turn/API 绑定快照。
4. 全局 `electron-run.log` 与 `heartbeat.jsonl`，用于复盘卡死、慢流式与绑定断裂。

## 5. 影响圈与风险

### 打算修改

- `src/services/longDocumentExecutionPlanner.ts`
- `src/services/longDocumentPolicy.ts`
- `src/services/finalDraftService.ts`
- `src/services/agentOrchestrator.ts`
- `src/services/longDocumentWriteProtocol.ts`（如需新增 invariant 描述）
- `src/components/chat/ChatPanel.vue`
- `src/components/common/OutlineWorkspace.vue`
- 相关 spec 与 Electron 验证脚本

### 可能碰到但不改语义

- `src/services/editorTools.ts`：只消费新 invariants，不放宽原子校验。
- `src/composables/useEditTaskSession.ts`：只接生产计划，不改状态机。
- runTrace schema：新增事件需同步 schemaVersion 与导出白名单。
- SKILL handoff 文档：执行协议说明同步，不给 SKILL 新执行权。

### 风险与对策

| 风险 | 对策 |
|---|---|
| EditTask 多批中途失败 | 批次原子 + checkpoint + 只重试当前批次；失败原文不变 |
| 模型把“去重”扩大成顺手删改 | `planned-deletion-only`；删除目标必须来自只读确认；未确认候选拒绝 |
| normalize 分批改写导致语义漂移 | 标点/空白归一后集合校验；不一致批次整批拒绝 |
| restructure 大结构命令超限 | 单条 `reorder_sections` 原子命令，禁止多条 move 拼接 |
| final-draft 误拦授权重写 | 校验按 operation 分级，保留防复读与残缺检测 |
| 旧测试继续固化旧契约 | Phase 5 同批重建，不允许新旧断言并存 |

## 6. 验证门

执行顺序：

1. `npm run test:services`
2. `npm run type-check`
3. `npm run build:vue`
4. Electron 可见窗口真实 UI 矩阵
5. 真实 API 长文复刻，等待完整执行，不因耗时长提前停止
6. trace 复查：模式、批次、命令、失败、恢复、写回全部可解释

未全部通过前不封装、不升版本、不宣称闭环。

## 7. 成熟度评估（G0.6）

| 层 | 结论 | 依据 |
|---|---|---|
| 执行器/工具层 | 成熟 | EditTask 状态机、原子批、reorder 校验、多批追加已存在并有测试 |
| 应用方案/交互闭环 | 成熟（待用户审核确认） | 模式矩阵明确，覆盖用户四类诉求与双入口、有无 SKILL |
| 实现接线 | 未开始 | 本文档为方案阶段，尚无代码改动 |
| 验证标准 | 已定义、未执行 | 真实 Electron + 真实 API 复刻为放行必要条件 |

整体结论：半成熟。放行条件是用户审核确认本方案；实现后必须按第 6 节验证门拿到真实证据，才允许从半成熟升级为成熟。
