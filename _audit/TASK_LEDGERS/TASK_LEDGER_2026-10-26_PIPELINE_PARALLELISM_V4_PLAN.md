# TASK LEDGER: 2026-10-26 流水线并行 V4 执行收口

## 1. 目标与原话

- 用户原话链：实测发现“进行中的UI显示错误，进度条取消生成失效，并且同时API似乎无法支持同时多卷纲，章节，或者正文生成”，要求逐条对账诊断并“按照可交付客户的方案来执行”。
- 最终可感知行为：三层可同时生成；同层新任务真排队且不发物理请求；每个 run 有独立进度、日志、取消与 trace 归属；取消只影响目标 run；四格再入不把旧产物冒充新输出；应用不因并行而冻结。
- 交付物：V4 生产修复、测试与 Electron 验证器硬化、PASS 证据、DEV_LOG、经验文件 v9.6.0、仓库提交。

## 2. 门禁读证

- G0.3（诚实闭环）：mock-provider 只声明 mock 范围，live 写 `untested`。
- G0.4（门禁复读）：本轮已复读 v9.5.0 经验文件与 V4 方案、V3.3 DEV_LOG。
- G0.5（回头看）：收尾逐行 diff、对账证据、复查旧状态清零与工作区。
- G0.8（任务收尾清理）：删除 10-26 未跟踪 failed-exports 临时现场，保留 10-24 已跟踪证据与当前 PASS 证据。
- G0.10（新旧并存清零）：删除 `activePipelineRunIds` 等旧单槽状态，并反查生产引用为 0。
- G0.12（台账七节）：本台账即执行凭证。
- G1.5（验证器自身质量）：验证器目标绑定、证据写入失败掩盖主结果两类缺口已修复并复跑。
- G1.17（执行者自盲区）：增加同层双 run、真排队、四格再入、取消隔离等证伪路径，不再只用每层单 run 的绿灯冒充用户契约。

## 3. 路由判定

- 加入：G0.3、G0.4、G0.5、G0.8、G0.10、G0.12、G1.5、G1.17。
- 排除：G2.13 SKILL 执行中立，本轮不改 SKILL 内容，仅传递归属 ID，不改变 SKILL 职责。
- 排除：G1.12 发布封装，本轮沿用已存在的 3.108.1 安装包，未做新打包，故不执行打包核验门。

## 4. 影响圈与作者反证

- 打算改的：`runRegistry.ts`、`pipeline.ts`、`PipelinePanel.vue`、`realSkillExecutor.ts`、`skillOrchestrator.ts`、`pipelineRunOutcome.ts`、并行相关 spec、Electron 验证器。
- 可能碰到的：进度条 UI、取消语义、断点恢复、失败终态再入、trace 归属、provider 排队事件。
- 最可能错的三个假设与证伪：
  1. “run 闭包化后 UI 自然正确” → 用同层双 run 断言进度条、运行中心、取消目标证伪。
  2. “排队只是状态字段” → 用排队 run 物理请求必须为 0、唤醒后必须成功证伪。
  3. “终态后再入会生成新产物” → 用新 runId、新 target、新 hash、请求增量证伪。

## 5. 停止条件

- 全量 vitest、vue-tsc、build:vue 全绿。
- Electron 验证器全场景 PASS，coverage 六项为 true，性能 longTask/freeze/slowClick 为 0。
- 生产源码旧单槽状态 0 引用。
- 审计文档、台账、经验文件、索引、工作区提交全部收口。

## 6. 执行证据

- `runRegistry.ts`：`waitForActivation()` at line 112；`activateQueuedRuns()` at line 158。
- `pipeline.ts`：`waitForActivation` at line 72；完成/失败/取消后激活同层 at lines 134/152/165；trace 所有权表 at lines 216-222。
- `PipelinePanel.vue`：`PipelineRunCenter` 挂载 at line 77；`perRunGenerationUi` at line 1005；`displayedRunForStep()` at line 1067；`cancelDisplayedRun()` at line 1122；四个进度条分别位于 lines 241/376/525/597。
- `pipelineRunOutcome.ts`：owner pipeline run 状态覆盖输入 at line 9 与 line 31。
- `realSkillExecutor.ts` / `skillOrchestrator.ts`：进度事件携带 `traceRunId`。
- 验证报告 [report.json](../verification-pipeline-parallelism-live/report.json)：`result=PASS`、`mode=mock-provider`、coverage 六项 true。
- 关键数字：章节取消 `94ms`；排队 run 物理请求 `0`；provider `requestCount=6`、`maxConcurrency=2`；成功再入请求 `4->7`；断点再入 `2->2`；失败再入 `1->3`；longTask/freeze/slowClick 全 0。

## 7. 缺口清单

- live 供应商并行验证未执行，登记 `untested`；不得宣称外部供应商已闭环。
- provider 并发吞吐、不同供应商组合、真实长文本耗时性能未采样。
- 本轮未重新封装，沿用 3.108.1 安装包；如需发布包含本修复的新包，需另走 G1.12 封装门。
