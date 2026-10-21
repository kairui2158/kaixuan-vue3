# 任务台账：生成流水线依赖并行 V3 方案

## 1. 目标与原话

**用户原话**：

> 你v2的方案对于我们的需求运行机制是怎么样的？ 其它层在运行的时候是不是也同步显示进度条？ 进度条会不会乱？ 同步运行后，应用会不会延迟严重？ 卡顿？ 卡死？  导致应用崩溃？  你的V2方案没有把我们的目标需求记录在内，这样会导致你的方向发生偏移，你现在就我的问题来升级方案成V3给我审核，重点是我们的需求目的要作为核心记录在内

**最终可感知行为**：

1. 卷纲层生成第 4 卷时，章节层可生成已确认卷，正文层可生成已完成章节。
2. 三层运行时各自进度条同步显示且不串线。
3. 应用不出现严重延迟、卡顿、冻结或崩溃。
4. V3 文档把用户需求原文作为一等契约记录，防止方向偏移。

**本轮交付物**：

- `_audit/PROPOSAL_2026-10-21_PIPELINE_DEPENDENCY_PARALLELISM_V3.md`
- `_audit/TASK_LEDGERS/2026-10-21_pipeline-dependency-parallelism-v3.md`

## 2. 门禁读证

| 门禁 | 读证与执行 |
|---|---|
| G0.1 目标对齐 | 第 0 节记录用户原话与 5 条目标契约；所有章节对应“消除串行等待 + 进度独立 + 可响应” |
| G0.3 诚实闭环 | 成熟度结论区分方案成熟与实现未开始；明确本轮无生产代码改动 |
| G0.4 门禁复读 | 本轮复读 `神意开发经验总结_v8` L0-L2 相关条目，并复读 V2 方案全文 |
| G0.6 方案成熟度 | 第 10 节按四层给出成熟/半成熟/未开始结论 |
| G0.7 正反推研磨 | 第 6 节为 V3 新增 20 轮推论；第 2 节反推“直接并行为什么必乱” |
| G0.9 影响圈声明 | 覆盖 stores、PipelinePanel、runTrace、agent bridge、风格卡片、项目保存、供应商调度、退出恢复 |
| G0.10 新旧并存清零 | 第 8.5 节负向断言要求旧全局进度、current fallback、auto-abandon 执行层清零 |
| G0.11 真实交互冒充禁令 | 第 8.3 节要求真实下拉选择 SKILL/Agent，禁止注入冒充 |
| G0.12 门禁执行台账 | 本台账按七节产出 |
| G1.4 验证分层 | 验证分为单测、mock 并行、性能压力、Electron、live、负向断言 |
| G1.8 日志与观测同步 | trace/API/progress 绑定 runId；崩溃前现场不得只在内存 |
| G1.9 状态机与终态收敛 | run 终态接入 `stateTransitionGuard`；终态后拒绝进度复活 |
| G1.13 Electron 验证执行标准 | 可见窗口、隔离 profile、真实点击、内置 key |
| G1.19 耗时观测先于性能决策 | V3 不先改性能代码，先定义性能预算、计数器和 freeze watchdog |

## 3. 路由判定

**加入**：G0.1、G0.3、G0.4、G0.5、G0.6、G0.7、G0.9、G0.10、G0.11、G0.12、G1.4、G1.8、G1.9、G1.13、G1.19。

**排除**：

1. G1.12 封装收尾：本轮只出方案，不实现、不封装；封装门禁在 V3 批准并执行后适用。
2. G2 系列 SKILL/正文契约细则：本轮目标是运行架构方案，不改 SKILL 与正文协议；执行时按对应 Phase 再路由。
3. 社区爬取门禁：用户本轮要求的是基于已有推论升级 V3，不要求新增社区调研；后续若用户要求社区对账再执行。

## 4. 影响圈与作者反证

**打算改的**（方案批准后）：

1. `src/stores/pipeline.ts`：全局状态迁为 RunRecord 与 registry。
2. `src/stores/runTrace.ts`：删除运行期 auto-abandon，多 active run 显式路由。
3. `src/components/pipeline/PipelinePanel.vue`：四层进度条改按 run 取数；按钮禁用改依赖门。
4. `src/components/pipeline/GenerationProgressBar.vue`：入参改为 run progress。
5. `src/services/agentTraceBridge.ts`：删除 current fallback。
6. `src/components/pipeline/StyleProfileCard.vue`：观测绑定 runId。
7. `src/stores/project.ts`：运行产物按目标事务提交。
8. `src/services/aiService.ts`：provider scheduler 与软错误隔离。
9. 断点与 `pipeline_step_config`：owner 化与串行事务。
10. 退出与启动：shutdown 收口与 interrupted 恢复。

**可能碰到的**：

1. 大纲工作台与流水线共享配置写入。
2. trace 保存队列、流式 flush、运行记录导出。
3. 章节批次、修复重试、断点恢复。
4. 运行中心新 UI 与现有页签布局。
5. 测试和验证脚本中的旧全局状态断言。

**最可能错的假设及证伪方式**：

1. *假设：合并刷新足以保证流畅。* 证伪：合成流式压测若仍出现 >200ms long task 或 >2s freeze，方案必须继续拆分渲染与更新。
2. *假设：每层 1 run 已满足用户目标。* 证伪：用户实际场景若需要同层多目标并行，按契约“消除串行等待”扩展，而不是用技术理由拒绝。
3. *假设：provider 并发 2 是安全默认。* 证伪：live 测试若出现供应商限流放大或额度误伤，按观测数据调整而不是拍脑袋加并发。
4. *假设：registry 能避免所有串线。* 证伪：错误 runId、终态 run、取消后事件、页面切换恢复都必须进入负向与恢复测试。

## 5. 停止条件

**方案轮停止条件**：

1. V3 文档存在且第 0 节包含用户原话与目标契约。
2. 逐项回答运行机制、进度条、进度乱、延迟、卡顿、卡死、崩溃七个问题。
3. 20 轮 V3 推论、性能预算、验证矩阵、回滚策略、成熟度结论、审核决策点齐全。
4. 台账七节齐全。

**执行轮停止条件**（批准后）：

1. 正确性、性能、Electron、live、负向断言全部通过。
2. 负向断言显示旧执行路径命中 0。
3. 无未登记缺口；DEV_LOG、经验文件、版本与封装收尾完成。

**失败条件**：

1. 任一性能硬门禁不达标。
2. 任何 run 事件串线或取消污染。
3. 旧路径 fallback 存在。
4. 验证使用注入冒充真实 UI 操作。

## 6. 执行证据

**本轮读取**：

1. `_audit/PROPOSAL_2026-10-21_PIPELINE_DEPENDENCY_PARALLELISM_V2.md` 全文。
2. `_audit/神意开发经验总结_v8.md` L0-L2 相关门禁。
3. `rg` 输出确认：
   - `PipelinePanel.vue:217/352/502/574` 四层都读 `pipelineStore.generationProgress`；
   - `pipeline.ts:7-27` 存在全局 `isGenerating/generationProgress` 与新 run abort 旧 controller；
   - `runTrace.ts:899-949` 存在 source 单当前槽；
   - `runTrace.ts:1065-1067` 存在 `startRun` auto-abandon 风险；
   - `agentTraceBridge.ts:28` 存在 `runId || currentRunIdBySource` fallback。

**本轮修改**：

1. 新增 V3 方案文件。
2. 新增本台账。

**本轮不修改**：

1. 生产源码。
2. 测试脚本。
3. V2 文档（保留作为历史输入；批准 V3 后按 G0.10 决定是否归档）。

## 7. 缺口清单

**封存登记（2026-10-21）**：

1. 用户决定先处理其他任务，V3 方案封存待启动。
2. 封存期间禁止启动 Phase 0-J，禁止引用本方案作为并行改动依据。
3. 解除封存时必须重新复读最新经验文件与 DEV_LOG，确认期间没有其他改动破坏 V3 的影响圈假设。

**本轮登记缺口**：

1. V3 尚未实现，属于待用户审核方案；实现接线未开始。
2. 性能预算值（250ms/500ms/200ms/100ms/2s）是工程保守初始值，需在真实机器压测后确认或收紧。
3. live 三层并行尚未执行，真实供应商耗时对比只能在执行轮采集。
4. V2 文档与 V3 文档当前并存；批准 V3 后必须按 G0.10 归档 V2，禁止双方案并行执行。

**本轮无生产代码改动；不能声明功能完成。**
