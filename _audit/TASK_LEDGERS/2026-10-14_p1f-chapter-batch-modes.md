# 任务台账：P1-F 章节分批生成模式

## 1. 目标与原话

- 用户原话：我确认这个口径，那么 AI 生成章节=按设定数量生成本批，自动生成章节=全量到底，另加续生成按钮；名称也需要变成更改后的名称，不能再沿用之前的了。
- 目标行为：章节层提供三个真实入口：生成本批章节、全量生成章节、续生成。三者共用 `genChapters(mode)` 引擎；本批/续生成在达到设定数量后以成功态停在批次边界，断点保存为 `paused`；只有全量完成才清除断点。旧按钮名称在源码、测试、验证脚本中清零。
- 交付物：模式规划器与部分账本校验、`genChapters(mode)` 改造、三按钮 UI 与禁用态、专项与 wiring 测试、Electron 真实 UI 验证、3.87.0 封装、DEV_LOG 与本台账。

## 2. 门禁读证

- G0.1：本轮只做 P1-F 章节层分批模式，不夹带正文层与卷纲层新行为。
- G0.3：完成声明必须区分单测、Electron、打包验证；不把 mock 冒充真实 UI。
- G0.5：收尾前逐行审 diff，双向扫描生产与验证器旧入口。
- G0.6：用户已确认三入口语义；批次边界成功态、暂停验账、取消不入库为执行层硬约束。
- G0.8：收尾清理旧安装包、一次性 profile、可再生成临时探针。
- G0.10：旧文案与旧无参调用清零；验证脚本旧入口同步迁移，不允许旧路径继续执行。
- G0.11：Electron 验证必须真实点击三个按钮；断点与 trace 由应用自身状态确认。
- G0.12：本文件为七节台账，缺节不得声明完成。
- G1.11：wiring 用全局计数，不用 `indexOf`；旧断言同批迁移。
- G1.13：Electron 使用独立 profile、`SHENYI_DATA_DIR`、可见窗口与超时守卫。

## 3. 路由判定

- 加入：G0.1、G0.3、G0.5、G0.6、G0.8、G0.10、G0.11、G0.12；实现验证阶段加入 G1.4、G1.5、G1.7、G1.8、G1.11、G1.13。
- 排除 G1.9 新增状态机：不新增全局任务状态，`paused` 是章节断点 phase，不是活动生成态。
- 排除 G1.10 权限门：本阶段只改章节生成入口，不改 API 直写授权语义。
- 排除 G1.19 性能门：本阶段解决的是可操作性与分批交付，不声明耗时优化结论。

## 4. 影响圈与作者反证

- 已改面：`chapterGenerationContract`、新增模式规划器、`PipelinePanel.genChapters`、章节层按钮区、旧验证脚本、新 Electron 验证器。
- 可能被误伤面：既有一口气到底的章节验证器、断点恢复文案、`validateChapters` 全量语义。
- 高危假设一：“分批停止可以直接失败收口”。反证：用户明确要求成功态；必须新增 `chapters_batch_complete` trace reason 与 `finishGeneration()`。
- 高危假设二：“暂停时不必验账”。反证：缺章会被隐藏到最后一轮；每次边界必须校验 `1..coveredEnd` 连续无重叠。
- 高危假设三：“只改按钮文案即可”。反证：`genChapters` 无参会让三个入口仍全量到底；必须传 mode 且共享单一引擎。

## 5. 停止条件

- 完成：专项测试 RED→GREEN；全量 `npm run test:services` 通过；`npm run type-check` 通过；`npm run build:vue` 通过；Electron 三批次真实 UI 验证通过，断言 2/4/6 章递增、每批断点 `paused`、第三批总账通过且断点清空；负向取消不入库；3.87.0 打包与真实启动核验通过；旧产物与临时 profile 清理；DEV_LOG/台账/索引收口。
- 失败：旧文案或旧无参入口残留；本批停止走 `failGeneration`；批次边界缺账；取消产生半批入库；三按钮未绑定不同 mode；任一验证命令 exit 非 0。

## 6. 执行证据

- RED：新增 `chapterBatchPlanning.spec.ts`、`chapterBatchModesWiring.spec.ts` 后、实现落地前，专项测试因缺少 `chapterBatchPlanning.ts` 与三按钮/三 mode 接线而失败；失败面覆盖模式规划、旧文案清零、单一引擎三入口与批次成功态。
- GREEN 专项：`npm run test:services -- chapterBatchPlanning chapterBatchModesWiring chapterGenerationContract` → 3 files / 28 tests passed，exit 0。
- 全量：`npm run test:services` → 161 files / 1897 tests all passed，exit 0。
- `npm run type-check` → exit 0。
- `npm run build` → exit 0；NSIS 产物 `dist/神意助手-Setup-3.87.0.exe`。
- Electron 真实 UI：`node scripts/verify-chapter-batch-modes-electron.mjs` → `===== CHAPTER BATCH MODES ELECTRON PASSED =====`；2/4/6 章递进，前两批 `chapters_batch_complete` + `paused`，第三批 `chapters_generation_complete` + 断点清空，取消场景保持 4 章不入库、run 为 `canceled`。证据：[_audit/verification-chapter-batch-modes-electron/report.json](_audit/verification-chapter-batch-modes-electron/report.json)。
- 3.87.0 打包核验：`node scripts/verify-packaging-3-87-0.mjs` → `verdict: pass`；asar version `3.87.0`、renderer 74 files、`electronAPI` 77 methods、真实启动渲染通过；安装包 231,528,921 bytes，SHA256 `b0540ee8e6e3df1372440fd13a6a76f1625152f06de2c83ed27818a9df67d503`。证据：[_audit/verification-packaging-3-87-0/packaging-evidence.json](_audit/verification-packaging-3-87-0/packaging-evidence.json)。

## 7. 缺口清单

- 本轮 Electron 使用本地 OpenAI-compatible provider，未调用外部 live 供应商；已验证的是三入口状态机、断点、trace 与取消语义，供应商差异不在本证据面内。
- `_data` 下仍有约 23 个历史任务 profile / 凭据 / run-trace 目录，分属 9/27-10/10 的多个已收口任务；本任务一次性 profile 已删除。为避免误删其他任务证据，历史 `_data` 清理列为独立收尾项，不在本任务内一刀切处理。
- `PipelinePanel.vue` 批次输入区有一处历史缩进漂移，验证脚本中有一个循环边界内的死分支；二者不影响行为，为避免已通过的重验证作废，本轮不改动，留给后续格式专项。
