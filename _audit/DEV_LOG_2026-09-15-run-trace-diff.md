# 开发日志：运行记录两次对比面板（RunTraceDiff）

日期：2026-09-15

## 目标

按 `PROPOSAL_2026-09-15_RUN_TRACE_DIFF.md` 交付两次运行的结构化 diff 面板，供 SKILL 制作方对比模板修改前后 API、提示词、输出、工具、处理报告与状态链差异。

## 交付内容

1. `src/services/runTraceDiff.ts`：A/B 对齐、分组对比、文本 diff、纯文本报告与 JSON 导出结构。
2. `src/services/runTraceDiff.spec.ts`：对齐、单侧存在、脱敏、导出结构回归。
3. `src/components/common/RunTraceDiffPanel.vue`、`TextDiffView.vue`：对比 UI、六组 Tab、双栏/单栏文本对照与全文导出。
4. `RunTracePanel.vue`：新增对比模式入口、A/B 选择、退出对比与关闭面板不记忆选择。
5. `electron/ipc/runTrace.js`：diff 导出走 `.json` 单文件，新增 `uniqueExportFile()` 防止同名覆盖或变成无后缀目录。
6. `scripts/verify-run-trace-diff-e2e.mjs`：真实 Electron + CDP + Pinia 注入的两条不同结构运行 E2E。

## 关键修复

1. 导出文件名保留 `.json` 后缀：旧 `uniqueExportDestination()` 会把 diff 导出目标剥成无后缀路径。
2. diff 导出结构补 `version: RUN_TRACE_DIFF_SCHEMA_VERSION`。
3. 导出前递归脱敏：`RunTracePanel.vue` 的 `exportDiff()` 使用本地递归 `maskValue` 包装 `runTraceStore.maskSensitive`，避免对象被 `String()` 变成 `[object Object]`。
4. E2E 断言读取真实导出外层结构：`exported.diff.runs.a/b`，不是顶层 `exported.runs`。

## 排查记录

曾怀疑 electron-log IPC transform 深度序列化导致 diff 对象被写成字符串。二分定位显示：preload 与主进程 handler 收到的 payload 均为对象；重新执行 `npm run build:vue` 后 E2E 导出恢复为约 43KB 完整 JSON。真实根因是 E2E 在前端修复后没有重建，读取旧 `dist-renderer` 产物（经验文件 §3 规则 18），不是 IPC 序列化损坏。`electron/preload.js` 顶部的 electron-log renderer bridge 是既有初始化，本次未改。

## 验证

1. `npx vitest run src/services/runTraceDiff.spec.ts src/stores/runTrace.spec.ts src/stores/runTrace.integrity.spec.ts src/composables/useAiCallTrace.spec.ts electron/ipc/runTrace.spec.js`：5 files / 58 tests passed。
2. `npx vue-tsc --noEmit`：exit 0。
3. `npm run build:vue`：exit 0。
4. `node scripts/verify-run-trace-diff-e2e.mjs`：31 项 PASS，包括 A/B 选择、六 Tab、请求差异、导出全文、脱敏、无 `[object Object]`、退出对比、单次详情回归与 A/B 不记忆。

## 回头看

1. 本轮未改 `runTrace.ts`、`useAiCallTrace.ts`、采集层和 `RUN_TRACE_SCHEMA_VERSION`；diff 是独立观测层。
2. 搜索确认无 `[DEBUG:` 临时输出残留。
3. 版本已升级为 3.50.0；NSIS 封装等待用户另行确认，本轮不生成安装包。
