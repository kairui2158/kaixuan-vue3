# 2026-09-13 3.40.0 版本封装

## 背景

3.39.2 之后完成卷纲层三缺陷修复复验，并追加修复旧版 run-trace 二次导出仍内联 `__payload.value` 的兼容缺口。本版将真实 trace 主文件从 6.63MB 降至约 70KB，且新旧导出格式统一为 `preview + payloadRef`。按 run-trace 导出协议变更升级为 3.40.0。

## 版本

- `package.json`：3.40.0
- `package-lock.json` 根记录：3.40.0
- 产物：`dist/神意助手-Setup-3.40.0.exe`

## 验证

- `npm run type-check`：通过。
- `npm run test:services`：14 个测试文件、192 条测试全部通过。
- `npm run build`：主构建 1635 modules transformed、provider protocols 2 modules transformed、electron-builder NSIS 打包成功。
- `dist/latest.yml`：`version: 3.40.0`，产物大小 130,365,112 字节。
- `dist/builder-effective-config.yaml`：`oneClick: false`、`allowToChangeInstallationDirectory: true`、`include: build/installer.nsh`。
- asar 内 `package.json`：`name=shenyi-assistant`、`version=3.40.0`。
- asar 内 `electron/ipc/runTrace.js`：包含 `normalizeLegacyPayloads()` 与 `responseText = undefined` 外置逻辑，确认本轮修复已进入安装包。
- SHA256：`B5D373D01F76418E47E4A6B513B34D51037B547CBA1DF2C98B26020581CEC1B3`。
- 旧 3.39.2 安装器与 blockmap 已从 `dist/` 删除，并用 `Test-Path` 复核均为 `False`。

## 未验证项

- 未执行安装版人工安装实测；安装器为未签名构建。
- 真实供应商长链路生成未在本轮打包门禁中重复执行，沿用本修复任务此前的真实 trace 复验边界。
- 工作区存在大量前序任务未提交改动，本日志只记录封装增量，不声明全仓提交完成。
