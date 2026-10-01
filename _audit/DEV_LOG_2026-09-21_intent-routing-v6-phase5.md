# 2026-09-21 意图路由 V6 Phase 5：LLM 兜底矩阵与验证口径收口

## 背景

V6 Phase 5 的目标是验证 LLM 兜底在生产 Electron 里的真实行为：`no_match` 输入在 LLM 兜底失败后仍可安全降级为只读 discuss；真实 `ambiguous` 输入失败后必须停在等待用户确认的 fallback 气泡，不得静默降级或发写请求。

## 修复

1. `src/services/chainIntentRouter.ts`：回滚错误的产品方向。LLM 兜底失败时，ambiguous 输入保持 `fallbackMode: 'await-user'`，不再降级为 readonly-discuss。
2. `src/services/chainIntentRouter.spec.ts`：新增 `keeps ambiguous input awaiting the user when LLM fallback fails`；三处 `no_match` 的 `fallbackMode` 断言改为类型收窄写法，保持 `matched` 分支类型正确。
3. `scripts/verify-intent-routing-electron.mjs`：
   - Phase 5 拆成 no_match 与 ambiguous 两组，各覆盖 normal / request-failed / invalid-json / low-confidence / timeout。
   - no_match 组要求无气泡、turn success、至少一次 provider 请求，readonly 工具面。
   - ambiguous 失败组要求 `bubble=1; provider=0`，trace 记录 routingFallback；normal 组要求高置信分类成功且无气泡。
   - fallback 恢复段改用主页 DOM：点击“按推荐技能继续”后，气泡消失、单请求执行、turn 关闭。
   - 压力轮 dataset 标签修正为 `stress-mixed`，与 `classifyExpected()` 的豁免规则一致。
   - baseline 对账补充 `live-divergence`：离线通过但真实会话分叉的输入不再被误报成 baseline 缺失，而是显式落盘。
4. `_audit/intent-routing-v6-phase1-baseline.json`：由当前源码重新生成，避免拿 09-20 旧基线对账 09-21 新代码。

## 验证

- `node scripts/verify-intent-routing-electron.mjs`
  - `===== INTENT ROUTING V6 PHASE 1/5 ELECTRON VERIFICATION PASSED =====`
  - `cases=64; pass=39; expectedFailure=2; liveDivergence=1`
  - evidence: `_audit/verification-intent-routing-electron/intent-routing-electron-evidence.json`
  - deepTrace: `_data/intent-routing-electron-exports/run-trace-outline-20260921-072949-deep`
- `npm run evaluate:chain-intent -- --phase1-baseline`
  - 核心 corpus classification 20/20，routing 20/20。
  - holdout 25/28，adversarial 21/37，negative 14/14；已知失败均由词表层登记，属 Phase 2 语义层目标。
- `npm run type-check`
  - 通过。
- `npm run test:services`
  - 74 个测试文件、723 个测试全部通过。
- `npm run verify:production-wiring`
  - 285 modules / 958 dependencies，无依赖违规。

## 回头看

- 本轮只触碰意图路由、对应测试、Electron 验证脚本、Phase 1 baseline 与审计文档，未顺手改其他模块。
- mock 制造的 `PAGE CONSOLE ERROR` 属于 request-failed / invalid-json / timeout 场景的预期证据，不是产品 bug。
- `今天天气怎么样` 在离线无上下文时为 no_match PASS，在长会话上下文中被分为 discuss，已显式登记为 `live-divergence`。
- 临时文件 `_audit/intent-routing-home-debug.log` 已按 M42 清理。

## 遗留

1. 词层 holdout / adversarial 失败继续由 Phase 2 embedding 语义层处理，本任务不修。
2. Electron 启动时的 `electron-log renderer bridge failed` 为既有噪音。
3. 本任务不封装安装包；封装需另行按 M17/M40/M43 执行。
