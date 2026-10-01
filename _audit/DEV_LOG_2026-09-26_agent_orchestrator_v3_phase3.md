# DEV_LOG 2026-09-26 - Agent Orchestrator V3 Phase 3

## 范围

- 方案：`_audit/PROPOSAL_2026-09-26_AGENT_ORCHESTRATOR_V3_INTEGRATED.md`
- Phase 3：AgentOrchestrator 状态机、防空转门禁、`context.remaining`、`agent.plan`、runTrace 五层事件接线。
- 本阶段只做任务层编排，不复制 aiService 的物理请求循环。

## 交付

- `context.remaining` 不再返回占位 null：
  - 接入 `estimateInputTokens()` 单源估算。
  - 接入 `runtime.getContextRemaining()`，由调用方注入真实供应商窗口与输出上限。
  - 窗口未知时保持 `contextWindowTokens: null`，不合成假窗口。
- 长文档自动路由：
  - 运行前按 `runtime.document` 与 `shouldAutoRouteToEditTask()` 判定。
  - 命中整篇重排、整篇替换、大范围编辑等场景时，任务进入 `needs_user`，原因记录为 `edit_task_required:<policy reason>`，不发物理请求，避免绕过 EditTask 直写。
- 伪工具调用防线：
  - 每轮 `CallAiResult` 返回后调用 `judgeConvergenceText()`。
  - 命中 `pseudo_tool_call` 时发出 `pseudo_tool` 警告事件，供 runTrace 与 UI 说明“本轮未写入”。
- `TaskResult.result` 保留最终 `CallAiResult`，调用方可以拿到完整 usage、toolResults、finishReason 等下游数据。
- runTrace 五层事件接线：
  - 新增 `agentTraceBridge.ts`，由组件层注入 Pinia 与 source/runId。
  - 事件类型映射为 `agent-*`，每轮状态同步写入 `agent-snapshot`。
  - `electron/ipc/runTrace.js` 导出时把 `event.payload` 外置为 `agent-event` payload 文件，主 run-trace.json 保持轻量。

## 回归测试

- `src/services/agentOrchestrator.spec.ts`
  - 新增：最终 CallAiResult 回传。
  - 新增：整篇长文档任务运行前自动路由 EditTask，且不发生物理调用。
  - 新增：伪工具调用事件。
- `src/services/agentTraceBridge.spec.ts`
  - 新增：agent 事件写入当前 run，payload 保留在事件上。
  - 新增：无当前 run 时不抛错。
- `electron/ipc/runTrace.js`
  - `node --check` 通过；agent-event payload 归档逻辑未破坏既有 payload 去重与导出。

## 验证证据

- `npm exec vitest -- src/services/agentOrchestrator.spec.ts src/services/agentTraceBridge.spec.ts src/stores/runTrace.spec.ts src/stores/runTrace.integrity.spec.ts --run`
  - 结果：4 files passed / 73 tests passed。
- `npm run type-check`
  - 结果：exit 0，无错误。
- `npm run test:services`
  - 结果：109 files passed / 1099 tests passed。
- `node --check electron/ipc/runTrace.js`
  - 结果：exit 0。
- `node --check electron/preload.js`
  - 结果：exit 0。

## 未完成与后续

- Phase 4：主进程真实 IPC（checkpoint:save/load/list、status、cancel-token、recover），替换 `electron/main.js` 中 `renderer_handled` 空壳。
- Phase 5：工具名冲突检测、顺序 `agent.spawn/wait`、子 Agent 超时终态。
- Phase 6：全量验证矩阵，包括 Electron 级真实 UI 实测、四供应商实测、恢复实测与 M17 回头看。
