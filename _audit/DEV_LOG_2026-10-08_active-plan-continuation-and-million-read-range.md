# 2026-10-08 Active Plan Continuation 与 1M 读取坐标修复

## 范围

- Active plan continuation：T1 建计划后 `needs_user`，T2 保持只读讨论不重建计划，T3 用户确认后复用同一 `planId` 真实写入并收敛 `edit-task-task-finished`。
- 1M Electron 复刻暴露的新缺陷：`editor.read_range` 在标题独占节上返回 `invalid_range`，导致 1M 大纲无法进入批次写入。

## 根因

`editor.read_range` 实际读取区间是 `section.start` 到 `section.end`（标题 + 正文），但 offset 校验使用 `section.charCount`（正文长度，不含标题）。两套坐标并存导致：

- 标题独占节 `charCount=0`，offset 0 被误判越界。
- 尾部分页 offset 大于正文长度但小于完整节区间时，`nextCursor` 继续读取被误拒。

## 修复

- [editorDocumentMap.ts](../src/services/editorDocumentMap.ts) 中 `read_range` 的 cursor 与显式 offset 校验统一改为 `Math.max(0, section.end - section.start)`。
- `outlineStructure.charCount` 语义不变，继续表示正文长度；文档地图与摘要消费方不受影响。
- 测试新增标题独占节可读、节内单一坐标分页两个用例，并把第二页断言校准为完整区间坐标。

## 验证

- TDD：红测 `1 failed | 13 passed` → 修复后 `14 passed`。
- 回归：`npm run test:services` → 133 files / 1562 tests 全绿。
- 类型：`npm run type-check` 通过。
- 构建：`npm run build:vue` 通过；仅既有登记 warning。
- Electron 真实 UI：`node scripts/verify-api-direct-write-electron.mjs` 全量 PASSED，含 1M 场景 `13-outline-million-document-edit-task.png`；整篇替换负路径仍被 `document_too_large_for_whole_replacement` 阻断，写入门禁未放宽。

## 2026-10-08 回头看补漏

- 夦查发现 `analyze` 追问在 planner 中同样解析为 `discussion`，入口层的等待计划保留判定本身覆盖该分支；本轮已补集成测试，防止只读追问被误当成新编辑请求而清掉 `awaiting_user_plan`。
- 授权摘录原先只记录 `discuss` 回复，`analyze` 回复会被排除；已改为 `discuss` 与 `analyze` 都进入计划授权上下文，双入口一致。
- 清理 `ActiveExecutionTaskStore.markStatus`：无生产调用点，属于旧状态接口残留，已删除并同步测试，避免新旧状态语义并存。

## 2026-10-08 回头看二轮补录

- 大纲入口自锁回归：`sendMessage` 置位 `outlineSendStarting` 后调用 `askAi`，而旧 `askAi` 用包含该瞬态锁的 `outlineInputBlocked` 做执行拦截，导致自己拦截自己。现拆出 `outlineExecutionLocked` 只看生成态；`outlineInputBlocked` 仅负责 UI 防重复提交。首页无对称自锁路径，但同步补 `homeSendStarting` 防重复提交，并在 `directWriteWiring.spec.ts` 增加双入口守卫。
- Electron 验证脚本修复：`respond()` 旧引用已删除的全局 `scenarioCount` 会抛 `ReferenceError`；改为使用本轮请求记录内的 `requestCount`，并修正每个 scenario/turn 的计数语义。
- 首个格式编辑场景文案 `你把大纲的标点符号格式重新排版` 会命中本地 `normalize` 转换，导致未发起 API 直写请求；场景改为 `请把第二章内容替换成新的第二章大纲`，mock 分类器同步补词，确保验证的是 API 直写路径而非本地转换路径。
- 验证：`npm run test:services` → 133 files / 1565 tests 全绿；`npm run type-check` 通过；`node scripts/verify-api-direct-write-electron.mjs` 连续两轮全量 PASSED，包含双入口等价与 1M 场景。控制台中的 cancel、integrity_failed、物理请求预算耗尽为脚本刻意构造的负路径，最终均收敛并 PASS。

## 收尾边界

- 版本保持 3.77.0，未封装。
- 台账：[_audit/TASK_LEDGERS/2026-10-08_active-plan-continuation.md](_audit/TASK_LEDGERS/2026-10-08_active-plan-continuation.md)。

# 2026-10-11 全文一次成型真实链路证据补录

- 相关任务：[_audit/TASK_LEDGERS/2026-10-10_full-context-single-pass-restructure.md](_audit/TASK_LEDGERS/2026-10-10_full-context-single-pass-restructure.md)
- 真实 Electron + 真实 API 完成大纲/首页、无 SKILL/有 SKILL 共 4 场景验证：74,293 字大纲整篇整理重排均为 `success / final_draft_complete`，每场景 1 次物理请求、0 次工具调用、`finishReason: stop`，全文长度均发生变化。
- 完整证据：[_audit/verification-single-pass-live-replay/verification-result.json](_audit/verification-single-pass-live-replay/verification-result.json)
- 详细记录：[_audit/DEV_LOG_2026-10-10_full-context-single-pass-live-verification.md](_audit/DEV_LOG_2026-10-10_full-context-single-pass-live-verification.md)
