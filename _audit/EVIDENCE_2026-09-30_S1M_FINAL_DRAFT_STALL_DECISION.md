# 2026-09-30 S1M 终稿停滞证据与决策

## 结论

S1M（1,000,022 字 / 20 段）真实终稿实测已完成 16 段，累计 818,912 字。第 17/20 段运行超过 91 分钟仍未完成，API 调用数停在 18，续生成次数为 0，终稿通道工具调用为空。Electron 窗口可见且任务状态保持 `streaming`。

判定：供应商长时间流式吞吐劣化，不是应用空转、重试风暴或工具循环。本次运行已停止；由于当前版本没有分段 checkpoint，已完成的 81.9 万字不能作为可恢复产物继续第 17 段。

## 证据

- 原始心跳：`_audit/verification-final-draft-electron/S1M-live-stalled-evidence/S1M-heartbeat.jsonl`，9,093 行。
- 汇总：`_audit/verification-final-draft-electron/S1M-live-stalled-evidence/stall-summary.json`。
- 方案：`_audit/PROPOSAL_2026-09-30_FINAL_DRAFT_S1M_LIVE_STALL_EVIDENCE_AND_RECOVERY.md`。
- 吞吐观测实现日志：`_audit/DEV_LOG_2026-09-30_final-draft-throughput-observability.md`。

关键值：

| 指标 | 值 |
| --- | --- |
| 已完成段 | 16/20 |
| 已完成字符 | 818,912 |
| 第 17 段开始 | 2026-09-30 08:46:17 |
| 手动停止 | 2026-09-30 10:17:09 |
| 第 17 段耗时 | 超过 91 分钟 |
| API 调用 | 18（1 规划 + 17 段） |
| 续生成次数 | 0 |
| 工具调用 | 无 |

后期分段耗时已明显抬升：第 15 段 74 分钟、第 16 段 95 分钟、第 17 段超过 91 分钟。每段输入规模相近，因此不符合应用侧上下文滚雪球，更符合供应商长时间调用后的限速/负载劣化。

## 决策

不再守着本次运行。理由：

1. 流未断但吞吐极低，继续等待的收益不可预测。
2. 没有 checkpoint，等待完成前中途放弃的代价不变。
3. 已有足够证据证明根因与缺口，继续等待不会产生新的决策信息。

## 处理策略

按既有五阶段执行，优先级调整如下：

1. **Phase C：分段 checkpoint（最高优先）**。每段完成立即落盘，包含 `completedText`、`activeSegmentIndex`、源文 hash、任务元数据；恢复时校验源文 hash 后从第 N 段继续，不重做已完成段。没有这项，后续所有长跑都可能重复“等待数小时后全损”。
2. **Phase B：停滞动作**。UI 显示 `streaming_active / streaming_slow / stalled`，停滞时提供继续等待、重试当前段、取消三个动作；不自动取消，不设总耗时上限。
3. **Phase D：供应商换路**。低速或停滞时允许切换供应商/模型继续未完成段，已完成段保持不变，并记录换路前后吞吐。
4. **Phase E：验证收尾**。S100/S200 回归，S1M 使用 checkpoint 做 soak；心跳读取段内累计字符，验收区分 `completed / active_streaming / stalled / failed`。
5. **自适应分段作为后续增强**。在 checkpoint 稳定后再把目标段长降到 1 万至 2 万字，降低单段劣化代价。

硬边界保持不变：不设 token 预算、不设输出上限、不设续生成次数上限；唯一边界是模型供应商本身。

## 决策后进展对账（2026-09-30 13:14）

Phase C 服务层已落地并通过单测，不处于“完全未开工”状态：

- 新增 `src/services/finalDraftCheckpoint.ts`：定义 `FinalDraftCheckpointStore`、内存实现、保存/加载/恢复；恢复校验覆盖 schemaVersion、源文 hash、checkpoint 自身 hash、可恢复状态。
- 新增 `src/services/finalDraftCheckpoint.spec.ts`：5 条用例。
- `src/services/finalDraftService.ts`：`planSegmentOrderIfNeeded` 对“已有有效 segmentOrder 且已有进度”的任务跳过重规划，避免恢复时吞掉一次 API 调用。
- `src/services/finalDraftRunner.ts`：run 链路在分段推进/进入 generating 时保存 checkpoint；保存失败仅记 warn，不阻断生成；新增 `resumeFinalDraftTask`。
- `src/services/finalDraftRunner.spec.ts`：新增 3 条 checkpoint 用例（每段保存、保存失败降级、从第 2 段恢复只调 1 次 API）。
- 新鲜回归：`npx vitest run` 5 个终稿文件 → 5 files / 65 tests passed（2026-09-30 13:14）。

尚未完成、不能宣称闭环的部分：

1. Electron checkpoint store 适配器（`agentCheckpointSave/Load/List` → `FinalDraftCheckpointStore`）。
2. 双入口接线：`ChatPanel.vue`、`OutlineWorkspace.vue` 的 run 与 continue 链路传入 checkpoint store。
3. 恢复 UI 入口：任务未完成时检测 checkpoint 并提供恢复动作。
4. Phase B 停滞动作：继续等待 / 重试当前段 / 取消。
5. Phase E：S100/S200 回归、S1M 带 checkpoint soak、Electron 真实 UI 验证。
