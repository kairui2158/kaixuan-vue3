# 2026-09-26 3.68.0 仓库清理与封装

## 范围

- 本轮为 Agent Orchestrator V3 Phase 6B 通过后的仓库收尾与交付封装。
- 生产源码未做功能性修改；仅升级版本号并新增 3.68.0 封装核验脚本。

## 仓库分层清理

按 M42 / M29 分层执行，删除前均核对绝对路径位于 `D:\codex\novel-workshop-vue3\` 内，删除后逐项复核不存在：

- 旧安装产物：`dist/神意助手-Setup-3.66.0.exe`、`dist/神意助手-Setup-3.66.0.exe.blockmap`；封装核验通过后再清 `dist/神意助手-Setup-3.67.0.exe` 与 blockmap。
- 可再生成探针/临时输出：`_audit/chapter-tree-after-fix.txt`、`_audit/current-overflow-run.txt`、`_audit/overflow-after-fix.txt`、`_audit/overflow-after-fix-2.txt`、`_audit/packaging-3-65-0.txt`、`_audit/probe-chapter-tree-100px.png`、`_audit/probe-chapter-tree-default.png`。
- Electron 专用测试 profile：`_data/api-live-status-profile`、`_data/api-live-status-screenshots`、`_data/outline-stage2-profile`、`_data/provider-wire-electron-profile`。
- 保留层：未提交源码、测试、方案、DEV_LOG、经验文件、验证证据目录、`_data` 用户真实数据与密钥；既有 `D preload.js`、`D src/composables/useUndoRedo.ts` 等删除不回滚。

## 版本与验证

- 版本：`package.json` `3.67.0` -> `3.68.0`。
- `npm run type-check`：通过。
- `npm run test:services`：114 个测试文件 / 1139 条测试全部通过。
- `npm run verify:production-wiring`：359 modules / 1181 dependencies，无依赖违规。
- `npm run build`：Vue 双构建与 NSIS x64 打包通过，生成 `dist/神意助手-Setup-3.68.0.exe`。
- `node scripts/verify-packaging-3-68-0.mjs`：asar 真实启动、`window.electronAPI` 75 项、可见文本渲染、安装路径可选、产物新鲜度、SHA256 全部通过。

## 封装证据

- 核验脚本：`scripts/verify-packaging-3-68-0.mjs`
- 证据目录：`_audit/verification-packaging-3-68-0/`
- 安装包：`dist/神意助手-Setup-3.68.0.exe`
- 大小：231,462,796 bytes
- SHA256：`8d995b3dcc4b2814e5fe8500f50e9396d454a70221159047af2a1ac8a96ac783`

## 验证器修正记录

- 初版脚本错误地要求 asar 内 `package.json` 保留 `build.nsis` 配置；实际 electron-builder 会剥离该字段。
- 修正为从仓库根 `package.json` 校验 `oneClick:false` 与 `allowToChangeInstallationDirectory:true`。产品 NSIS 配置本身无缺陷。

## 收尾复核

- `dist` 最终仅保留 3.68.0 一套安装产物（exe + blockmap + latest.yml + builder 调试文件 + `win-unpacked`）。
- `Get-Process electron`：无 Electron 进程残留。
- 无预算目标，未设置任何 token 预算。
