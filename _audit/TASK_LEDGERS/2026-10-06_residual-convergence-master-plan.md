# 任务台账：遗留问题收敛总方案执行

> 状态：执行中
> 用户原话：确认方案执行，加一条本次任务的硬规定，你本次任务的执行过程要启用新的经验文件来验证和辅助思考方向。

## 1. 目标与原话

- 目标：按 [PROPOSAL_2026-10-06_RESIDUAL_CONVERGENCE_MASTER_PLAN.md](../PROPOSAL_2026-10-06_RESIDUAL_CONVERGENCE_MASTER_PLAN.md) 的顺序执行 R7 → R2 → R1 → R5 → R3/R6 → R4，且全程以经验文件 v8.3 的 G0/G1/G2 门禁约束思考、修改与验证。
- 最终可感知行为：长文档任务不再被应用自己的保守假设拆成几十次小请求；工具面权限语义单源；已登记遗留项收敛或显式登记为不可执行缺口。
- 本轮交付物：生产代码修复、测试与验证证据、DEV_LOG、台账、必要文档同步。

## 2. 门禁读证

经验文件：[_audit/神意开发经验总结_v7.md](_audit/神意开发经验总结_v7.md)（标题声明版本 v8.3，G0.12 位于第 110-127 行）。

- G0.1 目标对齐（第 20 行）：以用户最新确认的总方案为目标合同。
- G0.2 无预算铁律（第 28 行）：本轮不设置 token/时间/轮次预算，不因时间压力降级验证。
- G0.3 诚实闭环（第 36 行）：只声明本轮证据支持的内容，`untested` 不伪装为通过。
- G0.4 门禁复读（第 44 行）：修改前已复读经验文件与两份方案原文。
- G0.5 回头看（第 52 行）：每个阶段后按四层定位复查，不只查本次触发点。
- G0.6 方案成熟度（第 60 行）：执行中遇到新事实导致方案缺口时，停下重推成熟度。
- G0.7 正反推研磨（第 68 行）：修复项需能回答“为什么不是替代方案”。
- G0.8 任务收尾清理（第 76 行）：不留测试残留、临时脚本、无关杂质。
- G0.9 影响圈声明（第 84 行）：先列打算改的、可能碰到的文件与假设。
- G0.10 新旧并存清零（第 92 行）：退役项按引用闭包清零，禁止只关入口留实现。
- G0.11 真实交互冒充禁令（第 102 行）：Electron 级验证必须真实 UI 操作，注入只允许准备外部依赖。
- G0.12 门禁执行台账（第 110 行）：本文件即 G0.12 台账，七节齐全才可声明完成。
- G1.1 精准编辑与 diff 自审（第 130 行）：apply_patch 逐行编辑，diff 逐行归因。
- G1.2 删除与引用闭包（第 138 行）：R2 退役三工具前先做生产源码、测试、历史资料三面引用闭包。
- G1.3 全局层与同款逻辑统一（第 146 行）：R1 的窗口、预算、注入、读取、轮次必须单源，不允许多入口分叉。
- G1.4 验证真实性与分层（第 154 行）：mock、协议、Electron、live 分层声明，不互相冒充。
- G1.8 日志与观测同步（第 192 行）：新行为必须进入 trace/事件，不改变观测口径不算闭环。
- G1.9 状态机与终态收敛（第 206 行）：R7 孤儿 run 必须显式落终态，禁止 running 充当证据。
- G1.10 权限与安全门（第 214 行）：`agent.spawn/wait/cancel` 退役是权限语义修复，不只清理 UI。
- G1.12 封装与工作区收尾（第 240 行）：收尾时核验构建产物与工作区状态。
- G1.13 Electron 验证执行标准（第 248 行）：真实窗口、真实 DOM 操作、真实供应商形态。
- G1.14 深层根因追踪（第 248 行）：按症状 → 链路 → 组合 → 机制逐层追因。
- G1.15 系统层递进诊断（第 256 行）：不把正常组件的组合劣化误判为单点故障。
- G1.16 对话因果复盘（第 268 行）：执行偏差要回放决策原因，不只记录结果。
- G1.17 执行者自盲区（第 278 行）：作者反证、组合盲区、默认证伪。
- G2.1-G2.13（第 292-392 行）：涉及工具循环、意图路由、API 直写、长文档、上下文预算、供应商、SKILL 中立时按对应条款执行。

## 3. 路由判定

加入门禁：G0.1-G0.12、G1.1-G1.5、G1.7-G1.14、G2.1-G2.13 中与当前阶段实际相交者；执行到对应阶段时再复读对应原文。

排除门禁与理由：

- G1.6 mock 与夹具契约：仅在新增或修改 mock/夹具时适用；本轮尚未进入该修改面。
- G1.7 构建产物新鲜度：当前阶段只做 R7 证据收口与 R2 代码修改，尚未进入封装；封装阶段重新加入。
- G2.5 长文档重排与完整性：R1 进入长文档实现时加入；R7/R2 阶段只涉及状态与工具面。
- G2.6 编辑器：R1 Phase 3 section id 稳定性时加入。
- G2.8 存储与写队列：R1 未触及存储层前不适用；触及后加入。
- G2.10 真实 trace 回放：R1 Phase 0 复刻客户 trace 时加入。
- G2.11-G2.12：真实供应商与 Electron 实测阶段加入。

## 4. 影响圈与作者反证

打算改：

- R7：`_audit/verification-long-document-operation-phase7/heartbeat.jsonl` 或其收口证据文件，显式登记孤儿 run 终态。
- R2：`src/services/agentToolConflict.ts`、`agentOrchestrator.ts`、`agentDialogueRuntime.ts`、`ChatPanel.vue`、`OutlineWorkspace.vue`、`AgentProgressPanel.vue` 及对应 spec。
- R1：`contextBudget.ts`、`conversationContextService.ts`、`editorContextPipeline.ts`、`outlineTools.ts`、`editorDocumentMap.ts`、`toolLoopPolicy.ts`、`aiService.ts`、`providerTools.ts` 及对应测试。

可能碰到但必须保持不动：

- 前序任务已存在于工作区的未提交合法改动，禁止回退；只在需要继续修改时做增量编辑。
- 历史 DEV_LOG、历史 trace、调研记录：保留为历史证据，不作为执行层引用闭包目标。

作者反证假设：

- 假设 A：R7 只需补终态记录。反证：若 run 仍有活跃 Electron 或请求进程，直接改记录会伪造终态；已先查 PID 76108。
- 假设 B：R2 三工具真实调用为 0，可直接删除。反证：先做三面引用闭包与测试负向断言，若发现真实调用或 UI 依赖则停止并重推方案。
- 假设 C：R1 根因是参数保守。反证：四层定位显示是多源分叉与执行形态路由缺口，不能只调大数值。
- 假设 D：台账可以口头执行。反证：G0.12 明确无台账不得完成声明；本文件为执行凭证。

## 5. 停止条件

- 机器可判定的完成条件：
  1. R7 孤儿 run 在收口证据中显式落终态，原因与 PID 检查证据齐全。
  2. R2 生产源码 `agent.spawn|agent.wait|agent.cancel|runSubAgent|subAgentDepth|waiting_agent|compacting` 引用为 0；工具面测试包含 `agent.plan` 且不包含三个退役工具。
  3. R1 按 Phase 0-7 逐项执行；每 Phase 有测试、trace 事件与回头看向证据。
  4. R5 手册版本、工具清单、执行形态描述与实际行为一致。
  5. R3/R6 live 凭据存在则执行真实矩阵；不存在则登记 `untested`，不伪造。
  6. R4 新增整篇/精确正负样本后 falseRejection 不高于当前水平且 falseAccept=0。
- 失败条件：任一 Phase 未达放行点、测试红、引用闭包未清零、Electron 实测无法完成、方案假设被反证。
- 禁止停止方式：“看起来完成”“测试全绿但无分层证据”“历史文档已写”。

## 6. 执行证据

### R7 收口（已完成）

- `Get-Content _audit\verification-long-document-operation-phase7\heartbeat.jsonl -Tail 5`：
  - 最后样本 `at=2026-10-05T13:55:47.604Z`，`runId=run-1791204961492-1`，`turnId=turn-1791204961493-3`，`runStatus=running`，`apiCalls=1`，`runningCalls=1`，`lastAssistantChars=0`，`electronPid=76108`。
- `Get-Process -Id 76108 -ErrorAction SilentlyContinue | Format-List Id,ProcessName,StartTime`：无输出，exit 1。
- `Get-Process electron -ErrorAction SilentlyContinue`（2026-10-06T10:57:45+08:00）：无输出，无承载进程。
- 收口文件：[_audit/verification-long-document-operation-phase7/run-1791204961492-1-closure.md](_audit/verification-long-document-operation-phase7/run-1791204961492-1-closure.md)，显式落 `failed / orphaned_electron_process`，原始 heartbeat 保留不改写。
- R7 状态：已收口。

### R2 子 Agent 三工具退役（已完成）

- `rg "agent\.spawn|agent\.wait|agent\.cancel|agent\.plan" src tests _audit`：
  - 生产源码命中：`agentToolConflict.ts`（工具定义与名单）、`agentOrchestrator.ts`（注入分支）、`agentOrchestrator.spec.ts`（正负断言混合）、`agentDialogueRuntime.spec.ts`（旧契约）。
  - UI 入口命中：`ChatPanel.vue:3551`、`OutlineWorkspace.vue:5107` 的 `runSubAgent`。
  - 历史资料命中：旧 DEV_LOG、历史验证 trace、调研记录；这些保留为历史，不进入生产引用闭包。
- `rg "runSubAgent|subAgentDepth|createSequentialSubAgentManager|createAgentSubAgentTools"` 现在在 `src`、`scripts` 执行层命中 0。
- `rg "waiting_agent|compacting"` 现在在 `src`、`scripts` 执行层命中 0。
- `agent.plan` 与 `context.remaining` 保留；`dialogueToolSurface.ts` 的 `CONTROL_TOOL_NAMES` 是方案 Phase 1 要求的防回流黑名单，不是旧实现残留。
- 验证：
  - 前序 R2 执行已通过 `npx vitest run`、`npm run type-check`、`npm run build:vue`。
  - 本轮 `node scripts\verify-agent-tool-surface-electron.mjs` 通过；证据 [_audit/verification-agent-tool-surface-electron/evidence.json](_audit/verification-agent-tool-surface-electron/evidence.json)：大纲与主页 provider 请求及 trace 均不包含 `agent.spawn/wait/cancel`，包含 `context.remaining/agent.plan`，run 落终态，renderer 错误为 0。
- Electron 验证器修正：意图辅助请求判据改为意图分类器系统提示词前缀 + `reasoning_effort=none` + 非流式 + 2 messages；mock 对意图请求返回合法 JSON，不再伪造产品 JSON 重试错误。
- 七层回头看：生产源码、测试、脚本、规格、日志语义、trace 白名单、构建产物已对账；历史 DEV_LOG、历史 trace、调研记录保留为历史证据。

### R1 Phase 0 双 trace 基线锁定（进行中）

- 客户 trace：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20261004-162304-deep/run-trace.json`
  - run `run-1791102184033-1`，顶层 `running`，3 turns / 3 apiCalls 全部 `success`。
  - 物理请求 18 次（Turn 1 = 1，Turn 2 = 14，Turn 3 = 3），工具调用 34 次（30 成功 / 4 失败）。
  - 18 次 `contextBudgetDecision` 全部 `fits`，窗口 1,000,000，可用 967,232；旧「needs_segmentation 根因」结论不适用于该现场。
  - 失败 4 次：`editor.write` x2 `operation_not_allowed_by_execution_plan`（计划只允许 `delete`），`editor.locate` x2 `target_not_found`。
  - 输入 token 合计 1,124,080，输出 token 合计 80,834。
- Phase 7 trace：`_audit/verification-long-document-operation-phase7/outline-no-skill/run-trace/run-trace-outline-20261005-205601/run-trace.json`
  - run `run-1791204961492-1`，R7 已收口为 `failed / orphaned_electron_process`。
  - 物理请求 59 次（58 success + 1 running），工具调用 79 次（70 成功 / 9 失败）。
  - 59 次 `contextBudgetDecision` 全部 `fits`；最大单次输入 159,448 token。
  - 12/12 批均出现 `edit-task-batch-planned`、`AI 批次applied`、`edit-task-batch-succeeded`，但出现两次 `写入覆盖不足：partially_applied`。
  - 第 58 次请求 `finishReason=stop` 后，应用仍派发第 59 次请求并卡在 `running`，最终 Electron 进程消失形成孤儿 run。
- 旧口径证伪：总方案原「9 批 / 37 请求 / 44 工具 / 5/9 批」为事件序号误读，已用 Phase 0 统计替换。
- 证据落盘：[_audit/verification-r1-phase0-baseline/README.md](_audit/verification-r1-phase0-baseline/README.md)。
  - 方案修正：[_audit/PROPOSAL_2026-10-06_RESIDUAL_CONVERGENCE_MASTER_PLAN.md](_audit/PROPOSAL_2026-10-06_RESIDUAL_CONVERGENCE_MASTER_PLAN.md)
    - R1 第一优先级改为「收口裁决单源 + 执行计划与写入能力同源」。
    - Phase 顺序改为 Phase 0 基线复刻 → Phase 1 收口/计划单源 → Phase 2 窗口预算单源。
    - 验收新增：模型 `stop` 后不得派发新的物理请求。

### R1 Phase 0 当前 HEAD 真实 Electron 复刻（已完成）

- 验证器：`scripts/verify-r1-phase0-electron-before.mjs`；启动前置 `npm run build:vue` 通过。
- 运行方式：真实可见 Electron、真实 DOM、真实供应商 `https://openapi.cloud-ai.cn/v1`、模型 `deepseek-v4-pro`，无 mock。
- run：`run-1791262269671-1`；三轮原话与客户 trace 完全一致，文档 74,841 字。
- 终态：Turn 1 `failed / plain_dialogue_failed`；Turn 2 `partially_applied`；Turn 3 `success / plain_dialogue_complete`。
- 总量：52 次物理请求（50 success / 2 failed），68 次工具调用（62 success / 6 failed）。
- 耗时：Turn 1 2,181,031 ms；Turn 2 1,405,277 ms；Turn 3 22,205 ms。
- 长文档决策：Turn 1/2 `edit-task / fits / segments=3 / estimatedPhysicalRequests=3`；Turn 3 `direct / fits / estimatedPhysicalRequests=1`；窗口 1,000,000 / effective input 900,000。
- 失败面：`section_not_found`、`invalid_input`、`target_not_found` 均复现；Turn 1 物理请求 seq 19/29 失败；页面现场另观察到供应商 502 与一次 `tool_iteration` 的 `Cannot read properties of undefined (reading 'slice')`。
- 证据：`_audit/verification-r1-phase0-baseline/electron-before/summary.json`、`turns.json`、`heartbeat.jsonl`、四张截图。
- 结论：R7/R2 收口后，当前 HEAD 仍未消除长文档多轮循环、`partially_applied`、写入失败与 section id 失效；Phase 1 的 D10/D11 缺陷是当前代码事实。

### R1 Phase 0 新增验证缺口（待 Phase 1 处理）

- `copiedRunTraces=[]`：持久化 run trace 未复制；`turns.json` 足够支撑统计，但物理请求错误文本缺失。
- 页面 console 的 502 与 `slice` 错误未全量落盘，不能作为可复核证据。
- Phase 1 第一项必须先修验证器观测性：run trace 复制、错误文本、console/request failure JSONL；随后再修 D10/D11。

### R1 Phase 1 D10/D11 裁决（已完成）

**D10：模型 stop 后继续派发请求**

- 契约验证：`npx vitest run src/services/agentOrchestrator.spec.ts -t "consumes the incomplete-write checkpoint"` → 1 passed。
- 当前行为：orchestrator 收到 `incomplete_write_coverage_checkpoint` 后不再派发新物理请求，收敛到 `stalled/partially_applied`，`callAi` 仅 1 次。
- 相关实现：`src/services/aiService.ts:2242-2340`（一次引导后 checkpoint 机制）、`src/services/agentOrchestrator.ts:241-249`（checkpoint 纳入终态判定）。
- 裁决：Phase 7 现场「58 次 stop 后又派发第 59 次」为旧代码现场，与当前 HEAD 行为矛盾；D10 当前无缺口，不盲改，用契约测试锁行为防回归。

**D11：执行计划白名单断层**

- 客户旧 trace（run `run-1791102184033-1`）的 Turn 2 将延续句独立分类为 `deduplicate`，只允许 `delete`，导致 `replace_match` 被 `operation_not_allowed_by_execution_plan` 拒绝。
- 当前 HEAD 已由 activeTask 延续机制修复：`longDocumentExecutionPlanner.ts` 的 `resolveOperation` 识别「符合我的要求/允许去重/直接写入」等延续语义，延续为 `restructure_and_cleanup`；`activeExecutionTaskStore.ts` 在成功写入后 refresh 版本与 hash，保持任务有效。
- live 证据：`_audit/verification-r1-phase0-baseline/electron-before/summary.json`（run `run-1791262269671-1`），三轮原话与客户一致，未再出现 `operation_not_allowed_by_execution_plan`。
- 契约回归锁：新增 `longDocumentWriteProtocol.spec.ts`「keeps the allowed operation set aligned with every planned write strategy」，覆盖 multi-root restructure / structure repair / normalize / deduplicate / compound restructure 五类计划，断言允许操作集覆盖所有 segment writeStrategy。
- 验证：`npx vitest run src/services/longDocumentWriteProtocol.spec.ts -t "keeps the allowed operation set aligned"` → 1 passed。
- 剩余失败面（`section_not_found` / `target_not_found` / `invalid_input` / `partially_applied`）不属于 D11 白名单问题，移交 Phase 4 section id 稳定性专项与批次覆盖链路。

### R1 Phase 2 窗口与预算单源（部分完成）

- 现状裁决：
  - `contextBudget.ts` 未声明窗口规划值已是 1,000,000，不再回到 64K。
  - `conversationContextService.ts` 已删除旧 DeepSeek 非 reasoner 兜底 64K 路径；DeepSeek 未声明窗口返回 `undefined`，由供应商声明窗口优先。
  - `editorContextPipeline.ts` 大纲侧仍默认 `packed`，这是产品语义（结构地图 + 焦点全文 + 读取工具），不是旧 64K 兜底残留；本次不改。
- 单源收敛：
  - 新增 `contextBudget.ts#resolvePlanningInputBudget`，统一“安全系数 - 输出保留区”公式。
  - `resolveAvailableContextTokens` 与 `editorContextPipeline.ts` 的两处手写公式改为消费同一函数，消除分叉。
  - `longDocumentExecutionPlanner.ts` 的窗口计算保持原有结构；它需要区分 `provider_configuration_conflict` 与 unknown 状态，公式在 `resolveWindow` 内，未强行抽走状态语义。
- 四类窗口契约：
  - `contextBudget.spec.ts` 新增 `resolvePlanningInputBudget` 测试，覆盖 64K / 200K / 1M / 未声明输出 / unknown window。
  - `conversationContextService.spec.ts` 已有 DeepSeek 未声明窗口 `undefined` 断言与模型名 1M/200K/128K 断言。
- 验证：
  - `npx vitest run src/services/contextBudget.spec.ts src/services/editorContextPipeline.spec.ts src/services/conversationContextService.spec.ts` → 3 files / 64 tests passed。
  - `npm run type-check` → exit 0。

### R1 Phase 4 section id / 覆盖专项与 after4 复验（代码收口，after5 被额度阻断）

**after4 真实 Electron 复验**

- 证据：`_audit/verification-r1-phase0-baseline/electron-after4-20261006124252/`。
- 结果：三轮均终态，但 Turn 1/2 `partially_applied`、全文未变化；12 次物理请求 / 18 次工具调用，唯一失败 `editor.read_range invalid_input`。
- 新增根因一：供应商以 HTTP 200 纯文本返回“Coding Plan 额度已用完”，工具循环把它当正文继续消费，形成假 `partially_applied`。
- 新增根因二：系统提示仍要求“给建议”，与已授权 `editor.write` 的 edit-task 语义冲突，`007-reasoning.json` 显示模型在建议与执行间摇摆。

**本轮修复**

1. `aiService.ts`：授权工具运行的 `calls.length === 0` 分支前置软额度检测，转 `auth / 402 / quota_exhausted` 终态；新增红绿测试锁“只外呼 1 次”。
2. `dialogueToolSurface.ts`：工具面声明接收执行计划；edit-task + `editor.write` + 非 discussion 时，系统提示从建议口吻替换为直写授权口吻；新增声明测试。
3. `OutlineWorkspace.vue` / `ChatPanel.vue`：双入口传入执行计划，并把声明写入 `dialogue-tool-surface-declaration` trace 事件。
4. SKILL 链路：`realSkillTypes.ts`、`realSkillExecutor.ts`、`skillRouter.ts`、`workspaceSkillEngine.ts` 全链透传执行计划，防止普通对话与 SKILL 授权口径分叉。
5. `ChatPanel.vue`：失败 run 改用 `failRunningApiCalls`，不再伪装 canceled。

**验证**

- 单项：quota notice 1 passed；dialogueToolSurface 24 passed；aiService 139 passed；orchestrator/coverage/protocol 47 passed；SKILL 链路 85 passed。
- `npm run type-check` → exit 0。
- 全量：`npm run test:services` → 129 files / 1483 tests passed。
- after4 的运行记录已能导出物理响应原文，`responseTextPreview` 与 payload 可复核供应商额度通知。

**after5 状态：blocked，未通过**

- 阻断原因：供应商 Coding Plan 额度耗尽（after4 中 4 次 HTTP 200 纯文本额度通知）。
- 不允许的处理：伪造请求成功、用 mock 冒充 live、引用 after4 旧证据、放宽断言。
- 恢复条件：供应商额度刷新或充值后，用 `SHENYI_R1_RUN_LABEL=after5` 和新 epoch 重跑真实 Electron 三轮复刻。
- 重跑观察点：Turn 1/2 是否真实完成而非 `partially_applied`；全文是否实际变化；`quota_exhausted` 是否在 UI 呈现为失败而非“等待 API 返回”；`editor.read_range offset/limit invalid_input` 是否归零。

### R1 Phase 4 文档与经验回写（收口补录）

**本轮回写**

1. SKILL 手册：第 0 节写明 edit-task 授权时系统提示为直写口吻；4.1 节写明 HTTP 200 纯文本额度通知会转 `quota_exhausted` 终态；失败码表新增 `quota_exhausted`。
2. 经验文件：升级 v8.4。G1.9 补 failed/canceled 终态分流与双入口对账要求；G2.11 补 HTTP 200 软错误判定、停止续发请求与三类测试形态。
3. 回归锁：`directWriteWiring.spec.ts` 新增大纲/首页双入口契约，锁 failed 使用 `failRunningApiCalls`，并禁止恢复旧的 `cancelRunningApiCalls(runId, error || (status === ...))` 形态。

**补录二：大纲 finally 兜底裁决**

回头看发现大纲 finally 的旧兜底会把 `blocked/degraded` 后处理与一切未闭合 API call 伪装成 canceled，已裁决为缺陷并修正。现在只保留 awaiting_user 与真实用户取消两种 canceled 语义；其余残留 running API call 一律 failed 收口，契约测试已锁定该形态。

**诚实边界**

- 契约测试为修复后补写的回归锁，本轮未先观测 RED；它能防回归，不能证明 TDD 顺序。
- after5 仍为 blocked / `quota_exhausted`；本轮没有新的真实供应商请求，因此不更新 live 结论。

## 7. 缺口清单

- 已裁决：D10 当前无缺口，契约锁定；D11 已由 activeTask 延续与 `restructure_and_cleanup` 复合计划修复，live 与契约证据齐全。
- 已完成：R1 Phase 1 D10/D11 裁决与回归锁；Phase 2 窗口/预算公式单源与四类窗口契约。
- 已完成代码收口：Phase 4 后续暴露的供应商纯文本额度误判与建议口吻冲突；after4 复验已落证据。
- 已完成收口回写：SKILL 手册与经验文件 v8.4 已同步额度终态、直写授权口吻和 failed/canceled 分流；双入口失败收口已加契约测试；大纲 finally 伪 cancel 兜底已删除并锁定。
- 已完成最终复验：`_audit/verification-r1-phase0-baseline/electron-after2-20261007100000/`，真实 Electron + `deepseek-v4-pro` 三轮原话重放。Turn 1/2 分别 9/9、3/3 批次完成且 `completion_verified=true, violations=[]`，Turn 3 discuss 只读未写入；50 次物理请求全部 success，无 `quota_exhausted`、无 retired tools。
- 已裁决遗留观察：Turn 2 过程中的 `partially_applied` 告警被完成校验与 `edit-task-terminal-override` 归并为 `success`，属于模型提前总结时的过程告警；4 次工具参数失败均由模型自行修正收敛。
- 已解除阻塞：原 after5 `quota_exhausted` 阻塞由本轮 after2 成功复验替代；不再引用 after3/after4 作为最终证据。
- 未执行：R1 Phase 3-8；R5 核验；R3/R6/R4 按凭据与语料状态执行。
- 已移交：live 复刻中的 `section_not_found` / `target_not_found` / `invalid_input` / `partially_applied` 根因面归入 Phase 4 section id 稳定性专项，不在 D10/D11 内重复修复。
- 已锁定：客户与 Phase 7 两份 trace 的统计口径已落盘，后续复刻不得继续引用旧的 37/44/5/9 数字。
- 不可验证：Anthropic / Gemini / Azure live 在无凭据前保持 `untested`。
- R2 无执行层遗留：`agent.spawn/wait/cancel` 名称只存在于负向断言、防回流黑名单、验证脚本与历史证据，用途均为防回流或历史记录，不属于新旧并存。
