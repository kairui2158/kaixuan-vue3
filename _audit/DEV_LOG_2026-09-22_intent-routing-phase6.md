# DEV LOG：意图路由 V6 Phase 6（falseRejections 语料与切分收口）

日期：2026-09-22

## 背景

Phase 2 校准后剩余 19 条 falseRejections。逐条核对显示这不是路由结构缺陷：17 条为 embedding margin-gate 拦截、1 条为符合设计的 ambiguous（“继续”）、1 条为工作区语料覆盖不足导致的 `out-of-scope`（“起草第二卷的三个节点”）。margin 拦截在生产链路中已由 `routeChainIntentDetailed()` 的异步 LLM fallback 恢复，LLM 失败时保持 readonly-discuss / await-user，不会硬拒绝。

## 改动

1. `src/services/chainIntentEvalData.ts`
   - 新增 `ChainIntentEvalSplit` 与 `CHAIN_INTENT_EVAL_SPLITS`。
   - Holdout 28 条按索引确定性切分为 train 10 / dev 9 / test 9；train 可用于示例库扩充，dev 只做阈值选择，test 只做最终报告。
2. `src/services/chainIntentRouter.ts`
   - `INTENT_EXAMPLES.edit` +15，覆盖钩子重做、开篇强化、伏笔补写、节奏重排、作者解释与质疑等误拒模式。
   - `INTENT_EXAMPLES.discuss` +10，覆盖作者澄清、设计意图说明、反对意见与位置咨询变体。
   - 示例总数 126 -> 151。
   - `thresholdSource` 修正为 `calibrated:v6.1-phase6:79-samples:151-examples:train-dev-test:oos-audited`。
3. `scripts/calibrate-intent-routing-thresholds.mjs`
   - 校准产物改为 `_audit/intent-routing-v6-phase6-calibration.json`。
   - 指标按 train/dev/test 分别计算；阈值只在 dev 集选择，test 集不参与排序。
   - 删除旧校准器中 `falseRejections <= 19` 的硬上限，避免把当前缺陷固化成筛选策略。
   - 保留写入安全硬约束：dev 集 `writeFalseTriggers === 0` 且 `missedRejections === 0` 才可成为候选。
4. `src/services/chainIntentRouter.spec.ts`
   - 新增 train/dev/test 结构锁定测试：三份互斥、全覆盖、确定性索引切分与样本数量均被断言。

## 校准结果

最终生产组合（与当前生产常量一致，未放宽写入阈值）：

- strategy：centroid
- thresholds：analyze 0.30 / edit 0.34 / generate 0.34 / discuss 0.30
- ambiguityThresholds：analyze 0.06 / edit 0.08 / generate 0.08 / discuss 0.06
- oosThreshold：0.24
- dev：8/9；writeFalseTriggers 0；falseRejections 1；missedRejections 0；discussBlocked 1
- test：8/9；writeFalseTriggers 0；falseRejections 1；missedRejections 0；discussBlocked 0

证据：`_audit/intent-routing-v6-phase6-calibration.json`

与 Phase 2 全量口径（57/79，falseRejections 19）相比，新口径把选择与报告分离：阈值选择只看 dev，test 提供未参与调参的观测值，避免“同一条语料既当练习册又当考卷”。

## 验证

- `npx vitest run src/services/chainIntentRouter.spec.ts src/services/workspaceSkillEngine.spec.ts`：66/66 通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过；仅存在既有 chunk-size / `__dirname` 警告。
- `node scripts/verify-intent-routing-electron.mjs`：通过，64 cases / 39 pass / 2 expectedFailure / 1 liveDivergence。
- deep trace 已确认生产运行记录透出 `thresholdSource=calibrated:v6.1-phase6:79-samples:151-examples:train-dev-test:oos-audited`，且阈值、margin、OOS 与生产常量一致。

## 回头看

- 本轮没有放宽写入类安全阈值；`writeFalseTriggers` 在 train/dev/test 均为 0。
- margin-gate 异步 judge 不需要新建：`routeChainIntentDetailed()` 已在 no_match/ambiguous 后调用 LLM fallback，Electron 验证覆盖 normal / request-failed / invalid-json / low-confidence / timeout。
- `thresholdSource` 中的示例计数曾误写为 161，已按 `INTENT_EXAMPLES` 实际总数 151 修正，并由 Electron deep trace 复核。
- 旧 Phase 5 证据保留为历史对照，未删除。
- 本轮只触碰意图路由语料、示例、校准器、路由常量标签、专项测试与审计文档。
- 经验文件已升级 v5.29：新增最高优先级门禁 M52 与 §8 详细纪律，登记 `thresholdSource` 计数必须逐项核对、falseRejections 不得固化成硬上限、margin-gate 失败路径必须全覆盖。

## 遗留

1. 语料规模仍小（holdout 28），train/dev/test 各不足 10 条；下一阶段应以真实 trace 持续补充 holdout，再重跑 Phase 6 校准。
2. test 集 1 条 falseRejection 与 1 条 train 集 falseRejection 需要在下一批真实语料落地后分析，不允许直接用放宽阈值解决。
3. 本任务不封装安装包；封装需按 M17/M40/M43/M51 另行执行。
