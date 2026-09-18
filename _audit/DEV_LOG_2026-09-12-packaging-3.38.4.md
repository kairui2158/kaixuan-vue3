# 2026-09-12 3.38.4 版本封装日志

## 项目功能

交付「降级终态与运行记录状态修复」后的 3.38.4 Windows NSIS 安装包。

## 用途

- 客户实测卷纲 folder chain 在降级完成、协议提示、chain 记忆、卷纲字数回退四类场景下的 UI 与导出记录。
- SKILL 调试方验证“完成（降级）”不再被折叠成失败，协议提示不再伪装降级。
- 确认安装器继续支持选择安装目录，避免回退一键安装。

## 执行过程

1. 主修复与验证在 `DEV_LOG_2026-09-12-degraded-trace-repair.md` 完成：定向测试 61+30 项、`type-check`、`build:vue`、六缺陷 E2E、产物状态 E2E 全部通过。
2. `package.json` 与 `package-lock.json` 版本统一升级为 `3.38.4`，执行 `npm install --package-lock-only` 同步根记录。
3. 执行 `npm run build`：主构建 `1632 modules transformed`，协议构建 `2 modules transformed`，electron-builder 生成 NSIS 安装包。
4. 验证包外元数据、NSIS 有效配置、包内 asar 版本与 SHA256。
5. 清理 3.38.2、3.38.3 旧安装包与 blockmap，只保留 3.38.4 产物。

## 验证结果

- `npm install --package-lock-only`：exit 0，`up to date, audited 804 packages`。
- `npm run build`：exit 0，NSIS 日志输出 `oneClick=false perMachine=false`。
- `dist/builder-effective-config.yaml`：
  - `nsis.oneClick: false`
  - `nsis.allowToChangeInstallationDirectory: true`
  - `nsis.include: build/installer.nsh`
- `dist/latest.yml`：`version: 3.38.4`，`size: 130361188`。
- asar 内 `package.json`：`shenyi-assistant 3.38.4`。
- 清理后 `dist` 安装包级产物只包含 3.38.4 的 exe 与 blockmap。

## 产物

- 安装包：`dist/神意助手-Setup-3.38.4.exe`
- 大小：`130,361,188 bytes`（约 `124.3 MB`）
- SHA256：`5EBD7AFBCFC3B94F14F1C17BC90563ABD75524FE25615444BA513211209723B0`
- Blockmap：`dist/神意助手-Setup-3.38.4.exe.blockmap`
- 签名状态：未签名，electron-builder 日志显示 `no signing info identified`

## 收尾

- 删除 `dist/神意助手-Setup-3.38.2.exe` 与 blockmap。
- 删除 `dist/神意助手-Setup-3.38.3.exe` 与 blockmap。
- 主索引登记 3.38.4 封装记录。
