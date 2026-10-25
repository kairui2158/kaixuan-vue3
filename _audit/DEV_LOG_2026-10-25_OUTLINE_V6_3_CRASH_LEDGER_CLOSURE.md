# DEV_LOG：大纲编辑器 V6.3 崩溃账本收口

## 目标

清零 V6.3 遗留的“崩溃后账本读取”E2E 缺口，并把 popup/嵌套 popup 响应面接线修复到产品层。

## 根因

1. 产品层：`ensurePopupPreload` 只给第一层子窗口接线。popup 再开 popup 时，嵌套窗口没有 `registerResponsivenessHandlers` 与 `attachWindowResponsivenessListeners`，`window.electronAPI.responsivenessLedger` 不存在。
2. 验证器层：`readLedgerOverCdp` 使用顶层 `await` 表达式，CDP 将其判为异常并被旧脚本吞成“账本不可读”；恢复事件断言早于落账；崩溃后仍复用已失效的 Playwright page 句柄。

## 修复

- `electron/main.js`：`did-create-window` 中递归调用 `ensurePopupPreload(childWindow)`，并继续注册响应面监听。
- `scripts/verify-outline-v6-main-ledger-e2e.mjs`：CDP 读取改为 Promise 表达式 + `awaitPromise`，显式抛出 `exceptionDetails`；循环等待 `renderer_recovery_reloaded`；fresh target 增量识别并直接经 CDP 截图，删除失效 `recoveryPage` 死代码。
- `electron/ipc/responsivenessLedger.spec.js`：嵌套 popup 测试断言 `render-process-gone + renderer_recovery_scheduled` 事件集合与完整响应面，不再误绑“最后一条事件”。

## 验证

- `npx vitest run electron/ipc/responsivenessLedger.spec.js`：9/9 PASS。
- `npm run build:vue`：exit 0。
- `node scripts/verify-outline-v6-main-ledger-e2e.mjs`：PASS；证据 `_audit/verification-outline-v6-main-ledger-e2e/result.json`，崩溃恢复与新窗口账本读取均为 true。
- `npm run test:services`：212 files / 2296 tests 全部 PASS。
- `npm run type-check`：exit 0。

## 诚实边界

本轮 22 秒阻塞由应用安全模式捕获，同时触发真实 `render-process-gone`；Electron 原生 `unresponsive/responsive` 未在该时长内出现，报告保留 `false`，不冒充通过。
