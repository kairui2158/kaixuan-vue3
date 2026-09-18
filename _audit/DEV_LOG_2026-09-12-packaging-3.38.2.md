# 2026-09-12 3.38.2 版本封装日志

## 项目功能

交付「产物有效性与状态一致性修复」后的 3.38.2 Windows NSIS 安装包。

## 用途

- 客户实测卷纲 folder chain 在空正文、reasoning 耗尽、输出截断、postProcess blocking 四类真实状态下的 UI、run trace 与导出结果。
- 验证“请求成功”不再伪装成“产物有效”，SKILL 调试方可以从运行记录看到 `finishReason/usage/reasoning` 与失败现场。
- 确认安装器仍支持选择安装目录，避免再次回退成一键安装。

## 执行过程

1. 主修复与验证在本轮前一阶段完成：定向单测 64 项、`type-check`、`build:vue`、源 Electron E2E 四场景全部通过。
2. `package.json` 与 `package-lock.json` 版本统一升级为 `3.38.2`，并执行 `npm install --package-lock-only` 同步根记录。
3. 执行 `npm run build`，前端 `1632 modules transformed`，electron-builder 成功生成 NSIS 安装包。
4. 验证包外元数据、NSIS 有效配置、包内 asar 版本与 SHA256。
5. 清理 `_data/product-validity-status-e2e-export` 与 3.38.0/3.38.1 旧安装包、blockmap，只保留 3.38.2 产物。

## 验证结果

- `npm install --package-lock-only`：exit 0，`up to date, audited 804 packages`。
- `npm run build`：exit 0，NSIS 日志输出 `oneClick=false perMachine=false`。
- `dist/builder-effective-config.yaml`：
  - `nsis.oneClick: false`
  - `nsis.allowToChangeInstallationDirectory: true`
  - `nsis.include: build/installer.nsh`
- `dist/latest.yml`：`version: 3.38.2`，`size: 130358319`。
- asar 内 `package.json` 版本：`3.38.2`。

## 产物

- 安装包：`dist/神意助手-Setup-3.38.2.exe`
- 大小：`130,358,319 bytes`（约 `124.3 MB`）
- SHA256：`5239080EF4B5944EB3BC26C7D54C78CF6DD7245EC000D5B1D6D223D00382EB6B`
- Blockmap：`dist/神意助手-Setup-3.38.2.exe.blockmap`
- 签名状态：未签名，electron-builder 日志显示 `no signing info identified`

## 收尾

- 删除 `_data/product-validity-status-e2e-export`。
- 删除 `dist/神意助手-Setup-3.38.1.exe`、`dist/神意助手-Setup-3.38.1.exe.blockmap`、`dist/神意助手-Setup-3.38.0.exe.blockmap`。
- `dist` 中安装包级产物只保留 3.38.2 的 exe 与 blockmap。
