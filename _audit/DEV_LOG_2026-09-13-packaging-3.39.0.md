# 2026-09-13 3.39.0 版本封装日志

## 项目功能

交付「全应用统一性修复」后的 3.39.0 Windows NSIS 安装包。

## 用途

- 客户实测 Modal 队列统一后的弹窗叠加与关闭行为。
- 验证 AI Trace 生命周期统一后，无 running 僵尸记录、无跨入口状态残留。
- 确认旧架构 6 服务删除后三入口生成、folder chain、运行记录导出不受影响。
- 确认安装器继续支持选择安装目录，避免回退一键安装。

## 执行过程

1. 主修复与验证在 `DEV_LOG_2026-09-13-full-unification-repair.md` 完成：`vue-tsc`、481 个 Vitest 测试、`build:vue`、run-trace-depth-v2 E2E、G2/G3 压力与失败路径 E2E、G4 三入口 E2E 全部通过。
2. `package.json` 与 `package-lock.json` 版本统一升级为 `3.39.0`，执行 `npm install --package-lock-only` 同步根记录。
3. 执行 `npm run build`：主构建 `1634 modules transformed`，协议构建 `2 modules transformed`，electron-builder 生成 NSIS 安装包。
4. 验证包外元数据、NSIS 有效配置、包内 asar 版本与 SHA256。
5. 清理 3.38.4 旧安装包与 blockmap，只保留 3.39.0 产物。

## 验证结果

- `npm install --package-lock-only`：exit 0，`up to date, audited 804 packages`。
- `npm run build`：exit 0，NSIS 日志输出 `oneClick=false perMachine=false`。
- `dist/builder-effective-config.yaml`：
  - `nsis.oneClick: false`
  - `nsis.allowToChangeInstallationDirectory: true`
  - `nsis.include: build/installer.nsh`
- `dist/latest.yml`：`version: 3.39.0`，`size: 130362534`。
- asar 内 `package.json`：`shenyi-assistant 3.39.0`。
- 清理后 `dist` 安装包级产物只包含 3.39.0 的 exe 与 blockmap。

## 产物

- 安装包：`dist/神意助手-Setup-3.39.0.exe`
- 大小：`130,362,534 bytes`（约 `124.3 MB`）
- SHA256：`00754AD79742003C06EBE3998F5D8B059FF4A5FA36CA55B5C6EB772FE2808480`
- Blockmap：`dist/神意助手-Setup-3.39.0.exe.blockmap`
- 签名状态：未签名，electron-builder 日志显示 `no signing info identified`

## 收尾

- 删除 `dist/神意助手-Setup-3.38.4.exe` 与 blockmap。
- 删除 asar 验证与旧包清理的临时脚本。
- 主索引登记 3.39.0 封装记录。
