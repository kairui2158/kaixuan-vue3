# 2026-09-14 API 对话框输入区统一改造

## 任务

- 新增共享组件 `ApiChatInput.vue`，统一主页 `ChatPanel` 与大纲工作台 `OutlineWorkspace` 的 API 对话框输入区。
- 输入区由原先约 36px 单行框改为 60px 最小高度，可随内容自动增高，最高 120px。
- 新增「Enter 发送 / Enter 换行」双模式，持久化到应用设置；Enter 发送模式下 `Shift+Enter` 换行，Enter 换行模式下 `Ctrl/Meta+Enter` 发送。
- 保留原 `user-input`、`btn-send`、`btn-reset-conversation`、`ow-chat-input`、`btn-ow-send`、`btn-ow-reset-conversation` 等入口 ID，避免破坏测试与既有联动。

## 真实 UI 验证

本轮使用源 Electron、Playwright CDP 和隔离 profile `D:\codex\novel-workshop-vue3\.userdata-chatinput-test` 做真实操作验证。验证前先执行 `npm run build:vue`，确认探针读取的是当前渲染产物。

| 编号 | 验证项 | 结果 | 证据 |
|---|---|---|---|
| V1 | `npm run type-check` | PASS | 无 TypeScript 错误 |
| V2 | `npm run test:services` | PASS | 216 个测试通过 |
| V3 | `npm run build:vue` | PASS | 主产物与协议产物构建成功 |
| V4 | 主页输入框高度 | PASS | CDP 实测 60px |
| V5 | Enter 发送模式：Enter 发送并清空输入 | PASS | 源 Electron 实测 |
| V6 | Enter 发送模式：Shift+Enter 换行 | PASS | 输入值实测为「第一行\n第二行」 |
| V7 | Enter 换行模式：Enter 换行 | PASS | 输入值保留换行 |
| V8 | Enter 换行模式：Ctrl/Meta+Enter 发送 | PASS | 源 Electron 实测 |
| V9 | 输入模式持久化 | PASS | `_data/wa_appSettings.json` 写入 `"chatInputMode":"enter-newline"`，重启后大纲工作台仍显示该模式 |
| V10 | 大纲工作台输入框高度与模式开关 | PASS | CDP 实测 60px，两个模式按钮状态同步 |
| V11 | 大纲工作台重置对话 | PASS | 确认弹窗可点击，default 会话清空 |
| V12 | 主页重置对话 | PASS | 关闭前置工作台层后确认弹窗打开，danger 按钮可点击，消息清空 |

## 交接缺陷复核结论

交接记录中提到的「主页非流式路径重置失效」经过复测判为探针场景误判，不是产品缺陷：

1. 当时主页 `generationStatus` 为 `error`，`isStreaming` 已为 false，重置按钮没有被业务守卫拦截。
2. 真实点击失败的原因是当时大纲工作台全屏层 `#outline-workspace` 仍然打开，Playwright 记录到 `<div class="ow-overlay" id="outline-workspace"> intercepts pointer events`。
3. 关闭大纲工作台后复测，`#btn-reset-conversation` 正常打开「重置对话」确认弹窗；点击「清空」后主页消息数量从 8 清为 0，确认层关闭。

因此本轮不修改 `resetConversation()` 业务逻辑，也不扩大改动圈。

## 收尾

- 版本号从 3.42.2 升级到 3.43.0。
- 删除本轮临时 CDP 探针与隔离 profile。
- 后续封装使用 `npm run build`，并复核 NSIS 配置仍允许选择安装路径。
