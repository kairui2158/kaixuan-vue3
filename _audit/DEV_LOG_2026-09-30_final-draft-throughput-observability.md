# 2026-09-30 终稿吞吐可观测性（Phase A）

## 背景

S1M 实测在第 17/20 段出现供应商级低速流式输出。应用此前只显示“分段 N/M · 已输出 X 字 · 本段 Y 字”，用户无法区分“活着但慢”与“已停滞”，也无法估算剩余时间。

## 改动

1. 新增 `src/services/finalDraftTelemetry.ts`：
   - 维护 60 秒内的流式样本窗口。
   - 输出最近 10 秒、60 秒滚动 `chars/s`。
   - 输出 `streaming_active` / `streaming_slow` / `stalled` 三分类。
   - 基于当前段目标字符与滚动吞吐输出 `estimatedRemainingMs`。
   - 默认 10 分钟无任何新字符判定为停滞。
2. `src/services/finalDraftRunner.ts`：
   - 主生成与续生成两条流式路径接入同一 tracker。
   - `onProgress` 新增 `telemetry` 字段。
   - trace 中按 1 秒聚合写入 `final-draft-throughput-*` 事件，不逐字符落盘。
3. 新增 `src/services/finalDraftProgress.ts` 统一双入口状态文案：
   - 显示吞吐、低速/停滞状态和预计剩余时间。
4. `ChatPanel.vue` 与 `OutlineWorkspace.vue` 的终稿/续终稿状态文案统一调用该 helper。

## 验证

- `npx vitest run src/services/finalDraftService.spec.ts src/services/finalDraftRunner.spec.ts src/services/finalDraftTelemetry.spec.ts src/services/finalDraftProgress.spec.ts`
  - 结果：4 个文件，57 条测试全部通过。
- `npm run type-check`
  - 结果：exit 0。

## 设计边界

- 本阶段只增强观测与 trace，不改变生成语义、不自动取消、不重试、不写编辑器。
- 停滞判定只依据最后一次收到 chunk 的时间，不依据总耗时。
- ETA 为估算值，当前段输出已超过目标时允许为 0。

## 后续

- Phase C：复用 Electron `agent:checkpoint:save/load` 做终稿分段 checkpoint，支持跨进程从第 N 段恢复。
- Phase B：停滞后的用户动作（继续/重试当前段/取消）与 UI。
- Phase D：供应商换路续跑。
- Phase E：S100/S200 回归 + S1M checkpoint soak。
