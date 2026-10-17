# DEV_LOG：正文层 metadata 契约与物理重试台账收口（2026-10-17）

## 交付内容

本轮针对 `run-trace-正文层-20261017-200242-standard` 暴露的六个暗伤完成生产闭环：

1. `formatUpstreamMetadata` 改为受控摘要交接：`extractedMeta` 只传 `count/totalChars`，数组只传 count 与最多 8 条 160 字符预览，`【正文交接】` 等标签归一为 `[metadata-section]`，键上限 16。S3 不再滚动携带 metadata JSON 原文。
2. `upstreamStepMetadata` 在 `PipelinePanel.vue` 的 S1→S3 链路逐步流转并写入断点，恢复后不丢。
3. 物理请求生命周期补齐 `normal/schema_retry/direct_retry/continuation` phase 分类，重试与续写不再混成一次逻辑调用。
4. run 与 step timing ledger 的 `firstTokenSumMs/outputSumMs` 改为同源求和，消除同名指标双公式。
5. token 观测校准修正方向反转：`observedRatio = correctedRatio`。只影响估算，不放宽上下文窗口、输出保留区或安全比。
6. 正文生产事件、attempt 与终稿 UI 统一 `countBodyWords`；`legacy_outline_no_scope` 如实标记历史大纲上下文缺失。

## 验证证据

- `npx vitest run`：173 files / 2015 tests 全部通过。
- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0。
- `node scripts/verify-body-contract-degraded-electron.mjs`：PASSED，runtime fingerprint commit `10e1dcb41d5a`。
- 拒绝场景 `run-1792248190641-1`：4 次物理请求，phase `[normal, normal, schema_retry, schema_retry]`，1654 字，`degraded_plus_contract_failure`，S3 零调用，run failed。
- 接受场景 `run-1792248191556-61`：5 次物理请求，2200 字，S3 请求含 `--- 上一步结构化交接 ---` 与 `- extractedMeta: count=1,totalChars=6867`，且无 `【正文交接】` 原文；`s2SchemaRetryPhases=2`；call/run/step timing 同源。
- 证据目录：`_audit/verification-body-contract-degraded-electron/`。

## 诚实边界

- `legacy_outline_no_scope` 为历史遗留：缺结构化 unit closure 的大纲无法补全上下文，本轮只做如实登记，不做静默升级。
- `buildSchemaRetryFeedback` 仍原样回传候选全文，属同族未修登记项；本轮不与 metadata 语义混改。
- Electron 为本地 OpenAI-compatible provider，不是外部 live 供应商矩阵。应用内既有 live key 在上一轮验证中仍为 401。

## 经验裁决

经验文件保持 v8.15，不升 v8.16。本轮发现的问题是验证器断言曾要求 S3 携带 `extractedMeta` 又禁止其必然包含的原文，属于 G1.5“断言与采集器/语义同批升级”既有门禁已覆盖的案例，不是新的工程纪律缺陷；升版反而会稀释经验版本含义。

## 收口与封装

- 版本升级 3.96.0 → 3.97.0。
- `npm run build` exit 0。安装包 `dist/神意助手-Setup-3.97.0.exe`，231,547,162 bytes，SHA256 `d25c45ac8a88a2881869b6855a82ac63f278c13b0c44c24e1a3ecba21a06f723`。
- `node scripts/verify-packaging-3-97-0.mjs` 打包后真实启动核验 PASSED：asar 版本 3.97.0、rendererFiles=81、electronAPI methods=77、本地 embedding 模型加载成功、渲染 bodyTextLength=912。
- 证据：`_audit/verification-packaging-3-97-0/packaging-evidence.json`。
- 构建仍有两个真实 chunk 体积提示：`index` 1,055.72 kB、`g6` 1,406.66 kB；未调 `chunkSizeWarningLimit` 伪装消警。
- `_data/body-contract-degraded-profile` 与 `_data/body-contract-degraded-skills` 复核不存在，`_audit/verification-body-contract-degraded-electron/` 证据保留。
- 旧产物 `神意助手-Setup-3.96.0.exe` 与 blockmap 已删除，Node 复核均不存在；`dist` 仅保留 3.97.0 exe/blockmap、builder-debug.yml、builder-effective-config.yaml、latest.yml，以及真实启动核验载体 `dist/win-unpacked`。
