# 2026-09-11 全应用深度递归检测

## 项目功能

在 3.35.0 大版本更新后，对全应用做一次递归质量检测，覆盖 IPC 通道对账、全量测试发现、渲染层事件监听生命周期、TODO/FIXME 残留、硬编码颜色与诊断输出扫描，并修复确认的两个真实问题。

## 用途

- 防止多轮大任务迭代后留下断链、监听泄漏、测试误报、参数漂移等隐性缺陷。
- 让全量测试重新成为可信的交付门槛，而不是被第三方调研缓存污染的噪声来源。
- 消除主页 API 对话框在组件卸载后的 window 事件监听残留，降低长会话和多窗口场景下的内存泄漏与重复触发风险。

## 检测范围与结论

1. IPC 对账：preload 暴露 63 个通道，main 注册 56 个；6 个差值均为主进程向渲染层发送的事件，发送端齐备，无真实断链。
2. 全量 Vitest：修复前 16 个失败套件全部来自 `_audit/research-cache/` 与 `scripts/tests/`；394 个真实测试全部通过，失败均为测试发现污染。
3. 渲染层事件监听：ChatPanel 的 `editor-action`、`diff-applied`、`diff-closed` 三个监听没有成对卸载。
4. TODO/FIXME 扫描：无遗留。
5. 轮询与流式清理：`agentStatus`、`mainNetStream`、App.vue 事件监听均已正确清理。
6. 硬编码颜色：69 处中绝大多数是 CSS 变量 fallback；集中在 G6 图表组件的部分为图表专用配色，本轮不改动。
7. 静默异常：AgentProgressPanel 的 `pollAgentStatus` catch 原为空注释，轮询失败无诊断输出。

## 修复内容

1. `vite.config.ts` 增加 Vitest `test.exclude`，排除 `_audit/research-cache/**`、`scripts/tests/**` 与构建产物，同时保留 `test:services` 显式文件列表行为。
2. `ChatPanel.vue` 将 `diff-applied`、`diff-closed` 匿名监听改为具名函数，并在 `onUnmounted` 中统一移除 `editor-action`、`diff-applied`、`diff-closed`。
3. `AgentProgressPanel.vue` 的轮询失败 catch 增加 `console.warn` 诊断输出，保留轮询不中断的行为。

## 验证结果

- `npx vitest list` 输出中不再包含 `research-cache` 或 `scripts/tests`。
- `npm run test:services`：20 个文件 / 216 个测试全部通过。
- `npm run type-check`：通过。
- `npx vitest run`：53 个文件 / 394 个测试全部通过，16 个污染套件清零。
- 补修后复跑：`npm run type-check` 通过；`npx vitest run` 53 文件 / 394 测试全部通过。

## 经验记录

- 调研缓存和自研验证脚本目录必须进入测试排除清单。调研代码进入仓库时，测试发现边界也要同步交付，否则全量测试会长期带着假红灯，掩盖真实回归。
- window 事件监听必须在同一个组件里完成注册与卸载。匿名函数一旦注册就无法清理，组件重复挂载会累积监听；正确做法是具名 handler + `onUnmounted` 成对移除。
- 后台轮询的 catch 可以不中断业务，但不能完全无痕；至少要有诊断输出，否则 IPC 异常会被误判为“面板正常但没数据”。
