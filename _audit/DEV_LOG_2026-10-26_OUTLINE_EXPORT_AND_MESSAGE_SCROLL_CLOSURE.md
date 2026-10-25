# 2026-10-26 大纲运行记录导出与共创消息滚动修复

## 范围

- 修复用户实测发现的两处 3.108.0 回归：运行记录导出按钮失效；大纲共创 API 消息滚动显示区鼠标无反应。
- 用户已澄清失效区域是 `.ow-messages` 消息滚动显示区，不是底部输入框。本轮不把输入框可用冒充滚动区验证。
- 交付 3.108.1，完成源码版与打包版双真实 Electron UI 回归、经验文件回写、旧产物清理与工作区收尾。

## 根因

1. **运行记录导出失效：Pinia reactive proxy 进入 Worker。**
   - [runTraceExportWorkerService.ts](/d:/codex/novel-workshop-vue3/src/services/runTraceExportWorkerService.ts:53) 直接把 store 中的 run 交给 `worker.postMessage`。Pinia reactive proxy 不能 structured clone，抛 `DataCloneError`。
   - [RunTracePanel.vue](/d:/codex/novel-workshop-vue3/src/components/common/RunTracePanel.vue:261) 旧实现把失败压缩成 `console.warn('导出 Worker 不可用或超时')`，用户看到的是按钮无反应，失败原因被观测层吞掉。
2. **消息滚动区鼠标无反应：滚动容器语义错误叠加自动跟随抢滚动。**
   - `.ow-messages` 是 `overflow: hidden`；虚拟列表场景由 `.ow-message-scroller` 滚动，普通列表没有子滚动器，滚轮无法产生位移。
   - `scrollToBottom()` 在流式输出中持续强制拉底，用户向上滚动会被抢回，形成“鼠标无效/页面不受控”的体验。
   - `scroll` 事件不冒泡；只挂在普通冒泡监听时收不到虚拟列表滚动意图，无法区分用户意图与程序写入。

## 修复

- [OutlineWorkspace.vue](/d:/codex/novel-workshop-vue3/src/components/common/OutlineWorkspace.vue:535)
  - `.ow-messages` 改为 `overflow-x: hidden; overflow-y: auto`。
  - 新增 `outlineMessageFollowEnabled` 统一跟随状态；真实滚动更新跟随/暂停跟随，回底附近恢复自动跟随。
  - 流式 `scrollToBottom()` 尊重用户跟随状态，并用 80ms 节流减少滚动写入。
  - scroll 使用 `capture: true`，普通列表与虚拟列表共用同一用户意图状态。
  - 卸载时清理 timer 与监听。
- [runTraceExportWorkerService.ts](/d:/codex/novel-workshop-vue3/src/services/runTraceExportWorkerService.ts:53)
  - 新增 `unwrapCloneable()` / `makeCloneableRun()`，处理 Date/Map/Set/Array/循环引用并剥离 Vue proxy 标记。
  - `postMessage` 抛错时清理 pending 并返回受控错误。
- [RunTracePanel.vue](/d:/codex/novel-workshop-vue3/src/components/common/RunTracePanel.vue:261)
  - 导出/复制按钮增加 `exporting/copying` 状态、成功路径与失败原因显示，取消导出恢复 idle。
- 测试与验证器：
  - [directWriteWiring.spec.ts](/d:/codex/novel-workshop-vue3/src/services/directWriteWiring.spec.ts:214) 新增消息区滚动契约，防止退回 `overflow: hidden` 或丢失用户意图保护。
  - [runTraceExportWorkerService.spec.ts](/d:/codex/novel-workshop-vue3/src/services/runTraceExportWorkerService.spec.ts:31) 用 `structuredClone(message)` 钉住 Worker 入参可克隆，覆盖 reactive run、timeout、`DataCloneError` 三类路径。
  - [verify-outline-message-scroll-ui-regression.mjs](/d:/codex/novel-workshop-vue3/scripts/verify-outline-message-scroll-ui-regression.mjs:1) 删除拖拽假断言；关闭共创页必须真实点击关闭按钮并等待组件卸载；滚轮断言等待真实 `scrollTop` 变化，兼容普通列表与虚拟列表。

## 验证

- 定向：`npx vitest run src/services/directWriteWiring.spec.ts src/services/runTraceExportWorkerService.spec.ts` → 2 files / 29 tests PASS。
- 类型：`npm run type-check` → exit 0。
- 构建：`npm run build:vue` → exit 0。
- 打包：`npm run build` → 3.108.1，安装包 `dist/神意助手-Setup-3.108.1.exe`，231,609,991 bytes，SHA256 `D2AF831266D686D8E1703F80ED3C73D91201310E636EA8A2074E4B921E245782`；`latest.yml` version=3.108.1。
- 源码版真实 Electron UI：
  - 导出 PASS：真实点击导出按钮，导出目录含 `export.json`。证据 `_audit/verification-outline-export-ui-source/result.json`。
  - 滚动 PASS：plain-list `delta=600`、生成态 `delta=-600`；virtual-list `delta=600`、生成态 `delta=-600`。证据 `_audit/verification-outline-message-scroll-ui-source/result.json`。
- 打包版真实 Electron UI：
  - `node scripts/verify-outline-export-ui-regression.mjs packaged` → PASS；导出目录 `run-trace-导出回归-20261026-042144-standard` 含 `export.json`；`pageErrors=[]`、`consoleMessages=[]`。证据 `_audit/verification-outline-export-ui-packaged/result.json`。
  - `node scripts/verify-outline-message-scroll-ui-regression.mjs packaged` → PASS；plain-list `staticDown=600`、`generatingScroll=-600`；virtual-list `staticDown=600`、`generatingScroll=-600`；`responsivenessState=normal`、`freezeCount=0`。证据 `_audit/verification-outline-message-scroll-ui-packaged/result.json`。
- 产物清理：3.108.0 安装包与 blockmap 删除后 `exists=false`，dist 仅保留 3.108.1 一套交付。

## 诚实边界

- 未做 NSIS 安装器人工安装路径核验；以 electron-builder 输出、文件尺寸、latest.yml、SHA256、win-unpacked 双真实 UI 回归为准。
- 未做真实外部供应商长流滚动验证；生成态由应用真实 streaming 测试钩子进入，滚动与跟随语义不依赖供应商内容。
- 未复跑全应用 13 个历史 Electron 脚本；本轮按触点完成 4 项真实 UI 回归，历史脚本范围沿用既有 DEV_LOG 证据。

## 经验与封装回写

- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_OUTLINE_EXPORT_AND_MESSAGE_SCROLL_CLOSURE.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_OUTLINE_EXPORT_AND_MESSAGE_SCROLL_CLOSURE.md)
- 经验文件升级 v9.2.0 → v9.3.0：
  - G1.5 补“UI 验证必须对准用户实际失效区域”。
  - G1.8 补“Worker/结构化克隆边界输入必须先解 reactive proxy，并给失败出口”。
  - G1.9 补“滚动容器与自动跟随必须分离用户意图，程序滚动不得抢占用户滚动”。
- 版本：3.108.0 → 3.108.1。
