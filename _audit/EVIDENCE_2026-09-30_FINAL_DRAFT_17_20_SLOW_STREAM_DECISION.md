# 2026-09-30 终稿 17/20 低速流证据与决策

## 现场观测

- 任务状态：最后一次可核验的落盘状态为终稿生成进行中，进度 17/20 段。
- 用户可见现象：流式接收和输出长时间只有十位数级别字符跳动，整体推进速度明显异常。
- 未出现：自动取消、重试风暴、工具循环、续生成次数异常。
- 2026-09-30 14:30 复核：本机已无 Electron/验证 runner 进程。因此当前证据口径是“已落盘的最后一次观测”，不能把该任务再描述为仍在推进。

## 证据定位

1. 前一次 S1M 完整停滞证据：`_audit/EVIDENCE_2026-09-30_S1M_FINAL_DRAFT_STALL_DECISION.md`
   - 16/20 段完成、818,912 字，第 17 段超过 91 分钟无有效推进。
   - 判定为供应商长时间流式吞吐劣化，不是应用空转或上下文滚雪球。
2. 心跳原始证据：`_audit/verification-final-draft-electron/S1M-live-stalled-evidence/S1M-heartbeat.jsonl`（9,093 行）与 `stall-summary.json`。
3. 当前代码事实：
   - `src/services/finalDraftTelemetry.ts`：吞吐分类已存在，但 `snapshot()` 只在 `onChunk` 中被调用。
   - `src/services/finalDraftRunner.ts`：run/continue 链路只在 chunk 到达时记录吞吐与进度。
   - 供应商停吐时 `onChunk` 不触发，因此 `streaming_slow/stalled` 不会进入 UI 和 runTrace。
   - checkpoint 在段推进时保存；当前段中途停止时，已完成段安全，当前段会重做。
4. 新鲜回归（2026-09-30 13:49）：`npx vitest run` 终稿 6 个 spec 文件，70/70 通过。
5. 当前运行的落盘证据：`_audit/verification-final-draft-electron/S1M-live-stalled-evidence/`
   - `S1M-heartbeat.jsonl` 共 9,093 行，最后一条为 2026-09-30 10:17:09。
   - `stall-summary.json` 显示第 17 段从 2026-09-30 08:46:17 开始无有效推进，API 调用停在 18 次。
   - `final-state-2026-09-30.md` 已判定：该运行已终止；16 段、818,912 字符因缺段中途 checkpoint 不能原样恢复。

## 决策

不再以“守着窗口”作为处理手段。当前运行继续作为观测对象，处理策略转为按证据决策：

1. 只要字符仍在增加，即使低速也不自动取消；应用不设 token、输出、续生成或总耗时上限。
2. 一旦超过停滞阈值（当前设计 10 分钟无新字符），应停止等待当前段，从最近 checkpoint 重试该段。
3. 已完成段必须保持可恢复；任何等待、重试、取消动作都要写入 runTrace。

## 待修复缺口

1. 停滞观测必须独立于 `onChunk`：runner 层增加任务级心跳定时器，周期性调用 `telemetry.snapshot()`，把 `stalled` 写入 `onProgress` 与 runTrace。
2. `resumeFinalDraftTask` 的 checkpoint 保存节奏需与 run/continue 一致：段推进即保存，而不是只在终态保存。
3. 段中途周期性 checkpoint：当前段流式累计需定期落盘，降低单段重做代价。
4. 停滞三动作 UI：继续等待 / 重试当前段 / 取消。
5. 供应商换路续跑：低速或停滞时允许切换供应商/模型继续未完成段，并记录换路前后吞吐。

## 2026-09-30 修复与验证记录

### 本轮定位的两个观测缺口

1. `src/services/finalDraftRunner.ts` 中 run/continue/resume 三条链路的 `onChunk` 路径没有把 `onProgress` 传给 `publishFinalDraftProgress()`，导致 telemetry 事件不发、UI 与 runTrace 看不到吞吐状态；run 链路还额外发一份无 telemetry 的原始进度事件。
2. `src/services/finalDraftTelemetry.ts` 只保留 60 秒滚动样本，停滞判定依赖“最后一个样本”。超 60 秒后样本被清理，停滞状态会退回 `streaming_active`；同时原判定使用严格 `>`，在整 10 分钟心跳边界会漏报。本轮保留独立 `lastSampleAt`，并把停滞判定改为达到阈值即触发。

### 修复范围

- `src/services/finalDraftRunner.ts`
  - run 链路 `onChunk` 删除无 telemetry 的直发事件，统一走 `publishFinalDraftProgress()`，并传入 `onProgress`。
  - continue 链路 `onChunk` 的统一发布器补传 `onProgress`。
  - resume 链路 `onChunk` 的统一发布器补传 `onProgress`。
- `src/services/finalDraftTelemetry.ts`
  - `record()` 记录独立 `lastSampleAt`，不随 60 秒窗口清理。
  - 停滞判定由 `idleMs > stalledAfterMs` 改为 `idleMs >= stalledAfterMs`。
  - `reset()` 同步清空 `lastSampleAt`。

### 验证证据

- `npx vitest run src/services/finalDraftRunner.spec.ts src/services/finalDraftTelemetry.spec.ts`
  - 2 个文件、18 条用例全部通过。
- `npx vitest run src/services/finalDraftCheckpoint.spec.ts src/services/finalDraftCheckpointElectron.spec.ts src/services/finalDraftProgress.spec.ts src/services/finalDraftRunner.spec.ts src/services/finalDraftService.spec.ts src/services/finalDraftTelemetry.spec.ts`
  - 6 个文件、72 条用例全部通过。
- `npm run type-check`
  - 通过，无类型错误。

### 处理策略

1. 正在低速但仍有字符增加的任务不自动取消：先观测，不设 token、输出、续生成或总耗时上限。
2. 达到 10 分钟无新字符即判停滞：停止等待当前段，从最近 checkpoint 重试当前段；已完成段保留。
3. 所有等待、停滞、重试、取消事件进入 runTrace，作为后续供应商质量评估依据。
4. 低速或停滞时可换供应商/模型续跑未完成段，并记录换路前后吞吐，用于判断是供应商劣化还是任务本身过重。

### 2026-09-30 14:30 证据更新与执行决策

#### 事实定级

1. 本次 17/20 不是“低速但仍推进”，而是第 17 段供应商停吐。`completedChars` 停在 818,912，`accumulatedChars` 停在 0，API 调用停在 18 次；第 17 段首次观测后超过 91 分钟无字符增量。
2. 进程复核对齐 `final-state-2026-09-30.md`：当前没有活的 Electron/验证 runner，该运行已终止，不是仍需守候的活任务。
3. 结论分层：
   - 应用不是空转：有 18 次调用、无工具循环、无重试风暴。
   - 供应商层是真异常：长请求停止吐流，且没有自行恢复。
   - 应用层有两个真实缺口：段中途无周期 checkpoint，停滞时没有用户可见的“重试当前段/换供应商续跑”动作。

#### 执行顺序

1. **保留当前运行作为供应商劣化证据**，不再等待其复活；下次 S1M 验证禁止整段重跑。
2. **先做段中途周期 checkpoint**：当前段流式累计按周期落盘。这样第 17 段这类停吐损失从“整段重做”降到“最多一个 checkpoint 周期的内容”。
3. **再做停滞三动作 UI**：继续等待 / 重试当前段 / 取消。语义为“保留 completedText，丢弃当前段未完成累计，从 checkpoint 或段起点重发当前段”，并写入 runTrace。
4. **补供应商换路续跑**：停滞时允许换供应商/模型继续当前段，记录换路前后吞吐。不要把“等待”作为默认处理。
5. **真实长文验证重跑顺序**：先跑 100k，确认 checkpoint、停滞动作、trace 全链路有效；再跑 200k；最后跑 1M。每一档保留 heartbeat、runTrace、换路记录和终态文件。

#### 不做的事

1. 不设 token、输出、续生成或总耗时上限；低速不自动取消。
2. 不把停滞心跳用于自动 abort；心跳只观测和提示，终态由用户或明确重试动作触发。
3. 不用本次已终止的 17/20 运行继续冒充“正在验证”。

### 剩余登记项

1. 段中途周期性 checkpoint：降低单段重做代价。
2. 停滞三动作 UI：继续等待 / 重试当前段 / 取消。
3. 供应商换路续跑 UI 与协议。
