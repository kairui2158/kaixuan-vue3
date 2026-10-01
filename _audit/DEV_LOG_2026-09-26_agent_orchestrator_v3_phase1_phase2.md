# DEV_LOG 2026-09-26 - Agent Orchestrator V3 Phase 1 + Phase 2

## 范围

- 方案：`_audit/PROPOSAL_2026-09-26_AGENT_ORCHESTRATOR_V3_INTEGRATED.md`
- Phase 1：Tokens 无感化，能力解析与假默认清理。
- Phase 2：Usage 校准与压缩生命周期、checkpoint、失败回退。

## Phase 1 交付

- `ModelCapabilityService` 接入模型能力解析，输出路径不再回落到 8192/128000/4096 假默认。
- `resolveAvailableContextTokens()` 与 `contextBudget.ts` 建立可用上下文预算单源。
- 请求体按能力已知、能力未知、显式覆盖三类收敛，旧假默认在代码与 trace 输出中清零。

## Phase 2 交付

- `ContextCompactionLifecycleStage` 定义 `pre_compact -> summarizing -> checkpoint -> post_compact -> window_switch`，另含 `checkpoint_failed`。
- `ConversationContextService` 新增：
  - `saveCompactionCheckpoint()`：压缩前保存目标、关键事实、硬约束、待决问题、必要片段、工具状态与内容哈希。
  - `loadCompactionCheckpoint()`、`verifyCompactionCheckpoint()`、`getActiveCompactionCheckpoint()`。
  - checkpoint 写盘失败时不执行压缩，历史保持原样，事件标记 `checkpoint:failed`。
  - 跨轮元数据继承：每轮合并上一轮 checkpoint 上下文与当前轮 meta，压缩触发时目标与事实不丢。
  - 双哈希校验：`contentHash` 锁定压缩前快照，`postCompactionHash` 锁定成功压缩后的会话；恢复只接受其中一侧可信，hash 不匹配进入 `hash_mismatch`，不静默重跑。
- 主页 `ChatPanel.vue` 与大纲 `OutlineWorkspace.vue` 的压缩生命周期事件写入 runTrace 与 DiagLogger，覆盖成功、失败与窗口未知分支。
- `ContextCompactionLifecycleEvent.workspace/sessionId` 保持可选：服务端内部发射会补齐，UI 诊断侧允许本地上下文补字段，避免对象展开覆盖。

## 修复与回看记录

- 红测根因一：`checkpointContext` 原先只在压缩轮写入，导致首轮完整 meta 无法跨轮继承。已改为每轮记录、压缩时消费。
- 红测根因二：checkpoint 校验只带压缩前哈希，成功压缩后的会话必然 hash 不匹配。已引入 `postCompactionHash`，并保留压缩前内存快照校验。
- M17 回头看发现并修复：
  - 生命周期事件必填字段导致服务端内部发射类型错误。
  - 主页/大纲 DiagLogger 对象展开导致 `workspace` 重复覆盖。
  - checkpoint 快照严格空值问题。
  - 测试中重复 `setCompactionRouting` 与未断言的 `checkpointWrites`，已改为断言最后一次 checkpoint 写盘包含继承的 goal。

## 验证证据

- `npm exec vitest -- src/services/conversationContextService.spec.ts --run`
  - 结果：29 passed / 29。
- `npm run type-check`
  - 结果：exit 0，无输出错误。
- `npm run test:services`
  - 结果：107 files passed，1086 tests passed。

## 后续

- Phase 3：`AgentOrchestrator` 状态机、plan contract、防空转门禁、`context.remaining`、`agent.plan`。
- Phase 4：主进程 IPC checkpoint/status/cancel/recover，替换 `renderer_handled` 空壳。
