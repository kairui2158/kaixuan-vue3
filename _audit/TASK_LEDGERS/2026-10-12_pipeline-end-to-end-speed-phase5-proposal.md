# 任务台账：生成流水线全层速度优化 Phase 5 方案

## 1. 目标与原话

用户原话核心：不能只停留在表面；说 1 必须推到 2/3/4/5/6；拿正文层举例不代表只修正文层，生成流水线不是只有正文层，必须沿用经验文件教训。

最终可感知行为：一份覆盖 Step 0、Step 1、Step 2、Step 3、Step 4、记忆抽取和层间等待的全流水线速度优化方案，供用户审核。

本轮交付物：`_audit/PROPOSAL_2026-10-12_PIPELINE_END_TO_END_SPEED_PHASE5.md`。

## 2. 门禁读证

- G0.1 目标对齐：方案将“效率”定义为加载速度、API 响应速度、流式生成速度、全任务总耗时，不以省 token 为目标。
- G0.3 诚实闭环：方案明确区分“方案成熟度”和“执行证据边界”；未采数据层不得先下优化结论，但不得把未采数据误判为设计断点。
- G0.6 方案成熟度：方案末尾给出“成熟，附执行证据边界”的结论、复用依据和放行条件。
- G0.7 正反推研磨：范围从单层扩展到全层，并建立四类耗时归因。
- G1.19 耗时观测先于性能决策：Phase 5A/5B 先补观测与真实采样，Phase 5D 才做优化。
- G2.9 终稿与流水线：覆盖流水线每层进度反馈、上下文、批次和耗时结构。

## 3. 路由判定

加入：G0.1、G0.3、G0.6、G0.7、G1.19、G2.9。

排除：

- G2.1 工具循环：本方案不修改工具循环，后续优化阶段若触碰再启用。
- G2.4 API 直写：本方案目标是流水线速度，不改直写权限语义。
- G2.10 真实 trace 回放：Phase 5B 后续执行时启用；本轮只出方案，不跑复刻。

## 4. 影响圈与作者反证

打算改：暂无代码，仅新增方案文档。

可能碰到：无。

最可能错的假设：认为 Step 1/3/4/记忆抽取只要套用 Step 2 的观测口径即可。证伪方式：Phase 5A 实现时必须逐层检查编排器差异，发现无法复用字段时先扩展 schema，不硬套。

## 5. 停止条件

本轮停止条件：方案覆盖全流水线层、层间等待、四类耗时归因、真实验证矩阵、before/after 对比和明确成熟度结论。

已满足。

## 6. 执行证据

- 代码入口核对：`src/components/pipeline/PipelinePanel.vue:2327`、`:3530`、`:3621`、`:3840`、`:4040`。
- 记忆入口核对：`src/components/pipeline/PipelinePanel.vue:4566` 附近为记忆抽取 trace 入口。
- Phase 2 真实数据：`_audit/DEV_LOG_2026-10-12_pipeline-timing-ledger.md`。
- Phase 5C 根因与 Phase 5D 修复：`_audit/DEV_LOG_2026-10-13_pipeline_timing_remediation_phase5c5d.md`。
- Phase 4 现状：`_audit/PROPOSAL_2026-10-12_PIPELINE_CONTEXT_DEDUPLICATION_PHASE4.md`。
- 2026-10-07 效率复用证据：7,606 字从 23 次物理请求、约 954 秒降为本地毫秒级；1,035,784 字 61.561ms；Electron 双入口 181ms/165ms，0 物理请求 / 0 API call / 0 工具调用。
- 2026-10-10 反面证据：306KB/322KB 载荷膨胀与“读取 2/30”证明旧分段读取在 1M 窗口下是效率枷锁。
- 本轮新增：`_audit/PROPOSAL_2026-10-12_PIPELINE_END_TO_END_SPEED_PHASE5.md`。
- Phase 5E live 证据：`_audit/verification-pipeline-artifact-contract-live/summary.json` 六层全部 `success`；`timing-analysis.json` 记录卷纲层 36.66m、12 物理请求、0 retry、`firstTokenSumMs=26968`。before 事故唯一保留证据为 `_audit/verification-pipeline-artifact-contract-live-archive/2026-10-12T20-05-51-471Z/`。
- 诚实边界：交接中提到的 `PASSED` stdout 标记未落盘，完成判据只使用 `summary.json` 与 trace，不补造 stdout 证据。

## 7. 缺口清单

- Phase 5A 观测与 Phase 5C/5D 修复已完成；Phase 5E 真实 Electron + 真实 API + 真实 UI 复测已完成，六层全部 `success`。
- 卷纲层 before/after：54.58m / 14 物理请求 / 2 次超时 retry / `firstTokenSumMs` 约 20.81m（含口径污染） → 36.66m / 12 物理请求 / 0 retry / `firstTokenSumMs` 26.97s。
- 遗留项为正文层 schema retry 策略与卷纲层 `fullReasonMissing` 观察项，均已登记为下一阶段独立事项，不允许和超时修复混算。
- Phase 4 live 复证仍保持未执行登记；不得用 Phase 5E 证据冒充 Phase 4 结论。
