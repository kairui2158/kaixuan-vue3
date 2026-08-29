# 2026-08-24 大纲工作台共创流式输出

## 目标

将大纲工作台 AI 共创从“等待完整响应后一次性显示”改为流式显示，并提供可验证的取消生成路径。

## 根因

`src/components/common/OutlineWorkspace.vue` 的 `askAi()` 明确使用 `stream: false`，且没有临时助手消息、AbortController 或取消按钮。供应商即使已经开始返回内容，界面也只能等完整请求结束。

## 修改

- 改为 `stream: true`，传递 `signal` 和 `onChunk`。
- 增加临时流式气泡，接收 aiService 的累计文本并替换显示，避免重复追加。
- 增加连接中、首字节、生成中字数状态。
- 增加取消生成按钮；取消时不写入半截助手消息。
- 发送和重生成期间禁止并发请求；成功完成后才持久化正式助手消息。

## 验证

- `npm run build:vue`：Vite 175 modules transformed，构建成功。
- 源文件 Electron：`start-electron.bat`，CDP 端口 9227。
- 发送后 700ms：`#btn-ow-cancel-generation=1`、`#ow-streaming-message=1`、状态为“正在连接 API...”。
- 取消路径：立即点击取消后 `sendButton=1`、`cancelButton=0`、`stream=0`，消息数仅增加用户消息，未出现半截助手消息。
- 一次较慢请求在两次脚本间自然结束，后续取消按钮不存在；该结果只说明请求已结束，不作为取消路径证据。

## 经验

供应商响应速度与应用可见性必须分开诊断：供应商决定首字节和总耗时，应用决定是否实时呈现、是否能取消、是否会留下半截记录。发现固定 `stream:false` 时，必须改造完整的 UI 状态闭环，不能只把参数改成 `true`。
