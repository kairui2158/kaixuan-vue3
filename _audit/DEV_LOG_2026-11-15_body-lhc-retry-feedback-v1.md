# DEV LOG 2026-11-15 正文层 LHC 反馈链路修复 V1

## 背景

用户确认执行已批准方案，处理 SKILL 复核确认的四条应用侧残留：legacy 合同句、骨架解析器不认 LHC 信封、word-gap 上游接线错位、JSON 解析失败路由缺失。方案编号 `BODY_LHC_RETRY_FEEDBACK_V1`，基线 3.128.0 / `48cacfc4`。

## 变更

- `chainExecution.ts`：`bodyGeneratorContractSentence()` 退役 legacy 追加账本口径，改为现役 LHC 信封平台合同。
- `schemaRetryFeedback.ts`：word-gap 骨架解析先走 `parseGenerationResult()`，兼容信封 body 与 `metadata.extractedMeta[0]`；legacy 路径保留。
- `PipelinePanel.vue`：上游情报改接 S1 骨架产物，不再把章节基础 prompt 当作 S2/S3 上游 fallback。
- `schemaRetryFeedback.ts`：信封/JSON 解析类失败进入结构/格式模式，优先走 candidate-anchored 路由并携带完整候选；word-gap 只服务单纯的字数缺口。
- 模型可见反馈文案 7 处改为信封口径；相关 spec 增加正向信封断言与 legacy 负向守护断言。
- 版本升级 3.128.1；完整 NSIS 封装与 packaging 核验通过。

## 验证

- 定向回归：`npm run test:services -- --run src/services/schemaRetryFeedback.spec.ts src/services/chainExecution.spec.ts src/services/proseWordContract.spec.ts src/services/realS2ProtectedContract.integration.spec.ts src/services/realSkillExecutor.spec.ts` → 5 files / 137 tests PASS。
- `src/` 生产路径 legacy 句 `正文本体后必须追加【正文交接】区块` 0 命中；保留词面仅为负向守护断言或带退役标注的历史文档。
- `_audit/SKILL_HANDOFF_BODY_LAYER_FULL_PIPELINE_SPEC_2026-11-14.md` 现役句改为 LHC 信封口径；`FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md` 加退役标注。
- `神意开发经验总结_v9.md` G2.9 补 run 起点/生效快照与磁盘 mtime/构建时间对账规则，禁止把时序事实倒推成缓存缺陷。
- 全量验证：`npm run test:services` 253 files / 2774 tests PASS；`npm run type-check` exit 0；`npm run build` exit 0；`npm run verify:packaging` PASS。
- 安装包：`dist/神意助手-Setup-3.128.1.exe`，231,672,563 bytes，SHA-256 `14200a14e50b6b9518b75edf9e382dae85668dc125cb6615913c85f6d5a2714d`。
- 产物清理：删除 3.128.0 安装包与 blockmap；`dist` 当前保留 3.128.1 安装包与同名 blockmap。

## 缺口

- 12403/12000 不动作项维持 G1.31 结论：它是 system+user 完整 request 总长，不是重试反馈合成限；12000 属终步账本限。
- 本轮不改 folder SKILL 与历史 trace payload；真实供应商 live smoke 在全量验证与封装阶段继续执行。

## 2026-11-15 SKILL 四项转达复核

1. `deai-model-profile`：`DEAI_MODEL_PROFILE_RELEASED=true` 已落地；`calibration-not-ready` 只在快照无达标规则时出现，继续按 G2.13 保留为校准数据观测项。
2. `postProcess usage`：`realSkillExecutor.ts` 已传 `{ output, usage }`，并保留 `_perf` 的 advisory 对象、`thresholdNotMet`、`usageUnavailable` 三态；相关定向回归 PASS。应用侧历史待办改判关闭。
3. `fullReasonMissing`：按 `chainHandoff.ts` 现役协议，`requiresFullUpstreamContext` 不属于 full 交付 reason 触发面；当前正文层 S2/S3 均声明 false，无产品缺陷。保留观测。
4. S3 供应商占位正文防线：零 output usage 且非空正文判定假成功，`generationValidity.ts` 拒绝为 usable；定向回归 PASS。
