# 2026-09-23 EditTask System Phase 5：终态工具面收敛与 Electron 实测收口

## 目标

完成 `PROPOSAL_2026-09-22_EDIT_TASK_SYSTEM_V1.md` Phase 5 的最后收口：修复“编辑任务结束后，下一轮 edit 请求没有 `editor.write`”的工具面收敛缺陷，并用真实 Electron UI 高强度实测验证失败、恢复、取消、终态后的普通写权限。

本文件同时记录 Phase 5 的三次迭代：路由窄门、提示声明缺口、终态收敛缺口。

## 迭代一：任务追问被路由窄门挡住

### 根因

第一版把“存在活动任务”当成路由层新意图的条件，但普通追问句缺少显式写入词时仍被 `discuss` 兜住；工具面在 discuss 下保持只读，模型只能回答“没有写入权限”。

### 修复

活动任务上下文直接进入 `authorizeDialogueTools()`：活动任务期间，普通追问暴露 `task.resume` / `task.cancel` 控制工具，`editor.write` 由任务执行器管理；`awaiting_batch` 状态表示重试轮，写工具恢复给模型。

## 迭代二：工具面存在但 system prompt 没有声明

### 根因

工具面正确后，下一轮请求仍可能凭历史对话声称没有权限，因为 system prompt 只包含旧的基础指令。

### 修复

新增 `appendDialogueToolSurfaceDeclaration()`：

- 列出本轮实际工具面。
- 活动任务 + `awaiting_batch` + 有 `editor.write`：声明“写入权限已恢复，必须调用 `editor.write` 重试当前批次”。
- 活动任务 + 无写工具：声明“必须调用 `task.resume`，由执行器按批次校验并写入”。
- 无活动任务：恢复普通直写或只读声明。
- 所有声明都禁止模型凭记忆或历史对话声称“没有写入权限”。

## 迭代三：终态任务仍挡住普通写权限

### 根因

`authorizeDialogueTools()` 上一版在判断写权限时只看“是否传入 task 对象”：

```ts
const writeToolsAllowed = permission.writeEditor && !task
```

任务进入 `completed` / `failed_after_write` / `canceled` 等终态后，`useEditTaskSession` 会把 `activeTask` 清成 null，但真实链路里终态 task 对象仍可能被传入授权函数。结果是 task 控制工具被正确移除，`editor.write` 却仍被“存在 task 对象”挡住，形成“任务结束但下一轮 edit 没有写工具”的断点。

### 修复

`src/services/dialogueToolSurface.ts`：

1. 先归一活动任务：`const activeTask = task && isActiveEditTask(task) ? task : null`。
2. 写权限改为：`permission.writeEditor && (!activeTask || taskAwaitsRetry)`。
3. 终态判定独立为 `taskIsTerminal = Boolean(task) && !activeTask`；终态时移除 task 控制工具并恢复普通工具面。
4. 删除上一轮叠加残留的 `isActiveEditTaskTool()` 过滤器，该过滤器曾把活动任务中的 `editor.get_state` 等普通读工具全部滤掉。

新增防回归测试：`restores the ordinary write surface for edit after a task finishes`，断言终态任务 + edit 意图时工具面必须回到 `editor.get_state` + `editor.write`，且不含任何 `task.*` 工具。

## 验证器假失败

Electron 验证脚本 D2 场景原 mock 逻辑是 `scenarioTurn <= 2` 失败、`> 2` 重试成功。第 4 轮实际返回 retryWrite 成功，但脚本却等待“取消任务”按钮，导致 30 秒超时。这是验证器口径错误，不是产品缺陷。

修复：`scripts/verify-api-direct-write-electron.mjs` 中第 4 轮显式返回 failedWrite，其余 `scenarioTurn > 2` 返回 retryWrite；恢复成功后新增断言任务条清零、第 4 轮真实请求为普通写工具面。

## 验证证据

- `npx vitest run src/services/dialogueToolSurface.spec.ts src/services/useEditTaskSession.spec.ts src/services/skillRouter.spec.ts`：18/18 通过。
- `npx vitest run`：85 个测试文件、814 个测试全部通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过（仅既有 Vite 配置 warning：jieba fs externalized、`__dirname` 提示）。
- `node scripts/verify-api-direct-write-electron.mjs`：`===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====`。
- Electron 日志关键行为：暂停轮工具面 `task.resume + task.cancel`；恢复轮工具面 `editor.write + task.cancel`；恢复成功后第 4 轮恢复纯 `editor.write` 普通写面；取消后 trace 记录 `task-canceled`。
- 证据目录：`_audit/verification-api-direct-write-electron/`（01-10 截图与 `run-trace-export.json`）。

## M17 回头看

- `rg "isActiveEditTaskTool"` 全仓 0 残留。
- `rg "onPlanUpdate"` 全仓 0 残留，旧计划接口已清零。
- `task.update_plan` 仅存在于 `editorTools.spec.ts` 的“必须不存在”守护断言。
- `editor.propose_edits` 仅作为守护断言存在，无生产回流。
- `git diff --check` 通过。
- 本轮不封装；版本升级与安装包生成等用户确认后执行。

## 收尾清理

- Electron 验证脚本输出显示 `[CLEANUP] stress profile and temporary exports removed`。
- `_audit/verification-api-direct-write-electron/` 仅保留本次有效证据：10 张截图与 1 份 run trace 导出，无临时探针残留。
- 工作区的大量修改与未跟踪文件属于当前应用本体，按 M29/M42 分类保留，不作为旧留存删除。
