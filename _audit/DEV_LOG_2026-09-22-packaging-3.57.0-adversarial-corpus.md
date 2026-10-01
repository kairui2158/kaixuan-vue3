# 2026-09-22 3.57.0 意图对抗语料工厂封装

## 目标

交付包含意图路由自动化对抗语料工厂的 3.57.0 安装包，并完成 M29/M42/M43/M44/M54 门禁：旧产物清零、真实打包产物启动核验、preload 语法校验与验证脚本自身校验。

## 版本与产物

- 版本：`package.json` 与 `package-lock.json` 均为 3.57.0。
- 安装包：`dist/神意助手-Setup-3.57.0.exe`。
- SHA256：`56FEE8E54C945AA012BB1CDF128E8023BC8914B7A93E1599DEABF6D6F3A96347`。
- NSIS 有效配置：`oneClick: false`、`allowToChangeInstallationDirectory: true`、`include: build/installer.nsh`，客户可自选安装路径。

## 核验脚本

- 新增 `scripts/verify-packaging-3-57-0.mjs`，同步版本、`schemaVersion=packaging-3-57-0-v1`、输出目录与横幅。
- 删除旧 `scripts/verify-packaging-3-56-0.mjs`，避免新旧验证入口并存；历史 DEV_LOG 中的旧文件名属于当时事实，保留不改。
- `node --check scripts/verify-packaging-3-57-0.mjs`：通过。

## 验证

- `node --check electron/preload.js`：通过。
- `npm run test:services`：78 个测试文件、760 条测试全部通过。
- `npm run type-check`：通过。
- `npm run build`：Vite 双构建与 electron-builder NSIS x64 打包完成。
- `node scripts/verify-packaging-3-57-0.mjs`：
  - asar 版本 3.57.0。
  - renderer 74 条目。
  - `window.electronAPI` 77 个方法可用。
  - 打包应用真实启动并渲染可见文本。
  - 本地意图 embedding 模型从 `resources/models/bge-small-zh-v1.5` 正常加载。
  - 证据：`_audit/verification-packaging-3-57-0/packaging-evidence.json`。

## 产物清理

- 删除旧安装产物：`dist/神意助手-Setup-3.56.0.exe`、`dist/神意助手-Setup-3.56.0.exe.blockmap`。
- 删除旧封装证据文件：`_audit/verification-packaging-3-56-0/packaging-evidence.json`、`_audit/verification-packaging-3-55-0/packaging-evidence.json`。
- 复核后 `dist` 仅保留 3.57.0 一套安装产物；`_audit/verification-packaging-*` 仅保留 3.57.0 证据目录。

## 客户复验重点

- 安装 3.57.0 后应用可启动，`window.electronAPI` 可用，可自选安装路径。
- 意图路由对话功能与运行记录行为正常。
- 不需要客户执行任何“喂养语料”的额外操作；真实 confirmed 样本会在正常使用中自动积累。
