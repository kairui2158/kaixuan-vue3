# 2026-09-20 API 输入框实时状态流

## 背景

用户反馈大纲工作台 API 输入区上方只有静态“正在连接 API...”，下方又显示“正在等待 API 返回...”，无法判断生成到底推进到哪一层，空等时间不可见。

## 过程纠偏

第一轮实现未先提交方案审核，直接在大纲工作台和主页 ChatPanel 内各自复制 `liveStatusLines`，并把 runTrace 事件尾部直接渲染进状态条。用户指出违反 M18/M17 后复盘结论：不成熟。

已撤回该实现，并重新确认范围：工具调用不参与滚动显示；工具是否调用、调用结果继续由运行记录与工具过程区承担，状态条只回答“连接、流式接收、重试、终态”。

## 实现

- 新增共享 composable `src/composables/useLiveApiStatus.ts`：
  - 单源状态映射：`connecting / streaming / retrying / terminal / silent`
  - 只消费活跃状态、入口状态文案、最新 API call 的 `status / streamText.length / retryStrategy`
  - 不消费工具名、工具结果、工具事件，杜绝工具信息进入 UI 状态流
- 大纲工作台 `OutlineWorkspace.vue` 消费共享 composable，替换原单行静态状态
- 主页 `ChatPanel.vue` 消费同一 composable，替换原单行 `generationMessage`
- 两入口只保留展示样式差异，状态语义完全同源
- 修正第一轮 `<span>` 包 `<div>` 的错误 HTML 结构，主页改为嵌套 `<span>`

## 验证

- `npx vitest run src/composables/useLiveApiStatus.spec.ts`：1 个测试文件、6 个用例全部通过
- `npm run type-check`：通过
- `npm run test:services`：73 个测试文件、698 个用例全部通过
- `npm run verify:production-wiring`：277 个模块、913 条依赖，无违规
- `npm run build:vue`：renderer 与 protocols 构建通过
- 全仓 `rg useLiveApiStatus|liveApiStatusLines|ow-live-status-line|chat-live-status-line`：仅共享模块、两个消费入口与测试文件命中

## Electron 级真实 UI 实测

补做真实 Electron + CDP + Playwright UI 实测，脚本为 `scripts/verify-api-live-status-electron.mjs`。

### 实测场景与结果

1. 大纲工作台纯流式：PASS。状态条采样覆盖“正在连接 API...”、“正在生成... / 流式接收中 · 已接收 N 字”、终态；runTrace 中 API call 全部 closed，`streamLength` 与正文长度一致。
2. 大纲工作台工具轮：PASS。提示词明确要求“读取当前大纲编辑器内容”，真实触发 `editor.get_state` 工具；工具信息只出现在 `.ow-tool-stream` 工具流区，状态条全程只显示“正在生成...”，未泄漏工具名、“正在执行工具”或“工具返回：”。runTrace 中一条逻辑 API call 内记录 2 条物理请求，工具名包含 `editor.get_state`。
3. 主页纯流式：PASS。状态条同样覆盖连接、流式计数与终态；runTrace 中 API call 全部 closed，`streamLength` 与正文长度一致。

命令输出关键行：`===== API LIVE STATUS ELECTRON E2E PASSED =====`。

### 截图证据

目录：`_data/api-live-status-screenshots/`

- outline：30 帧
- outline-tool：3 帧
- home：30 帧

人工目检 `outline-tool-01.png`：状态条“正在生成...”与工具流区 `editor.get_state` 明确分离、无重叠；`home-01.png`：主页状态条与滚动信息正常。所有截图帧均为真实非空帧。

### 测试脚本复盘

第一轮失败不是产品状态条缺陷，而是测试脚本自身问题：

- 场景间未清空对话历史，导致第二轮意图路由判为 `discuss`，未进入读编辑器工具面。
- 旧气泡的工具文案被误算进“工具阶段”采样。
- 主页入口按钮 ID 写错，点的是不存在的 `#btn-home`。

修复后脚本在每个工具场景前重置对话并确认旧气泡清空；工具断言只看本轮新增 `.ow-tool-stream .ow-tool-stream-name`；主页入口改为关闭大纲工作台后等待 `#user-input`。

### 记录口径说明

大纲直写对话中，两轮 HTTP 请求会记录为一条逻辑 `apiCall` 下的 `physicalCalls`（数量 >= 2），`toolCalls` 记录工具名。这是设计行为，不是漏记；调试时应优先看 `physicalCalls` 与 `toolCalls`，不能只看顶层 `apiCalls` 数量。

### 回归验证

- `npm run test:services -- src/composables/useLiveApiStatus.spec.ts`：1 个测试文件、6 个用例全部通过。
- `node scripts/verify-api-live-status-electron.mjs`：三场景全部 PASS。
