## 记忆面板顶栏平铺标签栏改造 (2026-08-20)

### 闭环目标
- 把记忆面板顶栏从单个循环切换按钮改为5个平铺标签（记忆列表/关系图/图谱分析/思维导图/时间线）
- 导出/导入按钮收进"更多"下拉菜单，节省顶栏空间

### 改动文件
1. `src/components/common/MemoryPanel.vue` — 模板：5个mem-tab-btn标签平铺 + mem-more-menu下拉
2. `src/components/common/MemoryPanel.vue` — CSS：标签栏样式、下拉菜单样式、active高亮底线
3. `src/components/common/MemoryPanel.vue` — script：新增 showMoreMenu ref

### 验证证据
- 构建：npx vite build → 172 modules, 0 errors, built in 1.26s
- CDP验证（pageId=CB359CE60A2E2E897065A3076635BF4F）：
  - panelExists: true
  - tabCount: 5
  - tabTexts: ["记忆列表","关系图","图谱分析","思维导图","时间线"]
  - moreBtnExists: true
  - oldRelationGraphBtn: false（旧循环按钮已删除）
  - dropdownVisible: true
  - dropdownBtns: ["导出 JSON","导入 JSON","导入角色卡"]
  - allBtnIds中不再有btn-memory-relation-graph（旧按钮已清除）

### 经验教训
- Vite scoped CSS在构建产物中会被加data属性前缀，直接搜索原始class名搜不到，必须通过CDP运行时DOM验证
- Electron加载的是构建产物dist-renderer，改了源文件不构建就看不到变化
- CDP验证需要awaitPromise+setTimeout等待Vue异步渲染完成后才能检查DOM

### 临时文件清理
- _tmp_cdp.js、_tmp_verify*.js 系列临时脚本全部删除
- 根目录无残留
