# 2026-09-13 3.40.1 版本封装

## 背景

3.40.0 之后完成大纲工作台 compose + folder 修复 V2 验证闭环，并修复 prompt 外置载荷“哈希计算剔除元数据字段，但落盘文件仍包含这些字段”导致 `hashMismatch` 的缺陷。本版按 bugfix 级别升级为 3.40.1，将该修复发布给客户实测。

## 版本

- `package.json`：3.40.1
- `package-lock.json` 根记录：3.40.1
- 产物：`dist/神意助手-Setup-3.40.1.exe`

## 验证

- `npm install --package-lock-only`：通过，lockfile 根记录同步为 3.40.1。
- `npm run type-check`：通过。
- `npx vitest run electron/ipc/runTrace.spec.js`：1 个测试文件、5 条 prompt sha256 回归测试全部通过。
- `npm run test:services`：14 个测试文件、198 条测试全部通过。
- `npm run build`：主构建 1635 modules transformed、provider protocols 2 modules transformed、electron-builder NSIS 打包成功。
- `dist/latest.yml`：`version: 3.40.1`，产物大小 130,365,926 字节。
- `dist/builder-effective-config.yaml`：`oneClick: false`、`allowToChangeInstallationDirectory: true`、`include: build/installer.nsh`。
- asar 内 `package.json`：`name=shenyi-assistant`、`version=3.40.1`。
- asar 内 `electron/ipc/runTrace.js`：包内第 131、135、187 行包含 `promptIdentityContent`，确认 prompt 哈希一致性修复已进入安装包。
- 封装收尾时发现 `asar extract-file` 曾把打包精简版 `package.json` 解到仓库根并覆盖源清单，`electron/ipc/runTrace.js` 源文件未被覆盖；已按 3.40.1 完整发布清单恢复，删除根目录残留 `runTrace.js`，并用 `require('@electron/asar')` 内存读取方式重新完成校验。安装包哈希保持 `A5F70443728BA9A8729AC94DB6178C17938C8F82D905F8616C880163D4F644B5`，未受影响。
- SHA256：`A5F70443728BA9A8729AC94DB6178C17938C8F82D905F8616C880163D4F644B5`。
- `npx vitest run`：全量测试 61 个文件、507 条测试全部通过。
- 旧 3.40.0 安装器与 blockmap 已从 `dist/` 删除，并用 `Test-Path` 复核均为 `False`。

## 未验证项

- 未执行安装版人工安装实测；安装器为未签名构建。
- 真实供应商长链路生成未在本轮打包门禁中重复执行，沿用本轮修复阶段的源 Electron E2E 验证边界。
- 工作区存在大量前序任务未提交改动，本日志只记录封装增量，不声明全仓提交完成。
