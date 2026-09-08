# DEV LOG 2026-09-05 UI 交互升级

## 版本
- v3.23.1 -> v3.24.0

## 改动概述
将四层生成流水线的全屏阻断式弹窗替换为内联进度条，新增统一弹窗队列、SKILL 拖拽排序、TopSheet 右键菜单组件。

## P0 - useModalQueue.ts
- 功能：统一弹窗栈管理，z-index 自动分配，ESC 关闭，isGenerating guard
- 文件：src/composables/useModalQueue.ts（新建）
- 用途：解决多弹窗叠加和状态残留问题

## P1 - GenerationProgressBar.vue
- 功能：内联进度条组件，替代全屏 overlay，支持折叠/展开流式日志
- 文件：src/components/pipeline/GenerationProgressBar.vue（新建）
- 关键设计：logContainerId prop 保留原 DOM id，使 autoScrollLog 仍能工作
- 用途：用户生成时能看到编辑器和上层内容

## P2 - PipelinePanel overlay 替换
- 功能：四层全屏 overlay 替换为 GenerationProgressBar 组件
- 文件：src/components/pipeline/PipelinePanel.vue
- 改动：删除约 96 行旧 overlay CSS，保留所有 computed ref、close 函数、watch 不变
- 用途：消除弹窗重叠问题

## P3 - SKILL 拖拽排序
- 功能：四层 SKILL chip 支持拖拽排序
- 文件：src/components/pipeline/PipelinePanel.vue
- 实现：内联 drag handler + skillDragState reactive
- 用途：更自然的排序方式

## P4 - TopSheet.vue
- 功能：从顶部滑入的面板组件
- 文件：src/components/common/TopSheet.vue（新建）
- 用途：右键菜单从顶部滑入

## P5 - ChapterTree TopSheet
- 功能：ChapterTree 右键菜单用 TopSheet 替代旧 ctx-menu
- 文件：src/components/sidebar/ChapterTree.vue
- 改动：删除旧 .ctx-menu CSS，保留 .ctx-item 和 ctxAction 不变
- 用途：统一右键菜单交互形态

## P6 - 清理与封装
- 删除 6 个临时脚本文件
- 版本号升级 v3.23.1 -> v3.24.0
- build:vue 验证通过
- 经验文件更新规则 73-75
