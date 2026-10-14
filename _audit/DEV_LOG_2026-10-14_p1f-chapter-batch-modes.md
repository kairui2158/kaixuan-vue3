# 2026-10-14 P1-F 章节分批生成模式收口

## 目标

章节层从“一口气生成到底”升级为三个明确入口：`生成本批章节`、`全量生成章节`、`续生成`。三者共用 `genChapters(mode)` 单一引擎；本批与续生成按 `#pl-chapter-batch-size` 生成到批次边界后以成功态暂停，全量生成完成或批次补齐最终章后清除断点。

## 交付内容

- [src/services/chapterBatchPlanning.ts](../src/services/chapterBatchPlanning.ts)：新增模式规划器。`batch`/`continue` 按批次大小截断目标端点，`auto` 规划剩余全量；统一输出 `start`、`targetEnd`、`requestedCount`、`reachesTotal`、`stopReason`、`requiresFullLedger`。
- [src/services/chapterGenerationContract.ts](../src/services/chapterGenerationContract.ts)：批次台账支持 `requiredEnd` 部分账本校验。批次边界只要求连续覆盖到本次目标端点，仍拒绝 gap、overlap 与未达边界；全量语义保持原目标章数校验。
- [src/components/pipeline/PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue)：新增每次生成数量输入；按钮改为 `生成本批章节` / `全量生成章节` / `续生成`，分别绑定 `genChapters('batch')` / `genChapters('auto')` / `genChapters('continue')`；`canContinueChapters` 在生成中、未锁定卷或已全部生成时禁用续生成。
- 分批停止走成功态：进度停在 `本批生成完成`，断点保存为 `paused`，trace 记录 `chapter-batch-complete` 与 `chapters_batch_complete`；只有最终章补齐才输出 `chapters_generation_complete` 并清空断点。
- 旧文案「AI生成章节」「自动生成章节」在源码与验证脚本中清零；四个旧验证器入口统一切到 `#btn-pl-autogen-chapters`，避免旧按钮入口继续指向全量路径。
- 新增 [scripts/verify-chapter-batch-modes-electron.mjs](../scripts/verify-chapter-batch-modes-electron.mjs)：可见 Electron + 真实点击 + 独立 profile + `SHENYI_DATA_DIR` 隔离，覆盖两批续生成、最终批清断点与取消不入库。

## 关键修复过程

- 第一版 Electron 验证把 run trace 当成追加队列，用 `.at(-1)` 取“最新 run”。实际 runTrace 用 `unshift` 插入，最旧 run 在数组尾部，导致后续轮次一直取到第一轮旧 run，出现“新 run 不存在 / reason 不匹配”的假失败。已改为 `.at(0)`，并加 `assert.notEqual(run.id, previousRunId)` 防止未来再次取旧 run。应用三轮实际都正确收尾。
- 取消用例从“第一批 0 章时取消”改为“4/6 未完成时取消”：先让 provider 挂起请求，点击续生成后取消，再释放请求。这样能证明已入库的 4 章不被半批污染、取消 run 不得伪装成 `paused` 成功边界，同时保留恢复断点。
- 分批边界必须验账：`validateChapters` 与 `validateChapterGenerationLedger` 都按 `requiresFullLedger` 切换全量/本次目标端点，不允许暂停把缺章藏到最后一轮。

## 验证

- 专项：`npm run test:services -- chapterBatchPlanning chapterBatchModesWiring chapterGenerationContract` → 3 files / 28 tests passed。
- 全量：`npm run test:services` → 161 files / 1897 tests all passed。
- `npm run type-check` → exit 0。
- `npm run build` → exit 0。
- Electron 真实 UI：`node scripts/verify-chapter-batch-modes-electron.mjs` → `===== CHAPTER BATCH MODES ELECTRON PASSED =====`。
  - 第 1 批：`#btn-pl-gen-chapters`，2 章，`success / chapters_batch_complete`，断点 `paused`。
  - 第 2 批：`#btn-pl-continue-chapters`，4 章，`success / chapters_batch_complete`，断点 `paused`。
  - 第 3 批：`#btn-pl-continue-chapters`，6 章，`success / chapters_generation_complete`，断点清空，续生成按钮禁用。
  - 取消：请求挂起后取消，章数保持 4，run `canceled`，断点保留恢复语义且不伪装成功暂停。
  - 证据：[_audit/verification-chapter-batch-modes-electron/report.json](_audit/verification-chapter-batch-modes-electron/report.json)。
- 3.87.0 打包核验：`node scripts/verify-packaging-3-87-0.mjs` → `verdict: pass`；asar version `3.87.0`、renderer 74 files、`electronAPI` 77 methods、真实启动渲染通过；SHA256 `b0540ee8e6e3df1372440fd13a6a76f1625152f06de2c83ed27818a9df67d503`。证据：[_audit/verification-packaging-3-87-0/packaging-evidence.json](_audit/verification-packaging-3-87-0/packaging-evidence.json)。

## 诚实边界

- 本轮 Electron 使用本地 OpenAI-compatible provider，不是外部 live 供应商；供应商差异未纳入本证据面。
- `continue` 与 `batch` 当前都是“从当前进度按设定数量继续”；差异主要是语义入口与用户意图，不引入第二套恢复逻辑。
- 分批解决的是长章节卷的可操作性与中断恢复，不等同于生成耗时优化；本轮不做性能声明。
- `_data` 历史 profile / 凭据 / run-trace 目录分属多个已收口任务，本任务仅清理自己的 `chapter-batch-modes-profile`，其余列为独立清理专项，避免误删其他证据。

## 清理

- 已删除 `_data/chapter-batch-modes-profile` 一次性 Electron profile。
- 已删除 `dist/神意助手-Setup-3.86.0.exe` 与 blockmap，只保留 3.87.0 当前产物。
- 验证脚本、专项测试与证据目录保留，供复跑和审计。

## 台账

- 七节台账：[_audit/TASK_LEDGERS/2026-10-14_p1f-chapter-batch-modes.md](_audit/TASK_LEDGERS/2026-10-14_p1f-chapter-batch-modes.md)

## 封装

- 版本：3.87.0；`package.json:3`、`package-lock.json:3`、`package-lock.json:9` 均为 3.87.0。
- 全量服务测试 161 files / 1897 tests、type-check、完整 NSIS build、打包验证器、真实启动核验全部通过。
- 安装包：`dist/神意助手-Setup-3.87.0.exe`，231,528,921 bytes，SHA256 `b0540ee8e6e3df1372440fd13a6a76f1625152f06de2c83ed27818a9df67d503`。
