# 2026-10-26 流水线并行 V4 破坏面对账与修复方案

## 任务目标

- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_PIPELINE_PARALLELISM_V4_PLAN.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_PIPELINE_PARALLELISM_V4_PLAN.md)
- 目标：把 V3.3 并行交付后的 UI 错乱、取消失效、假排队、运行中心缺失、provider 排队错归属整理为 V4 修复方案。
- 边界：本轮不修改生产代码；方案待用户审核。

## 结论

- V3.3 Phase 0-I 的 registry、per-run controller、进度通道、配置事务、provider scheduler 是有效地基，不推翻。
- 破坏集中在 Phase F-J 的半接入：`activePipelineRunIds` 单槽覆盖、假排队、`activeGenerationFeedbackStep` 等 UI 单实例、provider queue 按 latest run 回填；运行中心没有源码实现。
- Phase J mock 只覆盖每层一个 run，因此无法暴露同层双 run 和真排队问题；这不是“用户用错”，是验证矩阵缺口。
- V4 方案把修复分为 P0（run 闭包化 + 真排队门）、P1（per-run UI + 运行中心）、P2（验证硬化），并给出回滚与作者反证。

## 修改内容

- 新增 [_audit/PROPOSAL_2026-10-26_PIPELINE_PARALLELISM_V4.md](_audit/PROPOSAL_2026-10-26_PIPELINE_PARALLELISM_V4.md)
  - 第 0 节：V4 必要性与责任判定。
  - 第 1 节：事故根因矩阵（A-F，含源码锚点）。
  - 第 2 节：验证为什么没抓住。
  - 第 3 节：被破坏面、未实现面、未改造面三分类。
  - 第 4 节：P0-A/P0-B/P1-A/P1-B/P2 执行方案。
  - 第 6 节：作者反证与证伪方式。
  - 第 7 节：回滚策略。
  - 第 8 节：G0.6 四层成熟度结论。
  - 第 9 节：D1-D4 审核决策点。
- 新增本 DEV_LOG 与任务台账。

## 验证

- `rg` 复核方案锚点与源码锚点；`git status --short` 确认本轮只新增审计文档。
- `git diff --check` 通过。
- 未运行生产测试：本轮无生产代码改动；生产验证属于用户批准 V4 后的 Phase P0-P2。

## 诚实边界

- V4 尚未获批准，未写任何生产代码。
- 同层多 run 的真实 UI 验证、live 供应商验证、性能数字都未执行，方案不预支结果。
- provider 2 并发保留为设计值；用户若要放宽，需要另行观测决策。

# 2026-10-26 流水线并行 V4 执行收口

## 用户批准与目标

- 用户批准 V4 方案与 D1-D4 默认决策：同层排队、运行中心置顶展示、层内进度条显示排队 run、provider 2 并发保留。
- 本轮目标：修复 V3.3 半接入破坏面，交付“三层可同时生成、同层真排队、每个 run 有独立 UI/取消/trace 归属、四格再入不串旧产物”的用户可感知行为。

## 修复内容

- P0-A run 归属闭包化：删除 `activePipelineRunIds`、`activePipelineRunIdForStep`、`providerQueueStepByCallId` 单槽状态；所有回调显式闭包 `pipelineRunId`；新增 trace run 到 pipeline run 的所有权表 `rememberTraceRunOwnership` / `getPipelineRunIdForTrace`；SKILL/composite 进度事件携带 `traceRunId`。
- P0-B 真排队：`runRegistry` 新增 `waitForActivation()` 与激活等待队列；`activateQueuedRuns()` 每层只激活一个排队 run；层 busy 时新 run 入队而非假 running；取消排队 run 只影响该 run；取消运行中 run 精准唤醒一个同层兄弟；`cancelAllActiveRuns` 不误取消排队兄弟。
- P1-A per-run UI：新增 `perRunGenerationUi`，日志、SKILL 步骤、契约、验收状态按 run 隔离；四个 `GenerationProgressBar` 移入各自 step 面板，读取 `displayedRunForStep()`；取消按钮调用 `cancelDisplayedRun()`。
- P1-B 运行中心：新增 [PipelineRunCenter.vue](../src/components/pipeline/PipelineRunCenter.vue)，展示各 run 的层、目标、状态、进度与取消入口，挂载在流水线面板。
- P2 验证硬化：`pipelineRunOutcome` 接收 `pipelineRunStatus`，owner run 的 failed/canceled 覆盖 trace 本地 success；新增/迁移并行测试，覆盖 run 归属、排队激活、进度读取、终态判定。

## 验证器自身的两个根因

本轮在验证时先遇到“验证器假失败”，已按 G1.5 定案并修复，不能把产品修复和脚本修复混在一起：

1. 验证器目标绑定错误：`layerSnapshot().body` 未携带 `target`，成功终态再入时把“章节 1 新产物 hash”拿去和“章节 2 旧产物 hash”比较，制造假失败。修复为快照携带 `target`，并从 `allRuns` 识别最新成功 run 的新 runId，再断言新目标产物与新 hash。
2. 证据写失败掩盖主结果：Windows 上 `UNKNOWN` 文件锁错误偶发出现在证据 JSON 写入阶段，导致主 PASS/FAIL 被吞。修复为 `writeJsonEvidence()` 重试 + 时间戳兜底文件；失败路径先立即打印 `[PRIMARY FAIL]`，再写诊断证据。

## 验证结果（本轮真实执行）

- `node --check scripts/verify-pipeline-parallelism-electron.mjs`：exit 0。
- 真实 Electron + mock-provider 全场景 PASS，报告：[report.json](verification-pipeline-parallelism-live/report.json)，时间 `2026-10-26T13:42:30.837Z`：
  - 三层同时 running，runId 互不相同：卷纲 `pipeline-run-1793021902793-1`、章节 `pipeline-run-1793021902985-2`、正文 `pipeline-run-1793021903165-3`。
  - 章节取消点击到 canceled `94ms`，兄弟层产物与 trace 不受影响。
  - 同层排队：排队正文 run 物理请求 `0`；取消展示中的运行 run 后，排队 run 被唤醒并 `succeeded`。
  - provider：6 个请求，max concurrency `2`，存在卷纲/章节、卷纲/正文重叠。
  - 成功终态再入：新 runId、新章节目标、新 hash，正文物理请求 `4 -> 7`。
  - 断点再入：失败 `2` 请求，恢复 `2` 请求，最终正文 4665 字符，事件含 `chain-handoff-resume`。
  - 失败终态再入：`1 -> 3` 请求，最终正文 4665 字符。
  - 性能：longTask `0`、freeze `0`、slowClick `0`，4 次点击反馈最大 `2ms`。
- 定向 V4 spec：4 files / 61 tests 全部通过。
- 全量回归：`npx vitest run`：212 files / 2322 tests 全部通过。
- `npx vue-tsc --noEmit`：exit 0。
- `npm run build:vue`：exit 0，版本 3.108.1。

## 工作区清理登记

- 先用 `git clean -nd -- _audit/verification-pipeline-parallelism-live/failed-exports` 复核删除清单，再执行 `git clean -fd` 删除 2026-10-26 失败导出的 97 个未跟踪临时目录（约 12 MB、约 699 个文件）。
- 保留 2026-10-24 的 3 个已跟踪证据目录共 22 个文件，并保留本轮 PASS 证据（含 `body-queue-progress-missing.json/png`、`report.json`、trace/provider/heartbeat 证据），避免清理动作抹掉可复查事实。

## 诚实边界

- 本轮 Electron 验证为 `mock-provider` 模式，真实外部供应商 live 并行（`SHENY_PARALLELISM_LIVE=1`）本轮未执行，状态为 `untested`，不得宣称 live 已闭环。
- provider 2 并发为设计值，本轮只证明并发上限与排队行为正确，不评估供应商吞吐。
- 版本 3.108.1 已由大纲导出/滚动修复任务封装；本轮没有重新打包，安装包仍是该版本对应产物。
- 本 DEV_LOG 的执行段落在本轮收尾补写，方案阶段与执行阶段分开登记，避免用旧“未批准”状态冒充当前事实。
