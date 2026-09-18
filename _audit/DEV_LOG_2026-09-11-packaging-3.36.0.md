# 2026-09-11 3.36.0 版本封装日志

## 项目功能

将 API 对话系统底座统一 3.36.0 版本封装为 Windows 安装包，供客户实操验证。

## 用途

- 发布 API 对话系统底座统一后的三入口能力：主页编辑器、大纲工作台、生成流水线。
- 保留统一权限矩阵、上下文结构、工具声明、批次事件与写入安全模型。
- 提供可分发安装包 `dist/shenyi-assistant Setup 3.36.0.exe`。

## 执行过程

1. 使用 `npm version 3.36.0 --no-git-tag-version` 同步升级 `package.json` 与 `package-lock.json`。
2. 打包前验证：`npm run type-check` 通过；`npm run test:services` 20 个文件 / 218 个测试通过。
3. 第一次 `npm run build` 在 `rcedit` 阶段失败，报 `Unable to commit changes`。
4. 清理 `dist/win-unpacked` 后第二次构建在 asar integrity 写入阶段失败，报 `EBUSY: shenyi-assistant.exe`。
5. 排查发现无 `shenyi` / `electron` / `rcedit` 残留进程，文件 ACL 具备 Modify 权限；判定为上一次失败的 `rcedit` 写入尚未完全释放 Windows 文件锁。
6. 手动执行同参数 `rcedit` 写入版本资源，退出码 0。
7. 清理 `dist/win-unpacked` 后重新执行 `npx electron-builder --win --config.asar=true`，完整生成安装包、blockmap 与 `latest.yml`。

## 产物

- 安装包：`dist/shenyi-assistant Setup 3.36.0.exe`
- 大小：`198,976,514 bytes`（约 `189.7 MB`）
- SHA256：`E014FFAF5B59F0E4F5F9B51AC25C557842D0BC06BB34D5FACA7487092733EAE2`
- Blockmap：`dist/shenyi-assistant Setup 3.36.0.exe.blockmap`
- `latest.yml`：`version: 3.36.0`

## 验证结果

- `npm run type-check`：通过。
- `npm run test:services`：20 个文件 / 218 个测试全部通过。
- `npm run build:vue`：通过。
- 安装包元数据：`FileVersion: 3.36.0`、`ProductVersion: 3.36.0`。
- `win-unpacked/shenyi-assistant.exe` 元数据：`FileVersion: 3.36.0`、`ProductVersion: 3.36.0.0`。
- asar 内 `package.json` 版本：`3.36.0`。
- 安装包 SHA256：`E014FFAF5B59F0E4F5F9B51AC25C557842D0BC06BB34D5FACA7487092733EAE2`。

## 经验记录

### Windows 文件锁恢复路径

`rcedit` 报 `Unable to commit changes` 后，进程可能已经退出，但 Windows 对目标 exe 的写锁释放存在延迟。此时下一次构建会在 asar integrity 阶段报 `EBUSY`。可靠处理顺序是：

1. 先确认无 `shenyi` / `electron` / `rcedit` 进程残留。
2. 清理 `dist/win-unpacked` 半成品目录。
3. 手动执行同一组 `rcedit` 参数确认目标 exe 可写。
4. 再清理一次半成品目录，让构建从头生成。

禁止在未确认进程路径的情况下结束客户正在使用的安装版应用。

## 收尾

- 清理临时脚本：`scripts/cleanup-dist-3.36.0.ps1`。
- 保留最终安装包、blockmap、`latest.yml` 与 `win-unpacked` 构建产物。
