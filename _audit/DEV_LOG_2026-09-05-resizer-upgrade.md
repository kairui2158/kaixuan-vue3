# DEV LOG 2026-09-05 面板拖拽升级 + 进度条按钮优化

## 版本
- v3.24.0 (不升版本号，同日补丁)

## 改动概述
参照 splitpanes 4.1.2 核心设计，等价实现面板分隔条拖拽升级。不装包，不动布局 DOM，只重写 resizer 逻辑和 CSS。同时优化 GenerationProgressBar 展开按钮的可见性。

## P0 - useResizers.ts
- 功能：从 App.vue 抽出 resizer 逻辑为独立 composable
- 文件：src/composables/useResizers.ts（新建）
- 核心设计：百分比布局（flex: 0 0 N%），localStorage 持久化，RAF 节流，触屏支持，双击重置，MutationObserver 自动重绑
- 用途：解决刷新丢失、v-if 面板切换后 divider 失效、大内容拖动卡顿

## P1 - App.vue 集成
- 删除旧 initResizers 函数（45行内联逻辑）
- 替换为 useResizers composable 调用
- appMainRef 绑定到 .app-main-content 容器
- MutationObserver 监听面板增删
- 模板新增 resizer-overlay 和 drag-tooltip

## P2 - splitter CSS 升级
- 宽度 4px -> 6px
- 新增 ::before 30px 抓手线（参照 splitpanes default-theme）
- hover 时抓手线变色
- 新增 .drag-tooltip 浮标样式
- 新增 .resizer-overlay 全屏遮罩

## P3 - GenerationProgressBar 展开按钮优化
- 展开按钮从最侧边移到居中（margin: 0 auto + width: fit-content）
- accent 主题色边框+背景高亮
- 展开时按钮变实心填充色，收起时描边样式
- 按钮结构改为三段式：箭头图标 + 文字 + 行数标签

## 验证
- build:vue 通过，0 error
- dist-renderer 产物中 useResizers/rebindResizers/resizer-overlay/drag-tooltip 均已编译
- 旧 initResizers 像素逻辑已删除

## 经验文件
- 规则 76：面板拖拽 composable 抽离 + 百分比布局 + 持久化
- 规则 77：进度条展开按钮居中高亮
