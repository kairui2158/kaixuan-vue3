# 开发日志：3.28.6 封装交付（2026-09-08）

## 开发功能

将 Folder 技能导入状态与单个导入预览修复封装为 `3.28.6` 安装包。

本次版本包含：

1. `folderStatusMap` 写入键统一走 `normalizeSkillId(id, 'folder')`，修复导入成功后卡片误显示“路径失效”。
2. 单个“导入文件夹技能”改为“选择文件夹 -> 预览 -> 冲突策略 -> 确认导入”两段式流程。
3. 单个导入预览使用 `folder:` 归一化 ID 判断冲突，同名文本技能不会被误判为重复。
4. 新增 3 个服务回归用例，覆盖单个预览、跨规格共存和策略切换。

## 交付目的

向客户提供可直接安装的 `3.28.6` 版本，验证 Folder 技能导入后的路径状态显示、单个导入预览弹窗、冲突策略切换和确认导入闭环。

## 验证证据

- 构建前 Electron 进程检查：无残留进程。
- `npm run type-check`：退出码 0，输出 `shenyi-assistant@3.28.6 type-check`。
- `npm run test:services`：14 个测试文件通过，149 个测试通过，输出 `Test Files 14 passed (14)`、`Tests 149 passed (149)`。
- `npm run build`：Vite 主构建 1607 modules transformed，providerProtocols 构建 8.18 kB，electron-builder NSIS 打包完成，退出码 0。
- 产物：`dist/神意助手-Setup-3.28.6.exe`，大小 `129,773,401` 字节。
- 产物：`dist/神意助手-Setup-3.28.6.exe.blockmap`，大小 `134,750` 字节。
- SHA256：`8DD5B7902988B0EE190B6816C86D987F5470A3BCC53DB45A289581FD19FD2CC6`。
- app.asar 版本验证：通过 `@electron/asar` API 读取 `package.json`，输出 `shenyi-assistant 3.28.6`。
- 构建产物 `dist-renderer/assets/SkillSettings-rqxr52J7.js` 可检索到单个导入预览弹窗（`导入文件夹技能`、`btn-confirm-folder-import`）与归一化状态键逻辑（`normalizeSkillId`、`路径有效`），确认修复内容进入构建。
- 签名状态：未签名，electron-builder 日志显示 `no signing info identified, signing is skipped`，与历史版本保持一致。

## 客户验证重点

1. 安装包版本显示为 `3.28.6`。
2. 设置页技能栏点击“导入文件夹技能”，选择文件夹后应先出现导入预览弹窗，而不是直接入库。
3. 预览弹窗可切换“跳过重复 / 覆盖已有技能”，确认导入后卡片状态应显示“路径有效”，不应再出现“路径失效”。
4. 同名文本技能与文件夹技能应继续共存，预览不应把文本技能判定为重复。

## 遗留说明

- 源 Electron 真实 UI 验证已在封装前完成并记录于 [DEV_LOG_2026-09-08-folder-skill-import-preview-repair.md](DEV_LOG_2026-09-08-folder-skill-import-preview-repair.md)。
- 本包未做安装版 CDP 实操验证，安装版体验由客户实测确认。
