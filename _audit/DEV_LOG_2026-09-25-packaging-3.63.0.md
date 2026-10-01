# 2026-09-25 3.63.0 编辑器 F3/F4/F5 交付封装

## 范围

- 版本升级：`package.json` -> `3.63.0`。
- 交付内容：F3 API 写入后的行内 Diff 视图、F4 SKILL 调试对比增强、F5 多光标与虚拟选区、Provider live 矩阵补测。
- 新增封装验证器：`scripts/verify-packaging-3-63-0.mjs`。
- 经验文件升级：`_audit/神意开发经验总结_v5.md` -> v5.42，新增 M67-M70。
- 清理目标：仅删除 `dist` 中 3.62.0 安装包与 blockmap，保留 3.63.0 产物和全部验证证据。

## 前置验证

- F3：主页与大纲真实 Electron 各 10 轮通过；报告 `_audit/verification-editor-diff/electron-10-rounds.json`。
- F4：`node scripts/verify-run-trace-diff-electron.mjs` 通过，`PASS: 10/10 run trace diff rounds`；报告 `_audit/verification-run-trace-diff/electron-10-rounds.json`。
- F5：`node scripts/verify-editor-multi-cursor-electron.mjs` 通过，主页 10/10、大纲 10/10；报告 `_audit/verification-editor-multi-cursor/electron-10-rounds.json`。
- Provider live：openai-compatible、deepseek live 均为 pass，且各 1 次工具调用；Anthropic/Gemini/Azure 因本机无凭据保持 untested，不伪造结果。
- 全量回归：`npm run test:services` 106 files / 1070 tests 全绿；`npm run type-check`、`npm run verify:production-wiring`、`npm run build:vue` 均通过。

## 封装与核验

- `npm run build`：完成 Vue 双构建与 NSIS x64 打包，产物为 `dist/神意助手-Setup-3.63.0.exe`。
- `node scripts/verify-packaging-3-63-0.mjs`：通过。
  - asar 版本 `3.63.0`，主入口 `electron/main.js`。
  - renderer 文件 74 个，全部新于最新源码。
  - `window.electronAPI` 暴露 77 个 IPC 方法。
  - 打包产物真实启动成功，本地意图 embedding 模型可加载，页面渲染非空。
  - 7 个侧栏 tooltip 实测几何无溢出。
  - 证据：`_audit/verification-packaging-3-63-0/packaging-evidence.json`。
- 清理：删除 `dist/神意助手-Setup-3.62.0.exe` 与 `dist/神意助手-Setup-3.62.0.exe.blockmap`；删除后复核均不存在。

## 回头看

- `dist` 只保留当前 3.63.0 安装包、blockmap、win-unpacked 与 builder 元数据。
- F3/F4/F5 均已按门禁完成源码、服务测试、Electron 实测、日志覆盖与生产构建对账。
- Provider matrix 报告保留最近一次 live pass 结论，未因无凭据重跑被覆盖。
- 后续方向已登记：为 Anthropic/Gemini/Azure 补真实凭据后继续 live 矩阵补测。
