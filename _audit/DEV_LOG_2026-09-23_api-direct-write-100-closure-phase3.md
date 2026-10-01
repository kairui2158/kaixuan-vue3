# DEV LOG 2026-09-23 - API 直写 100% 闭环 Phase 3（长文档 EditTask 多批执行）

## 目标

执行 `PROPOSAL_2026-09-23_API_DIRECT_WRITE_100_CLOSURE_FINAL.md` Phase 3：让大范围整理自动进入 EditTask 多批执行，补齐长文档直写的“计划、批次、checkpoint、恢复/取消、失败收口”闭环。

本阶段不设 token 预算；版本升级与封装按方案留给 Phase 8。

## 范围与实现

1. 长文档策略接线（`src/services/longDocumentPolicy.ts`）：
   - 全文/整篇/全篇/整理/重排等请求：文档达到 80000 字符后 `editTaskExecution: true`。
   - 普通超长文档：同样按 80000 字符阈值进入 EditTask；低于阈值保持 direct loop。
   - 结构移动/顺序调整：识别为长文档，但保持 `executionModeReason: structural-move-targeted-commands`，走定向读取与受限命令，不自动升级整篇任务。
2. 大纲工作台与主页编辑器接线：
   - `OutlineWorkspace.vue` 在发起 direct 对话前执行 `analyzeLongDocumentRequest()`，得到 `useOutlineEditTaskPlan`。
   - `ChatPanel.vue` 同步计算 `homeLongDocumentEditTaskPlan`。
   - 两处均把该决策传入 `forbidWholeDocumentReplacement` 与 `startOrContinueBatch(..., { multiBatch })`。
3. 整篇替换硬拦截（`src/services/editorTools.ts`）：
   - EditTask 多批模式下，单批 `replace_document` 返回结构化错误 `document_too_large_for_whole_replacement`。
   - 错误消息明确要求改用 `editor.document_map / editor.read_range` 分段读取，并用 `replace_match`、`move`、`delete` 等受限命令分批写入。
4. 多批生命周期（`src/composables/useEditTaskSession.ts`）：
   - `multiBatch: true` 时，同目标活动任务可追加批次；批与批之间保持任务活动，不提前终态。
   - 每批成功后写 `after_batch` checkpoint（`documentVersion + contentHash`）。
   - 轮次结束时调用 `finishActiveTask({ succeeded })`：成功收敛到 `completed`，失败收敛到 `failed_before_write / failed_after_write`，避免活动任务悬挂。
   - 批次执行中被取消时返回 `task_canceled`，不会把取消批次改写成成功生命周期。
5. 工具面任务控制（`src/services/dialogueToolSurface.ts`）：
   - EditTask 活动期自动暴露 `task.cancel`；`awaiting_batch / waiting_user / partially_applied` 且提供恢复处理器时暴露 `task.resume`。
   - 仅 `awaiting_batch` 状态恢复 `editor.write`，其余活动状态必须走 `task.resume`，由执行器按批次校验写入。
   - system 声明会明确当前任务 ID、状态、写入权限形态，禁止模型凭历史对话宣称“没有写入权限”。
6. 意图路由窄修（本轮 Electron 压测暴露的根因）：
   - 重写 `SCOPED_WRITE_TARGET_PATTERN`：结构性范围词（`第N章/节/段/卷`、`第N到M节`、`首尾/开头/结尾两节`、`全文/整篇/全篇`）与名词目标等价参与 edit 计分。
   - 删除旧裸词匹配（单独“大纲/正文/设定/章节/卷纲”不再把讨论句推向 edit）。
   - “修改第1节 / 修改第三章 / 修改首尾两节”不再落入 `no-keyword-overlap`；“帮我整理一下 / 第3节写了什么 / 改成什么样”等讨论与疑问负样本保持原判。

## 关键语义

- “进入 EditTask”的判断先看请求形态，再看文档规模：小文档的全文整理仍可用 direct；结构移动即使长文也不自动升级整篇任务。
- EditTask 不是让模型自由重写整篇，而是强制“地图 -> 分段读取 -> 受限命令 -> 分批 checkpoint”。这是 1M 级长文档的安全边界。
- `awaiting_batch` 是唯一允许模型重试 `editor.write` 的活动状态；`task.resume` 的语义是恢复执行器批次，不是给模型开放直接写权限。
- 多批任务只在用户轮次结束时收口；中途收口会把后续批次错误挂进终态，这是本轮显式修复的旧缺陷。

## 验证证据

- `npx vitest run src/services/chainIntentRouter.spec.ts src/services/longDocumentPolicy.spec.ts` → 2 files / 51 tests passed。
- `npm run verify:phrase-corpus-sync` → 1789 phrases / 26 groups / 395 samples，problems: []。
- `npm run type-check` → exit 0。
- `npm run test:services` → 88 files / 890 tests passed。
- `npm run build:vue` → exit 0（仅 Vite 两条既有非阻塞 warning：jieba fs externalized、native config `__dirname`）。
- `node scripts/verify-api-direct-write-electron.mjs` → PASSED，包含 `12-outline-long-document-edit-task.png`：工具面含 `editor.write`，无 `tool_not_found`；E1-E3 场景全部通过。
- 路由单行复现：4 条范围词正样本全部 `matched/edit`；6 条只读/疑问负样本保持 discuss/no_match。

## 回头看

- 生产接线：大纲工作台与主页编辑器都由 `analyzeLongDocumentRequest()` 单源决策；`multiBatch` 与 `forbidWholeDocumentReplacement` 同源传入，未出现一侧升级、另一侧仍允许整篇替换的分叉。
- 意图边界：本次是范围词语义补齐，不是阈值放宽。讨论请求、位置咨询、状态询问负样本均保持只读；写入类安全阈值未调整。
- 状态机覆盖：`planning / awaiting_batch / running_batch / partially_applied / waiting_user` 与五个终态均有转换测试；`task_failed` 会按是否已有写入分流到 `failed_before_write / failed_after_write`。
- 可观测性：`long-document-policy` 事件记录 reason、executionMode、executionModeReason、outlineChars、outlineBytes；工具面声明与 `actualToolSurface` 由单源生成，trace 三层可对账。
- 新旧并存：旧确认预览链路保持已删除状态；`replace_document` 仍可用于短文档单批合法场景，仅在 EditTask 多批模式被拦截，无全局误伤。

## 遗留

- Phase 4 供应商矩阵未开始：Gemini streaming 工具调用仍为 `unverified`，Azure / Anthropic / Gemini live 覆盖待补。
- 1M 级真实文档性能与内存基准属 Phase 7 三档 Electron 实测。
- Phase 8 统一升版封装，本阶段不改版本号。
