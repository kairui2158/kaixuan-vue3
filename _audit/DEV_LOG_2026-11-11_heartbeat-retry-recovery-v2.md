# DEV_LOG_2026-11-11_heartbeat-retry-recovery-v2

- 主题：心跳重试间隔与探针超时收敛 V2
- 交付目的：消除章节层实测暴露的固定 60 秒心跳等待与探针继承完整 timeoutMs 造成的等待膨胀；让 trace 能区分心跳恢复探针。
- 应用改动：
  - `src/services/aiService.ts`：删除 `HEARTBEAT_INTERVAL=60_000`，新增 `heartbeatWaitMs()`；502/503/429 等待 10s，network 等待 20s，其他 30s。探针强制 `reasoning.mode=off`、`retryStrategy=heartbeat_recovery`，超时封顶 180s。`reportPhysical` 在 `heartbeat_retry` 阶段透传 `heartbeat_recovery`。
  - 下游 trace/聊天/大纲 API 结果类型同步接受 `heartbeat_recovery`：`src/stores/runTrace.ts`、`src/components/chat/ChatPanel.vue`、`src/components/common/OutlineWorkspace.vue`。
  - `src/services/aiService.spec.ts`：新增 503 与 network 心跳等待用例；503 用例纠正为三次快速重试耗尽后才进入心跳恢复，并断言 physical event 策略标记。
- 根因：心跳恢复此前使用固定 60s 等待；探针继承主请求 timeoutMs，慢供应商瞬时故障被放大为数十分钟等待。首轮测试失败不是透传逻辑失效，而是用例错误：mock 前三次成功吸收了普通重试，根本没进入 heartbeat 路径。
- 验证：
  - `npx vitest run src/services/aiService.spec.ts`：189/189 passed。
  - `npx vitest run src/services/realSkillExecutor.spec.ts`：81/81 passed。
  - `npm run test:services`：250 files / 2728 tests passed。
  - `npx vue-tsc --noEmit`：exit 0。
  - 真实供应商直连烟测：`https://api.kjdfhl.school/v1` + `glm-5.3-flashx`，SSE HTTP 200 并返回 `OK`；API key 只经 shell 环境临时传递，未写仓库或日志。
- 边界：不改 realSkillExecutor、流水线编排器、预算系统、自动调度或 UI；不恢复旧 60s 固定等待语义。
- 经验：`神意开发经验总结_v9.md` 升级 v10.4.1；G1.19 增补心跳探针错误感知等待、独立超时与 `heartbeat_recovery` trace 标记。
