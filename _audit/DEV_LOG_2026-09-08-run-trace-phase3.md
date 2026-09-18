# 开发日志：运行记录三期复现到大纲工作台与主页编辑器（2026-09-08）

## 开发功能

将已在生成流水线验证成功的“运行记录”能力扩展为全应用三来源旁路记录，覆盖：

1. **三来源运行模型**：`src/stores/runTrace.ts` 新增 `pipeline / outline / home` 来源与 `sourceName`、`target`、`context` 字段；当前运行 ID 与当前 API 调用 ID 按来源隔离，不同来源可并发记录，互不串线；同来源新运行开始时会自动把异常残留的 running 标记为 failed。
2. **通用运行记录面板**：从 `PipelinePanel.vue` 抽出 `src/components/common/RunTracePanel.vue`，沿用已定稿的“左侧运行列表 + 右侧详情四 Tab”居中大面板。面板支持来源筛选，三个入口共用一个组件。
3. **生成流水线回归**：`PipelinePanel.vue` 改为复用通用面板，原“运行记录”按钮、四 Tab、导出与复制能力保持不变，默认筛选流水线来源。
4. **大纲工作台接入**：`OutlineWorkspace.vue` 在“撤销 / 重做 / 复制 / 剪切”工具栏后新增“运行记录”按钮（`btn-ow-run-trace`），默认筛选 `outline` 来源；共创发送消息、API 调用、流式输出、取消与失败结束状态进入运行记录。
5. **主页编辑器接入**：`EditorPanel.vue` 在“去AI味 / AI命名”工具栏后新增“运行记录”按钮（`btn-editor-run-trace`），默认筛选 `home` 来源；提取记忆、生成正文、AI 命名接入 `runTracedHomeTool()`。
6. **主页 API 对话与去AI味接入**：`ChatPanel.vue` 记录主页 API 对话的生命周期、上下文、请求与流式输出，provider/API Key 早退路径也会结束 run，不残留 running；`useDeAi.ts` 记录去AI味处理、API 请求参数、返回、folder SKILL 执行事件与诊断。
7. **全量自动落盘与文件夹入口**：`electron/ipc/runTrace.js` 新增 `runTrace:save`，运行结束自动写入应用数据目录 `run-trace/{source}/`，写盘前在主进程递归脱敏；新增 `runTrace:openFolder`，可在面板中直接打开对应来源的记录文件夹；导出 IPC 不再重复写数据目录，避免双写。

## 交付目的

第三方 SKILL 制作方不再只能调试生成流水线。用户在大纲工作台共创、主页 API 对话、去AI味、AI 命名、提取记忆等场景遇到问题时，同样可以导出或复制一次运行的完整脱敏现场，用来判断是 SKILL 写法问题还是应用传参问题，同时不打断创作流程。

## 验证证据

- `npm run type-check`：通过。
- `npx vitest run src/stores/runTrace.spec.ts`：10 个用例通过，覆盖最近 20 次滚动窗口、同来源残留失败、三来源并发隔离、卸载中断、完整 API 调用与流式文本、导出脱敏。
- `npm run test:services`：14 个测试文件、149 个用例全部通过。
- `npm run build:vue`：通过。
- 源 Electron + CDP 验证（非网页模式、非开发者模式、非安装版）：
  - 主页编辑器按钮存在，顺序为“去AI味 · AI命名 · 运行记录”。
  - 真实点击“运行记录”后，居中面板正常打开与关闭。
  - 注入主页测试运行后，运行状态、API 调用、流式输出与返回记录均正常。
  - 自动落盘生成 `_data/run-trace/home/run-trace-CDP-验证运行-*.json`。
  - 磁盘 JSON 中 API Key 已脱敏：`Authorization: Bearer ***MASKED***`。
- 验证完成后 Electron 进程已关闭，临时 CDP 脚本与测试落盘文件已删除，`_data/run-trace/` 当前无测试残留。

## 客户验证重点

1. 在大纲工作台发送一条共创消息，再点击工具栏“运行记录”，确认默认看到大纲工作台来源。
2. 在主页 API 对话框发送一条消息，完成后点击主页编辑器工具栏“运行记录”，确认请求、流式输出、返回进入同一次运行。
3. 依次执行提取记忆、AI 命名、去AI味，确认各自形成独立运行记录，失败时错误原文保留。
4. 在面板中点击“打开运行记录文件夹”，确认按来源分目录：`pipeline / outline / home`。
5. 运行结束后检查应用数据目录 `run-trace/{source}/`，确认自动 JSON 存在且无 API Key。
6. 生成流水线再做一次生成，确认原运行记录面板和导出能力未回退。

## 遗留说明

- 大纲工作台与主页编辑器的真实 API 连通实操、真实工具调用与 Diff 审批路径未在本次源 Electron 自动验证中逐一触发，需客户实操确认；对应运行结构已接入，失败路径会保留错误现场。
- 大纲工作台与主页编辑器的运行记录尚未覆盖全部编辑器工具事件，本次先落生命周期、上下文、API、流式、folder SKILL 诊断与结束状态，后续可按调试需求补充事件粒度。
- 应用内仍保留最近 20 次运行；完整现场以磁盘自动落盘为准，不自动删除。
