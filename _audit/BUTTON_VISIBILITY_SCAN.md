# 按钮可见性扫描对账表单 — 最终版

## 扫描范围
- 40+ 个 .vue 文件（全部组件）
- 7 个面板（OutlineWorkspace, PipelinePanel, SettingsModal, ScPanel, MemoryPanel, DashboardModal, PluginMarket）
- CDP 打开每个面板后枚举所有按钮

## 扫描结果

### 1. 已修复按钮（9个，全部 CDP 验证通过）
| 按钮ID | 修复方式 | 验证结果 |
|--------|---------|---------|
| btn-ai-co-create | 从 v-show 移出，常驻 ow-header-right | 存在且可见 |
| btn-generate-content | 去掉 v-if="isBodyMode" | 存在且可见 |
| btn-de-ai | 去掉 v-if="isBodyMode" | 存在且可见 |
| btn-ai-names | 去掉外层 v-if="isBodyMode" | 存在且可见 |
| btn-writing-rules | 去掉外层 v-if="isBodyMode" | 存在且可见 |
| btn-timeline | 去掉外层 v-if="isBodyMode" | 存在且可见 |
| btn-batch-review | 去掉外层 v-if="isBodyMode" | 存在且可见 |
| btn-revise | 去掉外层 v-if="isBodyMode" | 存在且可见 |
| btn-find | 新增常驻查找入口按钮 | 存在且可见 |

### 2. 正常隐藏按钮（无需修复）
| 按钮ID | 隐藏原因 | 判断 |
|--------|---------|------|
| btn-ow-send | v-show="chatAreaOpen" | 合理交互 |
| 步骤2-5按钮 (PipelinePanel) | v-show="pipelineStore.currentStep === N" | 分步设计 |
| Dashboard 图表 | v-if="stats.volumeStats.length > 0" | 无数据时不显示 |
| MemoryPanel 表单 | v-if="showingForm" | 表单弹出模式 |
| 设置子标签页内容 | v-if="settingsStore.activeTab === xxx" | 标签切换 |

### 3. 按钮覆盖统计
- 侧边栏: 8 个（全部可见）
- 章节树: 12 个（全部可见）
- 编辑器: 15 个（全部可见）
- 聊天面板: 3 个（全部可见）
- 大纲工作台: 9 个（全部可见）
- 生成流水线: 39 个（按步骤切换，全部可见）
- 设置面板: 6 个标签页 + 子组件按钮（全部可见）
- 设定合集: 5 个（全部可见）
- 记忆面板: 6 个（全部可见）
- 仪表盘: 1 个（关闭按钮，可见）
- 插件市场: 7 个（全部可见）

## 结论
所有按钮均已通过 CDP 验证，无隐藏/无渲染的按钮遗留问题。之前存在的 9 个隐藏按钮已全部修复并验证通过。
