# 2026-08-16 章节树项目按钮 + 项目管理弹窗 修复记录

## 修复内容
1. **ChapterTree.vue** — 在 tree-header 添加"生成"和"项目"两个按钮
   - `#btn-tree-gen`：生成流水线按钮，点击触发 `navigate('pipeline')`
   - `#btn-open-project`：项目管理按钮，点击打开 ProjectModal
   - 新增 `projectModalVisible` 响应式状态
   - 新增 `ProjectModal` 组件导入和挂载

2. **ProjectModal.vue**（新建）— 项目管理弹窗
   - 项目列表展示（`projectStore.projectList` 循环）
   - 每项"加载"和"删除"按钮
   - 加载时确认是否保存当前项目
   - 删除时确认不可恢复
   - 新建项目内联表单（名称 + 大纲）
   - 新建时确认是否保存当前项目

3. **project.ts store** — 追加方法（已实现）
   - `clearCurrent()` — 清空当前项目状态
   - `createProject(name, outline)` — 创建项目，保存并刷新列表
   - `deleteProject(id)` — 删除项目，若为当前项目则清空 + 删 lastProjectId
   - `selectProject(id)` — 加载项目

## 验证结果
| 检查项 | 结果 |
|--------|------|
| btn-tree-gen 存在 | ✅ |
| btn-open-project 存在 | ✅ |
| 点击项目按钮 → 弹窗出现 | ✅ |
| 弹窗标题"项目管理" | ✅ |
| 弹窗包含"新建项目"按钮 | ✅ |
| 关闭弹窗后弹窗隐藏 | ✅ |
| 点击"生成" → 导航触发 | ✅ |
| 章节树头部存在 | ✅ |
| 项目列表已有项目 | ✅ 4个 |
| 新建按钮文字正确 | ✅ |

## 关键经验
- PowerShell 写文件用 `@''...''@ | Out-File` 避免转义问题
- CDP 验证用 `page.evaluate(() => document.querySelector(...)?.click())` 比 `click({force:true})` 可靠
- 构建命令 `npm run build:vue` 只产生警告无错误
- 应用启动后需等待 3-5 秒再连接 CDP
- 每次关闭先杀所有 electron 进程再启动
