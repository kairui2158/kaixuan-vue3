# HTML 修复对账表单

> 任务一：旧架构 vs 新架构 HTML 最深度逐项对比修复
> 旧架构基准: C:\Users\凯瑞\Documents\New project 2\renderer.html
> 新架构位置: D:\codex\novel-workshop-vue3\src\
> 创建时间: 2026-08-10

## 对账表

| 编号 | BUG描述 | 旧架构 | 新架构 | 修复状态 | 修复时间 | 修复文件 | 验证结果 |
|------|---------|--------|--------|----------|----------|----------|----------|
| BUG-1 | App.vue 重复渲染 MemoryPanel/PluginMarket/DashboardModal | 无重复 | 第49-51行重复渲染 | 待修复 | - | - | - |
| BUG-1b | handleNavigate 用独立 showPluginMarket/showDashboard | 无此问题 | 独立分支绕过 activePanel | 待修复 | - | - | - |
| BUG-1c | useShortcuts 引用 showPluginMarket.value | 无此问题 | 引用独立变量 | 待修复 | - | - | - |
| BUG-1d | showPluginMarket/showDashboard 变量声明 | 无此变量 | 多余声明 | 待修复 | - | - | - |
| BUG-2 | DashboardModal props 不匹配 | visible+stats | 第一处缺stats | 待修复 | - | - | - |
| BUG-3 | MemoryPanel position 为 absolute | 覆盖面板 | absolute定位 | 待修复 | - | - | - |
| BUG-4 | BreadcrumbBar 首页文字不同 | 小说工坊 | 首页 | 待修复 | - | - | - |
| BUG-5 | panel-backdrop 位置不同 | main内app-body外 | app-body内 | 待修复 | - | - | - |
| BUG-6 | OutlineWorkspace 结构差异 | ow-main+ow-sidebar | ow-body+ow-chat | 待修复 | - | - | - |
| BUG-7 | ScPanel 结构差异 | sc-categories+sc-items+sc-detail | sc-sidebar+sc-main | 待修复 | - | - | - |
| BUG-8 | PluginMarket 结构差异 | GitHub登录+token+搜索+列表 | 简单搜索框+静态列表 | 待修复 | - | - | - |
| BUG-9 | EditorPanel 工具栏按钮差异 | 箭头符号+章节修订 | SVG图标+修订 | 待修复 | - | - | - |
| BUG-10 | ChatPanel input id 问题 | id=user-input | class=chat-input | 待修复 | - | - | - |
| BUG-11 | 项目管理模态框 | 独立project-modal | ChapterTree内部实现 | 待验证 | - | - | - |
| BUG-12 | 卷管理模态框 | 独立volume-modal | ChapterTree内部实现 | 待验证 | - | - | - |
| BUG-13 | ExitConfirmModal 控制方式 | class modal-hidden | ref+defineExpose | 待修复 | - | - | - |
| BUG-14 | statusbar 缺少id | id=statusbar+5个span | class=statusbar+无id | 待修复 | - | - | - |
| BUG-15 | ContextMenu 与 ChapterTree 重复 | 独立ctx-menu | 两套右键菜单 | 待修复 | - | - | - |
| BUG-16 | InlineMenu actions 对齐 | 5个核心action | 20个actions | 待修复 | - | - | - |

## 递归普查发现

| 编号 | 问题描述 | 层级 | 修复状态 | 修复时间 |
|------|---------|------|----------|----------|
| (普查中...) | | | | |

## 修复记录详情

(每修复一项在此追加详细记录)
