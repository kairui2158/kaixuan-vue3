# 任务台账：生成流水线下一层提效 Phase 6 方案

## 1. 目标与原话

用户原话核心：根据经验文件，对下一层优化策略做详细方案；尽最大可能推断；评估对应用的实际提升；覆盖影响到最底层。

最终可感知行为：一份基于 Phase 5B 真实账本、拆到机制层、含并发分支判定与验证停止条件的 Phase 6 提效方案，供用户审核。

本轮交付物：`_audit/PROPOSAL_2026-10-13_PIPELINE_NEXT_LAYER_EFFICIENCY_PHASE6.md`。

## 2. 门禁读证

- G0.3 诚实闭环：所有收益数字标注推断或目标；并发分支未定案前不承诺提速结论。
- G0.6 方案成熟度：末尾给出"成熟，附执行证据边界"判定与执行顺序。
- G0.7 正反推研磨：根因从耗时症状反推到编排结构、契约粒度、异步位置、观测维度四个机制层。
- G0.12 门禁执行台账：本文件即台账，七节齐全。
- G1.15 系统层递进诊断：完成症状层（卷纲 36.66m）、链路层（12 串行请求）、组合层（SKILL 质量策略与速度结构叠加）、机制层（调度与契约设计）四层定位。
- G1.17 执行者自盲区：五个核心假设全部给出证伪方式。
- G1.19 耗时观测先于性能决策：6A 观测升级与 6B 采样矩阵位于 6C 执行改造之前。
- G2.9 终稿与流水线：覆盖卷纲、正文、记忆抽取与层间等待，不是单层方案。
- G2.11 供应商与网络：跨供应商采样矩阵决定并发上限，禁止单样本推导。

## 3. 路由判定

加入：G0.3、G0.6、G0.7、G0.12、G1.15、G1.17、G1.19、G2.9、G2.11。

排除：

- G2.1 工具循环：本方案不改直写工具循环。
- G2.4 API 直写权限：不触碰权限语义。
- G2.13 SKILL 中立：6C 只改应用调度，SKILL 仍不改变执行协议。

## 4. 影响圈与作者反证

打算改：本轮无代码改动，仅新增方案文档。

后续执行将触碰：`pipelineScheduler.ts`（新增）、`volumeSlotPlanner.ts`（新增）、`volumeBatchOrchestrator.ts`、`PipelinePanel.vue`、timing ledger schema、UI 进度展示。

最可能错的假设：认为卷间并行安全且供应商支持并发。证伪方式：6B 并发探针与槽位连贯性抽读，任一不过即回退并发 1。

## 5. 停止条件

本轮停止条件：方案覆盖真实账本根因、机制层拆解、并发分支判定、确定性收益项、作者反证、验证矩阵、停止条件与回滚策略，并明确成熟度与证据边界。

已满足。

## 6. 执行证据

- Phase 5B 账本：`_audit/verification-pipeline-artifact-contract-live/timing-analysis.md`，卷纲层 36.66m / 12 物理请求 / 0 retry / 流式 36.18m / 本地 31ms。
- 串行结构证据：`src/services/volumeBatchOrchestrator.ts:149` 的 `while (true)` 串行循环。
- 单卷策略来源：`src/components/pipeline/PipelinePanel.vue:3734`，folder SKILL 触发 `single-volume`。
- 正文重试证据：Phase 5B 记录 5 物理请求 / 2 retry。
- 记忆抽取证据：15.75s / 1 请求 / 层间 gap 1.05s。
- 观测复用基础：`src/services/finalDraftTelemetry.ts:1` 已有慢流与停滞模型；`src/services/realSkillExecutor.ts:761` 已有 timingLedger 结构。
- 本轮新增：`_audit/PROPOSAL_2026-10-13_PIPELINE_NEXT_LAYER_EFFICIENCY_PHASE6.md`。

## 7. 缺口清单

- 本轮只出方案，未改代码、未跑采样，属预期状态而非遗漏。
- Phase 6B 并发探针结果将决定 6C 并发上限，当前不写死数值。
- 正文层 schema retry 策略与卷纲层 `fullReasonMissing` 观察项沿用 Phase 5 台账登记，不混入本方案收益口径。
