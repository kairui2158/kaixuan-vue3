# 2026-11-05 SKILL blocking 终态与真实 UI 门禁

## 目标

执行 `_audit/PROPOSAL_2026-11-05_SKILL_BLOCKING_GATE_BYPASS.md`：folder SKILL postProcess 的 blocking 判定耗尽后，run 终态必须为 `failed`，禁止降级 payload 被应用契约或终步账本口径放行。

## 交付

- `realSkillExecutor.ts`：blocking gate 失败进入 `failed` 终态，`blockingGateFailed` 通过类型与调用结果单源透出。
- `stepArtifactAcceptance.ts`：caller 为 `failed` 或携带 blocking gate 标记时，即使合同数值通过也 reject。
- `PipelinePanel.vue`：记录 `folder-skill-blocking-gate`，链式终步传播 `body-generator-blocking-gate`；warning-only 降级的 errors 合入 `body-step-acceptance` 与步骤日志，形成可见降级。
- `verify-body-contract-degraded-electron.mjs`：补齐场景 D 的真实 UI 验证，修正夹具正则与 mock 供应商状态泄漏。

## 调试与修复记录

1. 场景 D 夹具 S2 的正则使用 `\\u4e00` 字符串级转义，经 Electron bridge 序列化后变成字面反斜杠，导致夹具恒计 148 字且不触发 blocking。改为真实汉字范围 `[一-龥]`。
2. mock 供应商 `reset()` 只清请求日志、不清响应队列，场景 C 剩余响应被场景 D 消费，导致夹具语义错位。reset 现在同时清空队列。
3. 场景 D 的 gate 断言最初把全局步骤号误写为链内序号；按场景 A 口径改为 `gate.step=4`，并补链内 `stepIndex=1 / totalSteps=3` 断言。
4. 终态进度条关闭逻辑从单次 if 改为 while 循环，并在关闭后 1 秒复查，避免历史终态条重新浮现。

## 验证

```text
node scripts/verify-body-contract-degraded-electron.mjs
[SCENARIO A] ... runStatus=failed, bodyLength=0
[SCENARIO B] ... runStatus=success, bodyLength=3393
[SCENARIO C] ... runStatus=failed, bodyLength=3393
[SCENARIO D] ... runStatus=failed, bodyLength=3393
===== BODY CONTRACT DEGRADED GATE ELECTRON PASSED =====

npm run type-check
vue-tsc --noEmit
exit 0

npx vitest run src/services/realSkillExecutor.spec.ts src/services/stepArtifactAcceptance.spec.ts
Test Files 2 passed (2)
Tests      92 passed (92)
```

## 边界

夹具 folder SKILL 只验证 blocking / warning-only / 账本缺失三类门禁语义，不验证真实 kaixuan SKILL 的叙事质量。真实供应商保持 `untested`。本轮不升版、不封装；后续交付节点再统一升级。
