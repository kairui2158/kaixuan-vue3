# Vue3 组件源码功能清单

> 生成时间：2026-08-09
> 分析文件数：20（成功 17，未找到 3）

---

## 1. EditorPanel.vue

`src/components/editor/EditorPanel.vue` - 编辑器主面板

- **按钮列表**：
  - undo → `undo()`
  - redo → `redo()`
  - 生成 → `generateContent()`
  - 保存 → `save()`（Ctrl+S 快捷键）
  - 导出 → `exportMenu = !exportMenu`（切换下拉）
  - Markdown (.md) → `exportChapter(''md'')`
  - 纯文本 (.txt) → `exportChapter(''txt'')`
  - EPUB (.epub) → `exportChapter(''epub'')`
  - 去AI味 → `triggerDeAi()`（disabled: `deAiStore.isProcessing`）
  - tab 关闭 x → `editorStore.closeTab(tab.id)`
  - 下一个 → `findNext()`
  - 全部替换 → `replaceAll()`
  - 查找关闭 x → `editorStore.toggleFind()`
- **下拉框列表**：无原生 select，导出为自定义 dropdown
- **输入框列表**：
  - `editorStore.findQuery`（查找）
  - `editorStore.replaceQuery`（替换）
  - textarea `:value=''activeTab.content''` → `onInput` → `editorStore.updateContent`
- **面板/条件渲染**：
  - `v-if=''editorStore.tabs.length > 0''` 章节标签栏
  - `v-if=''editorStore.findVisible''` 查找替换栏
  - `v-if=''exportMenu''` 导出下拉菜单
- **关键逻辑**：
  - `save()` 遍历 projectStore.chapters 找到对应章节写入 body 并保存
  - `generateContent()` 派发 `generate-body` CustomEvent
  - `triggerDeAi()` 调用 `deAiProcess` 处理文本
  - `exportChapter()` 支持 md/txt/epub，epub 用 `buildEpubZip` 手动构建 ZIP
  - `startAutoSave()` 30 秒定时自动保存
- **潜在问题**：
  - `undo()/redo()` 使用已废弃的 `document.execCommand(''undo'')`
  - EPUB 构建中所有文件 `store: false`（压缩），但 mimetype 应为 `store: true`
  - 自动保存间隔硬编码 30000ms，与 AppearanceSettings 的 `autoSaveInterval` 未联动

---

## 2. ChatPanel.vue

`src/components/chat/ChatPanel.vue` - AI 对话面板

- **按钮列表**：
  - send → `sendMessage()`
- **下拉框列表**：
  - `selectedChatAgent` ← `agentStore.agents`（智能体列表）
  - `selectedChatModel` ← `availableModels`（`providerStore.activeGenerateProvider.models`）
- **输入框列表**：
  - `inputText`（v-model，textarea，回车发送/Shift+回车换行）
- **面板/条件渲染**：
  - `v-if=''messages.length === 0''` 空状态提示
- **关键逻辑**：
  - `sendMessage()` 组装消息调用 `callApi` 流式响应
  - `callApi()` 处理 SSE 流式解析，429 时按 30s~240s 递增重试 8 次
  - `regenerateMessage(i)` 删除助手消息并重发上一条用户消息
  - `applyToEditor()` 将内容写入 `editorStore.activeTab`
  - `copyMessage()` 复制到剪贴板
  - 监听 `window` 的 `clear-chat` 事件清空消息
- **潜在问题**：
  - `isStreaming` 声明并用于阻止重复发送，但流式过程中 UI 无明显禁用反馈
  - `window.addEventListener` 在 setup 顶层注册而非 `onMounted`，SSR 不安全
  - `configStatus` 逻辑简单，未校验 baseUrl 有效性

---

## 3. ChatMessage.vue

`src/components/chat/ChatMessage.vue` - 单条聊天消息

- **按钮列表**：
  - copy → `$emit(''copy'', message.content)`
  - redo → `$emit(''regenerate'')`
  - apply → `$emit(''apply'', message.content)`
- **下拉框列表**：无
- **输入框列表**：无
- **面板/条件渲染**：
  - `v-if=''message.role === ''assistant''''` 消息操作按钮区
- **关键逻辑**：
  - `renderedContent` 用 `marked.parse` 渲染 Markdown 为 HTML
- **潜在问题**：
  - `v-html=''renderedContent''` 存在 XSS 风险，marked 未配置 sanitize
  - 按钮使用纯文本（copy/redo/apply）而非图标，不符 UI 规范

---

## 4. SettingsModal.vue

`src/components/settings/SettingsModal.vue` - 设置弹窗容器

- **按钮列表**：
  - x → `$emit(''close'')`
  - 各 tab 按钮 → `settingsStore.setActiveTab(tab.id)`
- **下拉框列表**：无
- **输入框列表**：无
- **面板/条件渲染**：
  - `v-if=''activeTab === ''api''''` → ApiSettings
  - `v-else-if=''activeTab === ''skill''''` → SkillSettings
  - `v-else-if=''activeTab === ''agent''''` → AgentSettings
  - `v-else-if=''activeTab === ''appearance''''` → AppearanceSettings
  - `v-else-if=''activeTab === ''deai''''` → DeAiSettings
  - `v-else-if=''activeTab === ''diag''''` → DiagLogPanel
- **关键逻辑**：
  - `tabs` 数组配置驱动标签栏
  - 点击遮罩 `@click.self` 关闭弹窗
- **潜在问题**：无明显问题，结构清晰

---

## 5. ApiSettings.vue

`src/components/settings/ApiSettings.vue` - API 供应商配置

- **按钮列表**：
  - 删除 → `providerStore.removeProvider(p.id)`
  - 获取模型 → `fetchModels(p.id)`
  - + 添加供应商 → `addProvider()`
- **下拉框列表**：
  - purpose-select（generate/verify）→ `setPurpose()`
  - `p.selectedModel` ← `p.models`（供应商模型列表）
- **输入框列表**：
  - `p.name`（v-model，@change 保存）
  - `p.baseUrl`（v-model）
  - `p.apiKey`（v-model，type=password）
  - `p.temperature`（range 0-2）
- **面板/条件渲染**：无独立条件面板，provider-list 为 v-for 列表
- **关键逻辑**：
  - `getPurpose()` 判断供应商是 generate 还是 verify
  - `setPurpose()` 调用 store 设置用途
  - `fetchModels()` 异步获取模型列表
  - `addProvider()` 新增默认供应商
- **潜在问题**：
  - apiKey 用 `type=password` 但在 store 中明文存储
  - 新供应商默认 baseUrl 硬编码 `https://api.openai.com`
  - `addProvider` 传入 `purpose` 字段但 store 可能未使用

---

## 6. AgentSettings.vue

`src/components/settings/AgentSettings.vue` - 智能体管理

- **按钮列表**：
  - 删除 → `agentStore.removeAgent(a.id)`
  - + 新建智能体 → `addAgent()`
- **下拉框列表**：无
- **输入框列表**：
  - `a.name`（v-model）
  - `a.model`（v-model）
  - `a.temperature`（range 0-2）
  - `a.maxTokens`（number）
  - `a.systemPrompt`（textarea）
- **面板/条件渲染**：无
- **关键逻辑**：
  - `addAgent()` 新建默认智能体
  - 所有字段 `@change` 触发 `agentStore.saveAgents()`
- **潜在问题**：
  - 新建智能体 `model` 为空字符串，用户需手动填写
  - 无模型选择下拉，需手输入模型名

---

## 7. SkillSettings.vue

`src/components/settings/SkillSettings.vue` - 技能管理

- **按钮列表**：
  - up → `skillStore.movePipelineSkillUp(i)`
  - down → `skillStore.movePipelineSkillDown(i)`
  - x → `removeFromPipeline(i)`
  - 编辑 → `editSkill(s.id)`
  - 加入流水线 → `addToPipeline(s.id)`
  - 删除 → `skillStore.removeSkill(s.id)`
  - + 新建技能 → `addSkill()`
  - 保存 → `saveEdit()`
  - x（弹窗关闭）→ `cancelEdit()`
- **下拉框列表**：
  - `editingExecutionMode`（chain/split-merge/multi-step）
  - `editingOutputFormat`（text/json）
- **输入框列表**：
  - `editingName`
  - `editingCategory`
  - `editingTemplate`（textarea）
- **面板/条件渲染**：
  - `v-if=''editingSkillId''` 技能编辑弹窗
- **关键逻辑**：
  - 流水线技能排序管理
  - 技能编辑弹窗加载/保存
  - `addToPipeline` 防重复添加
- **潜在问题**：
  - `saveEdit()` 调用 `updateSkill` 但未保存 `splitSize` 和 `validationRules`
  - 编辑弹窗 `@click.self` 关闭会丢失未保存内容

---

## 8. AppearanceSettings.vue

`src/components/settings/AppearanceSettings.vue` - 外观设置

- **按钮列表**：无
- **下拉框列表**：
  - `settingsStore.editorFont`（serif/sans-serif/monospace）
- **输入框列表**：
  - `settingsStore.fontSize`（range 12-20）
  - `settingsStore.autoSaveInterval`（number 5-300）
  - `settingsStore.maxTabs`（number 5-50）
  - `settingsStore.cdpPort`（number）
- **面板/条件渲染**：无
- **关键逻辑**：
  - 纯设置绑定，所有 `@change` 触发 `saveSettings()`
- **潜在问题**：
  - `autoSaveInterval` 单位为秒，但 EditorPanel 硬编码 30000ms 未读取此值
  - `cdpPort` 暴露调试端口配置，可能存在安全风险
  - 无主题/暗色模式切换

---

## 9. DeAiSettings.vue

`src/components/settings/DeAiSettings.vue` - 去AI味设置

- **按钮列表**：
  - 硬规则 toggle → `deAiStore.hardruleEnabled` 切换
  - up → `moveDeAiSkillUp(i)`
  - down → `moveDeAiSkillDown(i)`
  - x → `removeDeAiSkill(i)`
  - 保存设置 → `deAiStore.saveConfig()`
- **下拉框列表**：
  - `deAiStore.level`（light/medium/heavy）
  - `deAiStore.splitSize`（500/800/1000/1500/2000）
  - `selectedNewSkill` ← `skillStore.skills`
  - `deAiStore.agentId` ← `agentStore.agents`
- **输入框列表**：无文本输入
- **面板/条件渲染**：
  - `v-if=''deAiStore.mode === ''split-merge''''` 切分大小选择行
  - mode-cards v-for 三种模式卡片
- **关键逻辑**：
  - `selectMode()` 调用 `deAiStore.setMode`
  - 技能链增删排序
  - `verifyProvider` computed 显示验证供应商状态
  - 引入 `DeAiFlowPreview` 子组件
- **潜在问题**：
  - `modes` 数组在组件内硬编码，与 store 可能不同步
  - 技能管理与 `DeAiSkillSelector` 组件功能重复

---

## 10. DiagLogPanel.vue

`src/components/settings/DiagLogPanel.vue` - 诊断日志面板

- **按钮列表**：
  - 刷新 → `loadLogs()`
  - 导出 → `exportLogs()`
  - 清空 → `clearLogs()`
- **下拉框列表**：
  - `selectedDate` ← `availableDates`（最近 7 天日期）
- **输入框列表**：无
- **面板/条件渲染**：
  - `v-if=''logs.length === 0''` 空日志提示
- **关键逻辑**：
  - `loadLogs()` 从 `window.electronAPI.diagRead` 读取日志
  - `exportLogs()` 调用 `electronAPI.diagExport`
  - `clearLogs()` 调用 `electronAPI.diagClear` 并清空本地列表
  - 日志支持数组和字符串两种格式解析
- **潜在问题**：
  - 依赖 `window.electronAPI`，Web 环境下无数据
  - `availableDates` 每次 `loadLogs` 都重新生成，效率低
  - `onMounted` 调用 `loadLogs` 但无 `onUnmounted` 清理

---

## 11. PipelinePanel.vue

`src/components/pipeline/PipelinePanel.vue` - 生成流水线（核心组件）

- **按钮列表**：
  - x → `$emit(''close'')`
  - 步骤点击 → `pipelineStore.setStep(i)`
  - 保存大纲 → `projectStore.setOutline()`
  - 锁定大纲 → `projectStore.lockOutline()`
  - 下一步 → `nextStep()`
  - + 新增设定 → `addSetting()`
  - AI生成设定 → `genSettings()`
  - 确认设定 → `confirmSettings()`
  - AI生成全卷 → `genVolumes(''auto'')`
  - 逐卷生成 → `genVolumes(''continue'')`
  - 续生成 → `genVolumes(''resume'')`
  - 重新生成此卷 → `genSingleVolume(i)`
  - 确认卷纲 → `confirmVolumes()`
  - AI生成章节 → `genChapters()`
  - 自动生成全部 → `genChaptersAuto()`
  - 续生成 → `resumeGen()`
  - 确认章节 → `confirmChapters()`
  - 生成正文 → `genBody(i)`
  - AI生成正文 → `genBodyForSelected()`
  - 自动生成全卷 → `genBodyAuto()`
  - 插入到编辑器 → `insertToEditor()`
  - 删除设定 → `splice + saveProject`
- **下拉框列表**：
  - 设定 category（9 类：世界观/地理/势力等）
  - `chapterWords`（2000/3000/3500/4000/5000）
  - `selectedVolumeIndex` ← `projectStore.volumes`
  - `bodyVolumeIndex` ← `projectStore.volumes`
  - `bodyChapterIndex` ← `bodyVolumeChapters`
- **输入框列表**：
  - `projectStore.outlineText`（textarea）
  - `s.name`、`s.attrsText`（textarea）
  - `volumeWords`（number）
  - `vol.name`、`vol.outline`（textarea）、`vol.summary`
- **面板/条件渲染**：
  - `v-if=''currentStep === 0''` 大纲面板
  - `v-if=''currentStep === 1''` 设定面板
  - `v-if=''currentStep === 2''` 卷纲面板
  - `v-if=''currentStep === 3''` 章节面板
  - `v-if=''currentStep === 4''` 正文面板
- **关键逻辑**：
  - `callApi()` 调用 AI API，429 时递增重试 8 次（30s~240s）
  - `extractJsonArray()` 从 AI 响应中提取 JSON 数组（支持 markdown fence）
  - `validateSettings/Volumes/Chapters()` 校验生成结果字段
  - `genChapters()` 批量生成（每批 20 章），含 5 次重试 + 3 次补全
  - `resumeGen()` 断点续传
  - `genBodyAuto()` 遍历全卷章节生成正文
  - `insertToEditor()` 派发 `insert-text` CustomEvent
- **潜在问题**：
  - `callApi` 中 `resp` 变量在循环外声明，循环结束后 `resp!` 可能为 undefined
  - `genVolumes(''continue'')` 声明 `nextIdx` 但未使用，只取 `slice(0,1)`
  - `genChapters` 中 `boundSettingsText` 在循环内重复构建
  - 大量逻辑内联在单文件中，应拆分为 composables
  - `genSingleVolume` 的 `skillIdx` 逻辑与 `genVolumes` 不一致

---

## 12. OutlineWorkspace.vue

`src/components/outline/OutlineWorkspace.vue`

- **状态**：NOT_FOUND - 文件不存在

---

## 13. DeAiButton.vue

`src/components/deai/DeAiButton.vue` - 去AI味按钮组件

- **按钮列表**：
  - 去AI味 / 处理中...{progress}% → `triggerDeAi()`（disabled: `deAiStore.isProcessing`）
- **下拉框列表**：无
- **输入框列表**：无
- **面板/条件渲染**：无
- **关键逻辑**：
  - `triggerDeAi()` 调用 `deAiProcess` 处理 `editorStore.activeTab.content`
  - 处理结果写回 `editorStore.updateContent`
- **潜在问题**：
  - 与 `EditorPanel.vue` 中的 `triggerDeAi` 逻辑完全重复
  - 未配置技能时 alert 提示，无更友好的 UI 反馈

---

## 14. DeAiFlowPreview.vue

`src/components/deai/DeAiFlowPreview.vue` - 去AI味流程预览

- **按钮列表**：无
- **下拉框列表**：无
- **输入框列表**：无
- **面板/条件渲染**：
  - flow-node 状态：active/done
- **关键逻辑**：
  - `steps` 从 `deAiStore.flowPreview` 获取
  - `isCurrent(i)` 根据 `progress/100 * total` 计算当前步骤
  - `isDone(i)` 根据进度判断已完成步骤
- **潜在问题**：
  - `progress=0` 时 `currentIdx=0`，首步显示 active 但实际未开始
  - `progress=100` 时所有步骤显示 done 但逻辑边界 `index < total` 冗余

---

## 15. DeAiModeCard.vue

`src/components/deai/DeAiModeCard.vue` - 去AI味模式卡片

- **按钮列表**：
  - 整卡片点击 → `emit(''select'', mode.id)`
- **下拉框列表**：无
- **输入框列表**：无
- **面板/条件渲染**：
  - `v-if=''mode.recommended''` 推荐徽章
- **关键逻辑**：
  - 纯展示组件，点击 emit select 事件
- **潜在问题**：无明显问题

---

## 16. DeAiProgress.vue

`src/components/deai/DeAiProgress.vue` - 去AI味进度弹窗

- **按钮列表**：无
- **下拉框列表**：无
- **输入框列表**：无
- **面板/条件渲染**：
  - 全屏遮罩 `deai-progress-overlay`
  - flow-step 状态：active/done
- **关键逻辑**：
  - 显示进度百分比、进度条、当前步骤、流程预览
  - `isStepActive/isStepDone` 根据 progress 计算
- **潜在问题**：
  - 无关闭/取消按钮，处理中无法中断
  - 组件本身无 `v-if` 控制，需父级控制显隐
  - 与 `DeAiFlowPreview` 的步骤状态计算逻辑重复

---

## 17. DeAiSkillSelector.vue

`src/components/deai/DeAiSkillSelector.vue` - 去AI味技能选择器

- **按钮列表**：
  - up → `moveUp(i)`
  - down → `moveDown(i)`
  - x → `remove(i)`
- **下拉框列表**：
  - `newSkillId` ← `skillStore.skills`（@change 触发 add）
- **输入框列表**：无
- **面板/条件渲染**：
  - `v-if=''deAiStore.skillIds.length === 0''` 空状态
- **关键逻辑**：
  - 技能链增删排序
  - `add()` 防重复添加
- **潜在问题**：
  - 与 `DeAiSettings.vue` 中的技能管理功能完全重复
  - 组件未被任何文件引用（可能是废弃组件）

---

## 18. ChapterTree.vue

`src/components/sidebar/ChapterTree.vue` - 章节树侧边栏

- **按钮列表**：
  - 生成 → `$emit(''navigate'', ''pipeline'')`
  - 项目 → `openProjectList()`
  - x → 关闭弹窗
  - 查看已有项目 → `showProjectList = true`
  - + 新建项目 → `showProjectModal = true`
  - 创建 → `createNewProject()`
- **下拉框列表**：无
- **输入框列表**：
  - `newProjectName`（书名）
  - `newOutlineText`（textarea，大纲）
- **面板/条件渲染**：
  - `v-if=''volumes.length === 0''` 空提示
  - `v-if=''flatItems.length > 50''` 虚拟滚动（RecycleScroller）
  - `v-else` 普通列表
  - `v-if=''showProjectModal''` 新建项目弹窗
  - `v-if=''showProjectList''` 项目列表弹窗
  - `v-if=''expandedVolumes.has(...)''` 展开的章节列表
- **关键逻辑**：
  - `toggleVolume()` 展开/折叠卷
  - `selectChapter()` 调用 `editorStore.openTab` 打开编辑标签
  - `createNewProject()` 创建新项目并保存
  - `selectProject()` 加载已有项目
  - `flatItems` computed 构建虚拟滚动扁平列表
- **潜在问题**：
  - 依赖 `vue-virtual-scroller`，需确认已安装
  - `expandedVolumes` 用 `ref(new Set())`，Set 的增删可能非响应式
  - `selectChapter` 中 `ch.body || ''` 空内容时编辑器无默认提示
  - `createNewProject` 直接修改 store 属性，无事务保护

---

## 19. ScPanel.vue

`src/components/ScPanel.vue`

- **状态**：NOT_FOUND - 文件不存在

---

## 20. AgentProgressPanel.vue

`src/components/AgentProgressPanel.vue`

- **状态**：NOT_FOUND - 文件不存在

---

## 汇总统计

### 按钮功能分布
| 组件 | 按钮数 | 主要操作 |
|------|--------|----------|
| EditorPanel | 12 | 撤销/重做/生成/保存/导出/去AI味/查找替换 |
| ChatPanel | 1 | 发送消息 |
| ChatMessage | 3 | 复制/重新生成/应用 |
| SettingsModal | 7 | 关闭/切换标签页 |
| ApiSettings | 3 | 删除/获取模型/添加供应商 |
| AgentSettings | 2 | 删除/新建智能体 |
| SkillSettings | 9 | 排序/编辑/加入流水线/删除/新建/保存 |
| AppearanceSettings | 0 | 无按钮 |
| DeAiSettings | 5 | 硬规则切换/技能排序/保存 |
| DiagLogPanel | 3 | 刷新/导出/清空 |
| PipelinePanel | 20+ | 五步流水线全流程操作 |
| DeAiButton | 1 | 触发去AI味 |
| DeAiModeCard | 1 | 选择模式 |
| DeAiSkillSelector | 3 | 技能排序/移除 |
| ChapterTree | 6 | 导航/项目管理 |

### 废弃/重复代码
- `EditorPanel.triggerDeAi` 与 `DeAiButton.triggerDeAi` 逻辑完全重复
- `DeAiSkillSelector` 与 `DeAiSettings` 中技能管理功能重复
- `DeAiProgress` 与 `DeAiFlowPreview` 步骤状态计算逻辑重复
- `EditorPanel.undo/redo` 使用已废弃的 `document.execCommand`

### 未找到文件
- `OutlineWorkspace.vue` - 大纲工作区组件
- `ScPanel.vue` - 用途未知
- `AgentProgressPanel.vue` - 智能体进度面板

### 安全风险
- `ChatMessage.vue` v-html 渲染 marked 输出，存在 XSS 风险
- `ApiSettings.vue` apiKey 明文存储
- `AppearanceSettings.vue` cdpPort 暴露调试端口