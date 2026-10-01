# 2026-09-30 终稿停滞恢复闭环（3.70.0 收口前记录）

## 用户现象

客户在终稿 17/20 段看到字数极慢增长，等待数小时后要求给出处理策略。应用已有 Phase A 吞吐观测与 10 分钟停滞判定，但停滞后的恢复入口曾存在一个真实缺陷。

## 根因与修复

1. 停滞卡片点击“换供应商重试”无效：
   - 根因：Pinia 中的 `finalDraftTask` 是 reactive proxy，`structuredClone()` 不能克隆；旧实现克隆抛错，重试入口在进入生成前中断。
   - 修复：新增 `snapshotFinalDraftTask()`，用 JSON 快照在 abort 前保存任务；主页 `ChatPanel.vue` 与大纲工作台 `OutlineWorkspace.vue` 两个入口统一使用。实现见 `src/services/finalDraftService.ts:75`。
2. 慢流与物理重试竞争：
   - 根因：终稿请求已设置 `timeoutMs: null` 与 `slowStreamTolerant: true`，但 `aiService.callAiWithoutTools` 的物理重试仍可重发请求；重试首个 chunk 会重置 telemetry，把已停滞的流伪装成活跃，重试耗尽后任务被标 failed，停滞卡片消失。
   - 修复：慢流容忍模式下已有输出即不再重连/重试，中断转为可恢复的 terminal interruption 状态，保留停滞卡片与用户动作。
3. 主页活动 API 调用误关闭：
   - 根因：ChatPanel 关闭活动调用时未匹配 call-id，旧 run 的 `finally` 可关闭新 run 的活动记录。
   - 修复：活动 API 调用按 call-id 匹配关闭，避免跨 run 覆盖。

## 验证器口径修正（不改生产语义）

1. stalled-recovery 首次失败是 mock 映射错误，不是应用缺陷：第 2 段请求带第 1 段衔接尾巴，宽松关键词匹配命中第 1 段 marker，把第 1 段内容回给第 2 段；应用完整性门禁正确拦截。已改为精确分段块优先，见 `scripts/verify-final-draft-electron.mjs:320`。
2. 编辑器写入断言曾直接比较任务文本与编辑器内容；生产设计是任务文本保留原始分隔、写入前统一空行分段，且既有单测锁定该语义。验证器改为使用同一 normalize 口径，见 `scripts/verify-final-draft-electron.mjs:183`。

## 验证证据

- `SHENYI_FINAL_DRAFT_SCENARIOS='stalled-recovery' SHENYI_FINAL_DRAFT_FAST_STALL_MS='12000' SHENYI_FINAL_DRAFT_ARCHIVE_EVIDENCE='1' node scripts/verify-final-draft-electron.mjs`
  - 结果：`===== FINAL DRAFT ELECTRON LIVE PASSED =====`
  - 证据：`_audit/verification-final-draft-electron/stalled-recovery/record.json`
  - 关键值：`finalTask.status='completed'`、`activeSegmentIndex=3`、`segments=3`、`finalEditorChars=62`、请求 6 次、`providerSwitchEvent=true`、`stalledEvent=true`、`retryEvent=true`。
- `npx vitest run src/services/finalDraftTelemetry.spec.ts src/services/finalDraftRunner.spec.ts src/services/finalDraftService.spec.ts`
  - 结果：72/72 通过。
- `npm run test:services`
  - 结果：124 文件 / 1293 条测试全部通过。
- `npm run type-check`
  - 结果：exit 0。

## 设计边界

- 供应商低速或停吐是外部因素；应用不设置输出 token 或总时长上限。
- 10 分钟无新字符的停滞阈值保持不变，用户已确认不改默认值。
- 停滞后路径是：停滞卡片 → 换供应商重试 → 分段续写 → 完整性校验 → 写入编辑器。
- `__SHENYI_FINAL_DRAFT_TEST_OVERRIDES__` 仅用于测试加速停滞判定，生产阈值不受影响；本轮已移除生产源码中的临时 console 探针。
