# 2026-10-28 流水线流式归属修复任务台账

## 1. 目标

恢复进度条中的供应商实时流式滚动信息，并保证并行多任务下流式文本、进度、取消、关闭动作都归属各自的 pipeline run；运行中反馈不得被隐藏成后台孤儿任务。

## 2. 根因

1. 产品根因：`closePerRunFeedback` 把“关闭反馈”实现成“删除运行状态”。运行中关闭会清空 per-run UI、日志和流式状态，而 store 合同继续执行，导致进度条、取消按钮和流式输出全部消失。
2. 归属根因：UI 流式 state key 与 trace runId 混用。pipeline runId 与 trace runId 属于不同域，直接共用导致并行 run 的流式输出挂错或不可见。
3. 验证器根因：面板打开状态、终态 selector、可选展开按钮、被遮挡按钮四个假设均未按真实 DOM 行为编写，导致多轮假失败并掩盖产品根因。

## 3. 修复点

- `PipelinePanel.vue`
  - `isPerRunFeedbackHidden` 只允许终态 run 隐藏。
  - `closePerRunFeedback` 运行中只标记 `feedbackHidden`，终态才清理。
  - `displayRunForLayer` 可回看未隐藏的最近终态 run。
  - stream state 以 pipeline runId 为 key，`traceRunId/callId` 独立保存。
  - 四层进度条全部绑定 `isPerRunFeedbackHidden`。
- `pipeline.ts`：新增 `getRunHistoryForLayer`。
- `realSkillExecutor.ts`：流式 chunk 派发 `real-skill:stream`，携带 trace 归属。
- `verify-pipeline-parallelism-electron.mjs`：面板显式打开、稳定 selector、可选控件分支、诊断落盘、运行中/终态关闭双侧断言。
- `pipelineProgressReaders.spec.ts`：固化双 run 域调用形态与四层反馈绑定。

## 4. 验证

- 真实 Electron：`node scripts/verify-pipeline-parallelism-electron.mjs` → `result: PASS`。
  - 章节取消 `124ms`；卷纲流式 `252` chars；正文流式 `4777` chars。
  - 并发终态：卷纲 succeeded、章节 canceled、正文首任务 canceled、正文排队任务 succeeded。
  - provider `requestCount: 7`，`maxConcurrency: 2`。
  - 运行中关闭不改变 run 状态，不删 trace/API 账本；终态关闭只隐藏反馈。
  - 四格再入全部通过；最终 9 run 终态符合预期，正文产物 `4665` chars。
- 回归：`npm run test:services` → `221 files / 2387 tests` 全过。
- 类型：`npm run type-check` → exit 0。
- 构建：`npm run build` → exit 0。

## 5. 遗留边界

- 本轮为 mock provider 真实 Electron 验证；live 并行请求沿用既有验证，不冒充本轮证据。
- 正文成功自动打开编辑器并关闭流水线面板、无日志时无展开按钮，是产品正常行为。
- `failed-exports` 中 81 个失败整包现场为临时运行产物，已删除；最终 PASS 的 `report.json` 与主诊断文件保留。
- 安装包 `3.110.6` 本体被 Windows 文件 ACL 拒绝读取哈希；本轮以 `latest.yml` 的 SHA512 和文件尺寸作为构建核验证据，并如实登记该边界。
- 未发现新的流式串层、隐藏运行中反馈或取消失效路径。
