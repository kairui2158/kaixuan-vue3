=== 新旧架构功能对比报告 ===
时间: 2026-08-13T10:59:58.472Z
新架构组件: 32/32

=== sidebar (8个功能) ===
| 功能 | 映射组件 | 组件存在 | 已覆盖 |
|------|----------|---------|-------|
| btn-outline-workspace(大纲工作台) | SidebarNav.vue | YES | YES |
| btn-settings-collection(设定合集) | SidebarNav.vue | YES | YES |
| btn-pipeline(生成流水线) | SidebarNav.vue | YES | YES |
| btn-memory(记忆面板) | SidebarNav.vue | YES | YES |
| btn-plugin-market(插件市场) | SidebarNav.vue | YES | YES |
| btn-settings(设置) | SidebarNav.vue | YES | YES |
| btn-dashboard(仪表盘) | SidebarNav.vue | YES | YES |
| theme-toggle-btn(主题切换) | SidebarNav.vue | YES | YES |
覆盖率: 8/8 (100%)

=== header (3个功能) ===
| 功能 | 映射组件 | 组件存在 | 已覆盖 |
|------|----------|---------|-------|
| agent-select(智能体选择器) | N/A | NO | NO |
| model-select(模型选择器) | N/A | NO | NO |
| btn-clear(清空对话) | N/A | NO | NO |
覆盖率: 0/3 (0%)

=== editor (14个功能) ===
| 功能 | 映射组件 | 组件存在 | 已覆盖 |
|------|----------|---------|-------|
| editor-content(文本编辑器) | EditorPanel.vue | YES | YES |
| btn-undo(撤销) | EditorPanel.vue | YES | YES |
| btn-redo(重做) | EditorPanel.vue | YES | YES |
| btn-generate-content(AI生成) | EditorPanel.vue | YES | YES |
| btn-save-editor(保存) | EditorPanel.vue | YES | YES |
| btn-export(导出) | EditorPanel.vue | YES | YES |
| btn-ai-names(AI起名) | EditorPanel.vue | YES | YES |
| btn-writing-rules(写作规则) | EditorPanel.vue | YES | YES |
| btn-timeline(时间线) | EditorPanel.vue | YES | YES |
| btn-batch-review(批量审阅) | EditorPanel.vue | YES | YES |
| btn-revise(章节修订) | EditorPanel.vue | YES | YES |
| btn-de-ai(去AI味) | DeAiButton.vue | YES | YES |
| find-replace-bar(查找替换) | EditorPanel.vue | YES | YES |
| word-count(字数统计) | EditorPanel.vue | YES | YES |
覆盖率: 14/14 (100%)

=== chat (6个功能) ===
| 功能 | 映射组件 | 组件存在 | 已覆盖 |
|------|----------|---------|-------|
| messages-container(消息列表) | ChatPanel.vue | YES | YES |
| user-input(输入框) | ChatPanel.vue | YES | YES |
| btn-send(发送) | ChatPanel.vue | YES | YES |
| skill-area(技能区) | DeAiSkillSelector.vue | YES | YES |
| config-status(配置状态) | ChatPanel.vue | YES | YES |
| token-bar(Token统计) | ChatPanel.vue | YES | YES |
覆盖率: 6/6 (100%)

=== chapterTree (4个功能) ===
| 功能 | 映射组件 | 组件存在 | 已覆盖 |
|------|----------|---------|-------|
| current-project-name(项目名称) | ChapterTree.vue | YES | YES |
| btn-tree-gen(生成) | ChapterTree.vue | YES | YES |
| btn-open-project(项目) | ChapterTree.vue | YES | YES |
| tree-body(章节树) | ChapterTree.vue | YES | YES |
覆盖率: 4/4 (100%)

=== settings (13个功能) ===
| 功能 | 映射组件 | 组件存在 | 已覆盖 |
|------|----------|---------|-------|
| tab-api(API设置) | ApiSettings.vue | YES | YES |
| tab-skills(技能) | SkillSettings.vue | YES | YES |
| tab-agents(智能体) | AgentSettings.vue | YES | YES |
| tab-appearance(外观) | AppearanceSettings.vue | YES | YES |
| tab-deai(去AI味) | DeAiSettings.vue | YES | YES |
| tab-diag(诊断日志) | DiagLogPanel.vue | YES | YES |
| provider-list(供应商列表) | ApiSettings.vue | YES | YES |
| provider-edit(供应商编辑) | ApiSettings.vue | YES | YES |
| cfg-name(供应商名称) | ApiSettings.vue | YES | YES |
| cfg-url(Base URL) | ApiSettings.vue | YES | YES |
| cfg-key(API Key) | ApiSettings.vue | YES | YES |
| btn-fetch-models(获取模型) | ApiSettings.vue | YES | YES |
| model-list(模型列表) | ApiSettings.vue | YES | YES |
覆盖率: 13/13 (100%)

=== panels (6个功能) ===
| 功能 | 映射组件 | 组件存在 | 已覆盖 |
|------|----------|---------|-------|
| outline-workspace(大纲工作台) | OutlineWorkspace.vue | YES | YES |
| settings-collection(设定合集) | ScPanel.vue | YES | YES |
| pipeline(流水线) | PipelinePanel.vue | YES | YES |
| memory(记忆) | MemoryPanel.vue | YES | YES |
| plugin-market(插件市场) | PluginMarket.vue | YES | YES |
| dashboard(仪表盘) | DashboardModal.vue | YES | YES |
覆盖率: 6/6 (100%)

=== 总结 ===
总功能数: 54
已覆盖: 51
未覆盖: 3
覆盖率: 94%

=== 缺失功能 ===
- header/agent-select(智能体选择器) -> N/A
- header/model-select(模型选择器) -> N/A
- header/btn-clear(清空对话) -> N/A