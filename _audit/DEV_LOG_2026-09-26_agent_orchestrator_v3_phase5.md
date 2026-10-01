# DEV_LOG 2026-09-26 - Agent Orchestrator V3 Phase 5

## 范围

- 方案：`_audit/PROPOSAL_2026-09-26_AGENT_ORCHESTRATOR_V3_INTEGRATED.md`
- Phase 5：Agent 工具名冲突防护、外部工具重名剔除、顺序子 Agent 管理、工具冲突观测接线。

## 交付

- `src/services/agentToolConflict.ts`：
  - `BUILT_IN_TOOL_NAMES` 单源维护内置工具名单。
  - `findAgentToolNameConflicts()` 识别外部工具占用内置名与外部重名。
  - `removeConflictingExternalTools()` 保留首个工具并剔除冲突后续项。
  - `createSequentialSubAgentManager()` 实现队列 + `executing` 标志的单队列串行执行；同一时间只跑一个子任务。
  - `createAgentSubAgentTools()` 输出 `agent.spawn` / `agent.wait` / `agent.cancel` 三个工具契约；超时进入 `failed / sub_agent_timeout` 终态，不静默重跑。
- `src/services/dialogueToolSurface.ts`：
  - 工具面构建期执行冲突检测。
  - 冲突外部工具不进入 `tools`，诊断保留在 `toolConflicts`。
- 观测接线：
  - `ChatPanel.vue` skill/plain 两个入口写 `tool-conflict` runTrace 事件与 `home/tool-conflict` DiagLogger。
  - `OutlineWorkspace.vue` skill/plain 两个入口写 `tool-conflict` runTrace 事件与 `outline/tool-conflict` DiagLogger。
  - `agentTraceBridge.ts` 的 `agent-${event.type}` 映射覆盖 `agent-tool_conflict`。

## M17 发现并修复的真实缺陷

- `BUILT_IN_TOOL_NAMES` 曾把不存在的 `editor.reveal_target` 当作内置名，真实工具名是 `editor.reveal`。
  - 若不修，外部 SKILL 可用 `editor.reveal_target` 绕过内置名单且不会被识别为冲突。
  - 已修正为 `editor.reveal`，并有测试锁定。
- `createSequentialSubAgentManager()` 早期实现 spawn 即执行，多个子任务会并行，违背方案“顺序 spawn/wait”承诺。
  - 已改为单队列串行，测试锁定执行顺序。

## 回归测试

- `src/services/agentToolConflict.spec.ts`：
  - 外部占用内置名被拒绝。
  - 外部重名保留首个、剔除后续。
  - 子 Agent 真串行顺序执行。
  - 等待超时进入 `failed/sub_agent_timeout`。
  - spawn/wait/cancel 参数契约校验。
  - 冲突回调输出诊断。
- `src/services/dialogueToolSurface.spec.ts`：
  - `toolConflicts` 返回诊断。
  - 冲突工具不进入最终 `tools`。
- `src/services/agentTraceBridge.spec.ts`：
  - `agent-tool_conflict` 映射为 runTrace 事件。

## 验证证据

- `npm exec vitest -- src/services/agentToolConflict.spec.ts src/services/dialogueToolSurface.spec.ts src/services/agentTraceBridge.spec.ts src/services/agentOrchestrator.spec.ts --run`
  - 结果：4 files passed / 36 tests passed。
- `npm run type-check`
  - 结果：exit 0，无错误。
- `npm run test:services`
  - 结果：110 files passed / 1108 tests passed。
- M17 扫描：
  - `editor.reveal_target` 在生产代码清零。
  - `buildDialogueToolSurface` 的 3 个生产调用点全部接入冲突观测。

## 诚实边界：未接生产工具面

- `createAgentSubAgentTools()` 目前只有服务层实现、内置名单保护与测试，尚未接入任何生产工具面。
- 也就是说：`agent.spawn/wait/cancel` 还不能被真实对话模型调用，当前生产工具面只提供冲突防护与观测闭环。
- 该项不能在 Phase 5 日志中宣称完成，Phase 6 必须二选一：
  1. 将子 Agent 工具接入 orchestrator/dialogue 工具面并完成 Electron 实测；
  2. 明确登记为首期未接线项，并在方案收口时向用户说明。

## 未完成与后续

- Phase 6 全量验证矩阵尚未执行。
