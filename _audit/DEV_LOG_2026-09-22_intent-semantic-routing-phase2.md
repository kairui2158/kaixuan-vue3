# DEV LOG：意图语义路由 Phase 2 适配

日期：2026-09-22

## 目标

完成 60 仓库社区深挖后的应用适配：OOS 独立判定、分意图歧义阈值、误拒/漏拒指标、生产阈值回写、Electron 级验证。

## 改动

- `src/services/chainIntentRouter.ts`
  - 新增 `out-of-scope` reason，删除残留 `outside-workspace-scope` 类型。
  - 新增 `EMBEDDING_ROUTING_AMBIGUITY_THRESHOLDS` 与 `EMBEDDING_ROUTING_OOS_THRESHOLD` 导出。
  - embedding 层接入分意图 margin 和 OOS 判定。
  - 诊断结构写入 `ambiguityThresholds`、`oosThreshold`。
  - 路由器版本升级 `v6` -> `v6.1`，阈值来源升级为 phase5-r2。
- `scripts/calibrate-intent-routing-thresholds.mjs`
  - 输出改为 phase5 校准产物。
  - 网格扩展并加入 OOS、分意图 margin。
  - 加入 falseRejections / missedRejections / discussBlocked。
  - 修正排序方向：accuracy 后优先更少误拒、更少讨论拦截、更少漏拒。
  - 增加 baseline 记录。
- `src/services/chainIntentRouter.spec.ts`
  - 新增 OOS 判定测试，确保 low-confidence 输入不会升级为写入。
  - 新增诊断阈值暴露测试。
- `src/services/workspaceSkillEngine.spec.ts`
  - 更新 precomputed routing fixture 至 `v6.1` 诊断结构。

## 校准

最终生产组合：

- thresholds：analyze 0.30 / edit 0.34 / generate 0.34 / discuss 0.30
- ambiguityThresholds：analyze 0.06 / edit 0.08 / generate 0.08 / discuss 0.06
- oosThreshold：0.24
- accuracy 57/79；writeFalseTriggers 0；falseRejections 19；missedRejections 0；discussBlocked 3

证据：`_audit/intent-routing-v6-phase5-calibration.json`

## 验证

- `node --check scripts/calibrate-intent-routing-thresholds.mjs`：通过
- `npx vitest run src/services/chainIntentRouter.spec.ts`：34 passed
- `npx vitest run src/services/chainIntentRouter.spec.ts src/services/workspaceSkillEngine.spec.ts`：65 passed
- `npm run type-check`：通过
- `node scripts/calibrate-intent-routing-thresholds.mjs`：通过
- `npm run build:vue`：通过
- `node scripts/verify-intent-routing-electron.mjs`：64 cases / 39 pass / 2 expectedFailure / 1 liveDivergence

## 回头看

- `outside-workspace-scope` 在 `src`、`scripts`、`electron` 中已清零。
- `routeChainIntentDetailed` 生产调用点为 ChatPanel 与 workspaceSkillEngine，均通过统一路由入口消费诊断，无第三入口绕过。
- runTrace deep export 已确认 v6.1、新阈值、OOS 字段与 thresholdSource。
- 本轮未删除任何源码、测试、DEV_LOG 或经验文件。
