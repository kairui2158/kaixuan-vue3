# DEV_LOG：卷纲层历史问题修复与 schema retry 反馈收口（2026-10-20）

## 交付内容

本轮关闭卷纲层复查中仍真实存在的应用侧缺口，同时收口 2026-10-17 台账登记的“schema retry 全文回传”同族未修项：

1. 新增 `src/services/schemaRetryFeedback.ts`：非终步 schema retry 反馈单源组装。错误清单最多 10 条，定位锚点最多 3 条且每条 200 字符，候选稿只保留头尾各 200 字符的有界摘要，禁止回传全文。反馈同时输出 `candidateChars / feedbackChars / anchorCount / previewChars / suppressedCandidateChars` 指标。
2. `src/services/realSkillExecutor.ts` 删除旧 `buildSchemaRetryFeedback` 全文回传实现；两处 schema retry 分支接线新模块，并通过 `onSchemaRetryFeedbackComposed` 上报反馈构成。终步 polish 专用 `buildFinalStepSchemaRetryFeedback` 保持不动，避免破坏 2026-10-19 的终步反馈契约。
3. `onSchemaRetryFeedbackComposed` 回调沿 `RealSkillExecuteOptions → SkillRouteOptions → executeOptions` 全链穿透；`PipelinePanel.vue` 新增 `schema-retry-feedback-composed` trace 事件，记录五项反馈指标。
4. 卷纲请求协议单源分流：`PipelinePanel.vue` 用 `volumeRequestIsFolderChain` 判定 folder 链，并把 `outputProtocol` 传入 `buildVolumePrompt` 与批次编排器；folder 链不再生成直连 JSON 输出指令。
5. 续卷上下文有界化：`volumeRefText` 改为 summary 优先，outline 只保留头部 240 字符锚点；措辞从“上一卷为”改为“上一卷锚点为”，避免旧卷全文继续滚入请求。
6. `stripLegacyVolumeJsonProtocol` 升级为新旧两代句式，多行锚点使用 `[\s\S]*?` 跨行匹配，防止旧协议残留重新混入 folder 链。

## 机器验证

- 定向回归：`npx vitest run src/services/schemaRetryFeedback.spec.ts src/services/realSkillExecutor.spec.ts src/services/volumeGeneration.spec.ts src/services/volumeBatchOrchestrator.spec.ts` → exit 0，4 files / 96 tests。
- 全量回归：`npx vitest run` → exit 0，178 files / 2055 tests。
- 类型：`npm run type-check` → exit 0。
- 构建：`npm run build:vue` → exit 0，双产物 `dist-renderer/index.html` 与 `dist-renderer/providerProtocols.cjs` 构建完成。
- 封装：`npm run build` → exit 0，NSIS 产物 `dist/神意助手-Setup-3.100.0.exe` 生成。
- 打包核验：`node scripts/verify-packaging-3-100-0.mjs` → exit 0，输出 `===== PACKAGING 3.100.0 VERIFICATION PASSED =====`；`rendererFiles=81`、`electronAPI methods=77`，证据 `_audit/verification-packaging-3-100-0/packaging-evidence.json`。

## 诚实边界

- 本轮修复以单测、全量回归与构建为证据，未重新跑完整 Electron + 真实 API live；新 schema retry 反馈在真实供应商输出上的效果登记 `untested`，需下一次 live run 以 `schema-retry-feedback-composed` 事件验证。
- 2026-10-19 的第 12 轮 live 证据仍是当前最近一次真实链路证据；本轮不宣称复用其通过结论覆盖新行为。
- `chainHandoff.reason` 缺失属 SKILL 层元数据缺口，应用侧 warning 观测已存在，未在本轮伪装修复。
- `reasoning per-step 配置化` 仍为登记项，本轮未改供应商 reasoning 语义。

## 经验裁决

保持经验文件 v8.16，不升 v8.17。理由：schema retry 禁携候选全文已由 G2.9 v8.16 明确覆盖，本轮是该门禁从“终步”扩展执行到“非终步”的实现收口；卷纲协议分流与有界锚点也属于既有 G0.10 新旧并存清零和 G1.19 请求体放大门禁的执行项，没有暴露新的纪律缺口。若强行升版，会把执行项伪装成新经验。

## 收口

- 版本升级 3.99.0 → 3.100.0，`package.json` 与 `package-lock.json` 同步。
- 台账：`_audit/TASK_LEDGERS/2026-10-20_volume-retry-feedback-closure.md`
- 历史登记项对账：`2026-10-17_metadata-retry-ledger-closure.md` 第 7 节登记的 schema retry 全文回传已关闭；`chainHandoff.reason` 与 reasoning 配置化保持登记状态。
- 安装包 `dist/神意助手-Setup-3.100.0.exe`，231,551,270 bytes，SHA256 `7339303075759fcf68eccd1dc5985b729c21ee8959cd07ccf19bab23fcc304ab`；3.97.0 旧安装包与 blockmap 已清理，dist 仅保留 3.100.0 产物及打包元数据。
