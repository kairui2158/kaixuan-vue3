# 2026-10-12 3.80.0 流水线产物契约统一封装

## 范围

将流水线产物契约统一、runTrace schema 17、统一运行终态归并、`storage:remove` 同步删除 `.bak` 断点成果交付为 3.80.0 安装包。

## 版本与产物

- 版本：`package.json` 与 `package-lock.json` 均为 3.80.0。
- 安装包：`dist/神意助手-Setup-3.80.0.exe`。
- 验证器：`scripts/verify-packaging-3-80-0.mjs`，真实启动打包应用核验。
- 证据：`_audit/verification-packaging-3-80-0/packaging-evidence.json`。

## 执行步骤

1. 完成流水线产物契约统一实现与提交（`f07f0c7`）。
2. 执行全量服务测试、type-check、renderer 构建与 NSIS 打包。
3. 新增 3.80.0 封装验证器并真实启动打包应用核验。
4. 清理 3.79.0 旧安装包、旧验证器与旧证据目录。

## 验证

### 2026-10-12 01:41-01:45 新鲜验证输出

- `npm run test:services`：exit 0，147 files / 1757 tests passed。
- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0，仅保留既有 Vite warning。
- `npm run build`：exit 0，NSIS 产物为 `dist/神意助手-Setup-3.80.0.exe`。
- `node --check scripts/verify-packaging-3-80-0.mjs`：exit 0。
- `node scripts/verify-packaging-3-80-0.mjs`：`PACKAGING 3.80.0 VERIFICATION PASSED`。
- `git diff --check`：exit 0。

### 打包核验结果

- asar：`version=3.80.0`，`main=electron/main.js`，renderer 74 个文件。
- 安装包：231,515,087 bytes。
- SHA256：`f2086c8c60636e63380a34b688819b7c7882815ef0ee1bd254271e444fe35e5f`。
- 真实启动：打包应用窗口打开，`electronAPI` 75 个方法，可见正文 2,306 字符，无加载失败/白屏。
- 新鲜度：asar 晚于全部源码与构建配置；renderer 输出无 stale 文件。
- 证据：`_audit/verification-packaging-3-80-0/packaging-evidence.json`（generatedAt `2026-10-11T17:45:04.576Z`）。

## 功能前置证据

- 真实 Electron UI + API live：设定、卷纲、正文四层记录均 `status: success`，见 `_audit/verification-pipeline-artifact-contract-live/summary.json`。
- 导出回放：卷纲/设定/正文三层全部 `RESULT: ACCEPTED`。
- 旧 schema 三条历史记录按 `EXPECTED-FAIL` 口径复核，证明契约事件为新增能力而非历史伪造。

## 清理

- 已删除 3.79.0 旧验证器 `scripts/verify-packaging-3-79-0.mjs`、旧封装日志证据目录 `_audit/verification-packaging-3-79-0/`。
- 已删除旧安装产物 `dist/神意助手-Setup-3.79.0.exe` 与 `.blockmap`。
- `dist` 仅保留 3.80.0 安装包、blockmap、builder 元数据与 `latest.yml`。
- 主索引已新增 3.80.0 封装登记；3.79.0 历史日志保留为开发史，不再承载当前产物口径。

## 诚实边界

- 本轮为版本封装收口，不重复声明流水线契约功能验证；功能与 live 证据见 `_audit/DEV_LOG_2026-10-11_pipeline-artifact-contract-unification.md`。
- 打包验证覆盖一个 Windows x64 NSIS 形态；其他平台未在本项目交付范围。
- live 证据中的正文层出现 `api-degraded` 后由契约校验与恢复链路完成 `body-artifact-recovered`，已在功能日志登记，不隐瞒为完全无损成功。
