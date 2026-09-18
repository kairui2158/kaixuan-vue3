# 2026-09-12 3.37.1 版本封装修复日志

## 项目功能

修复 3.37.0 安装包无法选择安装路径的问题，重新封装为 3.37.1 Windows NSIS 安装包。

## 用途

- 恢复 electron-builder 的 NSIS 配置，确保用户可以选择安装目录。
- 保留现有项目数据卸载确认逻辑。
- 恢复标准产物命名 `神意助手-Setup-{version}.exe`。

## 根因

1. 3.37.0 的 `package.json` 缺失 `devDependencies` 和整个 `build` 配置块。
2. `dist/builder-effective-config.yaml` 只有基础字段，没有 `nsis` 块。
3. electron-builder 静默回退为默认 `oneClick: true`，导致安装包无法选择安装路径。
4. 触发原因符合经验文件已记录的 asar 提取覆盖事故路径：3.37.0 封装验证时 asar 内精简版 `package.json` 覆盖了工程清单，后续修复只恢复了部分脚本与版本号，没有完整对账 `build`/`devDependencies`。

## 执行过程

1. 按 git HEAD 的历史配置完整恢复 `package.json` 的 `devDependencies`、`build`、`files`、`win`、`nsis`、`asarUnpack` 配置。
2. 版本号升级为 `3.37.1`，同步 `package.json` 与 `package-lock.json` 根记录。
3. 清理 3.37.0 坏产物、`latest.yml`、builder 配置文件。
4. `npm run type-check`：通过。
5. `npx vitest run`：55 个测试文件、432 个测试全部通过。
6. `npm run build`：成功，构建日志明确输出 `oneClick=false perMachine=false`。

## 产物

- 安装包：`dist/神意助手-Setup-3.37.1.exe`
- 大小：`134,936,685 bytes`（约 `128.7 MB`）
- SHA256：`C357D49EDD1B5C9B616B1FC9890B8DD6CB45FD2E81F931B081E504E683645809`
- Blockmap：`dist/神意助手-Setup-3.37.1.exe.blockmap`
- `latest.yml`：`version: 3.37.1`

## 验证结果

- `npm run type-check`：通过。
- `npx vitest run`：55 个测试文件、432 个测试全部通过。
- `dist/builder-effective-config.yaml`：包含 `nsis.oneClick=false`、`nsis.allowToChangeInstallationDirectory=true`、`nsis.include=build/installer.nsh`。
- 构建日志：`target=nsis ... oneClick=false perMachine=false`。
- `dist/win-unpacked/神意助手.exe` VersionInfo：`3.37.1`。
- 安装包 VersionInfo：`3.37.1`。
- asar 内 `package.json` 版本：`3.37.1`。
- 安装包 SHA256：`C357D49EDD1B5C9B616B1FC9890B8DD6CB45FD2E81F931B081E504E683645809`。

## 收尾

- 删除 3.37.0 坏安装包与 blockmap，避免客户误装。
- 删除临时清理脚本 `scripts/cleanup-dist-3.37.1.ps1`。
- 更新 `神意开发经验总结_v4.md` §6 交付纪律，新增封装后 NSIS 有效配置检查规则。
