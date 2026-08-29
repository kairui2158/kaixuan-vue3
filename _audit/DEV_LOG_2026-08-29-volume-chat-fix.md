# 主页卷纲按钮对话栏消失修复日志

## 问题现象
客户/用户实测：章节树点击"纲"按钮打开卷纲标签后，右侧 AI 对话栏整体消失。点击前对话栏正常显示（宽 520px），点击后 `#chat-panel` 从 DOM 中被卸载。

## 排查结论
1. 主页面结构未被改动：`src/App.vue:32` 的 `<ChatPanel />` 一直无条件渲染；最近提交 `cc694dc` 只改了 `PipelinePanel.vue`（章节层）。
2. 运行态确认：点击"纲"前对话栏存在，点击后从 DOM 消失，说明是 Vue 渲染崩溃导致组件卸载。
3. 构建产物报错提取：`TypeError: n.map is not a function`（`index-CfKn9tmI.js:197:2796`）。

## 根因
`src/stores/pipeline.ts` 中 `getStepSkills(step)` 和 `getStepAgents(step)` 是 async 函数（内部走 `window.electronAPI.storageRead`），但 `ChatPanel.vue` 在同步 `computed` 里直接调用并对返回值执行 `.map()`。Promise 对象上没有 `.map` 方法，抛出 TypeError 后 Vue 渲染树崩溃，`ChatPanel` 整体卸载，表现为"对话栏消失"。

触发链：点击"纲" → `ChapterTree.vue:136` `openVolumeOutline` 打开 `mode:'vol-outline'` 标签 → `ChatPanel` 的同步 computed 立即执行 → Promise.map 崩溃 → 组件卸载。

## 修改内容
`src/components/chat/ChatPanel.vue`（+20/-21 行）：
1. 删除 `syncedAgentName` / `syncedSkillNames` 两个同步 computed，改为 `ref('')`。
2. 新增异步函数 `refreshSyncedPipelineInfo()`：`Promise.all` 同时等待 `getStepAgents` 和 `getStepSkills`。
3. 用 `syncedInfoToken` 计数器防止竞态覆盖（快速切换标签时旧请求结果不回写）。
4. 新增 watch：`editorStore.activeTab?.mode`（immediate: true）和 `[agentStore.agents.length, skillStore.skills.length]`，保证标签切换和配置变化都能刷新同步芯片。

## 验证证据
1. `npx vite build` 成功，新产物 `index-zoYRAEA2.js`。
2. 杀 Electron 进程 → `start-electron.bat` 重启 → CDP 探针实测：点击"纲"前后 `#chat-panel` 均存在（520px），editor 从 1128px 让位给对话栏，console 无任何错误。
3. `capture_volume_chat_fix.cjs` 确认：editorTitle = "第三卷 · 雷泽暗流 - 卷纲"，chatPanel=true。
4. 截图证据：`_audit/tmp/volume_outline_chat_fix.png`（1904x975），视觉确认编辑器卷纲标签 + 右侧对话栏同时存在。

## 边界说明
验证会话中卷纲层未配置 step agent/skill，同步芯片为空字符串属正常空态，不是本次缺陷。

## 遗留风险
`PipelinePanel.vue:1412` `getStepSkillIds()` 内 `pipelineStore.getStepSkills(step) as unknown as string[]` 也是同步调用 async 函数的同类隐患：Promise 是 truthy 但 `.length` 为 undefined，该 fallback 分支静默失效（不崩溃但存储配置可能被忽略）。本次未修，待用户决策是否另开任务。
