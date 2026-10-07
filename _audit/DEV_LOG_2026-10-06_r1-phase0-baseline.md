# 2026-10-06 R1 Phase 0 基线锁定与旧口径修正

## 目标

按总方案顺序进入 R1 Phase 0：复核客户 trace 与 Phase 7 复刻 trace，锁定 74,841 字大纲任务的唯一 before 基线，并修正总方案中被证伪的旧统计口径。

## 证据

本轮使用 Node 直接解析两份 `run-trace.json`，只读取 `apiCalls[].physicalCalls`、`turns[].toolCalls`、`events[]` 三个来源，避免把事件标签序号误当最终统计。

### 客户现场

来源：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20261004-162304-deep/run-trace.json`

- 3 turns / 3 外层 apiCalls，全部 `success`；顶层 run status 仍为 `running`，存在终态归并疑点，尚未判定为缺陷。
- 物理请求 18 次（1 + 14 + 3），全部 `success`；输入 token 1,124,080，输出 token 80,834。
- 工具调用 34 次：30 成功 / 4 失败。
- 18 次 `contextBudgetDecision= fits`，窗口 1,000,000，可用 967,232。
- 失败 4 次：两次 `editor.write` 因 `operation_not_allowed_by_execution_plan`（计划只允许 `delete`），两次 `editor.locate` 因 `target_not_found`。
- Turn 2 用时 1,176,807 ms；第 11 次物理请求输出 20,854 token、耗时 299,360 ms。

### Phase 7 现场

来源：`_audit/verification-long-document-operation-phase7/outline-no-skill/run-trace/run-trace-outline-20261005-205601/run-trace.json`

- 1 turn / 1 apiCall；R7 已收口为 `failed / orphaned_electron_process`，只能作 before 现场。
- 物理请求 59 次：58 success + 第 59 次 running。
- 工具调用 79 次：70 成功 / 9 失败。
- 59 次 `contextBudgetDecision= fits`；最大单次输入 159,448 token；输入 token 合计 6,277,254，输出 token 合计 191,626。
- 12/12 批均出现 planned / applied / batch_succeeded；但覆盖判定两次报 `partially_applied`。
- 第 58 次请求 `finishReason=stop`，之后又派发第 59 次 `running` 请求；这是本轮新钉实的收口缺陷。

## 旧口径证伪

总方案原文的「9 批 / 37 次物理请求 / 44 次工具调用 / 5/9 批完成」被证实为误读：37/44 是事件标签序号，5/9 批全文搜索不存在。已改为：

- 客户现场：18 请求 / 34 工具。
- Phase 7 现场：59 请求 / 79 工具 / 12 批全部成功但覆盖 partial。
- 两个现场全部 `fits`，不能把 64K 强制切分写成这两个 trace 的根因。

## 修正内容

1. 新增 [verification-r1-phase0-baseline/README.md](verification-r1-phase0-baseline/README.md)，作为两份 trace 的唯一 before 基线。
2. 修正 [PROPOSAL_2026-10-06_RESIDUAL_CONVERGENCE_MASTER_PLAN.md](PROPOSAL_2026-10-06_RESIDUAL_CONVERGENCE_MASTER_PLAN.md)：
   - 总体判断改为五项，第一优先级是收口判定多源分叉。
   - 四层定位改为双现场口径。
   - 新增 D10 收口裁决单源、D11 执行计划与写入操作同源。
   - Phase 顺序改为 Phase 1 先修收口/执行计划，Phase 2 再做窗口预算单源。
   - 验收新增「模型 stop 后不得派发新的物理请求」。
3. 更新任务台账第 6/7 节，登记 Phase 0 证据与剩余缺口。

## 诚实边界

- 本轮只做证据解析与方案/台账修正，未修改生产代码，未运行测试。
- 客户 run 顶层 `running` 与 turns `success` 的矛盾只登记为疑点，待当前 HEAD 复刻后再定性。
- Phase 0 仍有未完成项：当前 HEAD 的 74,841 字真实 Electron UI before 复刻尚未执行。

## 2026-10-06 当前 HEAD 真实 Electron 复刻收口

### 运行方式

- 验证器：`scripts/verify-r1-phase0-electron-before.mjs`
- 窗口：真实可见 Electron，PID 43636，CDP 9331。
- 供应商：`https://openapi.cloud-ai.cn/v1`，模型 `deepseek-v4-pro`，无 mock。
- 输入：客户 trace 三轮原话，文档为 74,841 字《绿潮》大纲总纲。
- 构建前置：`npm run build:vue` 通过后才启动。

### 结果

- run：`run-1791262269671-1`。
- 三轮全部终态：Turn 1 `failed / plain_dialogue_failed`，Turn 2 `partially_applied`，Turn 3 `success / plain_dialogue_complete`。
- 合计：52 次物理请求（50 success / 2 failed），68 次工具调用（62 success / 6 failed）。
- 耗时：Turn 1 2,181,031 ms；Turn 2 1,405,277 ms；Turn 3 22,205 ms。
- 长文档策略：Turn 1/2 均 `edit-task / fits / segments=3 / estimatedPhysicalRequests=3`；Turn 3 `direct / fits / estimatedPhysicalRequests=1`。窗口识别为 1,000,000。
- 失败面：`editor.read_range section_not_found`、`editor.read_range invalid_input`、`editor.write invalid_input`、`editor.write target_not_found` 复现；Turn 1 物理请求 seq 19 / 29 失败。
- 页面现场还观察到供应商 502 与一次 `tool_iteration` 阶段 `Cannot read properties of undefined (reading 'slice')`；但 `turns.json` 未保存错误文本，只能登记为观测性缺口。

### 证据

- `_audit/verification-r1-phase0-baseline/electron-before/summary.json`
- `_audit/verification-r1-phase0-baseline/electron-before/turns.json`
- `_audit/verification-r1-phase0-baseline/electron-before/heartbeat.jsonl`
- 截图：`turn-1-state.png`、`turn-2-state.png`、`turn-3-state.png`、`final-state.png`

### 新增缺口

1. `copiedRunTraces=[]`：持久化 run trace 未被复制。脚本清理了 profile，而导出目录没有产出文件；需要修复验证器的复制时机与导出触发。
2. 物理请求错误文本未进入证据 JSON；页面 console 中的 502 / `slice` 错误无法从落盘证据复核。
3. 需要把页面 console / request failure 全量捕获到 `electron-run.log` 或独立 JSONL。

### Phase 0 放行判断

当前 HEAD 的 before 复刻已完成，Phase 0 可以收口；但 Phase 1 的第一项应先补验证器观测性，否则修复后无法证明 502 与 `slice` 错误是否消除。

## 2026-10-06 Phase 1 D10/D11 裁决与回归锁

### D10 裁决

- 契约测试：`npx vitest run src/services/agentOrchestrator.spec.ts -t "consumes the incomplete-write checkpoint"` → 1 passed。
- 当前 HEAD 在收到 `incomplete_write_coverage_checkpoint` 后不再派发新物理请求，收敛到 `stalled/partially_applied`，`callAi` 仅 1 次。
- Phase 7 现场「58 次 stop 后又派发第 59 次」判为旧代码现场，与当前 HEAD 行为矛盾；本轮不改生产代码，只保留契约测试作为回归锁。

### D11 裁决

- 客户旧 trace 的白名单断层由 activeTask 延续机制修复：延续句现在扩展为 `restructure_and_cleanup`，允许 `move/insert/delete/replace_match/rewrite`。
- 当前 HEAD live 复刻（run `run-1791262269671-1`）三轮原话已不再出现 `operation_not_allowed_by_execution_plan`。
- 新增横向契约：`longDocumentWriteProtocol.spec.ts`「keeps the allowed operation set aligned with every planned write strategy」，覆盖五类执行计划，要求允许操作集覆盖全部 segment writeStrategy。
- 验证：`npx vitest run src/services/longDocumentWriteProtocol.spec.ts -t "keeps the allowed operation set aligned"` → 1 passed。
- 剩余 `section_not_found / target_not_found / invalid_input / partially_applied` 移交 Phase 4 section id 稳定性与批次覆盖专项，不在 D11 内重复修补。

### 观测性状态

- 验证器当前版本已接线 `observability.jsonl`、console/request failure 捕获、run trace 导出；产品侧 `physical.error` 已有导出投影测试。
- 验证：`npx vitest run src/stores/runTrace.spec.ts -t "physical call error text"` → 1 passed。
- 旧 before 证据中的 `copiedRunTraces=[]` 属于修复前现场；after 阶段需真实重跑 `verify-r1-phase0-electron-before.mjs` 才能证明链路产出，不能用代码存在冒充运行证据。

## 2026-10-06 Phase 2 窗口与预算单源

### 裁决

- 未声明窗口规划值已为 `1,000,000`，旧 64K 规划兜底不复存在。
- DeepSeek 非 reasoner 不再被模型名误判成 64K；未声明窗口保持 `undefined`，供应商声明窗口优先。
- 大纲工作台默认 `packed` 是产品语义（结构地图 + 焦点全文 + 读取工具），保留。

### 修改

1. `contextBudget.ts` 新增 `resolvePlanningInputBudget`，成为“安全系数 - 输出保留区”的唯一样式公式。
2. `resolveAvailableContextTokens` 改为委托 `resolvePlanningInputBudget`。
3. `editorContextPipeline.ts` 两处手写预算公式改为消费同一函数。

### 验证

- `npx vitest run src/services/contextBudget.spec.ts src/services/editorContextPipeline.spec.ts src/services/conversationContextService.spec.ts` → 3 files / 64 tests passed。
- `npm run type-check` → exit 0。

## 2026-10-06 Phase 4 修复与 after4 复验结论

### after4 真实 Electron 现场

- 证据：`_audit/verification-r1-phase0-baseline/electron-after4-20261006124252/summary.json`、`turns.json`、`heartbeat.jsonl`、`observability.jsonl`、`run-trace/run-trace-outline-20261006-204302/run-trace.json`。
- 三轮均进入终态，但 Turn 1/2 被判 `partially_applied`，全文 `contentChanged=false`；合计 12 次物理请求、18 次工具调用，唯一工具失败是 `editor.read_range invalid_input`。
- `007-reasoning.json` 显示模型在“给建议”和“直接执行”之间摇摆；系统提示首句仍是“请给出建议和修改意见”，与已授权 `editor.write` 的 edit-task 语义冲突。
- `011/017/043/049-response.json` 均为 HTTP 200 纯文本供应商额度通知。旧工具循环把它当正文继续消费，导致应用生成“本轮未完整执行写入计划”文案并误判 `partially_applied`。

### 修复

1. [aiService.ts](/D:/codex/novel-workshop-vue3/src/services/aiService.ts)：授权工具运行中，`calls.length === 0` 分支最前面检测纯文本供应商软额度通知；命中即转 `kind=auth / statusCode=402 / quota_exhausted` 终态失败，不再静默续发请求。
2. [dialogueToolSurface.ts](/D:/codex/novel-workshop-vue3/src/services/dialogueToolSurface.ts)：`appendDialogueToolSurfaceDeclaration` 接收执行计划；当工具面含 `editor.write`、计划为 `edit-task` 且非 `discussion` 时，将“请给出建议和修改意见。”替换为“应用已授权本轮通过 editor.write 直接写入编辑器，请按执行计划完成写入。”
3. 大纲与首页均传入本入口执行计划，并把工具面声明写入 run trace 的 `dialogue-tool-surface-declaration` 事件。
4. SKILL 链路补齐：`realSkillTypes.ts`、`realSkillExecutor.ts`、`skillRouter.ts`、`workspaceSkillEngine.ts` 全链透传执行计划，避免普通对话已授权、SKILL 路径仍用建议口吻的新旧并存。
5. [ChatPanel.vue](/D:/codex/novel-workshop-vue3/src/components/chat/ChatPanel.vue)：首页 run 失败时用 `failRunningApiCalls` 收口，不再把供应商失败伪装成 canceled。

### 验证

- `npm run test:services -- src/services/aiService.spec.ts -t "plain-text provider quota notice"` → 1 passed，且断言 `fetch` 只调用 1 次。
- `npm run test:services -- src/services/dialogueToolSurface.spec.ts` → 24 passed。
- `npm run test:services -- src/services/aiService.spec.ts` → 139 passed。
- `npm run test:services -- src/services/agentOrchestrator.spec.ts src/services/longDocumentWriteCoverage.spec.ts src/services/longDocumentWriteProtocol.spec.ts` → 47 passed。
- `npm run test:services -- src/services/realSkillExecutor.spec.ts src/services/workspaceSkillEngine.spec.ts src/services/skillRouter.spec.ts src/services/skillOrchestrator.spec.ts` → 85 passed。
- `npm run type-check` → exit 0。
- `npm run test:services` → 129 files / 1483 tests passed。

### after5 状态

**未通过，未执行成功；被供应商额度耗尽阻断。** after4 证据显示该供应商 Coding Plan 额度已用完，当前凭据无法发起有效真实请求。额度刷新前，after5 只能登记为 blocked / `quota_exhausted`，禁止用 mock、旧 trace 或放宽断言冒充真实通过。额度恢复后继续使用 `SHENYI_R1_RUN_LABEL=after5` 与新的 epoch 重跑。

### Phase 4 收口补录

1. [SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md](/D:/codex/novel-workshop-vue3/_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md)：第 0 节补 edit-task 授权时系统提示为直写口吻；4.1 节补 HTTP 200 纯文本额度通知会被应用转为 `quota_exhausted` 终态；失败码表补 `quota_exhausted`。
2. [神意开发经验总结_v7.md](/D:/codex/novel-workshop-vue3/_audit/神意开发经验总结_v7.md)：升级 v8.4。G1.9 补“failed 不得伪装 canceled”与双入口终态分流；G2.11 补“HTTP 200 不等于业务成功”和纯文本/SSE/正文自然出现额度词三类测试要求。
3. [directWriteWiring.spec.ts](/D:/codex/novel-workshop-vue3/src/services/directWriteWiring.spec.ts)：新增大纲与首页双入口契约，锁 `failed` 使用 `failRunningApiCalls` 收口，禁止恢复 `cancelRunningApiCalls(runId, error || (status === ...))` 旧形态。

诚实边界：该契约测试是在实现修正之后补写的回归锁，本轮没有先观测到 RED；它能防止旧实现回归，但不能证明 TDD 顺序。

### Phase 4 收口补录二：大纲 finally 兜底语义

回头看发现大纲 `askAi` finally 仍有一个旧兜底：非取消、非 awaiting_user 时把残留 running API call 一律 `cancelRunningApiCalls(..., '运行收尾时仍未闭合')`。该分支会命中 `resolvePostProcessTerminalStatus` 返回的 `blocked/degraded`，把后处理拦截伪装成 canceled，违反 G1.9。

裁决：这不是合理历史兜底，是缺陷。修正为三向终态分流：awaiting_user → canceled（未发起 API）；`已取消生成` → canceled（真实用户取消）；其余一切未闭合（含 failed、degraded、blocked、success 但 API call 未自然闭合）→ failed。首页现有 `closeActiveHomeApiCall('failed', ...)` 口径因此与大纲一致。

- [OutlineWorkspace.vue](/D:/codex/novel-workshop-vue3/src/components/common/OutlineWorkspace.vue)：大纲 finally 删除伪 cancel 兜底，改为三向终态分流。
- [directWriteWiring.spec.ts](/D:/codex/novel-workshop-vue3/src/services/directWriteWiring.spec.ts)：契约补三条大纲 finally 精确断言，并禁止旧伪 cancel 形态回流。

验证：

- `npm run test:services -- src/services/directWriteWiring.spec.ts -t "maps provider failures"` → 1 passed | 11 skipped。
- `npm run test:services -- src/stores/runTrace.spec.ts -t "keeps real provider failures"` → 1 passed | 78 skipped。

### 诚实边界

- 已验证：纯文本额度通知的终态化、直写授权提示语义、SKILL 链路透传、全量服务测试与类型检查。
- 未验证：修复后 74,841 字文档在真实供应商上的 after5 全链路效果，包括 Turn 1/2 是否从 `partially_applied` 变为真实完成、全文是否发生重排、失败气泡是否呈现 `quota_exhausted`。
- after4 中 `editor.read_range offset/limit invalid_input` 属于 Phase 4 分页协议遗留，不在本轮额度修复范围内；after5 需要继续观察。

## 2026-10-07 R1 Phase 4 最终 after2 重跑收口

### 现场与结果

- 证据：`_audit/verification-r1-phase0-baseline/electron-after2-20261007100000/`（run `run-1791313778852-1`，导出 trace `run-trace-outline-20261007-030938`）。
- 复刻方式：真实 Electron + 真实供应商 `deepseek-v4-pro`，重放客户三轮原话；源文档 74,841 字，无 mock。
- Turn 1“按照Word文档的形式重构大纲，不要缩减内容。”：`success / edit_task_completed`，9/9 批次执行，`edit-task-completion-verified: {"verified":true,"violations":[]}`，`contentChanged=true`。
- Turn 2“符合我的要求，分叉一允许去重。不用出预览，直接写入”：`success / edit_task_completed_verified`，3/3 批次执行，完成度校验通过，`contentChanged=true`。
- Turn 3“** 为什么会有这个符号”：`success / plain_dialogue_complete`，意图 `discuss`，只读工具面，`contentChanged=false`。
- 合计 50 次物理请求全部 success、80 次工具调用中 76 次成功；无 `quota_exhausted`、无 retired tools、无请求失败。

### 遗留观察的裁决

1. Turn 2 中出现 `agent-state: stalled / partially_applied` 与“模型在覆盖完成前输出总结”告警，但同一毫秒级时间线随后落 `edit-task-task-finished completed`、`completion_verified=true, violations=[]`、`edit-task-terminal-override`，turn 终态归并为 `success`。这是“模型提前总结”的过程告警，不是终态缺陷；覆盖校验与终态归并修复已生效。
2. 4 次工具失败为：1 次 `operation_not_allowed_by_execution_plan`、2 次 `editor.write invalid_input`（其中一次是 `replace_match` 空 `content`，模型随即改用 `delete` 成功）、1 次 `editor.search` 空 query。均由模型自行修正后收敛，未阻断批次完成。
3. Electron 退出码 1 来自验证脚本关闭 renderer 后 CDP 断开，`electron-run.log` 末尾为 `[PAGE CLOSE]` / `[BROWSER DISCONNECTED]`；`summary.json outcome=completed` 是验证结果，不判定为应用失败。

### 结论

R1 Phase 4 的 section id 稳定性、分页协议、批次覆盖、终态归并与额度终态化，已在同一轮真实 74,841 字三轮复刻中同时得到正向证据。目标要求的 after2 级真实 Electron 重跑已完成，不再引用 after3/after4 作为最终证据。
