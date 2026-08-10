 # Vue3 vs 旧架构 对账分析报告
 > 生成时间: 2026-08-09
 > 数据来源: vue3_components.md (AgentA) + old_arch_features.md (AgentC)
 
 ## 一、缺失功能总览
 
 ### 严重缺失（核心功能，必须修复）
 | # | 功能 | 旧架构位置 | Vue3状态 | 影响 |
 |---|------|-----------|---------|------|
 | 1 | 大纲工作台(独立AI共创面板) | btn-outline-workspace / Ctrl+1 | OutlineWorkspace.vue NOT_FOUND | 用户无法在大纲层与AI讨论修改 |
 | 2 | 设定合集面板 | btn-settings-collection / Ctrl+2 | 缺失 | 用户无法管理设定条目 |
 | 3 | 记忆管理面板 | btn-memory / Ctrl+4 | 缺失 | 用户无法查看/管理记忆 |
 | 4 | 顶部栏模型选择器 | model-select (顶部) | 仅ChatPanel有 | 用户无法在主界面切换模型 |
 | 5 | 顶部栏智能体选择器 | agent-select (顶部) | 仅ChatPanel有 | 用户无法在主界面切换Agent |
 | 6 | 主题切换(暗色/亮色) | btn-theme | 缺失 | 无主题切换功能 |
 | 7 | 面板调整器(拖拽宽度) | _initPanelResizers | 缺失 | 用户无法调整面板宽度 |
 | 8 | 快捷键系统 | Ctrl+1-5/Z/Y/S/, | 缺失 | 用户无法用快捷键操作 |
 | 9 | 防断网机制 | _aiRequest重试+心跳恢复 | PipelinePanel有429重试但无心跳 | 长文本生成断网后无法恢复 |
 | 10 | 内联AI菜单(改写/扩写/润色/续写/精简) | _checkInlineMenu | 缺失 | 编辑器选中文本无法快速AI操作 |
 
 ### 中等缺失（辅助功能，影响体验）
 | # | 功能 | 旧架构位置 | Vue3状态 | 影响 |
 |---|------|-----------|---------|------|
 | 11 | AI起名(generateNames) | btn-names | 缺失 | 无法AI生成角色名 |
 | 12 | 写作规则生成 | btn-wr | 缺失 | 无法AI生成写作规则 |
 | 13 | 时间线提取 | btn-tl | 缺失 | 无法AI提取时间线 |
 | 14 | 批量审阅 | btn-br | 缺失 | 无法批量AI审阅章节 |
 | 15 | 章节修订 | btn-rev | 缺失 | 无法AI修订章节 |
 | 16 | 面包屑导航 | breadcrumb-bar | 缺失 | 用户无法知道当前在哪个面板层级 |
 | 17 | 章节树右键菜单 | ctx-menu | 缺失 | 无法右键操作章节 |
 | 18 | 章节树拖拽排序 | dragstart/drop | 缺失 | 无法拖拽重排卷/章节 |
 | 19 | 章节树双击重命名 | dblclick | 缺失 | 无法双击重命名章节 |
 | 20 | 卷编辑模态框 | volume-modal | 缺失 | 无法编辑卷信息(名称/章节数) |
 | 21 | 技能绑定模态框 | skill-bind-modal | 缺失 | 无法绑定技能到卷/章级别 |
 | 22 | 写作仪表盘 | dashboard-modal | 缺失 | 无法查看项目统计 |
 | 23 | Diff对比模态框 | diff-modal | 缺失 | 无法对比修改前后内容 |
 | 24 | 退出确认模态框 | exit-confirm-modal | 缺失 | 关闭时无保存提示 |
 | 25 | 供应商快速切换 | ProviderManager.quickSwitch | 缺失 | 无法快速切换供应商 |
 | 26 | 模型启用/禁用管理 | activateProviderModel | 缺失 | 无法管理模型列表 |
 | 27 | 暂停/恢复生成 | _isPaused/_waitIfPaused | 缺失 | 无法暂停生成过程 |
 
 ### 轻微缺失（可后续添加）
 | # | 功能 | 旧架构位置 | Vue3状态 |
 |---|------|-----------|---------|
 | 28 | 插件市场 | btn-plugin-market / Ctrl+5 | 缺失 |
 | 29 | 技能测试模态框 | stm | 缺失 |
 | 30 | 智能体测试模态框 | atm | 缺失 |
 | 31 | 章节概述面板 | chapter-overview-panel | 缺失 |
 | 32 | 批量审阅结果模态框 | batch-review-modal | 缺失 |
 
 ## 二、已实现但有缺陷的功能
 
 | # | 功能 | 问题描述 | 严重度 | 文件位置 |
 |---|------|---------|--------|----------|
 | 33 | 撤销/重做 | 使用废弃的document.execCommand | 严重 | EditorPanel.vue undo()/redo() |
 | 34 | 自动保存间隔 | 硬编码30000ms未读取AppearanceSettings.autoSaveInterval | 中等 | EditorPanel.vue startAutoSave() |
 | 35 | 去AI味triggerDeAi | EditorPanel和DeAiButton逻辑完全重复 | 低 | 两处triggerDeAi() |
 | 36 | 去AI味技能管理 | DeAiSkillSelector和DeAiSettings功能重复 | 低 | DeAiSkillSelector.vue |
 | 37 | ChatMessage v-html | marked输出未sanitize，XSS风险 | 中等 | ChatMessage.vue renderedContent |
 | 38 | EPUB构建 | mimetype应store:true但设为false | 低 | EditorPanel.vue buildEpubZip |
 | 39 | 标题显示英文 | App.vue用中文但electron title覆盖 | 低 | main.ts BrowserWindow title |
 | 40 | 侧边栏按钮无文字 | 只有SVG图标无文字标签 | 中等 | SidebarNav.vue |
 | 41 | PipelinePanel resp变量 | 循环外声明可能undefined | 中等 | PipelinePanel.vue callApi() |
 | 42 | 去AI味进度无取消 | DeAiProgress无关闭/取消按钮 | 中等 | DeAiProgress.vue |
 | 43 | ChapterTree Set响应式 | expandedVolumes用Set可能非响应式 | 中等 | ChapterTree.vue |
 
 ## 三、数据加载问题（用户报告的核心问题）
 
 | # | 问题 | 根因分析 | 修复方案 |
 |---|------|---------|----------|
 | 44 | 下拉框只有1个选项 | store.onMounted调用loadProviders/loadAgents但数据可能为空 | 检查IPC通道是否正确注册、provider-manager是否正确加载 |
 | 45 | 供应商获取模型失败 | fetchModels调用electronAPI但IPC可能未注册 | 检查preload.ts是否暴露fetchModels |
 | 46 | 去AI味未同步模型 | deAiProcess读取store但未读取用户选择 | 确保deai store读取providerStore.activeGenerateProvider |
 | 47 | 多供应商不支持同时启用 | 旧架构ProviderManager支持purpose分类 | Vue3需要provider store支持多供应商同时active |
 
 ## 四、修复优先级排序
 
 ### P0 - 必须立即修复（应用基本不可用）
 1. 数据加载链路（#44-47）- 下拉框为空、模型获取失败
 2. 撤销/重做废弃API（#33）- 编辑器核心功能
 3. 快捷键系统（#8）- 用户操作效率
 4. 防断网机制（#9）- 长文本生成保护
 5. 主题切换（#6）- UI基本功能
 
 ### P1 - 高优先级修复（核心功能缺失）
 6. 顶部栏模型/Agent选择器（#4-5）
 7. 内联AI菜单（#10）
 8. 面板调整器（#7）
 9. 面包屑导航（#16）
 10. 章节树右键菜单+拖拽+重命名（#17-19）
 11. 去AI味进度取消按钮（#42）
 12. 自动保存间隔联动（#34）
 
 ### P2 - 中优先级修复（辅助功能）
 13. 大纲工作台（#1）
 14. 设定合集面板（#2）
 15. AI起名/写作规则/时间线/批量审阅/章节修订（#11-15）
 16. 卷编辑模态框（#20）
 17. 技能绑定模态框（#21）
 18. Diff对比模态框（#23）
 19. 退出确认模态框（#24）
 
 ### P3 - 低优先级（后续迭代）
 20. 记忆管理面板（#3）
 21. 插件市场（#28）
 22. 写作仪表盘（#22）
 23. 技能/智能体测试（#29-30）
 24. 章节概述（#31）
 
 ## 五、3个NOT_FOUND文件分析
 
 | 文件 | 旧架构对应功能 | 可能的Vue3替代 |
 |------|-------------|-------------|
 | OutlineWorkspace.vue | 大纲工作台面板 | 可能在PipelinePanel的step0中实现 |
 | ScPanel.vue | 设定合集面板 | 可能未迁移 |
 | AgentProgressPanel.vue | Agent进度显示 | 可能未实现 |
 
 ## 六、总结
 
 - 旧架构功能项: 60+按钮、16下拉框、25+面板、16种AI生成类型、3种去AI模式、完整防断网
 - Vue3已实现: 约40%功能（编辑器、聊天、设置、流水线、去AI味基础框架）
 - 严重缺失: 10项（P0级）
 - 中等缺失: 17项（P1-P2级）
 - 轻微缺失: 5项（P3级）
 - 已实现有缺陷: 11项
 - 总缺失率: 约60%
