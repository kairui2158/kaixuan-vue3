# 2026-09-11 3.35.0 版本封装日志

## 项目功能

将大纲工作台长文档共创底座 3.35.0 版本封装为 Windows 安装包，供客户实操验证。

## 用途

- 发布包含阶段 1 至阶段 4 全部功能的大纲工作台长文档共创底座。
- 提供可分发安装包 `dist/shenyi-assistant Setup 3.35.0.exe`。
- 记录本次封装遇到的 Windows 文件锁问题与处理方式，避免后续重复踩坑。

## 执行过程

1. 确认 `package.json` 与 `package-lock.json` 版本号为 `3.35.0`。
2. 清理 `dist/win-unpacked` 半成品目录，确认 `shenyi-assistant.exe` 不存在。
3. 执行 `npm run build`，仍出现 `EBUSY` 锁定。
4. 排查发现源 Electron CDP 验证实例仍在运行：
   - 父进程：`node_modules/electron/dist/electron.exe . --remote-debugging-port=9227`
   - 错误来源不是安装版应用，而是源码验证实例残留。
5. 精准关闭源验证实例父进程，随后子进程全部退出。
6. 再次清理半成品目录并重新打包，成功生成安装包。
7. 验证安装包元数据、asar 内版本号、文件大小与 SHA256。

## 产物

- 安装包：`dist/shenyi-assistant Setup 3.35.0.exe`
- 大小：`198,969,365 bytes`（约 `189.8 MB`）
- SHA256：`36CF93AEA20F890E5A7297408C6297E35D10848C601F8B5DF3D1C033D491A2B9`
- `app.asar` 大小：`379,753,196 bytes`

## 验证结果

- `npm run type-check`：通过。
- `npm run test:services`：20 个文件 / 216 个测试全部通过。
- `npm run build:vue`：通过。
- 源 Electron CDP 探针：阶段 1、阶段 2、阶段 2 SKILL、阶段 4、流水线冒烟全部通过。
- 安装包元数据：
  - `FileVersion: 3.35.0`
  - `ProductVersion: 3.35.0`
  - `FileDescription: 神意助手 - AI驱动的桌面小说写作应用`
  - `ProductName: shenyi-assistant`
  - `CompanyName: kaixuan`
- asar 内 `package.json` 版本：`3.35.0`

## 经验记录

### EBUSY 根因

本次 `EBUSY` 不是杀毒软件或目录句柄问题，而是源 Electron CDP 验证实例未退出。
该实例由源码目录启动，路径为：

```text
node_modules\electron\dist\electron.exe . --remote-debugging-port=9227
```

它不占用 `dist/win-unpacked/shenyi-assistant.exe` 本身，但会让构建产物写入与资源更新过程不稳定。

### 处理原则

1. 遇到 `EBUSY` 时先执行进程排查，确认是否残留源 Electron 验证实例。
2. 只精准关闭由本仓库源码启动的验证进程，禁止误杀客户正在使用的应用。
3. 关闭后清理 `dist/win-unpacked` 半成品目录，再重新打包。
4. `rcedit` 的 `Unable to commit changes` 若在重试后继续完成，需以最终安装包元数据验证为准，不能只看构建日志判断成败。

## 收尾

- 清理临时脚本：`scripts/cleanup-dist-3.35.0.ps1`
- 保留最终安装包、`blockmap`、`latest.yml` 与 `win-unpacked` 构建产物。
