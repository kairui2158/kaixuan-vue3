# DEV LOG — 2026-11-14 — 正文层生成步失败接线 W1/W2

## 交付

- **W1**：body 步 `callerStatus !== 'success'` 时，先进入既有 `resolveStepArtifactFlow`，写入 `body-step-acceptance` error 事件，调用 `rememberBodyStepAcceptance`，把失败步并入 `completedStepOutputs` 并通过 `onStepOutputs` 回传编排器，最后保留原结构化失败返回。锚点：`src/components/pipeline/PipelinePanel.vue:4942-4977`。
- **W2**：`disableBreakpointReplay + reuseArtifacts + startSi === generatorIndex` 的 targeted 修复允许消费 S1 legacy 骨架；其余路径继续要求生成器信封。锚点：`src/components/pipeline/PipelinePanel.vue:4575-4595`。
- **防崩**：`resolveStepArtifactFlow` 的 advisory/narrative/账本提取统一走 `metadataSections`，`extractedMeta` 非数组时不再抛错，而保留结构化拒绝。锚点：`src/services/stepArtifactAcceptance.ts:205-225`。

## 验证

- 聚焦回归：`npx vitest run src/components/pipeline/__tests__/body-generator-failure-wiring.spec.ts src/services/stepArtifactAcceptance.spec.ts` → `Test Files 2 passed (2)`、`Tests 29 passed (29)`。
- 全量服务回归：`npm run test:services` → `Test Files 252 passed (252)`、`Tests 2758 passed (2758)`。
- 静态回归：`npm run type-check` → exit 0；`npm run build:vue` → exit 0。
- 真实 Electron 证据：
  - Live 1 `run-20261114-102110`：seq 155 失败步写出 `decision=reject / reason=caller_failed`，seq 352 `repairScope=targeted`；同时暴露 malformed `extractedMeta`，催生防崩补丁。
  - Live 2 `run-20261114-105520`：seq 360/659 失败验收入账，seq 660 targeted 修复收敛为 `wordCount=1945 / ratio=0.9725 / status=complete`，seq 795 后续步骤 accept。`deai-stage-guidance` seq 796 注入 3 条 / 94 字符且 `budgetExceeded=false`。

## 结果判定

Live 2 章级业务在 40 分钟超时前未完成，观测汇总为 `observational-blocked`。这不证明正文质量提升，也不作为供应商成功门禁；但 W1/W2 的失败接线与 targeted 行为在真实链路可见，构成本轮平台合同修复的验收证据。

## 独立遗留

1. **物理调用放大**：Live 2 `apiCallCount=6`，实际 `physicalCallCount=14`，其中物理重试 8 次，预算为 16。必须另开缺陷单治理“逻辑 attempt × 供应商物理重试”放大、步级物理上限与预算计数口径。
2. **resume/replay 信封闸**：Live 2 seq 362/661 两次 `body-resume-artifact-invalid (generator_envelope_missing)`。W2 只修 targeted-from-generator；断点恢复/replay 仍要求生成器信封，需独立对账生命周期与合同形态。
3. **`deai-model-profile`**：两次 Live 共 6 次 `calibration-not-ready / injectedRuleCount=0`，保持既有校准观测门禁。

## 经验回写

- 在 G2.9 登记“物理外呼预算与重试放大”教训：API 预算必须以物理外呼计数，并对逻辑 attempt × 物理重试的放大建模；入口需要显式步级物理上限与超额事件。

## 边界

不改 folder SKILL；不改叙事裁判权；不新增预算系统、调度器、UI、第二裁判或新修复体系。证据目录 `_data/` 与 `_audit/verification-*` 不入库。
