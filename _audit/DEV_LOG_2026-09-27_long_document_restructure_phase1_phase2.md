# DEV_LOG 2026-09-27 - 长文档重排架构 V2 Phase 1 + Phase 2

## 范围

- 方案：`_audit/PROPOSAL_2026-09-27_LONG_DOCUMENT_RESTRUCTURE_ARCHITECTURE_V2.md`
- Phase 1：`LongDocumentExecutionPlanner` 单源计划器与上下文配置纠偏。
- Phase 2：EditTask 真实计划接入、批次事件顺序修复与长文档 steering 单源化。

## Phase 1 交付

- 新增 `src/services/longDocumentExecutionPlanner.ts`：
  - 操作分类：`restructure / normalize / deduplicate / targeted_edit / rewrite_segments`。
  - 执行模式：`direct / edit-task`，计划对象统一携带段、读写策略、预期变更、不变量与窗口状态。
  - 供应商窗口冲突：`maxOutputTokens` 吞没输入窗口时标记 `provider_configuration_conflict`，降级为可用规划窗口，禁止以 0 可用上下文继续路由。
  - 未声明窗口使用 planning-only 的 1M 未知窗口，不把应用层猜测当成交付能力上限。
- `src/services/contextBudget.ts` 增加 `provider_configuration_conflict` 分支，保留请求层观测。

## Phase 2 交付

- EditTask 事件顺序修复：
  - `plan_ready` 在 `planning` 状态下合并 `batchDetails`，不再覆盖已登记批次。
  - 事件顺序为 `plan_ready -> task_started -> batch_started`。
  - 后续批次通过 `appendEditTaskPlanBatch` 追加，保留历史批次元数据。
- 计划单源：
  - 主页在 `ChatPanel.vue` 构建计划；大纲工作台在 `OutlineWorkspace.vue` 构建计划。
  - `agentOrchestrator` 在每个物理请求注入同一个 `executionPlan`。
  - `aiService` 的长文档 steering 只从 `executionPlan` 生成，消除“一处禁止整篇替换、另一处鼓励整篇替换”的协议矛盾。
- 终态任务恢复：
  - `getActiveTask()` 对 completed / failed / canceled 返回 null。
  - 后续写入重新 `startTask`，旧终态任务不会阻塞下一轮请求。

## 验证

- `npx vitest run src/services/aiService.spec.ts`：123 tests passed。
- 定向 EditTask / planner / orchestrator 回归：5 files，70 tests passed。
- `npm run test:services`：116 files，1175 tests passed。
- `npm run type-check`：通过。
- Electron 可见窗口矩阵：`scripts/verify-agent-orchestrator-v3-phase6b-electron.mjs` 通过。
- 证据：`_audit/verification-agent-orchestrator-v3-phase6b/phase6b-report.json`。
- 覆盖：15 轮（读取 / 定向修改 / 定向删除 / 重排 / 标点整理各 3 轮），500k 字符，33 次物理请求，279 个 agent 事件，compaction 后强制崩溃恢复通过。
- 诚实登记：`live: "untested-no-live-credentials"`，真实供应商 API 留到 Phase 6，未冒充已验证。

## M17 回头看

1. 目标对账：Phase 1/2 的目标全部落地，无未执行项。
2. 影响圈对账：planner、EditTask 状态机、agent orchestrator、aiService steering、主页与大纲工作台双入口均覆盖。
3. 新旧并存扫描：`longDocumentPolicy` 仅保留兼容导出；UI 不重复构建计划；orchestrator fallback 只在 `executionPlan` 缺失时使用。
4. 登记缺口：run trace 的 EditTask 生命周期事件当前缺少 `plan.batchDetails / segmentId / expectedChange / invariantResult`。这是 Phase 5 观测项，不阻塞 Phase 2，但必须在 Phase 5 补齐。

## 后续

- Phase 3：重排、分段整理、重复项删除的完整写协议。
- Phase 4：删除授权合同、命令 hash 重放、孤儿正文处理与回滚保证。
- Phase 5：trace 补齐计划、批次、授权、心跳全量字段。
- Phase 6：100k / 200k / 1M 字真实 UI + 真实 API 压测与失败恢复矩阵。
