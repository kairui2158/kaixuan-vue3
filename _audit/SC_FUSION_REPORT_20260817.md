# 设定合集融合报告

> 生成时间：2026-08-17
> 目标：设定合集融合到生成流水线 + 删除旧ScPanel按钮

## 阶段完成情况

### 阶段1-2：Store数据层融合 + 绑定与prompt注入打通
- **ChatPanel.vue**: 3处 projectStore.settings 替换为 getSettingsCollection()
- **OutlineWorkspace.vue**: parseDecomposedSettings 改用 getSettingsCollection()
- **project.ts**: migrateSettingsToCollection 修复 attrs/isBound, 新增 appendSettingsToCollection

### 阶段3：流水线设定层UI融合
- **PipelinePanel.vue**: genSettings 去重 + 自动选中分类

### 阶段4：删除旧ScPanel入口
- ScPanel.vue 已删除, SidebarNav.vue 入口删除

### 阶段5：验证
- npx vite build 编译通过 (151 modules)
- CDP 17/17 全部通过

## 修复的7个问题缺口

| # | 问题 | 文件 | 修复方式 |
|---|------|------|---------|
| 1 | ChatPanel 读旧 settings 数组 | ChatPanel.vue | 改为 getSettingsCollection() |
| 2 | OutlineWorkspace 用旧 setSettings | OutlineWorkspace.vue | 改为直接写入 collection |
| 3 | migrateSettingsToCollection 丢 attrs/isBound | project.ts | 保留 attrs 对象 + isBound |
| 4 | 缺少 appendSettingsToCollection | project.ts | 新增去重写入函数 |
| 5 | genSettings 生成重复 | PipelinePanel.vue | 按 name+category 去重 |
| 6 | 无默认选中分类 | PipelinePanel.vue | 新增 watch 自动选中 |
| 7 | App.vue memory 行缩进错误 | App.vue | 修复缩进对齐 |
