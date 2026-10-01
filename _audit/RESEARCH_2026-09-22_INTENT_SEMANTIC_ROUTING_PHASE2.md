# 意图语义路由 Phase 2 社区深挖与适配报告

日期：2026-09-22  
范围：60 个真实仓库、414 个实现文件、4 类运行行为、79 条应用评估样本、Electron 级真实 UI 验证

## 结论

本次调研确认社区成熟方案普遍采用「分层决策 + 风险差异化阈值 + OOS 独立判定 + 误拒/漏拒双指标」，而不是单一 confidence 闸门。应用改造已按该模式落地：路由器升级为 `v6.1`，新增分意图歧义阈值与 OOS 阈值，并在校准器中引入 falseRejections / missedRejections 指标。

## 社区证据

抓取明细见：

- `_audit/RESEARCH_2026-09-22_INTENT_SEMANTIC_ROUTING_PHASE2_REPOS.json`
- `_audit/RESEARCH_2026-09-22_INTENT_SEMANTIC_ROUTING_PHASE2_EVIDENCE.json`
- `_audit/research-cache/intent-semantic-routing-phase2/`

重点源码结论：

1. **FlowRoute**：按风险分阈值（LOW route 0.55 / margin 0.08；CRITICAL route 0.90 / margin 0.25），并显式区分 `ROUTE / CLARIFY / LLM_REQUIRED` 与原因码。写操作对应高 margin，与本次 edit/generate 更严格 margin 的方向一致。
2. **DeepPavlov DNNC**：OOS 判定为 `max_probability < confidence_threshold -> "oos"`，OOS 不是普通 no-match，而是独立可诊断状态。
3. **SynaptoRoute**：阈值扫描同时评估 F1 / Precision / Recall 与 OOD FPR / FNR，即必须同时看误拒与漏拒。
4. **XIntent**：中文意图场景显式评估拒识准确率、误拒率、漏拒率。
5. **darwin-router**：margin gate 触发异步 judge、写回 exemplar，并有去重与上限保护。
6. **aurelio semantic-router**：不同 encoder 的默认 score threshold 差异很大（0.2 至 0.82），说明阈值必须绑定模型与样本集，不能全局复用。

## 应用适配

`src/services/chainIntentRouter.ts`：

- `ChainRoutingResult.no_match.reason` 新增 `out-of-scope`，并删除残留的 `outside-workspace-scope` 类型。
- 规则层与 embedding 层均可在明确越域时返回 `out-of-scope`；embedding 层通过 `EMBEDDING_ROUTING_OOS_THRESHOLD` 判定。
- 歧义阈值改为分意图：analyze/discuss 0.06，edit/generate 0.08。
- OOS 阈值校准为 0.24。
- 诊断结构新增 `ambiguityThresholds` 与 `oosThreshold`。
- `thresholdSource` 更新为 `calibrated:v6.1-phase5-r2:79-samples:126-examples:oos-audited`。

`scripts/calibrate-intent-routing-thresholds.mjs`：

- 网格扩展为 strategy × OOS × 分意图阈值 × 分意图 margin。
- 指标新增 `falseRejections`、`missedRejections`、`discussBlocked`。
- 选择策略修正为：write false triggers 必须为 0；然后按 accuracy、最少 false rejections、最少 discuss blocked、最少 missed rejections。
- 产物记录 baseline，避免“校准结果与生产常量不一致却看不出来”。

## 校准结果

`_audit/intent-routing-v6-phase5-calibration.json`：

- strategy：centroid
- thresholds：analyze 0.30 / edit 0.34 / generate 0.34 / discuss 0.30
- ambiguityThresholds：analyze 0.06 / edit 0.08 / generate 0.08 / discuss 0.06
- oosThreshold：0.24
- accuracy：57/79（0.7215）
- writeFalseTriggers：0
- falseRejections：19
- missedRejections：0
- discussBlocked：3

其中 19 条 falseRejections 是既有语料-路由差距，Phase 2 后续以扩充 holdout/adversarial 语义语料、引入校准集切分和异步 LLM judge 为主，不得用放宽写入安全阈值来换准确率。

## 验证

- `npx vitest run src/services/chainIntentRouter.spec.ts`：34/34 通过。
- `npx vitest run src/services/chainIntentRouter.spec.ts src/services/workspaceSkillEngine.spec.ts`：65/65 通过。
- `npm run type-check`：通过。
- `node scripts/calibrate-intent-routing-thresholds.mjs`：通过并产出新校准证据。
- `npm run build:vue`：通过。
- `node scripts/verify-intent-routing-electron.mjs`：通过，64 cases / 39 pass / 2 expectedFailure / 1 liveDivergence。
- deep trace 已确认生产运行记录包含 `v6.1`、`ambiguityThresholds`、`oosThreshold: 0.24` 与新 `thresholdSource`。

## 遗留

1. 语料层：继续扩充 holdout/adversarial 语义样本，特别是“作者解释、补充、质疑既有内容”的讨论句式。
2. 校准层：引入 train/dev/test 切分，避免同一语料既用于示例库又用于最终评估。
3. 语义层：评估 darwin-router 式 margin-gate 异步 judge，用于 write 候选的二次确认。

## Phase 6 收口

以上遗留已于 2026-09-22 由 Phase 6 处理：holdout/adversarial 语料扩充后重跑校准；校准器改为 train/dev/test 三切分，阈值只在 dev 集选择；margin-gate 异步恢复确认由既有 `routeChainIntentDetailed()` LLM fallback 承担，不新建 judge 系统。结果见 `DEV_LOG_2026-09-22_intent-routing-phase6.md` 与 `_audit/intent-routing-v6-phase6-calibration.json`。
