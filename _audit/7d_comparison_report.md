 # 旧架构 v2.7.63 vs 新架构 Vue3 — 七维度完整对比报告
 
 > 数据来源：旧架构 `old_arch_features.md`(688行) + 新架构 `vue3_components.md`(445行)
 > 旧架构源文件：renderer_v2.js (5294行) + style.css (6246行) + panels.js + renderer.html + main.js
 > 新架构源文件：27个Vue组件 + 9个Pinia stores + 6个IPC模块
 > 生成时间：2026-08-09
 
 ---
 
 ## 一、功能对比
 
 ### 1.1 生成流水线
 
 | 功能项 | 旧架构 v2.7.63 | 新架构 Vue3 | 差异 |
 |---|---|---|---|
 | 大纲生成 | apiGenerate("outline") | PipelinePanel step 0 | 对等 |
 | 设定生成 | apiGenerate("settings") | PipelinePanel step 1 | 对等 |
 | 卷纲生成 | apiGenerate("volumes") + AI生成全卷 + 逐卷生成 + 续生成 | PipelinePanel genVolumes('auto'/'continue'/'resume') + genSingleVolume | 对等 |
 | 章节生成 | apiGenerate("chapters") + 批量(每批20章) + 5次重试 + 3次补全 | PipelinePanel genChapters + genChaptersAuto + resumeGen | 对等 |
 | 正文生成 | apiGenerate("body") + S5技能 | PipelinePanel genBody + genBodyAuto + genBodyForSelected | 对等 |
 | 16种API类型 | outline/skills/settings/volumes/chapters/body/character/worldview/rewrite/expand/polish/translate/style/regenerate/continue/condense/modify | 仅支持5步流水线对应的类型 | **旧架构多出11种API类型** |
 | AI起名 | generateNames(character/location/faction/item) → 10个JSON名称 → 自动写入设定合集 | 无 | **旧架构独有** |
 | 写作规则 | generateWritingRules(outline) → JSON写作规则 → 自动写入设定合集 | 无 | **旧架构独有** |
 | 时间线提取 | extractTimeline(outline) | 无 | **旧架构独有** |
 | 批量审阅 | batchReviewChapters() → {score,issues,suggestions} | 无 | **旧架构独有** |
 | 章节修订 | reviseChapter(chapterId) → AI改善文笔/修正逻辑 | 无 | **旧架构独有** |
 | 内联AI操作 | _aiInlineAction: rewrite/expand/polish/continue/condense (选中文本触发) | 无 | **旧架构独有** |
 | 大纲工作台 | openOutlineWorkspace() — 独立面板含编辑器+AI对话 | OutlineWorkspace.vue NOT_FOUND | **旧架构独有** |
 | 设定合集面板 | showSettingsCollection() — 分类侧栏+条目区+详情区 | ScPanel.vue NOT_FOUND | **旧架构独有** |
 | 技能绑定到节点 | showSkillBindingModal() — 绑定技能到卷/章级别 | 无 | **旧架构独有** |
 | 卷编辑模态框 | showVolumeForm() — 编辑卷名/章节数 | PipelinePanel内联编辑 | 实现方式不同 |
 
 ### 1.2 去AI味
 
 | 功能项 | 旧架构 v2.7.63 | 新架构 Vue3 | 差异 |
 |---|---|---|---|
 | chain模式 | S1→hardrule-mid→S2→...→hardrule-post | DeAiSettings + deAiStore | 对等 |
 | split-merge模式 | _deAiSplitMerge: 切分→并行→拼接 | DeAiSettings mode卡片 | 对等 |
 | multi-step模式 | _deAiMultiStep: 事件核→偏转→重组→验证 | DeAiSettings mode卡片 | 对等 |
 | 硬规则 | DeAiProcessor.process(20条) + processSafe(安全子集) | deAiStore.hardruleEnabled toggle | 对等 |
 | 风格样本 | DeAiSamples.getSampleText() — 38个样本注入S1 | 无独立组件 | **旧架构更完整** |
 | cross_model_check | SkillValidators.cross_model_check() — verifyProvider交叉验证 | store中有引用 | 对等 |
 | first_subject_different | SkillValidators.first_subject_different() — 首句主语验证 | 无明确实现 | **旧架构独有** |
 | 温度控制 | _getDeAiTemperature(level,version,stage) — rewrite高温/verify低温0.3 | 无温度分层 | **旧架构独有** |
 | 流程预览 | _showDeAiProgress(steps) — 动态按模式生成步骤图 | DeAiFlowPreview组件 | 对等 |
 | 进度弹窗 | deai-progress-modal + 步骤列表 + 取消按钮 | DeAiProgress组件 (无取消按钮) | **旧架构更完整** |
 | 模式卡片 | .deai-mode-card 点击切换 | DeAiModeCard组件 | 对等 |
 | 验证供应商状态 | deai-verify-provider-status | DeAiSettings computed verifyProvider | 对等 |
 | 进度取消 | btn-deai-cancel → cancelController.abort() | 无取消按钮 | **旧架构独有** |
 
 ### 1.3 多供应商
 
 | 功能项 | 旧架构 v2.7.63 | 新架构 Vue3 | 差异 |
 |---|---|---|---|
 | 供应商用途 | purpose: generate/verify/detect | purpose: generate/verify | 旧多detect |
 | 快速切换 | ProviderManager.quickSwitch(id) | 无 | **旧架构独有** |
 | 供应商卡片 | .provider-card + 编辑/启用徽章 | ApiSettings v-for列表 | 对等 |
 | 模型获取 | fetchModelList() + testConnection() | fetchModels() | 对等 |
 | 模型启用 | activateProviderModel(m) | p.selectedModel绑定 | 对等 |
 | 获取模型URL拼接 | 正确处理baseUrl含/v1 | 修复了双/v1拼接 | 新架构修复了bug |
 
 ### 1.4 防断网机制
 
 | 功能项 | 旧架构 v2.7.63 | 新架构 Vue3 | 差异 |
 |---|---|---|---|
 | 自动保存 | 30秒定时 + 输入触发 + 退出前保存 | 30秒硬编码(未读autoSaveInterval) | **旧架构更完整** |
 | API重试 | 8次递增 2s→4s→6s→8s→10s→12s→15s→20s | 8次递增 30s→240s | 策略不同 |
 | 429/502/503重试 | 自动重试 | 自动重试 | 对等 |
 | 400自适应 | max_tokens自动减半重试 | 无 | **旧架构独有** |
 | 流式空闲检测 | 15秒无数据→idle_timeout，3次后降到10秒 | 无 | **旧架构独有** |
 | 心跳恢复 | 60秒探测API恢复→重建reader | 无 | **旧架构独有** |
 | 暂停/恢复 | _isPaused + _waitIfPaused + _resumeResolver | 无 | **旧架构独有** |
 | 超时控制 | AbortSignal.timeout(600秒) + AbortSignal.any | 无明确实现 | **旧架构独有** |
 | 章节批量续生成 | resumeGen() 断点续传 | resumeGen() | 对等 |
 
 ### 1.5 章节树
 
 | 功能项 | 旧架构 v2.7.63 | 新架构 Vue3 | 差异 |
 |---|---|---|---|
 | 展开/折叠卷 | toggleVolume(id) | toggleVolume() | 对等 |
 | 查看卷纲 | openVolumeOutline(id) → 编辑器切vol-outline模式 | 无 | **旧架构独有** |
 | 查看章节剧情 | openChapterPlot(vid,cid) → 编辑器切ch-plot模式 | 无 | **旧架构独有** |
 | 打开章节正文 | openChapter(vid,cid) → 编辑器切ch-body模式 | selectChapter() → editorStore.openTab | 实现方式不同 |
 | 删除章节 | deleteChapterFromTree() | 无 | **旧架构独有** |
 | 添加章节 | addChapter(vid) | 无 | **旧架构独有** |
 | AI生成章节 | _treeGenChapters(vid) | 无(仅流水线面板) | **旧架构独有** |
 | AI生成正文 | _treeGenBody(vid,cid) | 无(仅流水线面板) | **旧架构独有** |
 | 添加卷 | showVolumeForm() | 无(仅流水线面板) | **旧架构独有** |
 | 拖拽排序 | dragstart/dragover/drop → 重排卷/章节顺序 | 无 | **旧架构独有** |
 | 双击重命名 | dblclick → 内联编辑章节名 | 无 | **旧架构独有** |
 | 右键菜单 | contextmenu → 生成章节/正文/绑定技能 | 无 | **旧架构独有** |
 | 虚拟滚动 | 无 | vue-virtual-scroller (50+条触发) | **新架构独有** |
 
 ### 1.6 编辑器
 
 | 功能项 | 旧架构 v2.7.63 | 新架构 Vue3 | 差异 |
 |---|---|---|---|
 | 撤销/重做 | _undo()/_redo() 栈深度50 | document.execCommand('undo') 已废弃 | **旧架构更可靠** |
 | 查找替换 | _doFind/_findNext/_findPrev/_replaceOne/_replaceAll | findNext/replaceAll (功能不完整) | **旧架构更完整** |
 | 导出 | md/txt/epub | md/txt/epub | 对等 |
 | 主题切换 | _toggleTheme() dark/light | 无 | **旧架构独有** |
 | 编辑器多模式 | vol-outline/ch-plot/ch-body | 仅标签页模式 | **旧架构更灵活** |
 
 ### 1.7 其他功能
 
 | 功能项 | 旧架构 v2.7.63 | 新架构 Vue3 | 差异 |
 |---|---|---|---|
 | 记忆管理面板 | showMemory() — 分类侧栏+条目区+表单 | 无 | **旧架构独有** |
 | 插件市场 | showPluginMarket() — GitHub搜索+Token+分页 | 无 | **旧架构独有** |
 | 写作仪表盘 | showWritingDashboard() — 项目/字数/章节统计+柱状图 | 无 | **旧架构独有** |
 | Diff对比 | _showDiffView() — 逐行Diff+接受/拒绝+导航 | 无 | **旧架构独有** |
 | 诊断日志 | DiagLogger — 分类记录+性能+API追踪+导出 | DiagLogPanel — 读取/导出/清空 | 对等(新架构更简洁) |
 | 面包屑导航 | _updateBreadcrumb() — 面板链路导航 | 无 | **旧架构独有** |
 | 面板调整器 | _initPanelResizers() — 拖拽调整宽度 | 无 | **旧架构独有** |
 | 技能测试 | _runSkillTest(id) — 模拟selectedText注入 | 无 | **旧架构独有** |
 | 智能体测试 | runAgentTest() | 无 | **旧架构独有** |
 | 退出确认 | saveAndExit()/directExit() | 无 | **旧架构独有** |
 | 快捷键 | Ctrl+1~5/Ctrl+,/Ctrl+Z/Y/S/Esc | Ctrl+S | **旧架构更完整** |
 | 项目管理 | openProjectModal + createProject + deleteProject | ChapterTree内联创建 | **旧架构更完整** |
 
 ### 1.8 功能数量统计
 
 | 维度 | 旧架构 | 新架构 | 差距 |
 |---|---|---|---|
 | 按钮数 | 90+ | ~70 | 旧多20+ |
 | 下拉框 | 16 | ~12 | 旧多4 |
 | 面板/模态框 | 25+ | ~15 | 旧多10+ |
 | API类型 | 16 | 5 | 旧多11 |
 | 快捷键 | 12+ | 1 | 旧多11 |
 | 独有功能 | — | 虚拟滚动 | 新多1 |
 
 ---
 
 ## 二、链路对比
 
 ### 2.1 生成流水线链路
 
 **旧架构链路：**
 ```
 大纲层：识别大纲内容+字数→记录→联动SKILL→生成大纲
   ↓
 设定层：识别大纲→基调锚点→类型边界→伏笔ID→能量标注→联动SKILL→生成设定JSON
   ↓
 卷纲层：识别大纲+设定+字数分配→联动SKILL→逐卷/全卷生成卷纲(outline+summary+suggestedWords)
   ↓
 章节层：识别卷纲outline+总章数+单章字数→联动SKILL→生成章节JSON(title+plot)
   ↓
 正文层：识别大纲+设定+卷概要+章节剧情→联动SKILL(S1→S2→...→S5)→生成正文
 ```
 数据流：StorageManager ←→ Pipeline数据结构 ←→ 章节树 ←→ 编辑器
 
 **新架构链路：**
 ```
 PipelinePanel step 0：大纲输入→projectStore.setOutline
   ↓
 PipelinePanel step 1：AI生成设定→extractJsonArray→validateSettings
   ↓
 PipelinePanel step 2：AI生成卷纲→genVolumes(auto/continue/resume)
   ↓
 PipelinePanel step 3：AI生成章节→genChapters/genChaptersAuto/resumeGen
   ↓
 PipelinePanel step 4：AI生成正文→genBody/genBodyAuto→insertToEditor
 ```
 数据流：Pinia stores ←→ IPC ←→ Electron main ←→ 文件系统
 
 **差异：**
 - 旧架构的链路完整覆盖大纲→设定→卷纲→章节→正文，每步都有独立的API类型和SKILL联动
 - 新架构链路结构对等，但缺少：大纲工作台(AI共创)、设定合集(独立面板)、技能绑定到节点、内联AI操作
 - 旧架构的SKILL联动通过SkillExecutionEngine.chain()实现，新架构通过PipelinePanel内联callApi
 - 旧架构支持编辑器多模式(vol-outline/ch-plot/ch-body)，新架构只有标签页模式
 
 ### 2.2 去AI味链路
 
 **旧架构：**
 ```
 用户点击去AI味 → _syncDeAiConfigFromDOM() → 构建steps
   → chain: S1→hardrule-mid→S2→hardrule-post (顺序执行)
   → split-merge: 切分→Promise.all并行→拼接
   → multi-step: 事件核→偏转→重组→验证
   → 每步: _aiRequest(sysContent=技能模板, userContent=文本+风格样本)
   → S1后: cross_model_check + first_subject_different
   → 温度: rewrite高温 / verify低温0.3
   → 写回编辑器 + 更新字数统计
 ```
 
 **新架构：**
 ```
 用户点击去AI味 → triggerDeAi() → deAiStore.deAiProcess
   → 3种模式(chain/split-merge/multi-step)
   → 技能链执行
   → 进度显示(DeAiProgress/DeAiFlowPreview)
   → 写回editorStore
 ```
 
 **差异：**
 - 旧架构有温度分层(rewrite高温/verify低温)，新架构无
 - 旧架构有首句主语验证器，新架构无明确实现
 - 旧架构有进度取消按钮，新架构无
 - 旧架构有38个风格样本注入S1，新架构无独立样本管理
 - 新架构的deAiStore分离了状态管理，但执行逻辑可能不如旧架构完整
 
 ### 2.3 防断网链路
 
 **旧架构：**
 ```
 请求 → _aiRequest → 流式读取 → chunk处理
   → 429/502/503: 递增重试8次(2s→20s)
   → 400: max_tokens减半重试
   → 流式空闲15s: idle_timeout, 3次后降到10s
   → 所有重试耗尽: 60秒心跳探测→恢复后重建reader
   → 暂停/恢复: _isPaused→_waitIfPaused→_resumeResolver
   → 超时: AbortSignal.timeout(600s) + AbortSignal.any
 ```
 
 **新架构：**
 ```
 请求 → callApi → 流式解析 → 429重试8次(30s→240s)
   → resumeGen() 断点续传
 ```
 
 **差异：**
 - 旧架构有6层防断网(重试/400自适应/空闲检测/心跳/暂停恢复/超时控制)，新架构仅2层(重试+续传)
 - 旧架构的重试间隔更密集(2s起)，新架构更保守(30s起)
 - 旧架构有流式空闲检测和心跳恢复，新架构无
 - 旧架构有暂停/恢复机制，新架构无
 
 ---
 
 ## 三、交互对比
 
 ### 3.1 事件绑定
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 绑定方式 | addEventListener + onclick + 事件委托(data-a属性) | @click / v-on / @change / @input |
 | 事件委托 | data-a属性值→switch分支处理 | 无，每个按钮独立绑定 |
 | CustomEvent | generate-body / insert-text / clear-chat | generate-body / insert-text / clear-chat |
 | 快捷键 | keydown全局监听→Ctrl+1~5/,/Z/Y/S/Esc | Ctrl+S (仅一个) |
 
 ### 3.2 面板切换
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 机制 | classList.add/remove("visible") + style.display | v-if / v-show |
 | 设置Tab | switchTab(tabName)→7步DOM操作 | settingsStore.setActiveTab |
 | 模态框 | classList + display + 动态创建 | v-if控制 |
 | 面包屑 | _updateBreadcrumb()自动更新 | 无 |
 
 ### 3.3 拖拽
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 章节排序 | dragstart/dragover/drop → 重排卷/章节 | 无 |
 | 面板宽度 | _initPanelResizers() → 拖拽调整 | 无 |
 | 技能排序 | 上下箭头按钮 | 上下箭头按钮 |
 
 ### 3.4 右键菜单
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 章节树右键 | showContextMenu() → 生成章节/正文/绑定技能 | 无 |
 | 编辑器选中 | _checkInlineMenu() → 改写/扩写/润色/续写/精简 | 无 |
 
 ### 3.5 组件通信
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 状态共享 | 全局变量 + this引用 | Pinia stores (9个) |
 | 组件通信 | CustomEvent + 直接方法调用 | props/emit/store |
 | 数据持久化 | StorageManager → localStorage | electronAPI → 文件系统 |
 
 ---
 
 ## 四、UI设计对比
 
 ### 4.1 布局结构
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 整体布局 | 三栏(章节树|编辑器|聊天) + 侧边栏 + 面包屑 | 三栏(章节树|编辑器|聊天) + 侧边栏 |
 | 侧边栏 | 固定48px/44px(响应式) | 固定宽度 |
 | 章节树 | 180-240px(min-max) | 虚拟滚动(50+触发) |
 | 编辑器 | flex:1 | flex:1 |
 | 聊天面板 | 固定宽度 | 固定宽度 |
 | 面板调整 | resizer拖拽调整宽度 | 无 |
 
 ### 4.2 配色方案
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 主色 | --accent | 需确认Vue3 CSS变量 |
 | 主题 | dark/light 切换 | 无主题切换 |
 | 背景 | --bg-primary/secondary/tertiary | 需确认 |
 | 文字 | --text-primary/secondary/muted | 需确认 |
 | 状态色 | --danger/--success | 需确认 |
 
 ### 4.3 模态框设计
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 遮罩 | .modal-backdrop | 遮罩+@click.self关闭 |
 | 内容 | .modal-content/header/body/footer | 组件化 |
 | Tab | 7步DOM操作(active/visible/display) | settingsStore状态驱动 |
 | 动态创建 | 部分模态框运行时动态创建DOM | v-if控制 |
 
 ### 4.4 按钮设计
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 按钮系统 | .btn-primary/.btn-secondary/.btn-danger/.btn-icon/.btn-sm | 组件内样式 |
 | 禁用 | .btn-disabled (opacity:0.45) | :disabled绑定 |
 | 焦点 | button:focus-visible (outline:2px accent) | 需确认 |
 
 ---
 
 ## 五、UI规格对比
 
 ### 5.1 CSS变量体系
 
 | 变量类别 | 旧架构 | 新架构 |
 |---|---|---|
 | 字体 | --font-size/sm/xs/editor | 需确认scoped样式 |
 | 间距 | --space-xs/sm/md/lg, --gap, --btn-gap | 需确认 |
 | 颜色 | --text-primary/secondary/muted, --bg-*, --accent, --danger, --success | 需确认 |
 | 边框 | --border-color, --border-light, --radius-sm | 需确认 |
 | 过渡 | --transition-fast, --transition-card | 需确认 |
 | 模糊 | --blur-sm, --bg-glass | 需确认 |
 | 层级 | --z-overlay | 需确认 |
 | 按钮 | --btn-tight-padding, --btn-xxs-padding | 需确认 |
 
 ### 5.2 响应式设计
 
 | 断点 | 旧架构调整 | 新架构 |
 |---|---|---|
 | min1024 max1279 | 字体clamp(12,0.9vw,14), 章节树180-240, 工具栏wrap | 需确认 |
 | min800 max1023 | 字体clamp(11,1vw,13), 侧边栏48px, 按钮36x36, 章节树150-200 | 需确认 |
 | max799 | 字体sm, 侧边栏44px, 按钮32x32, 章节树display:none | 需确认 |
 
 ### 5.3 组件规格
 
 | 组件 | 旧架构规格 | 新架构规格 |
 |---|---|---|
 | 章节树 | min180-max240px, 拖拽调整 | 虚拟滚动(RecycleScroller) |
 | 侧边栏按钮 | 36x36/32x32(响应式) | 需确认 |
 | 流水线步骤侧栏 | clamp 140-200px | 需确认 |
 | 设定合集分类 | clamp 130-180px | 无此组件 |
 | 设定合集详情 | clamp 220-320px | 无此组件 |
 | 记忆管理侧栏 | clamp 130-180px | 无此组件 |
 | 大纲工作台编辑器 | flex:7 | 无此组件 |
 | 大纲工作台侧边栏 | flex:3 | 无此组件 |
 
 ---
 
 ## 六、整体设计对比
 
 ### 6.1 架构模式
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 框架 | 纯HTML5+CSS3+JS ES6(class语法) | Vue3+Pinia+Vite+Electron |
 | 文件组织 | 单文件(renderer_v2.js 5294行) + 独立模块 | 27组件+9 stores+6 IPC模块 |
 | 状态管理 | 全局变量+this引用+StorageManager | Pinia响应式store |
 | 数据持久化 | StorageManager→localStorage | electronAPI→文件系统 |
 | 代码复用 | 全局类+方法 | 组件化+composables |
 
 ### 6.2 可维护性
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 单文件复杂度 | renderer_v2.js 5294行，极高 | 组件最大PipelinePanel，中等 |
 | 关注点分离 | 低(全在一个文件) | 高(组件+store分离) |
 | 类型安全 | 无 | TypeScript(.ts stores) |
 | 测试性 | 低(全局状态耦合) | 中(store可独立测试) |
 
 ### 6.3 扩展性
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 新增功能 | 在renderer_v2.js中添加方法+DOM | 新建组件+store模块 |
 | 状态组合 | 手动同步全局变量 | store组合(computed) |
 | 未来方向 | 难以加MCP/Agent | 框架支持插件化 |
 
 ---
 
 ## 七、渲染对比
 
 ### 7.1 DOM操作方式
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 渲染方式 | 命令式DOM操作(innerHTML/textContent/createElement) | 声明式渲染(Vue模板→虚拟DOM) |
 | 列表渲染 | 手动拼接HTML字符串→innerHTML | v-for指令 |
 | 条件渲染 | classList.add/remove + style.display | v-if/v-show |
 | 状态更新 | 手动操作DOM(查元素→改属性) | 响应式自动更新(ref/reactive/computed) |
 | 事件绑定 | addEventListener/onclick | @click/@change/@input |
 
 ### 7.2 CSS作用域
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 作用域 | 全局(style.css 6246行) | scoped(组件内) |
 | 变量 | :root全局CSS变量 | 需确认(可能scoped内或全局) |
 | 样式冲突 | 高(全局覆盖) | 低(scoped隔离) |
 
 ### 7.3 性能特征
 
 | 维度 | 旧架构 | 新架构 |
 |---|---|---|
 | 初始渲染 | 快(无虚拟DOM开销) | 稍慢(虚拟DOM+组件挂载) |
 | 更新性能 | 手动操作DOM，大列表可能卡顿 | 虚拟DOM diff，自动优化 |
 | 章节树性能 | 无虚拟滚动，大量章节会卡 | 虚拟滚动(50+触发)，流畅 |
 | 内存 | 单文件+全局变量 | 组件实例+store+虚拟DOM |
 
 ---
 
 ## 总结
 
 ### 旧架构优势（需在新架构中补齐的功能）
 
 1. **功能完整度高**：16种API类型 vs 5种，多出AI起名/写作规则/时间线/批量审阅/章节修订/内联AI操作
 2. **防断网6层机制**：重试/400自适应/空闲检测/心跳/暂停恢复/超时控制，新架构仅2层
 3. **章节树功能完整**：拖拽排序/双击重命名/右键菜单/AI生成/多模式编辑器
 4. **去AI味更深入**：温度分层/首句主语验证/进度取消/38个风格样本
 5. **编辑器功能完整**：查找替换完整/撤销重做栈/主题切换/Diff对比
 6. **独立面板多**：大纲工作台/设定合集/记忆管理/插件市场/写作仪表盘
 7. **快捷键完整**：12+快捷键 vs 1个
 8. **项目管理完整**：创建/删除/打开独立模态框
 
 ### 新架构优势
 
 1. **组件化**：27个独立组件，关注点分离
 2. **状态管理**：Pinia 9个store，响应式自动同步
 3. **虚拟滚动**：章节树50+条触发虚拟滚动，解决大量章节性能问题
 4. **TypeScript**：stores使用.ts，类型安全
 5. **扩展性**：框架支持未来加MCP/Agent/插件
 6. **文件系统持久化**：比localStorage更可靠
 
 ### 需要补齐的功能清单（按优先级）
 
 | 优先级 | 功能 | 影响 |
 |---|---|---|
 | P0 | 防断网6层机制 | 用户最痛点(断网丢数据) |
 | P0 | 章节树完整功能(拖拽/右键/AI生成/多模式) | 核心交互缺失 |
 | P0 | 快捷键系统 | 用户体验 |
 | P1 | 去AI味温度分层+首句验证+进度取消 | 去AI味功能不完整 |
 | P1 | 查找替换完整功能 | 编辑器基础功能 |
 | P1 | 主题切换(dark/light) | 用户体验 |
 | P1 | 撤销重做栈(替代execCommand) | 编辑器可靠性 |
 | P2 | 大纲工作台面板 | AI共创功能 |
 | P2 | 设定合集面板 | 设定管理 |
 | P2 | 记忆管理面板 | 项目记忆 |
 | P2 | Diff对比模态框 | 内容对比 |
 | P2 | 写作仪表盘 | 统计信息 |
 | P2 | 插件市场 | 扩展功能 |
 | P3 | AI起名/写作规则/时间线/批量审阅/章节修订 | 辅助功能 |
 | P3 | 内联AI操作(选中文本→改写/扩写/润色/续写/精简) | 编辑器增强 |
 | P3 | 面包屑导航 | 导航增强 |
 | P3 | 面板调整器 | 布局灵活 |
 | P3 | 技能/智能体测试 | 调试功能 |
 | P3 | 退出确认 | 安全退出 |
 | P3 | 项目管理(创建/删除) | 项目管理 |
 
 ### 代码质量问题（新架构）
 
 | 问题 | 位置 | 严重度 |
 |---|---|---|
 | triggerDeAi重复实现 | EditorPanel.vue vs DeAiButton.vue | 中 |
 | 技能管理重复 | DeAiSkillSelector.vue vs DeAiSettings.vue | 中 |
 | 步骤计算重复 | DeAiProgress.vue vs DeAiFlowPreview.vue | 低 |
 | undo/redo用废弃API | EditorPanel.vue document.execCommand | 中 |
 | EPUB mimetype应store:true | EditorPanel.vue buildEpubZip | 低 |
 | autoSaveInterval未联动 | AppearanceSettings vs EditorPanel | 低 |
 | XSS风险 | ChatMessage.vue v-html未sanitize | 中 |
 | apiKey明文存储 | ApiSettings.vue | 中 |
