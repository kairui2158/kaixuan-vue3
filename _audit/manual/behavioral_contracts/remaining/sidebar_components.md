 # 侧栏组件行为契约
 
 涵盖: SidebarNav, AgentProgressPanel, ContextMenu(sidebar)
 
 ## SidebarNav.vue
 
 组件路径: src/components/sidebar/SidebarNav.vue
 组件职责: 左侧导航栏，7个功能按钮（大纲/设定/流水线/记忆/插件/设置/仪表盘）+ 主题切换按钮，支持tooltip和active状态高亮
 
 ### 依赖关系
 - useThemeStore: 主题状态管理和切换
 - props.activePanel: 当前激活面板ID
 
 ### F01: emit navigate(id: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | defineEmits，绑定于导航按钮@click |
 | L2 Input Source | item.id（从navItems数组） |
 | L3 Output Destination | emit('navigate', item.id) |
 | L4 Side Effects | 主行为：通知父组件切换面板 |
 | L5 Communication Paradigm | Vue emit |
 | L6 Verification Case | 点击大纲按钮 -> 检查emit('navigate', 'outline') |
 | L7 Cross-component Dependency | App.vue接收navigate事件，切换overlay显示 |
 
 ### F02: toggleTheme()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于主题切换按钮@click |
 | L2 Input Source | themeStore.theme |
 | L3 Output Destination | themeStore.toggle() |
 | L4 Side Effects | 主行为：切换深色/浅色主题 |
 | L5 Communication Paradigm | store操作 |
 | L6 Verification Case | 点击主题按钮 -> 检查themeStore.theme从dark变为light或反之 |
 | L7 Cross-component Dependency | themeStore变化触发CSS变量切换，影响全局样式 |
 
 ### navItems数组
 | Layer | Content |
 |---|---|
 | L1 Structure | 静态数组，定义7个导航项 + 2个分隔符 |
 | L2 Input Source | 硬编码 |
 | L3 Output Destination | 模板v-for渲染 |
 | L6 Verification Case | 检查7个按钮全部渲染，含tooltip文字 |
 
 ### Computed: isDark
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，从themeStore.theme计算 |
 | L2 Input Source | themeStore.theme |
 | L3 Output Destination | 模板渲染（切换sun/moon图标） |
 | L6 Verification Case | 切换主题 -> 检查图标在太阳和月亮之间切换 |
 
 ## AgentProgressPanel.vue
 
 组件路径: src/components/sidebar/AgentProgressPanel.vue
 组件职责: Agent进度面板，轮询显示运行中Agent状态，可折叠
 
 ### 依赖关系
 - window.electronAPI.agentStatus: IPC获取Agent状态
 
 ### F01: pollAgentStatus()
 | Layer | Content |
 |---|---|
 | L1 Structure | async函数，setInterval定时调用（每2秒） |
 | L2 Input Source | window.electronAPI.agentStatus('all') |
 | L3 Output Destination | agents reactive数组更新 |
 | L4 Side Effects | 主行为：轮询Agent状态并更新UI；副作用：IPC调用，异常被静默忽略 |
 | L5 Communication Paradigm | IPC调用 + 响应式数组操作 |
 | L6 Verification Case | 有Agent运行时 -> 检查面板显示Agent名称、状态点、进度条 |
 | L7 Cross-component Dependency | 依赖electronAPI IPC通道 |
 
 ### F02: expanded切换
 | Layer | Content |
 |---|---|
 | L1 Structure | 响应式ref，绑定于header @click |
 | L2 Input Source | expanded ref |
 | L3 Output Destination | 模板v-if控制body显示/隐藏 |
 | L4 Side Effects | 主行为：折叠/展开面板 |
 | L6 Verification Case | 点击header -> 检查面板body显示/隐藏切换 |
 
 ### 生命周期: onMounted / onUnmounted
 | Layer | Content |
 |---|---|
 | L1 Structure | onMounted启动pollTimer，onUnmounted清理 |
 | L4 Side Effects | 定时器资源管理 |
 | L6 Verification Case | 组件卸载 -> 检查定时器已清理 |
 
 ## ContextMenu.vue (sidebar)
 
 组件路径: src/components/sidebar/ContextMenu.vue
 组件职责: 章节树右键菜单，提供生成章节梗概/生成正文/绑定技能/删除操作
 
 ### F01: emit gen-chapters / gen-body / bind-skill / delete
 | Layer | Content |
 |---|---|
 | L1 Structure | defineEmits，绑定于菜单项@click |
 | L2 Input Source | props.visible, props.x, props.y |
 | L3 Output Destination | emit对应事件名 |
 | L4 Side Effects | 主行为：派发操作事件 |
 | L5 Communication Paradigm | Vue emit |
 | L6 Verification Case | 点击生成章节梗概 -> 检查emit('gen-chapters') |
 | L7 Cross-component Dependency | 父组件ChapterTree处理这些事件 |
 
 ### F02: onDocClick (onMounted)
 | Layer | Content |
 |---|---|
 | L1 Structure | document click事件监听器，onMounted通过setTimeout注册 |
 | L2 Input Source | document click事件 |
 | L3 Output Destination | emit事件（关闭菜单） |
 | L4 Side Effects | 主行为：点击外部关闭菜单；注意：当前实现有bug，emit参数不正确 |
 | L5 Communication Paradigm | DOM事件监听 + Vue emit |
 | L6 Verification Case | 打开菜单后点击外部 -> 检查菜单关闭 |
 
 ## 副作用风险表
 
 | 函数 | 风险等级 | 风险描述 |
 |---|---|---|
 | pollAgentStatus | 低 | IPC调用，异常被catch忽略 |
 | pollTimer | 低 | 定时器需正确清理 |
 | onDocClick | 中 | setTimeout注册全局事件，emit参数可能有bug |
 
 ## 通信范式汇总
 
 | 范式 | 使用位置 |
 |---|---|
 | Vue emit | SidebarNav(navigate), ContextMenu(gen-chapters等) |
 | store操作 | SidebarNav(toggleTheme) |
 | IPC调用 | AgentProgressPanel(agentStatus) |
 | DOM事件 | ContextMenu(document click) |
 
 ## L6 测试映射表
 
 | 测试ID | 函数 | 测试描述 |
 |---|---|---|
 | T-sidebar-01 | navigate | 点击7个按钮 -> emit对应id |
 | T-sidebar-02 | toggleTheme | 点击 -> themeStore切换 |
 | T-sidebar-03 | active状态 | activePanel匹配 -> 按钮高亮 |
 | T-sidebar-04 | tooltip | hover -> 显示tooltip文字 |
 | T-sidebar-05 | AgentProgressPanel展开 | 点header -> body显示/隐藏 |
 | T-sidebar-06 | AgentProgressPanel轮询 | 有Agent -> 显示状态和进度 |
 | T-sidebar-07 | ContextMenu菜单项 | 点生成章节 -> emit('gen-chapters') |
 | T-sidebar-08 | ContextMenu外部关闭 | 点外部 -> 菜单关闭 |
