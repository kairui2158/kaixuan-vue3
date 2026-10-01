# 2026-09-23 EditTask 20 轮回头看审计

## 目标

在 EditTask Phase 5 之后执行 20 轮单维度回头看：逐轮核对设计需求、生产接线、测试契约、trace 覆盖和旧链路残留；发现缺陷先修复，再做全量回归与 Electron 真实 UI 验证。

## 逐轮记录

1. **状态机三方定义**：`dialogueToolSurface.ts`、`useEditTaskSession.ts`、`editTaskManager.ts` 的活动态集合一致，均为 planning / awaiting_batch / running_batch / partially_applied / waiting_user，无旧状态残留。
2. **终态工具面归一（M58）**：终态任务会把 `activeTask` 归一为 null，`writeToolsAllowed` 恢复普通写面，逻辑复核通过。
3. **取消路径终态 UI**：发现缺陷。`emit()` 使用 `manager.getActiveTask() || manager.getCurrentTask()`，导致 canceled 终态任务被重新挂回 `activeTask`，任务条永久显示且取消按钮可再次点击。
4. **成功路径对照**：成功路径显式清空 `activeTask`，与取消路径行为不一致，证实第 3 轮缺陷是状态同步遗漏而非设计需求。
5. **banner 契约**：`EditTaskBanner.vue` 以 `task` 是否为 null 决定显示，取消终态应消失；继续按钮仅在 waiting_user / partially_applied / awaiting_batch 可用。
6. **session 单测契约**：原测试断言取消后 `activeTask().status === 'canceled'`，把错误行为固化为契约，已改为断言取消后清空。
7. **弱恢复路径**：`buildEditTaskControlHandlers.onResumeEditTask` 原先对 canceled/failed 任务仍返回 ok，已加状态门禁，仅允许 waiting_user 与 awaiting_batch。
8. **生产入口接线**：主页 `ChatPanel.vue` 与大纲 `OutlineWorkspace.vue` 的三处入口均委托 `useEditTaskSession.resumeEditTask`，强实现路径覆盖 partially_applied 重试。
9. **执行器复核**：`editTaskExecutor.ts` 的批次重试、checkpoint 校验、信号取消逻辑未发现问题。
10. **runTrace 生命周期**：run / turn / apiCall 三层记录链路完整，EditTask 事件在双入口均写入 trace 与 DiagLogger。
11. **工具声明同源**：双入口的 `appendDialogueToolSurfaceDeclaration` 均传入本入口的任务状态，与实际工具面同源。
12. **验证器 mock 对账**：D2 场景的 scenarioTurn 分支与产品序列一致，失败、恢复、重试、第二次失败均按真实路径触发。
13. **旧符号扫描**：全仓仅测试保留 `editor.propose_edits` 负向断言，无旧入口调用残留。
14. **工具面透传**：`workspaceSkillEngine.resolveAuthorizedToolSurface` 在 chain / compose 路径均按任务状态透传控制工具，未发现旁路。
15. **跨轮工具审计**：`crossTurnToolAudit` 测试通过，工具摘要与下一轮注入不缺口。
16. **task_loop 策略**：`toolLoopPolicy` 测试通过，停滞重试与工具轮策略无回归。
17. **trace store**：`runTrace.spec.ts` 通过，批次事件、取消事件、终态事件记录链路完整。
18. **全量测试**：85 个测试文件、814 个用例全部通过。
19. **类型与构建**：`npm run type-check` 通过；`npm run build:vue` 通过，仅保留 Vite chunk 体积与配置提示，无阻断错误。
20. **Electron 真实 UI**：十场景压力实测通过，取消后任务条消失、trace 保留 `edit-task-task-canceled`，写/改/删循环、失败恢复、终态工具面收敛均有截图证据。

## 修复内容

1. `src/composables/useEditTaskSession.ts`：`emit()` 不再把终态任务写回 `activeTask`，只保留活动态。
2. `src/services/editTaskManager.ts`：`onResumeEditTask` 增加状态门禁，非法状态返回 `task_not_resumable`，不再对终态任务返回成功。
3. `src/composables/useEditTaskSession.spec.ts`：取消后断言任务条清空。
4. `src/services/editTaskManager.spec.ts`：补终态恢复必须失败的回归用例。
5. `scripts/verify-api-direct-write-electron.mjs`：取消场景改为断言 banner 消失，同时保留 trace 取消事件断言。

## 验证证据

```text
npx vitest run src/composables/useEditTaskSession.spec.ts src/services/editTaskManager.spec.ts src/services/dialogueToolSurface.spec.ts
Test Files 3 passed (3), Tests 23 passed (23)

npx vitest run src/services/workspaceSkillEngine.spec.ts src/services/toolLoopPolicy.spec.ts src/services/crossTurnToolAudit.spec.ts src/services/editTaskExecutor.spec.ts src/services/editTaskService.spec.ts src/stores/runTrace.spec.ts
Test Files 6 passed (6), Tests 102 passed (102)

npm run type-check
vue-tsc --noEmit, exit 0

npx vitest run
Test Files 85 passed (85), Tests 814 passed (814)

npm run build:vue
dist-renderer 构建成功，exit 0

node scripts/verify-api-direct-write-electron.mjs
===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====
```

## 结论

20 轮回头看发现并修复两处真实缺陷：取消终态任务条不收敛、终态任务弱恢复假成功。其余维度复核通过。本轮不升版本、不封装，等待用户确认后再进入交付流程。
