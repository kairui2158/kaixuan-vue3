# 2026-09-12 3.38.0 版本封装日志

## 项目功能

交付「卷纲层运行记录六缺陷修复」后的 3.38.0 Windows NSIS 安装包，并补齐真实源 Electron E2E 验证。

## 用途

- 把 P0-A 至 P1-B 六项修复发布给客户实测。
- 修复 E2E 验证脚本自身的 Electron 启动、CDP 连接与断言问题，确保验证真实可复跑。
- 统一 3.38.0 版本号，清理旧版本安装包，避免客户误装。

## 根因与执行过程

1. E2E 脚本曾卡死，原因有三层：用 Node 直接执行 `electron.exe` 导致二进制被当作 JS 解析；CDP 输出匹配只兼容 `Remote debugging listening`，未兼容本版 Electron 的 `DevTools listening on`；手写 WebSocket 监听器使用 `once: true`，Electron 先推送任意事件即消耗监听器，`Runtime.evaluate` 响应永远收不到。
2. 改为 `spawn(electron.exe, [repoRoot, ...args])` 启动，并用 Playwright `chromium.connectOverCDP` 连接，绕开手写 WebSocket 帧处理。
3. 修正断言：folder-output 与 response 属于不同 `kind`，应分别校验 payload ref、`kind`、sha256 一致，而不是要求 ref 完全相同。
4. 临时目录删除增加 Windows EPERM 重试。
5. 对账发现 `package.json` 残留为 `3.29.0`（asar 覆盖事故残留）、`package-lock.json` 为 `3.37.2`，统一升级为 `3.38.0`。
6. 执行 `npm run type-check`、定向 Vitest、`node scripts/verify-pipeline-folder-chain-single-ownership.mjs`、`npm run build` 与 `node scripts/verify-volume-trace-six-defects-e2e.mjs`。
7. 清理 `dist/` 中 3.37.1 与 3.37.2 旧安装包及 blockmap，只保留 3.38.0 产物。

## E2E 验证结果

`node scripts/verify-volume-trace-six-defects-e2e.mjs` 六项全部 PASS：

- source Electron CDP reachable
- S1 export has request payload ref, stream, physical call
- folder diagnostics output is payload-ref with preview
- chain-dedupe and chain-output-echo events recorded
- payload files are content-unique
- no running API remains after finish/abandon

## 其他验证结果

- `npm run type-check`：通过。
- 定向 Vitest：`runTrace`、`realSkillExecutor`、`chainExecution`、`skillRouter`、`skillOrchestrator`、`electron/ipc/runTrace` 共 6 个测试文件、68 个测试全部通过。
- `node scripts/verify-pipeline-folder-chain-single-ownership.mjs`：8 项 PASS。
- `npm run build`：成功，构建日志输出 `oneClick=false perMachine=false`。
- `dist/builder-effective-config.yaml`：`nsis.oneClick=false`、`nsis.allowToChangeInstallationDirectory=true`、`nsis.include=build/installer.nsh`。

## 产物

- 安装包：`dist/神意助手-Setup-3.38.0.exe`
- 大小：`130,356,426 bytes`（约 `124.3 MB`）
- SHA256：`B07387FE8A22F2F38884F9F954995E901F5ECBFEEDDA210DE2B42A708EBD6570`
- Blockmap：`dist/神意助手-Setup-3.38.0.exe.blockmap`
- `dist/latest.yml`：`version: 3.38.0`，`size: 130356426`

## 收尾

- 删除 `dist` 中 3.37.1、3.37.2 旧安装包与 blockmap。
- 删除一次性清理脚本 `scripts/cleanup-dist-3.38.0.ps1`。
- 经验文件 v4 §2 新增 CDP `once: true` 吞响应规则，优先使用 Playwright `connectOverCDP`。
- 主索引追加 3.38.0 封装记录。
