# 2026-09-25 3.64.0 UI 全覆盖收口交付封装

## 范围

- 版本升级：`package.json`、`package-lock.json` 根记录同步升级为 `3.64.0`。
- 交付内容：UI 覆盖门禁从 24/341 扩展到 42 视图/605 案例后的全部风险清零成果，包括 MemoryPanel、PipelineFlow、PipelinePanel 溢出修复、章节树 300 案例压力核验、readonly computed setter 清理。
- 新增封装验证器：`scripts/verify-packaging-3-64-0.mjs`，证据目录 `_audit/verification-packaging-3-64-0/`。
- 清理目标：仅删除 `dist` 中 3.63.0 安装包与 blockmap，保留 3.64.0 产物和全部验证证据。

## 前置验证

- UI 交付内容已在前置轮完成并留证：
  - `npm run type-check` 通过。
  - `npm run test:services`：106 files / 1070 tests 全绿。
  - `npm run build:vue` 通过。
  - `node scripts/verify-design-fusion-responsive-overflow.mjs`：605 cases / 12 widths / 42 views / sidebar tooltip 396 cases。
  - `node scripts/verify-design-fusion-legacy.mjs`：407 files，0 findings。
  - `node scripts/verify-design-fusion-visual-matrix.mjs`：19 screenshots PASS。
  - `node scripts/probe-chapter-tree-overflow.mjs`：300 stress cases PASS。
- 封装前置：
  - `npm install --package-lock-only` 后发现 lockfile 根版本仍为 `3.61.0`，先同步根记录为 `3.64.0`，再执行 `npm install --package-lock-only`，最终 root version 为 `3.64.0`。
  - `node --check electron/preload.js` 通过。
  - `node --check scripts/verify-packaging-3-64-0.mjs` 通过。
  - `npm run verify:production-wiring`：349 modules / 1140 dependencies，无违规。

## 封装与核验

- `npm run build`：
  - Vue 双构建完成，renderer 主入口与 provider protocols 均生成。
  - electron-builder 25.1.8 完成 NSIS x64 打包。
  - 产物：`dist/神意助手-Setup-3.64.0.exe`，约 231MB。
  - `dist/builder-effective-config.yaml` 核对包含完整 `nsis` 块：`oneClick: false`、`allowToChangeInstallationDirectory: true`、`include: build/installer.nsh`。
- `node scripts/verify-packaging-3-64-0.mjs`：通过。
  - asar 内 `package.json` 版本 `3.64.0`，主入口 `electron/main.js`。
  - `electron/main.js`、`electron/preload.js` 非空。
  - renderer 文件 74 个，全部新于最新源码与构建配置。
  - 打包产物真实启动成功，本地意图 embedding 模型可加载。
  - `window.electronAPI` 暴露 77 个 IPC 方法。
  - 页面渲染非空，未出现加载失败文案。
  - 7 个侧栏 tooltip 实测几何全部在视口内。
  - 证据：`_audit/verification-packaging-3-64-0/packaging-evidence.json`。
- 清理：
  - 删除 `dist/神意助手-Setup-3.63.0.exe` 与 `dist/神意助手-Setup-3.63.0.exe.blockmap`。
  - 删除后复核 `dist` 仅剩 `win-unpacked`、3.64.0 安装包/blockmap、builder 元数据与 `latest.yml`。

## 回头看

- `dist/latest.yml` 根版本为 `3.64.0`，与安装包版本一致。
- `dist/builder-effective-config.yaml` 已核对完整 NSIS 配置，没有静默回退到 oneClick。
- 本轮只删除 3.63.0 可清理层，未触碰源码、日志、验证证据和历史未提交工作。
- UI 交付内容与 3.64.0 安装包已完成源码、测试、Electron 实测、打包产物四层对账。
