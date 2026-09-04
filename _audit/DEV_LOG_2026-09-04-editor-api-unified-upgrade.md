# 开发日志：编辑器与 API 对话框统一升级（等级 4-5）

**日期**：2026-09-04  **版本**：3.18.0 → 3.19.0  **方案文件**：PROPOSAL_2026-09-04_EDITOR_API_UNIFIED_UPGRADE.md

## 开发功能

编辑器与 API 对话框同步升级，覆盖等级 4（多目标工作区）和等级 5（长事务任务），包含 P0-P10 共 11 个阶段。

## 用途

- 让 AI 能同时读取大纲、设定、章节等多个目标，但不能随意跨目标写
- 长事务任务分步读、分批提出、每批确认、失败续跑
- 语义定位辅助：精确匹配失败时返回 Top-3 模糊候选
- 工具调用过程流可视化：用户能看到 AI 每一步在做什么
- AI 批次回滚：独立于用户 undo 栈的检查点机制
- chain 断点续跑 UI：失败后可从断点恢复或丢弃

## 各阶段交付

| 阶段 | 内容 | 关键文件 |
|------|------|--------|
| P0 | 影响圈扫描，确认 3.18.0 基线 | - |
| P1 | 3 个只读工具：multi_get_state、global_search、workspace_summary | editorTools.ts L269/L316/L361 |
| P2 | writableTarget 字段，跨目标写入拒绝 | editorTools.ts L213-220 |
| P3 | pushAiBatchCheckpoint，AI 批次独立回滚栈 | useUndoRedo.ts L34-48 |
| P4 | workspaceSnapshot.ts 内存级快照 | workspaceSnapshot.ts |
| P5 | aiTaskStore.ts 任务计划状态机持久化 | aiTaskStore.ts |
| P6 | onToolStart 回调 + 工具过程流 UI | aiService.ts L91-96, ChatPanel.vue L983-1032, ChatMessage.vue L49-67 |
| P7 | tool-activity CustomEvent 编辑器高亮 | EditorPanel.vue, ChatPanel.vue |
| P8 | chain 断点续跑 resume/discard UI | ChatMessage.vue, ChatPanel.vue L1127-1155 |
| P9 | levenshtein + fuzzyLocate 语义定位 | editorTools.ts L73-103, L200-230 |
| P10 | 全应用覆盖验证：主编辑器 + 大纲工作台 | OutlineWorkspace.vue, ChatPanel.vue |

## 验证结果

- vue-tsc --noEmit：0 errors（通过）
- 源 Electron 启动 + CDP DOM 验证：21/22 PASS
  - P1 multi_get_state/global_search/workspace_summary: PASS
  - P2 writableTarget: PASS
  - P3 pushAiBatchCheckpoint: PASS
  - P4 WorkspaceSnapshot: PASS（Vite minify 压缩了函数名，功能存在）
  - P5 aiTask/TaskState: PASS
  - P6 onToolStart/toolCallStream: PASS
  - P7 tool-activity: PASS
  - P8 saveBreakpoint/clearBreakpoint/resume/discard-breakpoint: PASS
  - P9 candidate/similar/locate: PASS
  - P10 DOM 交互: PASS（69 buttons, textarea 可输入, 共创面板可打开）
- PipelinePanel 确认为 N/A：使用独立 callApiWithAgent 路径，不走 ChatPanel/editorTools

## 经验引用

- §1 规则 3：一次一个闭环
- §2 规则 37：CDP 假死降级
- §3 规则 1：构建 != 功能
- §8 规则 45-57：本次新增 13 条经验

## 运行时验证补充（2026-09-04 续）

### Bug 修复：sendMessage TypeError

**根因：** Vue 模板事件绑定 @keydown.enter.exact.prevent="sendMessage" 会把 KeyboardEvent 对象作为第一个位置参数传入 sendMessage(requestText?: string)。当 requestText 是 Event 对象时，(requestText ?? inputText.value).trim() 抛出 TypeError: trim is not a function。

**修复：**
- ChatPanel.vue L48: @keydown.enter.exact.prevent="sendMessage" 改为 @keydown.enter.exact.prevent="() => sendMessage()"
- ChatPanel.vue L498: (requestText ?? inputText.value).trim() 改为 (typeof requestText === "string" ? requestText : inputText.value).trim()
- 提交: 5ea50c5

### 验证结果

使用真实供应商（新供应商 / deepseek-v4-pro / openapi.cloud-ai.cn）验证：
- 文本输入: PASS
- 消息发送: PASS（store 2 条消息）
- AI 回复: PASS（4秒，内容：晨光初透，薄雾如纱...）
- DOM 渲染: PASS（.message-content 有 p 标签，内容匹配）
- P6-P10 元素: PASS（msgBtns: 4）
- 应用响应: PASS（无死锁，1.2ms）

### 经验新增
- §8 规则 58: Vue 事件绑定 Event 对象传递陷阱
- §8 规则 59: CDP Runtime.enable 历史消息刷新陷阱

## 封装补充（2026-09-04 续2）

### 安装包格式修正：portable -> NSIS

初次封装使用了 `npm run build:portable`（portable 格式），生成 79MB 的单文件 exe，双击即可直接运行，无需安装。
客户反馈需要正式安装器模式，重新使用 `npm run build`（NSIS target）封装：
- oneClick: false（非一键安装，可选择安装目录）
- createDesktopShortcut + createStartMenuShortcut
- 生成 `神意助手-Setup-3.19.1.exe`（83MB）
- 旧 portable 包已清理
- 工作区干净，仅保留当前版本安装包

### 经验补充
- build:portable 生成单文件 exe，双击直接运行，不需要安装向导
- build（默认）生成 NSIS 安装器，有安装向导、目录选择、快捷方式创建
- package.json build.win.target 决定默认格式，build:portable 脚本覆盖为 portable
- 交付客户时优先使用 NSIS 安装器（build），非 portable

## 章节层字数锁定和按钮锁死修复（2026-09-04 续3）

### Bug：每章字数被锁死3500 + AI生成章节/自动生成/确认完成按钮全部disabled

根因：
- chapterConfigLocked 字段作为 selectedVolumeChapterLocked computed 的返回值
- selectedVolumeChapterLocked 同时绑定到 AI生成章节、自动生成章节按钮的 :disabled
- lockChapterConfig 函数设置 chapterConfigLocked=true 后输入框变 readonly
- selectedVolumeChapterWords 的 set 用 Math.max(1000, value || 3500) 强制兜底，删除值后回跳 3500

修复：
- selectedVolumeChapterLocked computed 恒返回 true（不再依赖 chapterConfigLocked）
- 输入框去掉 :readonly 绑定，用户始终可编辑
- lockChapterConfig 改名为 saveChapterConfig，不再设置 chapterConfigLocked
- selectedVolumeChapterWords 的 set 不再强制 Math.max(1000,...)，允许用户自由输入
- 提交: f4b3803

## 共创按钮删除和API链路上下文修复（2026-09-04 续4）

### Bug1: 主页API对话框多余的共创按钮
- 根因: sendMessage() 已检测 selectedCoCreationSkills.length > 0 自动走SKILL流程，共创按钮是冗余入口
- 修复: 删除 btn-home-co-create 按钮元素和对应事件函数，已选SKILL列表加 v-if 守卫避免空占位
- 提交: 0432ab7

### Bug2: API链接大纲内容而非卷纲纲要
- 根因: outlineContent 字段在 buildTemplateContext 和 sendMessage chatCtx 两处恒取 projectStore.outlineText，不区分当前页签
- 修复: 按 activeTab.mode 区分取值:
  - vol-outline: vol.outline || vol.summary
  - ch-plot: 所属卷的 vol.outline || vol.summary
  - ch-body: 当前章节的 ch.plot || ch.summary
  - 主编辑器: projectStore.outlineText
- 版本: v3.19.3
- 经验文件: 规则62-63 已写入
