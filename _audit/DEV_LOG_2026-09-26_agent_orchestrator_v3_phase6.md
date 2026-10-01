# DEV_LOG 2026-09-26 - Agent Orchestrator V3 Phase 6

## 范围

- 方案：`_audit/PROPOSAL_2026-09-26_AGENT_ORCHESTRATOR_V3_INTEGRATED.md`
- Phase 6：全量验证、M17 回头看、日志与经验回写、版本升级与封装、收尾清理。

## 本轮 M17 补修

- `src/components/common/OutlineWorkspace.vue` 的 workspace skill engine `buildTools` 钩子：
  - `onToolStart` / `onToolCall` 的 `tool-activity` UI 派发补上 `isAgentRuntimeToolName()` 统一过滤。
  - 该链路当前工具面来自 `buildOutlineToolSurface` → `buildDialogueToolSurface`，未注入 `agent.spawn/wait/cancel`，因此本轮不是现行 UI 泄漏，而是“工具面接线一变即漏”的防御性旁路。
  - `recordOutlineToolCall()` 与 runTrace/DiagLogger 路径保持不变；本修复只拦对话 UI 派发，不吞观测记录。

## M17 四向回头看结论

1. 新旧并存：
   - 全仓 `new CustomEvent('tool-activity')` 共 12 个派发点，ChatPanel 4 个、OutlineWorkspace 8 个，全部处于 `isAgentRuntimeToolName()` 保护内。
   - `renderer_handled` 生产清零；`AGENT_RUNTIME_TOOL_NAMES` 仅由 `agentToolConflict.ts` 单源维护。
2. 旁路：
   - workspace skill engine 两个入口已补防御过滤；其余入口均已有过滤。
3. 回归：
   - `npm run type-check` 通过。
   - `npm run build:vue` 通过，产物重建后执行 Electron 验证。
   - `node scripts/verify-agent-sub-agent-electron.mjs` 通过：outline/home 双场景、外层工具面含 agent 工具、子 Agent 工具面不含 agent 工具、trace 闭环、UI 不泄漏工具名。
   - `node scripts/verify-agent-state-electron.mjs` 通过：checkpoint hash、cancel token、非终态任务重启恢复。
   - `npm run test:services`：111 个测试文件、1117 条测试全部通过。
4. 观测覆盖：
   - agent 事件进入 runTrace；`tool-conflict` 在主页与大纲双入口落 trace 与 DiagLogger；agent 运行时工具身份不进入对话 UI，符合 M72 分层。

## Phase 6 验证矩阵

- 服务层：1117 条测试全绿，包含 `agentOrchestrator.spec.ts`、`agentDialogueRuntime.spec.ts`、`agentToolConflict.spec.ts`、`agentTraceBridge.spec.ts`。
- Electron 子 Agent：外层请求暴露 `agent.spawn/wait/cancel`；子 Agent 请求不暴露；顺序执行；一次真实子 Agent 请求；最终正文可见；UI 不泄漏工具名。
- Electron 状态：任务 checkpoint 带 `documentVersion + contentHash`；取消写入 cancel token 并进入终态；重启后恢复非终态任务。
- 历史证据（Phase 1-5 已登记）：
  - `resolveMaxTokens` 改为 `protocolMaxTokens(resolveModelCapability(...))`，无 `|| 8192` 假默认，`aiService.spec.ts` 锁定。
  - 工具循环默认 direct 12 轮，收敛与超时路径有测试。
  - 生产接线 `verify:production-wiring` 359 modules 通过。

## 诚实边界

- 供应商 live 分层沿用 M38/M67 口径：本轮 mock Electron 全通过；anthropic / gemini / azure 缺真实凭据，保持 `untested`，不冒充 live pass。
- `agent.plan` 属于计划类工具，允许进入子 Agent 工具面；`agent.spawn/wait/cancel` 只属于外层任务，不递归暴露，测试已锁定。

## 收尾

- 版本升级至 3.67.0 并执行 `npm run build`。
- 新增 `scripts/verify-packaging-3-67-0.mjs`，以 asar 真实启动 + `window.electronAPI` 断言完成封装核验。
- 清理本轮 Electron profile：`_data/agent-sub-agent-profile`、`_data/agent-state-profile`；保留源码、测试、方案、DEV_LOG、经验文件与当前验证证据。
