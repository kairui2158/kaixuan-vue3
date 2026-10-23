# 2026-10-22 流水线依赖并行 V3 解封复审

## 任务目标

- 台账：[_audit/TASK_LEDGERS/2026-10-21_pipeline-dependency-parallelism-v3.md](_audit/TASK_LEDGERS/2026-10-21_pipeline-dependency-parallelism-v3.md)
- 目标：解封 `_audit/PROPOSAL_2026-10-21_PIPELINE_DEPENDENCY_PARALLELISM_V3.md`，按唯一有效经验文件 `_audit/神意开发经验总结_v9.md` 复读相关门禁，并基于当前源码重新完成全方位推理。
- 边界：本轮是方案复审，不实施 Phase 0-J，不改生产代码。

## 复审结论

- V3 核心方向成立，继续作为唯一执行方案；断点 owner 隔离、`completedChain` 防御、正文候选账本与反馈审计已补强。
- 这些补强是局部修复，不能抵消全局 `isGenerating/generationProgress/generationAbortController`、trace 单 source 当前槽、current fallback、配置 read-modify-write、项目整块替换等全局并行风险。
- provider 并发调度、`RunProgressChannel`、run 级进度槽、long task/freeze watchdog 仍未实现。
- V3.1 新增四个复审缺口：13 个 Electron 验证脚本仍消费全局进度；性能预算未在真实机器采样；章节共享断点需要目标锁解释；settings 并行前需补写键矩阵。

## 修改内容

- `_audit/PROPOSAL_2026-10-21_PIPELINE_DEPENDENCY_PARALLELISM_V3.md`
  - 标题与状态从“已封存待启动”更新为“已解封复审中”。
  - 追加第 12 节“2026-10-22 解封复审（V3.1）”：证据对账、G1.15 四层推理、新增缺口、修正执行顺序、作者反证、成熟度复审、新增审核决策点。
  - 用户批示第 12.8 节 4 个决策点全部“是”后，标题更新为“V3.1，已批准待实施”。
  - 追加第 12.9 节“执行器/工具层成熟化包”：RunContext、RunRegistry、目标锁、Trace 显式化、配置事务、进度通道、性能与稳定性观测 7 组交付物与验收门；明确成熟度只能由 Phase 0-A 红绿测试推进，禁止文档层面改写结论。
- `_audit/TASK_LEDGERS/2026-10-21_pipeline-dependency-parallelism-v3.md`
  - 追加第 8 节“解封复审登记（2026-10-22）”，登记目标、门禁读证、执行证据、复审结论与缺口。
  - 追加第 9 节“决策点批准与成熟化包登记（2026-10-22）”，登记 4 个批示与成熟化包边界。

## 验证

- 只读源码对账完成：`src/stores/pipeline.ts`、`src/components/pipeline/PipelinePanel.vue`、`src/stores/runTrace.ts`、`src/services/agentTraceBridge.ts`、`src/services/chainBreakpoint.ts`、`src/services/realSkillExecutor.ts`、`src/stores/project.ts`。
- `rg` 确认 V3 中 `src/components/pipeline/StyleProfileCard.vue` 已漂移，当前路径为 `src/components/common/StyleProfileCard.vue`。
- `rg` 确认 13 个 `scripts/verify-*-electron.mjs` 仍读取 `pipeline?.generationProgress`。
- `git diff --check`：exit 0，无 whitespace error；仅有 LF/CRLF 提示。
- `git diff --stat`：2 个文档文件，117 行新增，2 行修改。

## 诚实边界

- 本轮没有修改生产代码，未运行 type-check、服务测试、Electron 或 live 验证；这些属于批准后的 Phase 0-J 范围。
- 性能预算 250ms/500ms/200ms/100ms/2s 仍是工程假设，未采样。
- 用户已于 2026-10-22 批准第 12.8 节全部 4 个决策点；方案进入可执行状态，下一动作是 Phase 0。
- 执行器/工具层当前仍是“半成熟”。第 12.9 节把它推进为“待实现的可验收交付清单”，不是把结论改写为成熟；Phase 0-A 完成并通过红绿测试前，不得声明该层成熟。

## 2026-10-22 追加：20 轮深度推进与 V3.2

- 用户质疑执行器/工具层推进是否吸取经验教训与开发日志，并要求进行 20 轮深度推进后升级方案供审核。
- 修改：方案追加第 13 节，登记 20 轮推演表、对第 12.9 节成熟化包的 7 条强化、D5-D7 三个新增审核决策点；台账追加第 10 节；本 DEV_LOG 追加本节；总索引登记 V3.2 状态。
- 推演覆盖：全局生成锁、字符串状态机、隐式 abort、trace auto-abandon、current fallback、双回落、断点 owner、章节共享槽、无 owner 回落、配置 RMW、项目整块替换、进度无 runId、canceled 吞终态、取消归属、UI 全局锁、目标锁安全语义、验证器旧断言、provider 调度、单 run 假并行验证、registry 单源。
- 验证：`Get-Content`/`rg` 完成四份审计文件与源码锚点复读；`git status --short` 确认本轮改动仅限审计文档；`git diff --check` 通过。
- 诚实边界：本轮无生产代码改动；执行器/工具层仍为“半成熟”；D5-D7 待用户审核；Phase 0-J 未启动。

## 2026-10-22 追加：链路支持性补充审计

- 用户追问：供应商支持并发时，应用链路与工具层是否支持。
- 结论：API 请求与链式执行器的函数形态具备重入潜力，但全局运行状态、trace 当前槽、断点共享 key 不支持安全并行；新增发现 `aiService.ts:2278/2459-2465` 的单例 `activeToolRunBudget` 在并发下会串账。
- 修改：方案追加第 13.6 节；台账追加第 11 节；Phase A 增加预算 per-run 化要求，Phase 0-A 增加并发预算红测试。
- 诚实边界：仍无生产代码改动；provider scheduler 未落地前不得声明并行验收通过。

## 2026-10-22 追加：方案重整与补充并入正文

- 用户要求重新更新方案文件，诚实保证不偏移主需求，补充和追加全部完善不遗漏。
- 修改：链路支持性结论并入第 0/1/2/7/8/12.9/13.3 节；新增 12.9.8 Provider 调度与预算隔离；新增第 13.7 节补充审计并入正文对账清单；修正 `StyleProfileCard.vue` 路径与 `PipelinePanel.vue` 精确锚点；台账追加第 12 节。
- 防偏移规则：所有 Phase、验收门、成熟度结论必须回指第 0.2 节 6 条契约；“函数可重入”不构成并行能力证明。
- 诚实边界：无生产代码改动；D5-D7 待审核；Phase 0-J 未启动。

## 2026-10-22 追加：V3.2 门禁逐条对账审计

- 用户要求根据经验文件教训逐条对账 V3.2，诊断是否存在“问题只停留在表面”和“门禁对不上”。
- 结论：V3.2 主方向是机制层根修，不是表面修补；但按 v9 逐条映射后发现 8 个半接入缺口，当前不能判为成熟。
- P0 缺口：G1.17 四格再入矩阵未进入第 8 节验收门；G2.11 `quota_exhausted` 软错误终态、三种返回形态与“无第二次物理请求”断言缺失；G2.8 写队列“临界区内读最新 state 后修改落盘”语义缺失。
- P1 缺口：G1.8 trace `schemaVersion`/导出通道/旧数据兼容未同批规划；G1.20 预算未从同一真实执行计划派生且未禁双实例；G2.9 断点清理与 attempt 产物生命周期未落验收；G1.17 保存失败副作用断言面未定义。
- P2 缺口：G1.12/G1.13 发布级封装与真实 UI 核验未写入 Phase I/J。
- 登记：台账追加第 13 节；本轮仅审计文档更新，方案正文与生产代码未改动，等待用户裁决是否升级 V3.3。

## 2026-10-22 追加：V3.3 门禁缺口并入

- 用户批示“确认并入”后，8 个门禁缺口一次性并入方案正文，标题升级为 V3.3，待审核 D5-D7。
- 修改：Phase 0/B/C/E/I/J、8.1/8.3/8.4/8.5、12.9.4/12.9.5/12.9.8、13.3、13.5.1、13.5.2、13.7 同批补齐；台账追加第 14 节。
- 核心落点：四格再入矩阵、`quota_exhausted` 三形态软错误、写队列临界区读新值、trace schema 同步、预算执行计划派生、断点/attempt 生命周期、副作用断言面、发布级封装核验。
- 诚实边界：无生产代码改动；执行器/工具层仍为“半成熟”；D5-D7 待审核；Phase 0-J 未启动。

## 2026-10-22 追加：V3.3 批准与方案升级

- 用户批示：审核决策点全部采纳“是”，并升级方案。
- 批准结果：D5 run 级取消按钮、D6 显式 run 状态枚举、D7 目标级锁定安全语义全部批准；方案状态升级为“V3.3，已批准待实施”。
- 唯一执行版本：按 G0.10，V3.3 为唯一执行版本；V3.1/V3.2 仅作历史复审记录，不双轨执行。
- 下一动作：Phase 0 红测试与单 run 只读性能基线；仍未修改生产代码。

## 2026-10-22 追加：V3.3 Phase 0 执行

- 用户批示：“以经验文件总结为底，诚实的按照方案每一步执行，现在确认批准 V3.3，开始执行”。本轮执行 Phase 0：红测试 + 单 run 只读性能基线，不改生产代码。
- 台账：[_audit/TASK_LEDGERS/2026-10-22_pipeline-parallelism-phase0.md](_audit/TASK_LEDGERS/2026-10-22_pipeline-parallelism-phase0.md)；测试文件：[pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:1)。
- 红测试结果：`14 tests: 7 failed / 7 passed`。7 个红灯钉住现状缺陷：第二次启动隐式中止第一个 run、全局进度覆盖、`canceled` 吞终态、runTrace 自动放弃 active run、agent bridge current fallback 串线、并发 step config RMW 丢写、run 级再入生命周期缺失。
- 绿灯与作者反证：保存队列“旧快照覆盖”原拟红灯未复现，按 G1.17 登记为意外绿灯/守护，不伪造成红灯；`quota_exhausted/auth/402` 软错误实测只发起 1 次物理请求，run 级 trace 归属仍留 Phase G。
- 单 run 只读基线：run-1792564350585-1743，`durationMs=1,793,484`，`outputSumMs=1,751,306`，`localOverheadSumMs=189`，`apiCalls=4`，`physicalCalls=4`，`retryPhysicalCallCount=0`。结论是该 run 的耗时主体是模型流式输出，不是应用本地等待；按 G1.19，不支持先做本地性能优化。
- 分步耗时：S1 `173,443ms`、S2 `1,202,932ms`、S3 `246,876ms`、S4 `168,963ms`；S2 占 67.1% 但 usage 未记录，Phase B 必须补齐 usage 归因。
- 全量回归：补齐后复跑 `npx vitest run`，`189 files: 1 failed / 188 passed`，`2142 tests: 7 failed / 2135 passed`，duration `46.26s`；唯一失败文件即 Phase 0 红测试文件，既有测试无新增回归。
- 诚实边界：Electron UI 性能未采样；并行 3 run 压力测试未执行；S2 usage 观测缺口未修；保存队列只守护已试交错形态；7 个红灯未实现为绿灯，Phase A-J 全部未开工。下一阶段为 Phase A（RunContext/RunRegistry、run 级预算、显式 run 状态枚举），需按用户阶段间确认节奏推进。

## 2026-10-22 追加：V3.3 Phase A-D 执行

- Phase A：新增 [runRegistry.ts](/d:/codex/novel-workshop-vue3/src/services/runRegistry.ts:1) 与 [runRegistry.spec.ts](/d:/codex/novel-workshop-vue3/src/services/runRegistry.spec.ts:1)，建立 run 级生命周期、状态、`rejectedEvents`、per-run controller 与工具预算持有；Phase 0 的 run 生命周期红灯转绿。
- Phase B：删除非 chat 场景 auto-abandon；[agentTraceBridge.ts](/d:/codex/novel-workshop-vue3/src/services/agentTraceBridge.ts:1) 仅接受显式 `runId`，移除 current fallback 抢账路径；runTrace 自动放弃串线红灯转绿。
- Phase C：新增 [pipelineConfigMigration.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineConfigMigration.spec.ts:1) 与 [pipelineConfigTransaction.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineConfigTransaction.spec.ts:1)；`PipelinePanel.vue` 四处 `pipeline_step_config` 直写改走 `pipelineStore.writeStepConfig`，四个 `startGeneration` 显式传 `configSnapshot`，正文断点 owner key 升级为 `pipeline:{projectId}:step-4:chapter-{chapterId}`。执行中曾发现 settings/volumes/chapters 三个启动点参数错位，已按函数上下文修正并用测试复核。
- Phase D：新增 [runProgressChannel.ts](/d:/codex/novel-workshop-vue3/src/services/runProgressChannel.ts:1)、[runProgressChannel.spec.ts](/d:/codex/novel-workshop-vue3/src/services/runProgressChannel.spec.ts:1)、[pipelineProgressReaders.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineProgressReaders.spec.ts:1)；四个生成器显式 `runId` 线程化，四个进度条改读 `activeSettingsRun/activeVolumesRun/activeChaptersRun/activeBodyRun`，13 个 Electron 验证脚本迁移到 per-layer 读数。共享链式进度裁定为按 `currentStep` 层兜底，不采用全局最新 run 兜底。生产 UI 模板对 `generationProgress` 读取为 0。
- Phase D 验证：定向 5 文件 33 测试全绿；`npx vue-tsc --noEmit` exit 0（曾报 `settingsRunId` 作用域错误，修正为 `chaptersRunId` 后复跑通过）；全量 `npx vitest run` 为 `194 files / 2162 tests` 全绿，Phase 0 目标红灯全部转绿且无新增回归；`npm run build:vue` 两个构建均成功。
- 诚实边界：13 个 Electron 脚本未做真实窗口 live 复跑，属 Phase J；`generationProgress` 与 `generationStatus` 仍在 store 内兜底，最终收口属 Phase F/I；`isGenerating` 串行守卫仍在，Phase F 移除前不能宣称四层真正并行开放。

## 2026-10-22 追加：V3.3 Phase E-F 执行

- Phase E：项目保存队列改为 request-sequence + drain loop，物理写挂起期间的新修改会追加第二次读最新 state 的落盘；失败即停且队列保持可用。章节批次提交改为按章节 ID 合并，保留并行 run 在同卷写入的新章节。红测试 `runs another save after an in-flight save finishes` 已从 `expected 1 >= 2` 转绿；`chapterArtifactCommit.spec.ts` 2 用例、`project.spec.ts` 13 用例全绿；`vue-tsc` exit 0。
- Phase F：新增同层同目标目标锁：不同层可并行，同层同目标新 run 入队并记录 `queuedReason`；前置 run finish/fail/cancel 后激活或取消队列。`isGenerating` 改为存在 active run 的派生语义；PipelinePanel 四个生成按钮改目标锁，顶部提供逐 run 取消与取消全部。新增红灯 `target locks permit cross-layer runs and queue same-target runs` 已从 `expected 'queued'` 转绿。
- 验证：`pipelineParallelismPhase0.spec.ts + runRegistry.spec.ts` 2 files / 21 tests 全绿；全量 `npx vitest run` 195 files / 2167 tests 全绿；`npx vue-tsc --noEmit` exit 0。
- 诚实边界：注册表级排队不等于完整队列调度器；Electron 真实窗口四层同时运行未验证，属 Phase J；同层部分编辑控件仍读派生 `isGenerating`，残留全局语义归 Phase I。

## 2026-10-22 追加：V3.3 Phase G 执行

- Phase G：新增 [providerScheduler.ts](/d:/codex/novel-workshop-vue3/src/services/providerScheduler.ts:1) 与 [providerScheduler.spec.ts](/d:/codex/novel-workshop-vue3/src/services/providerScheduler.spec.ts:1)，按供应商槽位排队，排队中取消不发起物理请求；`_rawCall` 在发起前获取 provider 槽位并在成功/失败统一释放。软错误统一归一为 `quota_exhausted/auth/402/softError=true`，作为终态禁止物理重试；`runTrace.spec.ts` 新增同源并发 run 隔离测试，失败 run 的 trace 归属正确，另一 run 保持 running。
- 排队观测接线覆盖三个入口：主页对话、大纲工作台、生成流水线均写 `provider-queue` trace；主调用、重试、续写、folder 调用、风格分析、Agent/终稿链路均透传 `onProviderQueue`。复查发现并补齐四个漏挂点：主页直出重试、大纲风格分析、流水线 folder 调用，以及接线过程中暴露的遗漏，均在完成声明前修复并复跑类型检查。
- 实错登记：`aiService.spec.ts` 曾误用 `Promise.withResolvers` 形态后又改为假 resolve，已修复为标准 executor deferred 并删除 `resolve(undefined)`；新增软错误断言曾误把错误文案写入 `responseText`，已改为 `error` 字段。两项均未进入完成声明，登记于台账第 12.2 节。
- 验证：`npx vue-tsc --noEmit` exit 0；定向 `aiService.spec.ts + providerScheduler.spec.ts + finalDraftRunner.spec.ts` 3 files / 202 tests 全绿；`runTrace.spec.ts + pipelineParallelismPhase0.spec.ts` 2 files / 114 tests 全绿；全量 `npx vitest run` 196 files / 2175 tests 全绿，duration 60.91s。
- 诚实边界：Provider 调度按供应商 ID 全局槽位，未做“供应商 × 层级”差异化限额；`provider-queue` 只写 trace，不写运行中心 `queuedReason`；真实 Electron 并行压测与 live 供应商观测属 Phase H/J，本节不宣称性能达标。

## 2026-10-22 追加：V3.3 Phase H-I 执行

- Phase H：新增 [performanceMonitor.ts](/d:/codex/novel-workshop-vue3/src/services/performanceMonitor.ts:1)，接入 long task 计数、2s freeze watchdog、100ms 点击反馈预算；[App.vue](/d:/codex/novel-workshop-vue3/src/App.vue:246) 启动/卸载接线。持久化恢复遇到非终态 run 时不再静默跳过，而是转为 `interrupted` 并写 `run-startup-interrupted` 事件；`RunTraceStatus` 与展示文案同步扩展。3 run × 300 高频事件合成压测证明进度合并写入每 run 最多 2 次且互不串线。
- Phase I：删除 `generationProgress` 与 `generationAbortController` 两个旧全局状态；abort 语义由 per-run controller 单源提供，生产代码零引用，仅保留防回归测试字符串断言。
- 验证：`npx vue-tsc --noEmit` exit 0；Phase H 定向 3 files / 109 tests 全绿；Phase I 定向 4 files / 111 tests 全绿。
- 诚实边界：真实 Electron long task/freeze/点击反馈数字、13 个 live 验证脚本、版本升级与封装核验仍未执行，属 Phase I 收尾与 Phase J，不得宣称性能达标或发布完成。

## 2026-10-23 追加：V3.3 Phase J 启动与 run 无关语义修复

- 章节批 live 证据归档：`verify-chapter-batch-contract-electron.mjs` 实机运行 `run-1792692922313-1`，结果 `success`；12 章/3 批（5+5+2）全部 `complete`，12 次 API 全成功且 `toolCallCount=0`，payload 原件归档于 [_audit/verification-chapter-batch-contract-live/live-export/payloads](_audit/verification-chapter-batch-contract-live/live-export/payloads)，索引见 [README.md](_audit/verification-chapter-batch-contract-live/live-export/README.md)。脚本退出日志中的 `[ELECTRON CLOSE] code=1` 来自脚本内 `taskkill` 收尾，不作为失败证据。
- 执行层 run 无关语义红灯：新增源码负向门禁，禁止 `PipelinePanel.vue` 执行路径出现 `pipelineStore.isGenerationCanceled()` / `getGenerationSignal()` 无 runId 调用与 `if (pipelineStore.isGenerating) return` 全局入口锁。红灯确认 4 个入口锁残留：删卷、删章卡、打开章详情、保存章详情。
- 根修：按 V3.3 §0.2“只锁定被目标锁覆盖的数据”，删卷在卷纲/章节/正文任一活动 run 时禁用；删章卡与保存章详情在章节/正文活动 run 时禁用；打开章详情恢复为可读操作，不再被生成状态全局封死。`genBodyForSelected` 同步修正 computed 取值错误（`selectedBodyTarget.value`）。
- 中断半成品闭环：`skillRouter.ts` 补齐 `userPromptSuffix` 声明与透传，终步重试协议不再在路由层丢失；`skillRouter.spec.ts` 增加透传断言。该缺口由 `vue-tsc` 抓出，属中断前未收口改动，不是本轮新设计。
- 验证：`npx vitest run src/services/pipelineParallelismPhase0.spec.ts` 红灯 16 passed/1 failed，修复后 17/17 绿；`npx vue-tsc --noEmit` exit 0；`npx vitest run src/services/skillRouter.spec.ts src/services/realSkillExecutor.spec.ts` 55/55 绿；全量 `npx vitest run` 197 files / 2185 tests 全绿。
- 诚实边界：本轮只完成 Phase J 前置缺陷修复与章节批 live 证据登记；四层真实并行、逐 run 取消互不污染、性能预算实测、四格再入矩阵仍属 Phase J，未完成。

## 2026-10-23 追加：V3.3 Phase J 真实 Electron 并行验收通过

- 验证：`scripts/verify-pipeline-parallelism-electron.mjs` 真实可见窗口 + mock provider 全流程 PASS，报告 [_audit/verification-pipeline-parallelism-live/report.json](_audit/verification-pipeline-parallelism-live/report.json)。
- 并行结果：卷纲/章节/正文三 run 同时 running；章节取消 121ms 达终态且不影响其他层；provider `maxConcurrency=2` 且 volumes/body 重叠；性能 `freezeCount=0`、`slowClickFeedbackCount=0`。
- 成功终态再入：`pipeline-run-1792708176779-3` → `pipeline-run-1792708187331-4`，正文 hash `3a6a...` → `9903...`，body 物理请求 1→2，新产物带 `parallelism-3` 轮次标记，证明旧稿未冒充新产物。
- 脚本缺陷定案：22ms 假成功源于 trace runId 与 pipeline runId 跨 ID 域混用；8 分钟伪卡死源于 `layerSnapshot` 用 `find` 观测最早 body run。均只修验证脚本，不动生产代码；`reentry-body-artifact-diagnostics.json` 改为无条件写入以便失败自诊断。
- 经验回写：v9 G1.5 新增跨 ID 域契约；G1.17 新增观测对象盲区（多 run 场景 `find`/`findLast` 必须与被测语义对齐）。
- 收尾：三份 trace 原件迁入 `_audit/verification-pipeline-parallelism-live/exports/`，`_data` 临时导出与 profile 目录清零。
- 诚实边界：断点恢复、失败终态后再入未在真实 Electron 触发；13 个历史 Electron 脚本未全部复跑；版本升级与封装核验未执行，等待用户确认。
