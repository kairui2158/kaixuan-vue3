# 旧架构功能清单

> 源文件: renderer_v2.js (5294行), style.css (6246行), provider-manager.js (NOT_FOUND)
> 分析Agent: AgentC
> 生成时间: 2026-08-09

## 按钮清单

| 按钮文本/ID | 所在面板 | 绑定方法 | 功能描述 |
|---|---|---|---|
| btn-send | 聊天面板 | sendMessage() | 发送消息给AI，流式输出回复 |
| btn-settings | 顶部栏 | toggleSettings(true) | 打开设置模态框 |
| btn-close-settings | 设置模态框 | toggleSettings(false) | 关闭设置模态框 |
| btn-toggle-key | 设置模态框 | toggleApiKeyVisibility() | 切换API Key显示/隐藏 |
| btn-test-connection | 供应商编辑 | testConnection() | 测试API连接并获取模型列表 |
| btn-save-settings | 供应商编辑 | saveSettingsFromForm() | 保存供应商配置(名称/URL/Key/温度/maxTokens/purpose/systemPrompt) |
| btn-fetch-models | 供应商编辑 | fetchModelList() | 从API获取可用模型列表 |
| btn-back | 供应商编辑 | exitProviderEdit() | 返回供应商列表(检查未保存修改) |
| btn-clear | 聊天面板 | clearChat() | 清空所有对话记录(带确认) |
| btn-outline-workspace | 侧边栏 | openOutlineWorkspace() | 打开大纲工作台面板 |
| btn-settings-collection | 侧边栏 | showSettingsCollection() | 打开设定合集面板 |
| btn-close-sc | 设定合集面板 | closeSettingsCollection() | 关闭设定合集面板 |
| btn-pipeline | 侧边栏 | showPipeline() | 打开生成流水线面板 |
| btn-close-pl | 流水线面板 | closePipeline() | 关闭生成流水线面板 |
| btn-memory | 侧边栏 | showMemory() | 打开记忆管理面板 |
| btn-close-mem | 记忆面板 | closeMemory() | 关闭记忆管理面板 |
| btn-plugin-market | 侧边栏 | showPluginMarket() | 打开插件市场模态框 |
| btn-close-market | 插件市场 | closePluginMarket() | 关闭插件市场模态框 |
| btn-market-search | 插件市场 | searchGitHub() | 搜索GitHub仓库 |
| btn-set-token | 插件市场 | _toggleTokenInput() | 切换GitHub Token输入框 |
| btn-token-help | 插件市场 | _toggleTokenHelp() | 切换Token帮助信息 |
| btn-save-token | 插件市场 | _saveGitHubToken() | 保存GitHub Token到凭据管理器 |
| btn-prev-page | 插件市场 | _prevPage() | 插件市场上一页 |
| btn-next-page | 插件市场 | _nextPage() | 插件市场下一页 |
| btn-open-project | 顶部栏 | openProjectModal() | 打开项目管理模态框 |
| btn-new-project | 项目管理 | showNewProjectForm() | 显示新建项目表单 |
| btn-create-project | 新建项目表单 | createProject() | 创建新项目 |
| pm-open (data-a) | 项目列表 | openProject(id) | 打开指定项目 |
| pm-delete (data-a) | 项目列表 | deleteProject(id) | 删除指定项目 |
| btn-tree-gen | 章节树 | showPipeline() | 打开生成流水线 |
| btn-generate-content (btn-gen) | 编辑器工具栏 | generateContent() | AI生成当前章节正文(覆盖编辑器内容) |
| btn-save (btn-save-editor) | 编辑器工具栏 | saveEditorContent() | 保存编辑器内容到Pipeline数据 |
| btn-export | 编辑器工具栏 | 导出下拉菜单toggle | 切换导出格式下拉菜单 |
| export-md/txt/epub | 导出下拉 | exportChapter(format) | 导出当前章节为MD/TXT/EPUB |
| btn-names | 编辑器工具栏 | generateNames("character", text) | AI生成角色名(10个，返回JSON) |
| btn-wr (writing-rules) | 编辑器工具栏 | generateWritingRules(outline) | AI生成写作规则(文风/节奏/视角/描写原则) |
| btn-tl (timeline) | 编辑器工具栏 | extractTimeline(outline) | AI从大纲提取时间线 |
| btn-br (batch-review) | 编辑器工具栏 | batchReviewChapters() | 批量AI审阅所有章节(评分/问题/建议) |
| btn-rev (revise) | 编辑器工具栏 | reviseChapter(chapterId) | AI修订章节内容(改善文笔/修正逻辑) |
| btn-de-ai | 编辑器工具栏 | deAiProcess() | 去AI味处理(3种模式: chain/split-merge/multi-step) |
| btn-deai-add-skill | 去AI味设置 | _addDeAiSkill() | 添加去AI味技能到链路 |
| btn-save-deai | 去AI味设置 | _saveDeAiConfig() | 保存去AI味配置到StorageManager |
| btn-theme | 编辑器工具栏 | _toggleTheme() | 切换暗色/亮色主题 |
| btn-undo | 编辑器工具栏 | _undo() | 撤销编辑器操作(栈深度50) |
| btn-redo | 编辑器工具栏 | _redo() | 重做编辑器操作 |
| btn-save (退出确认) | 退出确认模态框 | saveAndExit() | 保存并退出应用 |
| btn-direct (退出确认) | 退出确认模态框 | directExit() | 直接退出不保存 |
| btn-cancel (退出确认) | 退出确认模态框 | 取消退出 | 关闭退出确认模态框 |
| btn-diff-apply | Diff模态框 | _applyDiffResult() | 应用Diff对比结果 |
| btn-diff-cancel | Diff模态框 | _closeDiff() | 取消并关闭Diff |
| btn-diff-accept-all | Diff模态框 | 全部接受 | 标记所有Diff行为已接受 |
| btn-diff-reject-all | Diff模态框 | 全部拒绝 | 标记所有Diff行为已拒绝 |
| btn-diff-next | Diff模态框 | _diffCurrentIdx+1 | 跳转到下一个Diff变更 |
| btn-diff-prev | Diff模态框 | _diffCurrentIdx-1 | 跳转到上一个Diff变更 |
| btn-save-volume | 卷编辑模态框 | saveVolume() | 保存卷信息(名称/章节数) |
| btn-save-skill-binding | 技能绑定模态框 | saveNodeSkillBinding() | 保存节点技能绑定(卷/章级别) |
| btn-add-skill | 技能设置 | showSkillForm() | 显示技能编辑表单 |
| btn-cancel-skill | 技能设置 | hideSkillForm() | 隐藏技能编辑表单 |
| btn-save-skill | 技能设置 | saveSkill() | 保存技能(名称/描述/分类/模板/注入模式/绑定目标) |
| btn-add-agent | 智能体设置 | showAgentForm() | 显示智能体编辑表单 |
| btn-cancel-agent | 智能体设置 | hideAgentForm() | 隐藏智能体编辑表单 |
| btn-save-agent | 智能体设置 | saveAgent() | 保存智能体(名称/systemPrompt/model/temperature/maxTokens) |
| btn-save-appearance | 外观设置 | _saveAppearance() | 保存外观(字体大小/编辑器字体/主题) |
| btn-deai-cancel | 去AI味进度 | cancelController.abort() | 取消去AI味处理 |
| btn-find-next | 查找替换栏 | _findNext() | 查找下一个匹配 |
| btn-find-prev | 查找替换栏 | _findPrev() | 查找上一个匹配 |
| btn-replace-one | 查找替换栏 | _replaceOne() | 替换当前匹配 |
| btn-replace-all | 查找替换栏 | _replaceAll() | 替换所有匹配 |
| btn-find-close | 查找替换栏 | _closeFindBar() | 关闭查找替换栏 |
| btn-stm-run | 技能测试模态框 | _runSkillTest(id) | 运行技能测试(模拟selectedText注入) |
| btn-atm-run | 智能体测试模态框 | runAgentTest() | 运行智能体测试 |
| btn-dash (dashboard) | 顶部栏 | showWritingDashboard() | 打开写作仪表盘(项目/字数/章节统计) |
| tree: view-outline | 章节树 | openOutlineWorkspace() | 查看大纲 |
| tree: toggle-vol | 章节树 | toggleVolume(id) | 展开/折叠卷 |
| tree: view-vol-outline | 章节树 | openVolumeOutline(id) | 查看卷纲纲要(编辑器切vol-outline模式) |
| tree: view-ch-plot | 章节树 | openChapterPlot(vid,cid) | 查看章节剧情梗概(编辑器切ch-plot模式) |
| tree: open-ch | 章节树 | openChapter(vid,cid) | 打开章节正文(编辑器切ch-body模式) |
| tree: del-ch | 章节树 | deleteChapterFromTree(vid,cid) | 删除章节(带stopPropagation) |
| tree: add-ch | 章节树 | addChapter(vid) | 添加新章节 |
| tree: gen-ch | 章节树 | _treeGenChapters(vid) | AI生成本卷章节梗概 |
| tree: gen-body | 章节树 | _treeGenBody(vid,cid) | AI生成章节正文 |
| tree: add-vol | 章节树 | showVolumeForm() | 显示添加卷表单 |
| ctx: ctx-bind-skill | 右键菜单 | showSkillBindingModal() | 绑定技能到节点 |
| ctx: ctx-gen-chapters | 右键菜单 | _treeGenChapters(ctxNodeId) | 右键生成章节 |
| ctx: ctx-gen-body | 右键菜单 | _treeGenBody(ctxVolumeId,ctxNodeId) | 右键生成正文 |
| skill: skill-test | 技能卡片 | _runSkillTest(id) | 测试技能 |
| skill: skill-edit | 技能卡片 | showSkillForm(id) | 编辑技能 |
| skill: skill-delete | 技能卡片 | 删除技能(id) | 删除技能 |
| agent: edit-agent | 智能体卡片 | showAgentForm(id) | 编辑智能体 |
| agent: activate-agent | 智能体卡片 | 启用智能体(id) | 设为当前智能体 |
| msg: msg-btn-regen | 消息操作 | _regenerateMessage(idx) | 重新生成消息 |
| provider: provider-card-edit | 供应商卡片 | enterProviderEdit(id) | 编辑供应商 |
| provider: provider-model-enable | 模型列表 | activateProviderModel(m) | 启用指定模型 |
| provider: quick-switch | 供应商卡片 | ProviderManager.quickSwitch(id) | 快速切换供应商 |

## 下拉框清单

| 下拉框ID | 数据源 | 选项加载方法 | 说明 |
|---|---|---|---|
| model-select | 当前供应商模型 + 当前智能体模型 + settings.model(去重) | populateModelSelect() | 主模型选择器，option为"自动"+所有去重模型名 |
| model-select-chat | 同model-select | populateModelSelect() | 聊天面板模型选择器(与主选择器同步) |
| agent-select | AgentManager.getAll() | populateAgentSelect() | 智能体选择器，option为"默认"+所有智能体 |
| agent-select-chat | 同agent-select | populateAgentSelect() | 聊天面板智能体选择器(与主选择器同步) |
| deai-mode-select | 静态(chain/split-merge/multi-step) | renderDeAiSettings() | 去AI味模式选择 |
| deai-skill-select | SkillManager.getAll() | renderDeAiSettings() | 去AI味技能选择(chain模式) |
| deai-skill-select-sm | SkillManager.getAll() | renderDeAiSettings() | 去AI味技能选择(split-merge模式) |
| deai-skill-select-ms | SkillManager.getAll() | renderDeAiSettings() | 去AI味技能选择(multi-step模式) |
| deai-agent-select | AgentManager.getAll() | renderDeAiSettings() | 去AI味智能体选择(chain模式) |
| deai-agent-select-sm | AgentManager.getAll() | renderDeAiSettings() | 去AI味智能体选择(split-merge模式) |
| deai-agent-select-ms | AgentManager.getAll() | renderDeAiSettings() | 去AI味智能体选择(multi-step模式) |
| deai-text-type | 静态(novel等) | renderDeAiSettings() | 去AI味文体类型选择 |
| cfg-provider-purpose | 静态(generate/verify/detect) | enterProviderEdit() | 供应商用途选择(生成/验证/检测) |
| cfg-theme | 静态(dark/light) | _fillAppearanceForm() | 主题选择 |
| sf-bind-type | 静态(project/volume/chapter) | toggleBindTarget() | 技能绑定类型选择 |
| sf-bind-id | 卷/章列表动态加载 | showSkillBindingModal()内动态填充 | 技能绑定目标(卷或章) |
| export-dropdown | 静态(md/txt/epub) | 导出下拉菜单 | 导出格式选择(非select，是div下拉) |

## 面板切换

| 面板名 | 触发方式 | 显示条件 | 对应方法 |
|---|---|---|---|
| 设置模态框(settings-modal) | btn-settings点击 / Ctrl+, | toggleSettings(true) | toggleSettings(show) |
| 大纲工作台(outline-workspace) | btn-outline-workspace点击 / Ctrl+1 | classList.add("visible") | openOutlineWorkspace() / closeOutlineWorkspace() |
| 设定合集面板(settings-collection-panel) | btn-settings-collection点击 / Ctrl+2 | classList.add("visible") | showSettingsCollection() / closeSettingsCollection() |
| 生成流水线面板(pipeline-panel) | btn-pipeline点击 / Ctrl+3 / btn-tree-gen点击 | classList.add("visible") | showPipeline() / closePipeline() |
| 记忆管理面板(memory-panel) | btn-memory点击 / Ctrl+4 | classList.add("visible") | showMemory() / closeMemory() |
| 插件市场模态框(plugin-market-modal) | btn-plugin-market点击 / Ctrl+5 | classList.add("visible") | showPluginMarket() / closePluginMarket() |
| 供应商列表视图(provider-list-view) | 初始状态 | display:"" | renderProfileList() |
| 供应商编辑视图(provider-edit-view) | 点击编辑/新增供应商 | display:"" (隐藏listView) | enterProviderEdit(id) / exitProviderEdit() |
| 项目管理模态框(project-modal) | btn-open-project点击 | classList.add("visible") | openProjectModal() / closeProjectModal() |
| 新建项目模态框(new-project-modal) | btn-new-project点击 | classList.add("visible") | showNewProjectForm() / 关闭移除visible |
| 卷编辑模态框(volume-modal) | showVolumeForm() | classList.add("visible") | showVolumeForm(volId) / 关闭移除visible |
| 技能绑定模态框(skill-bind-modal) | 右键菜单ctx-bind-skill | classList.add("visible") | showSkillBindingModal() / 关闭移除visible |
| Diff对比模态框(diff-modal) | _showDiffView() | style.display="flex" | _showDiffView() / _closeDiff() |
| 去AI味进度模态框(deai-progress-modal) | deAiProcess()触发 | style.display="flex" | _showDeAiProgress() / _hideDeAiProgress() |
| 退出确认模态框(exit-confirm-modal) | beforeunload事件 | 默认显示 | saveAndExit() / directExit() / 取消 |
| 技能测试模态框(stm) | 技能卡片测试按钮 | 动态创建modal | _runSkillTest(id) |
| 智能体测试模态框(atm) | 智能体测试按钮 | classList.add("visible") | runAgentTest() |
| 写作仪表盘(dashboard-modal) | btn-dash点击 | 动态创建modal | showWritingDashboard() |
| 章节概述面板(chapter-overview-panel) | 章节树右键 | 动态创建panel | showChapterOverview() |
| 批量审阅结果模态框(batch-review-modal) | batchReviewChapters完成 | 动态创建modal | _showBatchReviewResults(results) |
| 查找替换栏(find-bar) | Ctrl+F(推测) | style.display切换 | _closeFindBar() |
| 上下文菜单(ctx-menu) | 章节树右键contextmenu | style.display="block" | showContextMenu(e) / hideContextMenu() |
| 内联AI菜单(inline-menu) | 编辑器选中文本mouseup | 动态显示 | _checkInlineMenu() / _hideInlineMenu() |
| 面包屑导航(breadcrumb-bar) | 面板切换时自动更新 | _updateBreadcrumb() | 显示当前打开的面板链路 |

### 设置模态框内Tab切换

| Tab名 | data-tab值 | 显示内容 | 触发后回调 |
|---|---|---|---|
| API设置 | "api" | 供应商管理 | switchTab初始化 |
| 技能管理 | "skills" | 技能列表/表单 | renderSkillList() + hideSkillForm() |
| 智能体 | "agents" | 智能体列表/表单 | renderAgentList() + populateAgentSelect() + hideAgentForm() |
| 外观 | "appearance" | 字体/主题设置 | _fillAppearanceForm() |
| 去AI味 | "deai" | 去AI味配置面板 | renderDeAiSettings() |
| 诊断 | "diag" | 诊断日志面板 | renderDiagPanel() |

switchTab(tabName) 逻辑:
1. 移除所有.modal-tab的active类
2. 给当前tab添加active类
3. 移除所有.tab-content的visible类
4. 给tab-{tabName}添加visible类
5. 设置所有.tab-content的display为none
6. 设置tab-{tabName}的display为block
7. 根据tabName执行对应回调

### 编辑器多模式

| 模式 | editorMode值 | 触发方式 | 编辑器标题 | 内容来源 |
|---|---|---|---|---|
| 卷纲纲要 | vol-outline | openVolumeOutline(volId) | {卷名} - 卷纲纲要 | pl.volumes[i].outline |
| 章节剧情 | ch-plot | openChapterPlot(vid,cid) | {章名} - 剧情梗概 | pl.volumes[i].chapters[j].plot |
| 章节正文 | ch-body | openChapter(vid,cid) | {章名} | pl.volumes[i].chapters[j].body |

### 章节树操作

| 操作 | data-a值 | 触发元素 | 方法 |
|---|---|---|---|
| 展开折叠卷 | toggle-vol | tree-volume-header | toggleVolume(id) |
| 查看卷纲 | view-vol-outline | tree-vol-btn | openVolumeOutline(id) |
| 查看剧情 | view-ch-plot | tree-ch-plot-btn | openChapterPlot(vid,cid) |
| 打开章节 | open-ch | tree-chapter | openChapter(vid,cid) |
| 删除章节 | del-ch | tree-actions button | deleteChapterFromTree(vid,cid) |
| 添加章节 | add-ch | tree-add-btn | addChapter(vid) |
| AI生成章节 | gen-ch | tree-gen-btn | _treeGenChapters(vid) |
| AI生成正文 | gen-body | tree-actions button | _treeGenBody(vid,cid) |
| 添加卷 | add-vol | tree-add-btn | showVolumeForm() |
| 拖拽排序 | dragstart/dragover/drop | tree-volume/tree-chapter | 拖拽重排卷/章节顺序 |
| 双击重命名 | dblclick | tree-body span | 内联编辑章节名 |
| 右键菜单 | contextmenu | tree-body | showContextMenu(e) |

## 生成流水线

### 核心方法

| 步骤 | 方法名 | 输入 | 输出 | 说明 |
|---|---|---|---|---|
| 统一AI请求 | _aiRequest(cfg) | {baseUrl,apiKey,messages,model,temperature,maxTokens,stream,signal,onChunk,onReasoning,onPause} | {text,reasoning} | 底层fetch请求，支持流式/非流式、重试、心跳恢复 |
| 统一生成入口 | apiGenerate(type,params,onChunk,opts) | type(16种),params文本,onChunk回调,opts{agentId,skillIds,wordsPerChapter} | 生成文本 | 根据type选prompt+sysPrompt，支持技能链执行 |
| 章节正文生成 | generateContent() | 当前章节上下文(大纲+设定+卷概要+章节剧情) | 覆盖编辑器内容 | 使用apiGenerate("body",params,...)，支持S5技能 |
| AI起名 | generateNames(type,context) | type(character/location/faction/item),context | 10个JSON名称 | 返回[{name,meaning}]，自动写入设定合集characters |
| 写作规则 | generateWritingRules(outline) | 大纲文本 | JSON写作规则 | 返回{rules:[{category,rule}]}，自动写入设定合集writingRules |
| 时间线提取 | extractTimeline(outline) | 大纲文本 | 时间线数据 | AI提取时间线 |
| 批量审阅 | batchReviewChapters() | 所有章节内容(前2000字) | [{volumeId,chapterId,title,review}] | 返回{score,issues,suggestions}，可中断 |
| 章节修订 | reviseChapter(chapterId) | 章节标题+全文 | 修订后全文 | AI改善文笔/修正逻辑/增强描写 |
| 树节点生成章节 | _treeGenChapters(vid) | 卷ID | 章节梗概列表 | AI生成本卷章节梗概 |
| 树节点生成正文 | _treeGenBody(vid,cid) | 卷ID+章ID | 章节正文 | AI生成指定章节正文 |

### apiGenerate 支持的16种类型

| type值 | 用途 | 系统提示词 |
|---|---|---|
| outline | 生成小说大纲 | 你是专业小说大纲架构师 |
| skills | 生成Skill建议 | 你是大纲架构师，擅长分析故事大纲并生成创作辅助技能 |
| settings | 拆解设定条目 | 你是小说设定分析师 |
| volumes | 生成卷纲结构 | 你是小说结构规划师 |
| chapters | 生成章节梗概 | 你是章节剧情设计师 |
| body | 生成章节正文 | 你是专业小说写手 |
| character | 生成角色 | 你是角色设计师 |
| worldview | 生成世界观 | 你是世界观构建师 |
| rewrite | 改写 | 你是文字改写专家 |
| expand | 扩写 | 你是扩写专家 |
| polish | 润色 | 你是文字润色专家 |
| translate | 翻译 | 你是翻译专家 |
| style | 风格转换 | 你是风格转换专家 |
| regenerate | 重生成 | 你是段落重生成专家 |
| continue | 续写 | 你是续写专家 |
| condense | 精简 | 你是文字精简专家 |
| modify | 修改 | 你是文字修改专家 |

### 技能链执行(SkillExecutionEngine)

| 步骤 | 方法名 | 逻辑 |
|---|---|---|
| 1. 收集技能 | opts.skillIds过滤 | 从opts.skillIds获取SkillManager.get(id) |
| 2. 获取自动验证器 | SkillExecutionEngine.getAutoValidators(type,opts) | 返回{validators,finalValidators} |
| 3. 获取验证供应商 | ProviderManager.getVerifyProvider() | 用于cross_model_check |
| 4. 链式执行 | SkillExecutionEngine.chain(prompt,skills,engineOpts) | S1输出->S2输入->...自动验证 |
| 5. 文本过滤 | _applyTextFilter(text,filterWords) | 若pl-text-filter-toggle开启，过滤敏感词 |
| 6. 返回 | _engineResult.text | 最终文本+reports |

### Pipeline数据管理

| 方法名 | 功能 | 数据存储 |
|---|---|---|
| _plData() | 读取当前项目的Pipeline数据 | StorageManager.get("project-"+projectId) |
| _plPersist(pl) | 持久化Pipeline数据 | StorageManager.set("project-"+projectId,pl) |
| _syncTreeToPipeline() | 章节树<->Pipeline双向同步 | 合并ChapterManager数据到pl.volumes |

Pipeline数据结构(pl):
```
{
  outlineText: "全书大纲",
  agentId: "当前智能体ID",
  chapterWordCount: 2000,
  s1Skills: [], s2Skills: [], s3Skills: [], s4Skills: [], s5Skills: [],
  volumes: [{ id, name, outline, cmId, chapters: [{ id, title, plot, body, bodyGenerated, updatedAt }] }]
}
```

### 拖拽排序

| 事件 | 方法名 | 逻辑 |
|---|---|---|
| dragstart | 记录拖拽源 | e.dataTransfer.setData("text/plain","") |
| dragover | 阻止默认+高亮 | 计算:before/:after插入位置 |
| dragleave | 移除高亮 | 清除drag-over类 |
| drop | 执行重排 | 根据拖拽源和目标位置重排DOM |
| dragend | 清理状态 | 移除所有拖拽相关类 |

## 去AI味流程

### 配置结构(_deAiConfig)
```
{
  skills: [],           // 技能ID数组
  agentId: null,        // 绑定智能体
  hardRulesEnabled: true, // 硬规则开关
  agentMode: "chain",   // chain | split-merge | multi-step
  splitSize: 1000,       // 分段大小(split-merge模式)
  level: "medium",      // low | medium | high
  version: "v3",        // v1 | v2 | v3
  textType: "novel",    // 文体类型
  filterWords: []       // 过滤词数组
}
```

### 三种模式

| 模式 | 方法名 | 逻辑 | 适用场景 |
|---|---|---|---|
| chain | deAiProcess()主流程 | S1->hardrule-mid->S2->...->hardrule-post 顺序链式执行 | 1-2个技能的简单改写 |
| split-merge | _deAiSplitMerge(text,cfg,cancel) | 文本按splitSize分段->并行处理->拼接 | 长文本快速处理 |
| multi-step | _deAiMultiStep(text,cfg,cancel) | 事件核->偏转->重组->验证 多步骤流程 | 需要>=3技能的深度改写 |

### chain模式详细流程

| 步骤 | 方法名 | 逻辑 |
|---|---|---|
| 1. 同步配置 | _syncDeAiConfigFromDOM() | 从DOM读取mode/splitSize/hardRules/agentId/level/version/textType/filterWords |
| 2. 构建步骤列表 | 构建steps数组 | S1 -> hardrule-mid(若多技能) -> S2 -> ... -> hardrule-post |
| 3. 显示进度 | _showDeAiProgress(steps) | 显示模态进度条+步骤列表 |
| 4. 逐步执行 | 循环steps | 每步更新进度 _updateDeAiProgress() |
| 5a. 技能步骤 | _aiRequest() | sysContent=技能模板, userContent=参数+文本(首步注入DeAiSamples风格样本) |
| 5b. 硬规则步骤 | DeAiProcessor.process()/processSafe() | mid=完整process, post=safe子集 |
| 6. AI验证AI | SkillValidators.cross_model_check() | S1输出后用verifyProvider交叉验证 |
| 7. 首主题验证 | SkillValidators.first_subject_different() | 检查首句主题是否改变 |
| 8. 温度控制 | _getDeAiTemperature(level,version,stage) | rewrite阶段高温, verify阶段低温 |
| 9. 写回结果 | editor.value = currentText | 更新编辑器+字数统计 |

### 进度显示

| 方法名 | 功能 |
|---|---|
| _showDeAiProgress(steps) | 创建进度模态框，每步骤生成dot+label+status |
| _updateDeAiProgress(steps,currentStep,totalSteps,subRatio) | 更新进度条百分比+步骤状态(等待/执行中/完成/失败) |
| _hideDeAiProgress() | 延迟600ms关闭，进度条动画到100% |

### 硬规则(DeAiProcessor)

| 方法名 | 逻辑 |
|---|---|
| DeAiProcessor.process(text,cfg) | 完整硬规则处理(mid步骤用) |
| DeAiProcessor.processSafe(text,cfg) | 安全子集处理(post步骤用，只做安全替换) |

### 验证器(SkillValidators)

| 验证器名 | 逻辑 |
|---|---|
| first_subject_different(output,original,opts,ctx) | 检查输出首句主题是否与原文不同 |
| cross_model_check(output,original,opts,ctx) | 用verifyProvider模型交叉验证输出质量，返回{ok,hint,score} |

### 去AI味设置面板(renderDeAiSettings)

| 元素 | ID | 说明 |
|---|---|---|
| 模式选择 | deai-mode-select | chain/split-merge/multi-step |
| 技能选择 | deai-skill-select[-sm/-ms] | 三种模式各一个select |
| 智能体选择 | deai-agent-select[-sm/-ms] | 三种模式各一个select |
| 强度单选 | input[name=deai-level] | low/medium/high |
| 版本单选 | input[name=deai-version] | v1/v2/v3 |
| 文体选择 | deai-text-type | 文体类型 |
| 硬规则开关 | deai-hardrule-enabled | checkbox |
| 分段大小 | deai-split-size[-ms] | split-merge/multi-step用 |
| 模式卡片 | .deai-mode-card | 点击切换模式 |
| 技能标签 | .deai-skill-chip | 已添加技能列表，可删除 |
| 验证状态 | .deai-verify-icon | [OK]/[!] 标记 |

## 多供应商逻辑

> 注: provider-manager.js 文件 NOT_FOUND，ProviderManager 逻辑嵌入在其他JS文件中(通过全局对象引用)

### ProviderManager API调用清单

| 方法名 | 调用位置 | 功能 | 返回值 |
|---|---|---|---|
| ProviderManager.get(id) | 多处 | 获取指定供应商 | {id,name,baseUrl,apiKey,models,streamMode,temperature,maxTokens,systemPrompt,purpose} |
| ProviderManager.getAll() | renderProfileList(), populateAgentProviderSelect() | 获取所有供应商 | 数组 |
| ProviderManager.add(obj) | saveSettingsFromForm() | 新增供应商 | {id,...} |
| ProviderManager.update(id,obj) | saveSettingsFromForm(), fetchModelList() | 更新供应商 | void |
| ProviderManager.getVerifyProvider() | 多处(deAi/apiGenerate等) | 获取purpose=verify的供应商 | {baseUrl,apiKey,model,name} 或 null |
| ProviderManager.getActiveProfile() | saveSettingsFromForm() | 获取当前启用供应商ID | string |
| ProviderManager.quickSwitch(id) | renderProfileList() | 快速切换供应商 | void |
| ProviderManager.listProfiles() | renderProfileList() | 列出供应商配置 | 数组 |

### 供应商用途(purpose)分类

| purpose值 | 用途 | 使用场景 |
|---|---|---|
| generate | 生成用供应商 | 默认，用于正文生成、对话 |
| verify | 验证用供应商 | 去AI味cross_model_check、技能链finalValidators |
| detect | 检测用供应商 | (定义存在，具体使用场景未明确) |

### 供应商编辑流程

| 步骤 | 方法名 | 逻辑 |
|---|---|---|
| 1. 进入编辑 | enterProviderEdit(id) | 隐藏listView显示editView，填充表单(名称/URL/Key/流式/温度/maxTokens/purpose/systemPrompt) |
| 2. 表单脏标记 | _formDirty=true | 任何字段change/input时标记 |
| 3. 获取模型 | fetchModelList() | 调用electronAPI.fetchModels(baseUrl,apiKey)，更新ProviderManager |
| 4. 测试连接 | testConnection() | 同fetchModelList但带超时10s和loading状态 |
| 5. 保存 | saveSettingsFromForm() | 验证必填->ProviderManager.add/update->同步settings(非verify/detect)->刷新UI |
| 6. 退出 | exitProviderEdit() | 检查_formDirty->确认放弃->隐藏editView显示listView->renderProfileList() |

### 模型选择逻辑(populateModelSelect)

| 步骤 | 逻辑 |
|---|---|
| 1. 收集当前供应商模型 | ProviderManager.get(currentProviderId).models |
| 2. 收集当前智能体模型 | AgentManager.get(currentAgentId).model |
| 3. 收集settings.model | this.settings.model |
| 4. 去重合并 | modelSet去重后生成option列表 |
| 5. 设置选中值 | sel.value = this.settings.model |
| 6. 同步聊天选择器 | selChat同步option和value |

### 智能体模型自动选择(_autoSelectAgentModel)

| 步骤 | 逻辑 |
|---|---|
| 1. 获取当前智能体 | AgentManager.get(currentAgentId) |
| 2. 若智能体有model | 在model-select中选中该model |
| 3. 同步聊天选择器 | model-select-chat同步 |

## 防断网机制

### 自动保存

| 功能 | 方法名 | 逻辑 |
|---|---|---|
| 输入自动保存 | editor-content input事件 -> _pushUndoState + updateWordCount + autoSave | 每次编辑器输入触发 |
| 定时自动保存 | _startAutoSaveTimer() | setInterval每30秒执行autoSave() |
| 停止定时器 | _stopAutoSaveTimer() | clearInterval清除定时器 |
| 退出前保存 | beforeunload事件 -> autoSave + _syncTreeToPipeline + _plPersist | 窗口关闭前保存 |

autoSave() 逻辑:
1. 检查currentProjectId/currentVolumeId/currentChapterId是否都存在
2. 读取editor-content.value
3. 在Pipeline数据中查找对应卷和章节，更新body/bodyGenerated/updatedAt
4. _plPersist(pl) 持久化Pipeline
5. ChapterManager.updateChapter() 同步到ChapterManager

### API请求重试与心跳恢复

| 功能 | 方法名 | 逻辑 |
|---|---|---|
| 重试策略 | _aiRequest()内循环 | 最多8次重试，递增延迟: 2s->4s->6s->8s->10s->12s->15s->20s |
| 429/502/503重试 | resp.status检查 | 自动重试，递增延迟 |
| 400自适应 | max_tokens自动减半 | 检测max_tokens相关400错误，减半后重试 |
| 客户端错误不重试 | 401/403/404 | 直接抛出，不重试 |
| 流式空闲检测 | Promise.race(chunk vs idle) | 15秒无数据触发idle_timeout，3次后降到10秒阈值 |
| 心跳恢复模式 | 所有重试耗尽后 | 每60秒探测一次API是否恢复，恢复后重新建立reader继续流式读取 |
| 超时控制 | AbortSignal.timeout(timeoutMs) | 默认600秒(10分钟)超时 |
| 信号合并 | AbortSignal.any([cfg.signal, timeout]) | 合并用户取消信号和超时信号 |

### 暂停/恢复生成

| 功能 | 方法名 | 逻辑 |
|---|---|---|
| 暂停标志 | _isPaused | 布尔值，默认false |
| 等待恢复 | _waitIfPaused() | 返回Promise，存入_resumeResolver |
| 流中暂停检查 | cfg.onPause回调 | 每个chunk处理前检查_onPause() |
| 恢复生成 | _resumeResolver() | 调用resolve恢复await |

### 取消机制

| 功能 | 方法名 | 逻辑 |
|---|---|---|
| 去AI味取消 | btn-deai-cancel -> cancelController.abort() | AbortController中断请求 |
| 聊天取消 | btn-send(流式时变停止按钮) -> abortController.abort() | 中断流式请求 |
| 批量审阅取消 | _batchReviewAborted = true | 标志位控制循环退出 |

### 章节树<->Pipeline同步

| 触发时机 | 方法名 | 逻辑 |
|---|---|---|
| 应用启动 | _syncTreeToPipeline() | init()内调用 |
| 关闭前 | _syncTreeToPipeline() + _plPersist() | beforeunload事件 |
| 打开章节 | _syncTreeToPipeline() | openChapter()内调用 |
| 删除章节 | _syncTreeToPipeline() | deleteChapterFromTree()后调用 |
| 创建卷 | _syncTreeToPipeline() | saveVolume()后调用 |
| 添加章节 | _syncTreeToPipeline() | addChapter()前后调用 |
| 设置变更 | _plData() + _plPersist() | 各处保存后调用 |

## 内联AI操作

| 操作 | 方法名 | 逻辑 |
|---|---|---|
| 改写 | _aiInlineAction("rewrite",text) | 填入聊天输入框+自动发送 |
| 扩写 | _aiInlineAction("expand",text) | 同上 |
| 润色 | _aiInlineAction("polish",text) | 同上 |
| 续写 | _aiInlineAction("continue",text) | 同上 |
| 精简 | _aiInlineAction("condense",text) | 同上 |

## 撤销/重做

| 功能 | 方法名 | 逻辑 |
|---|---|---|
| 推入撤销栈 | _pushUndoState() | editor input事件触发，比较_lastEditorSnapshot，最多50步 |
| 撤销 | _undo() | 从_undoStack弹出，推入_redoStack |
| 重做 | _redo() | 从_redoStack弹出，推入_undoStack |

## 查找替换

| 功能 | 方法名 | 逻辑 |
|---|---|---|
| 查找 | _doFind() | find-input input事件触发 |
| 下一个 | _findNext() | Enter或按钮 |
| 上一个 | _findPrev() | Shift+Enter或按钮 |
| 替换一个 | _replaceOne() | 替换当前匹配 |
| 全部替换 | _replaceAll() | 替换所有匹配 |
| 选中匹配 | _selectMatch() | setSelectionRange高亮匹配 |

## 导出功能

| 格式 | 方法名 | 逻辑 |
|---|---|---|
| Markdown | exportChapter("md") | Blob(text/markdown) + 下载 |
| TXT | exportChapter("txt") | Blob(text/plain) + 下载 |
| EPUB | exportChapter("epub") | _buildEpub()构建HTML打包为Blob |

## 快捷键

| 快捷键 | 功能 | 方法 |
|---|---|---|
| Ctrl+1 | 打开大纲工作台 | openOutlineWorkspace() |
| Ctrl+2 | 打开设定合集 | showSettingsCollection() |
| Ctrl+3 | 打开生成流水线 | showPipeline() |
| Ctrl+4 | 打开记忆管理 | showMemory() |
| Ctrl+5 | 打开插件市场 | showPluginMarket() |
| Ctrl+, | 打开设置 | toggleSettings(true) |
| Ctrl+Z | 撤销 | _undo() |
| Ctrl+Y | 重做 | _redo() |
| Ctrl+S | 保存编辑器 | saveEditorContent() |
| Escape | 关闭所有面板 | closeAllPanels() |
| Enter(聊天) | 发送消息 | sendMessage() |
| Shift+Enter(聊天) | 换行 | 默认行为 |
| Enter(查找) | 查找下一个 | _findNext() |
| Shift+Enter(查找) | 查找上一个 | _findPrev() |

## 面板调整器

| 功能 | 方法名 | 逻辑 |
|---|---|---|
| 章节树|编辑器 | _initPanelResizers() -> initResizer("resizer-chapter",...) | 拖拽调整宽度比例 |
| 编辑器|聊天 | initResizer("resizer-editor-chat",...) | 拖拽调整宽度比例 |

## 诊断日志(DiagLogger)

| 功能 | 方法名 | 逻辑 |
|---|---|---|
| 记录 | DiagLogger.info/warn/error(cat,msg,detail) | 分类记录日志 |
| 性能 | DiagLogger.perfStart/perfEnd(key,cat,label) | 性能计时 |
| API追踪 | DiagLogger.trackApiCall(model,tokens,duration,status,err) | API调用统计 |
| 去AI味追踪 | DiagLogger.trackDeAi(mode,skillCount,hardRules,duration,status) | 去AI味处理统计 |
| 导出 | DiagLogger.export() | 导出日志文件 |
| 清空 | DiagLogger.clear() | 清空所有日志 |
| 统计 | DiagLogger.getStats() | 返回{uptime,apiCalls,...} |
| 渲染面板 | renderDiagPanel() | 在设置diag tab中渲染日志列表 |

## CSS主要类名和布局结构

### 全局布局

| 类名/选择器 | 布局方式 | 说明 |
|---|---|---|
| #app-sidebar | 固定宽度 | 左侧导航栏(48px/44px响应式) |
| .sidebar-btn | 固定尺寸 | 侧边栏按钮(36x36/32x32响应式) |
| #chapter-tree | 固定宽度(min180-max240) | 章节树面板 |
| .editor-panel | flex:1 | 编辑器主面板 |
| #chat-panel | 固定宽度 | 聊天面板 |
| .header-selector | max-width限制 | 顶部选择器(agent-select/model-select) |
| .breadcrumb-bar | 水平排列 | 面包屑导航 |
| .breadcrumb-home | 链接 | 首页链接 |
| .breadcrumb-item | 链接 | 面板项(可关闭) |

### 模态框

| 类名 | 说明 |
|---|---|
| .modal-backdrop | 模态框背景遮罩 |
| .modal-content | 模态框内容容器 |
| .modal-header | 模态框头部 |
| .modal-body | 模态框主体 |
| .modal-footer | 模态框底部 |
| .modal-tab | 设置内Tab标签 |
| .modal-tab.active | 激活的Tab |
| .tab-content | Tab内容区 |
| .tab-content.visible | 可见Tab内容 |
| .modal-hidden | 隐藏的模态框 |
| .visible | 可见状态类 |

### 编辑器

| 类名 | 说明 |
|---|---|
| .editor-toolbar | 编辑器工具栏(flex,可wrap) |
| .editor-toolbar-sep | 工具栏分隔符 |
| .editor-toolbar-btn | 工具栏按钮 |
| #editor-content | 编辑器文本域 |
| #editor-title | 编辑器标题 |
| .input-hint | 输入提示 |
| .config-status | 配置状态文本 |
| .loading-overlay | 加载遮罩(absolute,inset:0) |
| .empty-state | 空状态提示 |

### 章节树

| 类名 | 说明 |
|---|---|
| .tree-volume | 卷容器 |
| .tree-volume-header | 卷头部(可点击展开) |
| .tree-chapters | 章节列表 |
| .tree-chapters.open | 展开的章节列表 |
| .tree-chapter | 章节项 |
| .tree-chapter.active | 当前选中章节 |
| .tree-actions | 章节操作按钮区 |
| .tree-add-btn | 添加按钮 |
| .tree-gen-btn | AI生成按钮 |
| .arrow | 展开/折叠箭头 |

### 聊天面板

| 类名 | 说明 |
|---|---|
| #messages-list | 消息列表 |
| #chat-empty-state | 聊天空状态 |
| .message-content | 消息内容 |
| .msg-actions | 消息操作区 |
| .msg-btn-regen | 重新生成按钮 |
| #user-input | 用户输入框 |
| #btn-send | 发送/停止按钮 |
| .btn-stop | 停止状态按钮 |
| #char-count | 字符计数 |

### 供应商管理

| 类名 | 说明 |
|---|---|
| #provider-list-view | 供应商列表视图 |
| #provider-edit-view | 供应商编辑视图 |
| .provider-card | 供应商卡片 |
| .provider-card-edit | 供应商编辑按钮 |
| .provider-model-item | 模型列表项 |
| .provider-model-active | 当前启用模型 |
| .provider-model-enable | 启用模型按钮 |
| .provider-model-name | 模型名称 |
| .provider-badge | 供应商徽章 |
| .provider-badge-on | 启用中徽章 |

### 去AI味

| 类名 | 说明 |
|---|---|
| .deai-mode-card | 模式卡片 |
| .deai-mode-card-body | 模式卡片内容 |
| .deai-step-item | 步骤列表项 |
| .deai-step-dot | 步骤圆点 |
| .deai-step-label | 步骤标签 |
| .deai-step-status | 步骤状态文本 |
| .deai-skill-chip | 技能标签 |
| .deai-skill-remove | 技能删除按钮 |
| .deai-verify-icon | 验证图标 |

### 生成流水线

| 类名 | 说明 |
|---|---|
| .pl-main | 流水线主容器(flex column) |
| .pl-body | 流水线主体(flex) |
| .pl-steps | 步骤侧栏(clamp 140-200px) |
| .pl-step-num | 步骤编号圆形 |
| .pl-content | 内容区(flex:1) |
| .pl-actions | 操作区 |
| .pl-gen-options | 生成选项 |
| .pl-checkboxes | 复选框组 |
| .pl-nav | 导航区 |
| .pl-gen-cat | 生成分类标签 |

### 设定合集

| 类名 | 说明 |
|---|---|
| .sc-main | 主容器(flex column) |
| .sc-body | 主体(flex) |
| .sc-categories | 分类侧栏(clamp 130-180px) |
| .sc-items-area | 条目区(flex:1) |
| .sc-detail-area | 详情区(clamp 220-320px) |
| .sc-detail-area.visible | 可见详情区 |
| .sc-detail-header | 详情头部 |
| .sc-detail-attr | 详情属性行 |
| .sc-detail-actions | 详情操作区 |
| .sc-item-header | 条目头部 |
| .sc-item-actions | 条目操作区 |
| .sc-attr-row | 属性行 |

### 记忆管理

| 类名 | 说明 |
|---|---|
| .mem-main | 主容器(flex column) |
| .mem-body | 主体(flex) |
| .mem-sidebar | 侧栏(clamp 130-180px) |
| .mem-cat-list | 分类列表(flex column) |
| .mem-content | 内容区(flex:1) |
| .mem-content-header | 内容头部 |
| .mem-item-header | 条目头部 |
| .mem-item-actions | 条目操作区 |
| .mem-form | 表单区 |

### 大纲工作台

| 类名 | 说明 |
|---|---|
| .ow-main | 主容器(flex) |
| .ow-editor | 编辑器区(flex:7) |
| .ow-sidebar | 侧边栏(flex:3) |
| #ow-chat-area | 聊天区 |
| .ow-chat-area .chat-input-row | 聊天输入行 |

### Diff对比

| 类名 | 说明 |
|---|---|
| .diff-toolbar | Diff工具栏(flex) |
| .diff-container | Diff容器(flex) |
| .diff-pane | Diff面板(flex:1) |
| .diff-line | Diff行 |
| .diff-line.removed | 删除行 |
| .diff-line.added | 新增行 |

### 仪表盘

| 类名 | 说明 |
|---|---|
| .dashboard-grid | 仪表盘网格(grid auto-fit minmax 180px) |
| .dashboard-bar-chart | 柱状图(flex column) |
| .dashboard-bar-row | 柱状图行(flex) |

### 章节概述

| 类名 | 说明 |
|---|---|
| .chapter-overview | 概述面板 |
| .chapter-overview.visible | 可见状态 |
| .chapter-overview-header | 头部(flex space-between) |
| .chapter-overview-close | 关闭按钮 |
| .chapter-overview-section | 区块 |
| .chapter-overview-section-title | 区块标题 |
| .chapter-overview-loading | 加载中(flex) |
| .spinner | 加载动画 |
| .progress-bar | 进度条 |

### 按钮系统

| 类名 | 说明 |
|---|---|
| .btn-primary | 主要按钮 |
| .btn-secondary | 次要按钮 |
| .btn-danger | 危险按钮 |
| .btn-icon | 图标按钮 |
| .btn-sm | 小按钮 |
| .btn-disabled | 禁用状态(opacity:0.45) |
| button:focus-visible | 焦点可见(outline:2px accent) |

### 其他

| 类名/选择器 | 说明 |
|---|---|
| .skill-area-header | 技能区头部(flex space-between) |
| .skill-card | 技能卡片 |
| .skill-card-header | 技能卡片头部 |
| .skill-card-name | 技能名称 |
| .skill-card-badge | 技能分类徽章 |
| .skill-card-desc | 技能描述 |
| .skill-card-meta | 技能元信息 |
| .skill-card-actions | 技能操作区 |
| .section-header | 区块头部(flex space-between) |
| .item-list | 条目列表(flex column) |
| .item-row | 条目行(flex space-between) |
| .item-actions | 条目操作(flex) |
| .var-tags | 变量标签(flex wrap) |
| .password-row | 密码行(flex) |
| .checkbox-label | 复选框标签(flex) |
| .kbd-shortcuts | 快捷键说明(flex column) |
| .kbd-row | 快捷键行(flex) |
| .token-input-row | Token输入行(flex) |
| .tab.active | 激活Tab(accent下边框) |
| .pl-ch-card-actions | 章节卡片操作 |
| .btn-save-ch | 保存章节按钮 |
| .btn-confirm-ch | 确认章节按钮 |
| .btn-delete-ch | 删除章节按钮 |

### 响应式断点

| 断点 | 调整内容 |
|---|---|
| @media min1024 max1279 | 字体clamp(12,0.9vw,14), 章节树180-240px, 工具栏wrap |
| @media min800 max1023 | 字体clamp(11,1vw,13), 侧边栏48px, 按钮36x36, 章节树150-200px |
| @media max799 | 字体sm, 侧边栏44px, 按钮32x32, 章节树display:none |

### CSS变量体系

| 变量类别 | 示例 | 说明 |
|---|---|---|
| 字体 | --font-size, --font-size-sm, --font-size-xs, --font-size-editor | 字号体系 |
| 间距 | --space-xs/sm/md/lg, --gap, --btn-gap | 间距体系 |
| 颜色 | --text-primary/secondary/muted, --bg-primary/secondary/tertiary, --accent, --danger, --success | 颜色体系 |
| 边框 | --border-color, --border-light, --radius-sm | 边框圆角 |
| 过渡 | --transition-fast, --transition-card | 动画过渡 |
| 模糊 | --blur-sm, --bg-glass | 毛玻璃效果 |
| 层级 | --z-overlay | z-index层级 |
| 按钮 | --btn-tight-padding, --btn-xxs-padding | 按钮内边距 |
| 主题 | body.light-theme | 亮色主题切换 |
