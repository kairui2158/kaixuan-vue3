# 2026-10-28 流水线流式归属与运行中反馈关闭修复

## 1. 问题与目标

用户核心诉求：进度条必须恢复供应商实时流式滚动信息，且多任务并行时每层的进度、取消、关闭和流式输出必须归属各自的 pipeline run，不能互相串层或把执行中的反馈整条隐藏。

## 2. 根因

### 产品缺陷

`closePerRunFeedback` 原来无条件执行 `resetPerRunUi` 与 `resetPipelineStepWarningCountsForRun`。运行中的 run 被关闭后，store 中的执行契约继续存在，但 `perRunGenerationUi`、日志和流式状态被清空，四层进度条也因 `displayRunForLayer` 只查 active run 而消失，形成“后台仍在执行、UI 无入口可取消”的假卡死。

同时，流式 UI 归属和 trace 归属混用同一个 runId：pipeline runId 与 trace runId 是两个域，直接以 trace runId 作为 UI stream state key 会让多任务并行的流式输出挂错层或不可见。

### 验证器缺陷

1. 假设流水线面板天然打开；正文成功后应用会自动打开编辑器并关闭流水线面板。
2. 用 `#pl-volume-api-log` 等仅在展开时存在的容器作为终态断言 selector。
3. 假设终态 run 必然渲染流式展开按钮；无流式日志时按钮不存在是正常行为。
4. 面板已打开时仍无条件点击 `#btn-pipeline`，被全屏面板遮挡。
5. 失败诊断不足，多轮红转绿过程中无法区分产品缺陷与脚本口径错误。

## 3. 修复

- `src/components/pipeline/PipelinePanel.vue`
  - `isPerRunFeedbackHidden` 仅在 `isPipelineRunTerminal(runId)` 为真时允许隐藏。
  - `closePerRunFeedback`：运行中 run 只置 `feedbackHidden = true`，保留执行契约、trace、日志和流式账本；终态 run 才做 UI 状态清理。
  - `displayRunForLayer` 在无 active run 时回看未隐藏的最近终态 run，让关闭按钮有真实终点。
  - 流式状态 key 使用 pipeline runId，`traceRunId` 与 `callId` 单独保存；`appendPipelineDelta`、`resetPipelineStreamState`、`flushPipelineStreamState` 全部显式区分两个 run 域。
  - `real-skill:stream` 事件携带 trace run/call 归属，正文 bypass 路径补供应商排队事件上报。
- `src/stores/pipeline.ts`
  - 新增 `getRunHistoryForLayer(layer)`，返回同层 run 历史 plain snapshot，供 UI 只读回看，不绕过 run registry。
- `src/services/realSkillExecutor.ts`
  - `onChunk` 同步派发 `real-skill:stream`，带上 `traceRunId`、`traceCallId` 和增量文本。
- `scripts/verify-pipeline-parallelism-electron.mjs`
  - 新增 `ensurePipelinePanelOpen`、稳定面板级 selector、可选展开按钮分支、失败诊断落盘、运行中关闭与终态关闭双侧断言。
- `src/services/pipelineProgressReaders.spec.ts`
  - 固化 stream delta/reset/flush 的双 run 域调用形态、四层 `isPerRunFeedbackHidden` 绑定、运行中关闭不得重置、正文 bypass 队列事件归属。

## 4. 验证

- 真实 Electron 并行验证：`node scripts/verify-pipeline-parallelism-electron.mjs`
  - `result: PASS`
  - 章节取消耗时 `124ms`
  - 卷纲 `succeeded`、章节 `canceled`、正文首任务 `canceled`、正文排队任务 `succeeded`
  - 卷纲流式 `252` chars；正文流式 `4777` chars
  - 运行中关闭只隐藏反馈，store 与 trace 保留执行账本；终态关闭只隐藏反馈
  - provider 总请求 `7`，最大并发 `2`
  - fresh start、成功终态再入、取消隔离、同层排队、断点再入、失败终态再入全部通过
  - 最终 9 个 pipeline run 达到预期终态；`bodyArtifactType: string`，`bodyArtifactChars: 4665`，`volumeCount: 2`，`chapterCount: 2`
- 全量回归：`npm run test:services` → `221 files / 2387 tests` 全部通过。
- 类型检查：`npm run type-check` → exit 0。
- 构建：`npm run build` → exit 0，产出 `dist/神意助手-Setup-3.110.6.exe`，231,644,128 bytes；`latest.yml` 为 3.110.6。

## 5. 版本与清理

- `package.json` / `package-lock.json` 由 `3.110.5` 升级为 `3.110.6`。
- 已删除旧 `3.110.5` 安装包与 blockmap；`dist` 仅保留 `3.110.6` 一套产物。
- 已删除验证失败整包导出 `_audit/verification-pipeline-parallelism-live/failed-exports/`（81 个目录，约 10.98 MB）与 5 个临时诊断文件；最终 PASS 的 `report.json`、provider 请求、heartbeat、诊断文件保留作为本轮证据。其中 3 个 2026-10-24 目录此前已被 Git 跟踪，历史版本仍可通过 Git 恢复。
- `_data/pipeline-parallelism-profile` 与 `_data/pipeline-parallelism-exports` 在本轮启动前已不存在，无需清理。

## 6. 诚实边界

- 本轮真实 Electron 验证使用 mock provider，符合已批准的并行验证口径；未新增 live 供应商请求。
- 成功正文自动插入编辑器并关闭流水线面板、无日志时不显示流式展开按钮，均为产品正常行为，不是缺陷。
- 本轮 `dist/神意助手-Setup-3.110.6.exe` 被 Windows 拒绝读取哈希与复制（`ERROR_ACCESS_DENIED`），`latest.yml` 的 SHA512 与安装包尺寸已核验；安装包本体哈希留待文件锁释放后补充，不冒充已验证。
- 修复过程中的多轮失败最终定案为验证器口径缺陷；产品侧真缺陷为“运行中反馈可被隐藏导致取消入口与流式归属消失”。
- 经验文件升级 `v9.6.8`，新增运行中反馈不可隐藏、验证器面板/selector/终态控件假设必须核对的门禁。
