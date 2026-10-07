# DEV_LOG 2026-10-05 组件存在必要性与生命周期收敛

## 目标

执行 [_audit/PROPOSAL_2026-10-05_COMPONENT_LIFECYCLE_RETIREMENT.md](_audit/PROPOSAL_2026-10-05_COMPONENT_LIFECYCLE_RETIREMENT.md)：对 8 个可疑组件/链路完成保留、修复、迁移、下架、删除裁决，并完成单测、Electron、构建与回头看闭环。

## 裁决执行

1. 编辑器写入跟随：保留修复。`editorViewport.ts` 增加程序滚动标记，`followWriteProgress()` / `revealTarget()` 滚动前标记 `programmaticScroll`，`onUserScroll()` 只在非程序滚动时暂停跟随；程序滚动仍触发 `scrollListeners`，搜索高亮重绘不受影响。
2. 子 Agent 三工具：先下架再修复，但实际交付为“生命周期补全后直接恢复上架”。原因是 Phase 2 生命周期（AbortSignal 传播、终态队列收口、trace 生命周期事件、`close()` 清理）已在本轮完成，并通过单测与 Electron 验证；继续保留下架会交付一个已修复却不可用的能力。原方案“先下架”的执行口径由本记录显式取代，避免审计口径漂移。
3. `useAiTools`：拆分处理。生成流水线 8 个 AI 按钮从 `PipelinePanel.vue` 移除，仅保留非 `useAiTools` 的“AI起名”；大纲自动拆解迁移到统一 AI 调用/trace 路径；`src/composables/useAiTools.ts` 删除，生产源码引用为 0。
4. 去AI味：保留修复。DeAI 统一预算来源，等待状态、续命/继续入口、trace 事件补齐。
5. `timeoutHint`：接线。主页、大纲 runtime、trace、watchdog 同批接线，长文档 hint 为 3600000ms。
6. `awaiting_confirmation`：源头归一。生产链路产出 `awaiting_user`；旧名仅保留在 `stateTransitionGuard.ts` 历史导入兼容映射及其测试。
7. 物理请求上限：保留并统一。主页与大纲共用 `agentPhysicalRequestLimit`；共享预算修正为“外层请求预扣 + 工具迭代内扣（`inCall: true`）”，上限为 `maxPhysicalRequests - 1`，耗尽映射 `stalled/physical_request_limit` 或 `partially_applied`。
8. 生成流水线旧 AI 工具栏：直接退役删除，未保留隐藏观察期；Electron 证据确认 8 个按钮为 0、AI起名保留。

## 根因与关键修复

共享物理请求预算存在双重计数根因：orchestrator 对外层请求预扣预算后，`aiService.ts` 工具循环内每个请求又按外层语义扣减一次，导致主循环未到语义上限就提前停机。修复为 `consumePhysicalRequestBudget?: (input?: { inCall?: boolean }) => boolean`，orchestrator 预扣外层请求，工具迭代用 `maxPhysicalRequests - 1` 允许值内扣减，并把耗尽作为显式终态而不是静默失败。

## 验证

1. `npm run type-check`：通过，exit 0。
2. `npx vitest run src/services/aiService.spec.ts src/services/agentOrchestrator.spec.ts src/services/agentToolConflict.spec.ts src/services/directWriteWiring.spec.ts`：186/186 通过。
3. `npm run test:services`：129 个测试文件、1458/1458 通过。
4. `npm run build:vue`：通过，仅既有构建 warning。
5. `node scripts/verify-component-lifecycle-electron.mjs`：PASSED。证据 `_audit/verification-component-lifecycle/evidence.json`，覆盖写入跟随、用户接管、暂停/恢复跟随、停止跟随、程序滚动搜索重绘、旧工具栏 0/8 + AI起名保留、DeAI 预算续命、大纲自动拆解、timeout hint。
6. `git diff --check`：无空白错误，仅 CRLF 提示。

## 诚实边界

1. 子 Agent Electron 证据 `_audit/verification-agent-sub-agent-electron/evidence.json` 为 mock provider 请求，验证工具面、生命周期与 trace 收口，不冒充真实供应商。
2. 本轮未重新执行子 Agent 真实 API 链路；状态为 `untested`，不以历史 live 证据冒充本轮。
3. 长文档 Phase 7 live run 的 heartbeat 最后样本仍为 `running`，1 个 API call、0 assistant chars；该项为未完成/进行中证据，不计入本轮 PASS。
4. 历史真实 API 复刻证据保留在 `_audit/verification-outline-20261004-162304-live-replay/`，属于 2026-10-05 早前任务，不重复计入本验证。

## G0.5 回头看

1. 工作区脏状态分类：40 个修改/删除文件均归入本轮组件生命周期任务；`useAiTools.ts` 删除为任务目标；`outline-with-skill/failure.json` 与 `turns-partial.json` 删除为被 `outline-no-skill/` 新证据替代的失败现场清理；新增 proposal、验证证据目录与 Electron 验证器保留。
2. `rg "useAiTools"`：生产源码命中 0；剩余命中为验证器断言字符串、历史 DEV_LOG/方案与 `_audit/call-graph.*` 历史证据，不参与执行。
3. `rg "awaiting_confirmation"`：生产源码仅 `stateTransitionGuard.ts` 兼容映射与其测试；其余为历史方案、日志与社区调研资料。
4. 版本保持 3.75.0；本任务未收到封装指令，未执行打包，也未删除现有安装产物。
