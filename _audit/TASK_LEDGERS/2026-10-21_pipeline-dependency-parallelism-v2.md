# 2026-10-21 流水线依赖并行 V2 全应用渗透推论台账

## 1. 目标与原话

- 用户原话核心：以现有方案为基础，根据经验文件的教训再进行 20 轮推论，渗透到整个应用，出具 V2 方案。
- 最终可感知行为：卷纲、章节、正文在依赖稳定时可并行运行；每个运行有独立进度、取消、trace、断点、配置快照与持久化收口。
- 本轮交付物：
  - `_audit/PROPOSAL_2026-10-21_PIPELINE_DEPENDENCY_PARALLELISM_V2.md`
  - 本台账。

## 2. 门禁读证

- G0.6（`_audit/神意开发经验总结_v7.md:60`）：V2 已按执行器、方案、接线、验证四层给出成熟度。
- G0.7（`:68`）：20 轮推论均锚定真实代码入口与用户目标，不只看逻辑成立。
- G0.10（`:92`）：V2 明确旧 current fallback、共享断点、全局 abort、合并保存必须清零，且要求负向断言。
- G0.11（`:102`）：Electron 验证要求真实 DOM 点击、真实 SKILL 下拉选择，禁止注入冒充。
- G0.12（`:110`）：本台账按七节结构登记。
- G1.15（`:272`）：推论覆盖症状、链路、组件组合、机制四层；本轮确认 runTrace auto-abandon 属机制层暗伤。
- G1.17（`:294`）：验证默认证伪，包含成功终态后二次进入和 current fallback 证伪。
- G2.9（`:422`）：断点 owner、attempt、目标锁与终稿/流水线状态收口纳入 V2。
- G1.19：耗时与效率决策必须先有观测账本；V2 不用主观速度优化替代行为正确性验证。

## 3. 路由判定

加入：G0.6、G0.7、G0.9、G0.10、G0.11、G0.12、G1.15、G1.17、G1.19、G2.9。

排除：

- G0.11 的注入准备例外不适用：本方案验证目标包含真实用户 UI 操作，因此素材准备之外的注入均无效。
- G1.18 本地确定性路径契约不适用：本方案核心是模型生成运行并行，不以本地变换替代模型链路；但其 trace 原话与版本收口原则被 V2 吸收。
- G2.13 SKILL/runtime 职责分离未单独列为改动项：V2 只要求 SKILL 内容进入 config snapshot，不允许 SKILL 改变执行协议与权限语义。

## 4. 影响圈与作者反证

打算改的：

- `src/stores/pipeline.ts`
- `src/stores/runTrace.ts`
- `src/components/pipeline/PipelinePanel.vue`
- `src/components/common/OutlineWorkspace.vue`
- `src/components/common/StyleProfileCard.vue`
- `src/services/agentTraceBridge.ts`
- `src/stores/project.ts`
- 新增 registry/config/transaction/scheduler 服务。

可能碰到的：

- ExitConfirmModal、App integrity、main 进程退出路径。
- runTrace 导出与回读。
- pipeline_step_config 读写测试。
- project save spec 中关于合并写盘的既有口径。
- 生成流水线各层 orchestrator。

最可能错的三个假设与证伪：

1. “删除 startRun auto-abandon 即可多运行”：证伪方式是两个 pipeline run 并行后检查 API call、agent event、trace 终态是否串线。
2. “项目保存合并不会丢运行产物”：证伪方式是两个 run 同 tick 写不同目标后强制保存失败，断言两个目标都进入可恢复失败。
3. “OutlineWorkspace 只是流水线 UI 的读取者”：证伪方式是并行时在工作台修改 step config，检查 run config snapshot 是否漂移。

## 5. 停止条件

机器可判定完成：

1. Phase 0-I 全部执行，测试、type-check、构建通过。
2. 三个真实 run 并行：互不取消、trace 独立、取消一个另两个完成。
3. 崩溃重启后残留 run 为 interrupted，断点可恢复。
4. 负向扫描中执行层无 `currentRunId` fallback、无共享章节断点、无旧全局 abort 路径。
5. Electron 真实 UI + 内置 key + 界面选择 SKILL 的证据齐备。

失败条件：

- 任一 phase 出现旧路径静默回退。
- 任一验证用 mock 冒充 live 或注入冒充真实 UI。
- 并行运行出现目标覆盖、trace 串线、断点错位、保存丢失。

## 6. 执行证据

- `src/stores/pipeline.ts:21-27`：新 run 先 abort 旧 controller。
- `src/stores/pipeline.ts:67-118`：chain owner 与共享 `pipeline_breakpoint` 并存。
- `src/stores/pipeline.ts:120-206`：step config 多处 read-modify-write。
- `src/stores/runTrace.ts:1065-1067`：非 chat `startRun` 自动 abandon 旧 run。
- `src/stores/runTrace.ts:956-986`：abandon 会把旧 run 与 running API call 判 failed。
- `src/stores/runTrace.ts:899-949`：source 级 current run/API call 单槽。
- `src/services/agentTraceBridge.ts:28`：runId 缺失时 fallback current run。
- `src/components/common/StyleProfileCard.vue:547-548`：按 host current run 读取。
- `src/components/pipeline/PipelinePanel.vue:2986`：signal fallback 全局 controller。
- `src/components/common/OutlineWorkspace.vue:3307` 附近：直接读写 pipeline 断点与 step config。
- `src/stores/project.ts:766-847`：saveProject 合并队列。
- `src/stores/project.ts:1000-1007`：setVolumes/setChapters 整块替换。
- `src/services/aiService.ts:1135-1185`：额度软错误识别已存在。
- `src/services/aiService.ts:4119`：429/502/503 重试已存在，无全局并发闸。
- `src/services/stateTransitionGuard.ts:28-43`：统一生命周期词汇已存在，V2 直接接入。

本轮未修改生产代码；仅新增方案文档与本台账。

## 7. 缺口清单

- 本轮是方案阶段，生产实现、单测、集成、Electron 真实 UI、live 供应商验证均未开始。
- 多项目并行、外部供应商矩阵、同层多 run 配置策略未纳入 V2 首版，作为后续扩展面登记。
- provider 并发默认值 2 是方案保守默认，需在真实 live 三层并发验证后确认是否暴露用户设置。
