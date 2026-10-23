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

1. V3 尚未实现；该缺口登记于封存轮，2026-10-22 已按第 9 节批示升级为“已批准待实施”，实现接线仍未开始。
2. 性能预算值（250ms/500ms/200ms/100ms/2s）是工程保守初始值，需在真实机器压测后确认或收紧。
3. live 三层并行尚未执行，真实供应商耗时对比只能在执行轮采集。
4. V2 文档与 V3 文档当前并存；批准 V3 后必须按 G0.10 归档 V2，禁止双方案并行执行。

**本轮无生产代码改动；不能声明功能完成。**

## 8. 解封复审登记（2026-10-22）

**用户原话**：

> `/D:/codex/novel-workshop-vue3/_audit/PROPOSAL_2026-10-21_PIPELINE_DEPENDENCY_PARALLELISM_V3.md` 这是封存的V3文件 ，现在解封，并且根据最新的经验文件总结教训诚实的再进行一次全方位的推理

**目标**：解除 V3 封存，按唯一有效经验文件 `_audit/神意开发经验总结_v9.md` 复读相关门禁，并基于当前源码重新做全方位推理；本轮仍不进入生产代码实施。

**门禁读证**：

1. G0.1：第 0 节用户原话与 5 条目标契约仍是方向锚点。
2. G0.3：复审明确区分“方案成熟”“实现未开始”“性能预算未采样”。
3. G0.7/G1.17：第 12.6 节列出 4 个作者反证与证伪路径。
4. G1.15：第 12.3 节按症状、链路、组合、机制四层递进。
5. G1.19：第 12.4/12.5 节把性能基线采样前置到 Phase 0。
6. G1.20：进度与预算实例必须单源；运行中心只消费 registry。
7. G0.10/G0.11/G0.12：后续实施必须迁移 13 个验证脚本的旧进度断言、真实 Electron 交互、独立台账。

**执行证据**：

1. `rg` 确认 `src/stores/pipeline.ts:7-27` 全局状态、单 controller 与新 run abort 旧 controller 仍存在。
2. `rg` 确认 `PipelinePanel.vue:217/352/502/574` 四层进度条仍读全局进度，按钮仍被全局 `isGenerating` 锁定。
3. `rg` 确认 `runTrace.ts:1134-1136` 仍存在非 chat `startRun` auto-abandon；`agentTraceBridge.ts:28` 仍存在 current fallback。
4. `Get-Content src/services/chainBreakpoint.ts` 确认 owner 隔离与 `completedChain` 防御已补强。
5. `rg` 确认 `realSkillExecutor.ts` 存在 per-attempt 候选账本与 `retainedCandidateIndex`，`runTrace.ts` 存在按 runId 的反馈审计。
6. `rg` 确认 provider 并发调度、RunProgressChannel、long task/freeze watchdog 均未实现。
7. `rg` 确认 13 个 Electron 验证脚本仍读取 `pipeline?.generationProgress`。
8. 本轮修改：`PROPOSAL_2026-10-21_PIPELINE_DEPENDENCY_PARALLELISM_V3.md` 追加第 12 节；本台账追加第 8 节。

**复审结论**：

1. V3 核心方向成立，继续作为唯一方案，不回到 V2，也不做双轨。
2. 断点 owner 隔离、completedChain 防御、正文候选账本与反馈审计已经补强，但这些是局部修复，不能抵消全局状态与单当前槽问题。
3. 全局生成状态、trace 单当前槽、current fallback、配置 RMW、项目整块替换、provider 调度、进度通道与性能观测仍未实现。
4. 新增缺口已登记到 V3 第 12.4 节，含验证器旧进度断言、性能预算未采样、章节共享断点例外、设置层写键矩阵。

**缺口清单**：

1. 本轮无生产代码改动，Phase 0-J 未启动。
2. V3.1 第 12.8 节 4 个新增决策点已于 2026-10-22 全部批准，登记见第 9 节。
3. 本轮 DEV_LOG 已创建：`_audit/DEV_LOG_2026-10-22_pipeline-parallelism-v3-unseal-review.md`，并已补记批准与成熟化包。

## 9. 决策点批准与成熟化包登记（2026-10-22）

**用户原话**：

> 审核决策点都批示为是，但是我看到方案里的执行器和工具层都显示未办成熟，这个你无法推进至成熟么？？

**批示登记**：

1. 批准 V3.1 修正版作为唯一执行方案，批准后先执行 Phase 0 红测试与性能基线。
2. 批准章节批次共享槽作为“目标锁内显式例外”，不删除重做章节断点。
3. 批准 Phase 0 先做只读性能采样，再确认或收紧 250ms/500ms/200ms/100ms/2s 预算。
4. 批准设置层并行先做写键矩阵审计；矩阵不清晰前，settings 只与无写冲突目标并行。

**成熟化包登记**：

1. 方案第 12.9 节新增执行器/工具层成熟化包，覆盖 RunContext、RunRegistry、目标锁、Trace 显式化、配置事务、进度通道、性能与稳定性观测 7 组交付物。
2. 每组均定义交付物与验收门；成熟度升级唯一路径是 Phase 0-A 完成并通过红绿测试。
3. 在 Phase 0-A 完成前，执行器/工具层保持“半成熟”；任何文档层面的“成熟”声明均视为假闭环。

**当前边界**：

1. 本轮仍未修改生产代码，Phase 0-J 未启动。
2. 下一动作是 Phase 0：红测试钉住全局进度串线、auto-abandon、current fallback、配置 RMW、整块替换，并采集单 run 只读性能基线。

## 10. 执行器/工具层 20 轮深度推进登记（2026-10-22）

**用户原话**：

> 你的执行器，工具层推进过程有没有吸取经验教训和开发日志？ 以前我们做的组件经常有纠缠打架现象，你必须诚实吸取教训来推进，你进行20轮次的深度推进，然后把方案升级后给我审核

**目标**：按经验文件 v9 与历史 DEV_LOG，对执行器/工具层做 20 轮深度推演，识别组件纠缠与打架形态，把 V3.1 升级为 V3.2 供用户审核；本轮仍不修改生产代码。

**教训读证**：

1. G1.15：组件组合层互相干扰；单组件正常不代表组合正常。
2. G1.9：状态机必须有终态收敛，终态事件不得被吞。
3. G1.17：作者与验证器都有自盲区，副作用必须有断言面。
4. G1.20：预算、进度、回放锚点必须单源。
5. G2.9：断点与 attempt 生命周期必须显式归属。
6. 历史事故链：预览状态机纠缠、断点生命周期错位、降级越权、双预算实例、runId 单源盲区、验证器旧锚点。

**源码对账**：

1. `src/stores/pipeline.ts:7-27`：全局 `isGenerating/generationProgress/generationAbortController`，`startGeneration` 先 abort 旧 controller。
2. `src/stores/pipeline.ts:30-57`：进度与终态 API 均无 runId；canceled 分支静默 return。
3. `src/stores/pipeline.ts:69-72`：无 owner 断点回落共享 key；chapters 共享槽为现状例外。
4. `src/stores/pipeline.ts:120-206`：四个配置入口对同一 `pipeline_step_config` key read-modify-write，catch 后仅 `console.warn`。
5. `src/stores/project.ts:1000-1008`：`setVolumes/setChapters` 整块替换后异步保存。
6. `src/stores/runTrace.ts:1134-1136`：非 chat `startRun` 调 `abandonRunningRun(source)`；`:2397-2405` current/last 双回落。
7. `src/services/agentTraceBridge.ts:28`：`runId || currentRunIdBySource` fallback。
8. `src/components/pipeline/PipelinePanel.vue:208/362-363/467-468/562-563`：四层入口被全局 `isGenerating` 锁定；`:318/460` 已有目标锁定安全语义；`:2941-3049` API 调用无 provider 并发调度。
9. `src/services/chainBreakpoint.ts:82-99`：owner 隔离与 `completedChain` 防御已补强，保留不重做。
10. 13 个 `scripts/verify-*-electron.mjs` 仍消费全局 `generationProgress/isGenerating`。

**产出**：

1. 方案追加第 13 节：20 轮推演表、对第 12.9 节的 7 条强化、3 个新增审核决策点、V3.2 成熟度复审。
2. V3.2 明确执行器/工具层仍为“半成熟”，成熟度只能由 Phase 0-A 红绿测试推进。

**缺口清单**：

1. 本轮无生产代码改动，Phase 0-J 未启动。
2. 第 13.4 节 D5-D7 三个决策点待用户审核。
3. V3.2 批准前，V3.1 与 V3.2 并存仅作审核对照；批准后按 G0.10 以 V3.2 为唯一执行版本。

## 11. 链路支持性补充审计登记（2026-10-22）

**用户原话**：

> 还有一个很重要的问题，应用若是多任务并行，API供应商本身支持，但是应用里的链路支持组件或者工具层支不支持？

**结论**：供应商并发只是外层条件；当前应用链路“函数形态可重入，但共享状态不支持安全并行”。

**新增证据**：

1. `src/services/aiService.ts:2278`：单例 `activeToolRunBudget`。
2. `src/services/aiService.ts:2459-2465`：`callAi` 用保存-替换-恢复管理该字段；并行交错时预算归属被后来者改写。
3. `src/services/aiService.ts:2489-2513`：消息、工具循环、本地预算引用为调用局部变量，请求层具备并发潜力。
4. `src/services/agentTraceBridge.ts:28`、`src/stores/runTrace.ts:1136`：trace 事件归属仍靠 fallback 与 auto-abandon，不支持多 run。
5. `src/stores/pipeline.ts:7-57`：全局状态与单 controller 是并行硬阻塞。
6. `src/services/chainBreakpoint.ts:84-99`：owner 断点已安全；`src/stores/pipeline.ts:69-72` 的共享 key 回落仍是串点入口。

**登记要求**：

1. 方案第 13.6 节新增：Phase A 将工具运行预算改为 per-request/per-run 显式传递。
2. Phase 0-A 红测试追加并发预算场景，断言两个 run 的预算互不污染。
3. provider scheduler 未落地前，不得声明并行验收通过。

## 12. 方案重整登记（2026-10-22）

**用户原话**：

> 你重新更新方案文件，诚实保证不偏移主需求，并且把补充的和追加的都补充完善，坚决不遗漏

**执行内容**：

1. 第 0.2 节目标契约新增第 5 条“链路与工具层真实支持”，原防偏移条顺延为第 6 条；第 0.3 节新增“供应商支持并发，应用链路和工具层支持吗”问答行。
2. 第 1.3 节新增第 5 条：两个 run 并行外呼时物理请求安全网与工具轮次预算各自独立。
3. 第 2 节新增工具运行预算串账行；修正 `StyleProfileCard.vue` 路径为 `src/components/common/`；补记精确锚点 `PipelinePanel.vue:217/352/502/562` 与按钮锁 `:208/:362/:467/:562-563`。
4. 第 7 节 Phase A 增加 per-run 预算交付；Phase I 清零项增加单例工具预算字段；Phase J 增加“链路/工具层并发审计报告”。
5. 第 8.1 节新增正确性第 8/9 条（物理请求与工具轮次预算隔离）；8.4 节新增 live 第 5 条；8.5 节新增负向断言第 6 条。
6. 第 12.9.1 节新增验收门第 5 条；新增 12.9.8“Provider 调度与预算隔离”；原 12.9.8 顺延为 12.9.9，成熟度推进规则补入 provider/预算行。
7. 第 13.3 节新增第 8 条：`activeToolRunBudget` 单例字段删除是 Phase I 清零项。
8. 新增第 13.7 节“补充审计并入正文对账清单”，登记所有补充内容并入位置与主需求对应关系，并写明防偏移规则。

**验证**：

1. `rg` 确认第 0.2/1.3/2/7/8/12.9/13.3/13.7 各处均已出现对应新增条目。
2. `rg --files` 确认 `StyleProfileCard.vue` 当前路径为 `src/components/common/StyleProfileCard.vue`。
3. `git diff --check` 通过。

**诚实边界**：本轮仍是方案重整，无生产代码改动；D5-D7 仍待审核；Phase 0-J 未启动。

## 13. V3.2 门禁逐条对账审计（2026-10-22）

**用户原话**：

> 你现在根据经验文件总结教训逐条对账方案V3.2来诊断查验是否问题只停留在表面的毛病，和门禁是否对的上

**目标**：按 `_audit/神意开发经验总结_v9.md` 逐条对账 V3.2，判定哪些修复是机制层根修、哪些停留在表面，并找出方案与门禁不匹配处。本轮为审计登记，不修改方案正文与生产代码。

**门禁读证**：

1. G0.1/G0.3/G0.6/G0.7/G0.10/G0.12：读自经验文件第 20-124 行；本轮保持目标、诚实边界、成熟度、正反推与台账约束。
2. G1.5/G1.8/G1.9/G1.10/G1.17/G1.19/G1.20：读自第 166-360 行；重点核对验证器同步、trace schema、状态机终态、权限、再入矩阵、观测先行、预算单源。
3. G2.8/G2.9/G2.10/G2.11/G2.13：读自第 423-489 行；重点核对写队列临界区、断点与 attempt 生命周期、真实 trace 回放、供应商软错误、SKILL 中立。

**对账结论**：

1. V3.2 的主方向不是表面修复：全局 `isGenerating`/单 controller、trace current fallback/auto-abandon、`activeToolRunBudget` 单例、配置 RMW、项目整块替换都被定位到机制层，并配了 Phase 0-J 与负向断言。
2. 但按门禁逐条映射仍有 8 个半接入缺口，主要集中在“同步面”“再入面”“时序面”和“收尾面”，不能在当前版本直接判为成熟。

**缺口清单**：

1. **P0，G1.17 四格再入矩阵缺失**：12.6 第 4 条提到“二次进入、成功终态后再进入”，12.9.1 有生命周期表，但第 8 节验证矩阵没有强制 `{执行模式} × {新鲜启动/断点恢复/成功终态后再次进入/失败终态后再次进入}` 四格。当前只会在实施时偶然覆盖，不是验收门。
2. **P0，G2.11 供应商软错误语义不完整**：12.9.8 第 3 条只写“额度、限流只终结当前 run”，第 8.4 节只写“当前 run 失败”，未落 `quota_exhausted` 显式终态、纯文本/SSE/自然出现额度词三形态、无第二次物理请求断言与 runId trace 观测。
3. **P0，G2.8 写队列临界区语义缺位**：12.9.5 只写“写入串行化”，Phase E 只写“保存串行化”，均未写“队列临界区内读取最新 state 后修改并落盘”。这是 G2.8 的核心，不是措辞差异。
4. **P1，G1.8 trace schema 同步缺口**：V3.2 大量新增 runId/进度/终态事件，但未登记 `schemaVersion`、导出通道、旧数据兼容测试与验证器白名单同批迁移，存在观测器旧语义假失败风险。
5. **P1，G1.20 预算派生契约缺口**：12.9.8 已把预算从单例改为 per-run，但未写“工具预算、物理请求预算、验证器预算从同一份真实执行计划派生”，也未禁止 snapshot/live 双实例。
6. **P1，G2.9 断点与 attempt 生命周期缺口**：Phase C/E 只写 owner 化与事务，未明确“每个 owner 写入点存在同 owner 成功清理路径”“成功清理失败不得宣称完成”“targeted 修复优先读取 attempt 生命周期产物”。
7. **P1，G1.17 副作用断言面缺口**：验证矩阵有“保存失败不污染项目数组”，但未定义断言面是“编辑器为空”还是“上一有效产物保持不变”；多场景连续验证必须断言“新 run 未覆盖旧产物 + runId 更新”。
8. **P2，G1.12/G1.13 收尾门禁缺位**：Phase I 写“更新版本并封装”，但没有版本核验、NSIS/asar/真实启动/electronAPI/SHA256、旧产物清理复核、真实 UI 可见窗口硬门禁。并行是发布级架构变更，不能用普通收尾冒充。

**门禁对得上但属于成熟覆盖的部分**：

1. G1.9：D6 显式 run 状态枚举、终态事件落 trace、canceled 不得吞终态，方向正确。
2. G1.10/G2.13：V3.2 未让 SKILL/Agent 改权限面，目标锁与执行层分开，符合中立原则。
3. G1.19：Phase 0 先采样基线再确认性能预算，符合观测先行。
4. G0.11：第 8.3 节要求 SKILL/Agent 真实下拉选择，禁止注入式冒充。

**处理建议**：

1. 先由用户批准是否将本轮 8 个缺口并入 V3.3；批准后一次性修订第 7/8/12.9/13.3/13.7 节，禁止逐个补丁式追加。
2. 四格再入矩阵、软错误语义、临界区读新值三项为 P0，必须在 Phase 0 红测试清单中先行钉住。
3. schema 同步、预算派生、断点/attempt 生命周期、副作用断言面为 P1，应在对应 Phase 交付物与验收门中落地。
4. 封装核验为 P2，但 Phase I/J 完成前必须补入，否则不得发布。

**验证**：

1. `rg` 对经验文件提取 G0/G1/G2 条目与关键语义，完成 L0-L2 相关门禁复读。
2. `rg` 对 V3.2 检索 `schemaVersion`、`quota_exhausted`、`二次进入`、`临界区`、`验证器预算`、`断点清理`、`attempt 产物`、`SHA256`，除第 12.6 的“二次进入”外均无验收级命中。
3. 本轮只修改本台账、DEV_LOG 与总索引；方案正文与生产代码未改动。

## 14. V3.3 并入登记（2026-10-22）

**用户原话**：

> 确认并入

**执行内容**：

1. 方案标题升级为 V3.3，解封状态说明 8 个门禁缺口已一次性并入。
2. Phase 0 追加四格再入、`quota_exhausted` 无二次物理请求、写队列旧快照覆盖三个 P0 红测试形态。
3. Phase B 追加 `schemaVersion`、导出通道、旧数据兼容与验证器白名单同批升级。
4. Phase C/E 追加同 owner 成功清理路径、临界区内读最新 state、targeted 修复优先 attempt 产物。
5. Phase I/J 追加发布级封装核验、旧产物清理复核、真实 UI 再入路径。
6. 8.1 新增四格再入矩阵；8.3 新增成功终态后再次进入路径；8.4 落 `quota_exhausted` 三形态与无二次请求；8.5 新增临界区与断点/attempt 负向断言。
7. 12.9.4/12.9.5/12.9.8 同批补验收门；13.3 追加三个 P0 红测试形态；新增 13.5.1 并入对账表与 13.5.2 V3.3 成熟度复审；13.7 对账清单同步登记。

**诚实边界**：

1. 本轮仅修改方案与审计文档，无生产代码改动；Phase 0-J 仍未启动。
2. 执行器/工具层仍为“半成熟”；成熟度只能由 Phase 0-A 红绿测试推进。
3. D5-D7 三个决策点仍待用户审核；V3.3 批准前不进入实施。

## 15. V3.3 批准与升级登记（2026-10-22）

**用户原话**：

> 审核决策点 全部采纳 是，然后升级方案

**批示登记**：

1. D5 批准：运行中心提供 run 级取消按钮；并行语义上线后移除全局取消入口。
2. D6 批准：以显式 run 状态枚举替换字符串状态判断，作为 Phase A 首批交付。
3. D7 批准：保留“生成中锁定目标”的安全语义，锁粒度从全局改为目标级。

**升级结果**：

1. 方案标题与状态升级为“V3.3，已批准待实施”。
2. 按 G0.10，V3.3 成为唯一执行版本；V3.1/V3.2 章节仅作历史复审记录。
3. 下一动作是 Phase 0：红测试钉住全局进度串线、auto-abandon、current fallback、配置 RMW、保存合并窗口，以及四格再入、`quota_exhausted` 无二次物理请求、写队列旧快照覆盖三个 P0 形态；同轮采集单 run 只读性能基线。

**诚实边界**：

1. 本轮仅更新方案状态与审计登记，无生产代码改动。
2. Phase 0-J 未启动；执行器/工具层仍为“半成熟”，成熟度只能由 Phase 0-A 红绿测试推进。

## 16. Phase J 真实 Electron 并行验收登记（2026-10-23）

**执行范围**：V3.3 Phase J 真实 Electron 验证（mock provider + 可见窗口真实操作），生产代码不因验证结果追加改动。

**验证入口**：`scripts/verify-pipeline-parallelism-electron.mjs`

**验收结果**：`_audit/verification-pipeline-parallelism-live/report.json` → `result: "PASS"`，完成时间 2026-10-23 06:29:55。

**已验证矩阵**：

1. **freshStart 三层并行**：卷纲 `pipeline-run-1792708176462-1`、章节 `pipeline-run-1792708176655-2`、正文 `pipeline-run-1792708176779-3` 同一并发快照内均为 `running`；三层 trace run `run-1792708176439-1 / run-1792708176643-14 / run-1792708176772-28` 各自独立。
2. **逐 run 取消隔离**：点击章节 run 取消后 `121ms` 达到 `canceled`；卷纲、正文 run 不受影响，最终分别为 `succeeded / canceled / succeeded`。
3. **Provider 并发**：3 个物理请求，`maxConcurrency=2`，`volumes + body` 出现重叠；章节取消未产生额外物理请求。
4. **成功终态再入**：正文旧 run `pipeline-run-1792708176779-3` 再入后产生新 run `pipeline-run-1792708187331-4`；正文 hash 从 `3a6a2ae5...` 变为 `99034e89...`，body 物理请求 `1 → 2`，产物含新轮次标记 `parallelism-3`，证明旧稿未冒充新产物。
5. **trace 导出**：卷纲 `success`、章节 `canceled`、正文 `success`，无 running 残留；trace 原件迁入 `_audit/verification-pipeline-parallelism-live/exports/`。
6. **性能预算**：`freezeCount=0`、`slowClickFeedbackCount=0`，三次 run 启动点击反馈均 `<=1ms`。

**验证器缺陷定案与修复（脚本层，非应用缺陷）**：

1. **22ms 假成功**：脚本把 trace runId（`run-...`）当 pipeline runId 传入 `runSuccessfulTerminalReentry`，导致 `runId !== previous` 恒真。Before：22ms 即通过且读到旧稿；After：主流程改用 `terminalSnapshot.body.runId`，并加 `startsWith('pipeline-run-')` 护栏，见 `scripts/verify-pipeline-parallelism-electron.mjs:834-836`。
2. **8 分钟伪卡死**：`layerSnapshot` 用 `find` 读取最早 body run，再入后新 run 正常 8 秒完成，脚本却永远观察旧 run。Before：等待条件永假直至超时；After：`findLast` 取当前活动 run，等待条件改为“新 runId + 非 running/queued 终态”，见 `scripts/verify-pipeline-parallelism-electron.mjs:384-387,640-699`。
3. **失败自诊断补齐**：`reentry-body-artifact-diagnostics.json` 改为无条件写入，失败时也保留完整 bodyRuns、traceRuns、hash 与 preview，见 `scripts/verify-pipeline-parallelism-electron.mjs:705`。

**经验回写**：`_audit/神意开发经验总结_v9.md` G1.5 新增“跨 ID 域契约”，G1.17 新增“观测对象盲区”。

**收尾清理**：`_data/pipeline-parallelism-exports/` 三份运行 trace 原件迁入证据目录后删除临时目录；`_data/pipeline-parallelism-profile/` 已由脚本 finally 清理，不复存在。

**诚实边界**：

1. `coverage.breakpointReentry=false`、`coverage.failedTerminalReentry=false`：断点恢复与失败终态后再入未在真实 Electron 中触发，Phase J 不得宣称四格再入全闭环。
2. 本轮为 mock provider + 真实 Electron 窗口，不等同外部 live 供应商矩阵；既有 13 个历史 Electron 验证脚本未全部复跑。
3. 版本升级、NSIS/asar 封装、安装包 SHA256 与打包后启动核验未执行，等待用户确认后进入收尾。
