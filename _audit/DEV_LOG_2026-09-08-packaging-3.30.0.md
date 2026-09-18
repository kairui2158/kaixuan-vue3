# 开发日志：3.30.0 封装交付（2026-09-08）

## 开发功能

将“运行记录三期”与“对话上下文重置”封装为 `3.30.0` 安装包。本次版本包含：

1. 运行记录从生成流水线复现到大纲工作台与主页编辑器，三处来源互相隔离。
2. 通用运行记录面板：左侧运行列表 + 右侧详情 Tab，支持按次导出 JSON、复制片段。
3. 生成过程自动落盘到应用数据目录 `run-trace/`，并支持打开记录文件夹。
4. 记录内容覆盖 API 请求、流式输出、返回全文、技能诊断与时间线事件，导出与复制均递归脱敏 API Key。
5. 主页编辑器与大纲工作台新增“重置对话”按钮，同时清空 UI 会话与 ConversationContextService 作用域上下文，帮助用户在对话跑偏后重新开始。

## 交付目的

让客户与第三方 SKILL 制作方在三大创作现场都能拿到完整可调试运行记录，并给用户提供对话上下文一键重置能力，避免长对话纠偏失败后只能重启应用。

## 验证证据

- 封装前已通过 `npm run type-check`。
- 服务测试：`npm run test:services`，14 个文件 149 用例通过。
- 构建命令：`npm run build`，Vite 构建与 electron-builder NSIS 打包完成，退出码 0。
- 产物：`dist/神意助手-Setup-3.30.0.exe`，大小 `129,781,757` 字节。
- 产物：`dist/神意助手-Setup-3.30.0.exe.blockmap`，大小 `135,147` 字节。
- SHA256：`A13F21B1C8F981C58C7A7D1D951858E227FD065AE1E44B25271499991681B6A6`。
- `dist/latest.yml` 已更新为 `3.30.0`，size 为 `129781757`，sha512 与产物一致。
- app.asar 版本验证：`@electron/asar` 读取 `package.json`，输出 `3.30.0`。
- app.asar 内容验证：`electron/ipc/runTrace.js` 包含 `runTrace:save` 与 `runTrace:openFolder`；渲染产物 `dist-renderer/assets/index-B3AR1MCG.js` 包含 `btn-reset-conversation` 与 `btn-ow-reset-conversation`，验证脚本输出 `package verification: PASS`。
- 源 Electron + CDP 真实 UI 验证已完成：主页重置后气泡 6→0，大纲工作台重置后气泡 2→0，详见 [DEV_LOG_2026-09-08-reset-conversation.md](DEV_LOG_2026-09-08-reset-conversation.md)。
- 签名状态：未签名，与历史版本保持一致。

## 客户验证重点

1. 安装包版本显示为 `3.30.0`。
2. 在生成流水线、大纲工作台、主页编辑器分别执行一次生成或 API 对话，再打开各自的运行记录入口，确认三处记录来源正确、不互相串数据。
3. 在大纲工作台和主页编辑器分别导出一次运行记录 JSON，确认默认文件名、内容完整性与 API Key 脱敏。
4. 打开应用数据目录 `run-trace/`，确认自动落盘文件存在。
5. 在主页和大纲工作台分别与 API 产生几轮对话后点击“重置对话”，确认弹窗确认后气泡清空、提示出现，再次生成时上下文重新初始化。
6. 主页重置不影响大纲工作台上下文，大纲工作台重置不影响主页上下文。

## 遗留说明

- 本包未做安装版 CDP 实操验证，安装版体验由客户实测确认。
- dist 目录内仍保留历史版本安装包；此前仅清理过指定旧包，本轮未获得继续清理授权。
