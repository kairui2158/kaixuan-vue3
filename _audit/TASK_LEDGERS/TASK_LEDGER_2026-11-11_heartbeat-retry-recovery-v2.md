# TASK LEDGER · 心跳重试恢复 V2

## 1. 目标与原话

用户确认执行心跳重试 V2：把固定 60 秒心跳等待改为错误感知等待，探针不继承主请求完整 timeoutMs，完成后完成测试、真实供应商烟测、经验回写、台账、DEV_LOG、升版、封装与提交。

## 2. 门禁读证

- G0.1：目标是缩短供应商瞬时故障后的心跳恢复等待，并保证 trace 能区分探针与正常调用。
- G0.2：未设置 token/时间/轮次预算。
- G0.3：方案与实现边界一致；首轮测试失败按实现证据修正测试构造。
- G0.4：已读 `_audit/神意开发经验总结_v9.md` G1.19、G2.11、G2.9 与最新 DEV_LOG。
- G0.5：回头看覆盖 `reportPhysical` 成功/失败/取消路径、下游类型面、测试锚点与真实链路烟测。
- G0.7：爆炸半径限定 AI service 心跳路径；反推排除 realSkillExecutor 与编排器。
- G0.12：本台账七节齐全。
- G0.13：只做等待函数、探针参数、trace 标记和最小测试，不新增预算系统、自动调度或 UI。
- G1.19：等待时长、探针超时和 physical call 标记都是耗时观测语义；测试覆盖错误路径。
- G2.11：真实供应商 key 只经环境变量；直连 SSE 烟测通过。

## 3. 路由判定

纳入：G1.19 耗时观测与错误路径测试、G2.11 供应商烟测、G0.13 最小必要性。排除：realSkillExecutor、流水线编排器、供应商限流治理、心跳 UI 展示；均不属本轮根因且会造成过度设计。

## 4. 影响圈与作者反证

影响圈：`aiService.ts` 心跳重连与 physical trace、`aiService.spec.ts`、三类下游 `retryStrategy` 类型。可能错点一：把测试失败误当实现修复无效。处置：输出完整 physical event 序列，证明 mock 三次成功吸收普通重试；改为真实三次 503 后恢复。可能错点二：只改 aiService 类型导致下游 `vue-tsc` 失败。处置：同步 runTrace、ChatPanel、OutlineWorkspace 类型。可能错点三：探针关闭 reasoning 后被误认为降级产物。处置：探针只用于恢复连接，成功结果仍按当前调用返回并显式标 `heartbeat_recovery`。

## 5. 停止条件

当任一心跳用例失败、类型检查失败、真实供应商直连失败或出现第二个心跳协议时停止。通过后不再调整重试曲线、预算或 UI。

## 6. 执行证据

- 定向：`npx vitest run src/services/aiService.spec.ts` → 189/189 passed。
- 关联：`npx vitest run src/services/realSkillExecutor.spec.ts` → 81/81 passed。
- 全量：`npm run test:services` → 250 files / 2728 tests passed。
- 类型：`npx vue-tsc --noEmit` → exit 0。
- Live：`Invoke-WebRequest https://api.kjdfhl.school/v1/chat/completions` → HTTP 200；`glm-5.3-flashx` SSE 首增量 `OK`。
- 代码锚点：`src/services/aiService.ts:427`、`:430`、`:3873`、`:4353`、`:4360`；`src/services/aiService.spec.ts:2480`。

## 7. 缺口清单与缺陷面枚举

缺口清单：无新增登记缺口。真实供应商“强制 503 后观察心跳”未执行，因为无法安全诱导第三方网关故障；已用真实错误序列单测 + 真实网关直连组合覆盖，如实登记该边界。

| 枚举面 | 写入/读取点 | 处置 |
|---|---|---|
| 心跳等待语义 | `aiService.ts heartbeatWaitMs` | 429/502/503=10s，network=20s，其他=30s |
| 探针超时 | `aiService.ts HEARTBEAT_PROBE_TIMEOUT_MS` | 独立 180s 上限，不继承 600s 主请求 |
| physical trace | `reportPhysical retryStrategy` | heartbeat_retry 阶段显式 `heartbeat_recovery` |
| 下游类型 | runTrace / ChatPanel / OutlineWorkspace | 同批收口，`vue-tsc` 通过 |
| 测试构造 | 503 用例 | 三次普通重试耗尽后才进入心跳，避免假绿/假红 |
| 结果策略字段 | heartbeat return `retryStrategy` | 保持调用方请求策略，探针策略由 physical event 单独承载 |
| 真实故障诱导 | 第三方网关 | 不可控，登记为未做；以真实错误序列单测替代 |
