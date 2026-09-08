# 开发日志：3.29.0 封装交付（2026-09-08）

## 开发功能

将生成流水线“运行记录”功能封装为 `3.29.0` 安装包。本次版本包含：

1. 居中运行记录大面板：左侧最近 20 次运行列表 + 右侧详情四 Tab（时间线、API 调用、技能诊断、导出/复制）。
2. 单次运行完整记录请求消息、流式输出、返回全文、usage、folder SKILL 诊断与时间线事件，运行内部不设条数上限。
3. 按次导出 JSON；主进程同步写入应用数据目录 `run-trace/` 全量现场。
4. 导出与复制双侧递归脱敏 API Key。
5. 旧执行日志的点赞、点踩、优化建议、删除摘要继续可用。

## 交付目的

向客户与第三方 SKILL 制作方交付可调试的完整运行现场。用户在真实生成后可按次导出或复制片段，SKILL 制作方据此定位提示词、协议、流式输出与技能诊断问题。

## 验证证据

- 封装前已通过 `npm run type-check`、`npm run test:services`（14 个文件 149 用例）、`npx vitest run src/stores/runTrace.spec.ts`（7 用例）。
- `npm run build`：Vite 主构建 1608 modules transformed，providerProtocols 构建 8.18 kB，electron-builder NSIS 打包完成，退出码 0。
- 产物：`dist/神意助手-Setup-3.29.0.exe`，大小 `129,777,964` 字节。
- 产物：`dist/神意助手-Setup-3.29.0.exe.blockmap`，大小 `135,196` 字节。
- SHA256：`0FC79FCCA8B250AD44B73EA3490C2AE4A6A14D2A490029F288653FCE26A01D01`。
- app.asar 版本验证：通过 `@electron/asar` API 读取 `package.json`，输出 `shenyi-assistant 3.29.0`。
- 构建产物 `dist-renderer/assets/index-BX9LFfmC.js` 可检索到 `btn-run-trace` 与 `运行记录` 文案，确认新功能进入构建。
- 签名状态：未签名，electron-builder 日志显示 `no signing info identified, signing is skipped`，与历史版本保持一致。

## 客户验证重点

1. 安装包版本显示为 `3.29.0`。
2. 打开生成流水线，点击顶栏“运行记录”，应出现居中大面板。
3. 执行一次设定 / 卷纲 / 章节 / 正文生成，重新打开运行记录，左侧应出现本次运行。
4. 切换右侧四个 Tab，确认时间线、API 调用、技能诊断、导出/复制均可见且内容不截断。
5. 点击“导出本次 JSON”，确认默认文件名为 `run-trace-层级-时间.json`，并检查导出内容不含真实 API Key。
6. 打开应用数据目录 `run-trace/`，确认同名全量现场文件存在。

## 遗留说明

- 本包未做安装版 CDP 实操验证，安装版体验由客户实测确认。
- 源 Electron + CDP 真实 UI 验证已在封装前完成，详见 [DEV_LOG_2026-09-08-run-trace.md](DEV_LOG_2026-09-08-run-trace.md)。
