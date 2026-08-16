# 神意助手开发日志 2026-08-16（追加）
> 目标：行为等价全面修复：Phase 0杀进程→Phase 1递归检查→Phase 2修复→Phase 3端到端验证→Phase 4报告

## 已完成工作

### Phase 0：杀进程保干净
- ✅ 清理所有 Electron 进程
- ✅ 读取当前状态快照（34个 .vue 组件，10个 store）

### Phase 1A：递归检查所有组件按钮行为等价
- ✅ 检查 ScPanel.vue 按钮绑定：全部完整
- ✅ 检查 OutlineWorkspace.vue 按钮绑定：全部完整
- ✅ 检查 SkillBindModal.vue 按钮绑定：全部完整
- ✅ 检查 PipelinePanel.vue 按钮绑定：已修复并通过CDP验证
- ✅ 检查 App.vue 快捷键绑定：全部完整
- ✅ 检查所有组件按钮：无隐藏/无渲染问题

### Phase 1B：IPC序列化全面普查
- ✅ agent.ts — 已用 JSON.parse(JSON.stringify())
- ✅ chapter.ts — 已用 toPlain()
- ✅ deai.ts — 已用 JSON.parse(JSON.stringify()) 对 skillIds/hardRules
- ✅ project.ts — 已用 toPlain() 在 saveProject() 中
- ✅ provider.ts — 已用 JSON.parse(JSON.stringify()) 在 saveProviders()
- ✅ settings.ts — 基本类型，安全
- ✅ skill.ts — 已用 JSON.parse(JSON.stringify()) 在 saveSkills()
- ✅ theme.ts — 基本类型，安全
- ⚠️ pipeline.ts:75 — 原本直接传 config 对象，已修复为 JSON.parse(JSON.stringify())

### Phase 2：修复
- ✅ pipeline.ts 的 setStepSkills 中加 JSON.parse(JSON.stringify()) 深拷贝

### Phase 3：端到端用户模拟
- ✅ CDP 连接正常（端口 9227）
- ✅ 所有快捷键 Ctrl+1~5, Ctrl+, 工作正常
- ✅ 所有面板可打开关闭
- ✅ 大纲工作台10个按钮全部存在
- ✅ 设定合集按钮全部存在
- ✅ 生成流水线已通过CDP验证（上一个session）
- ✅ 插件市场可通过 Ctrl+5 打开

### Phase 4：报告
- ✅ 本次验证报告
- ✅ 经验教训更新
- ✅ 开发日志更新

## 本次修复
1. **pipeline.ts: setStepSkills IPC 序列化修复**：直接传 config 对象给 Electron IPC 可能触发 "An object could not be cloned" 错误，增加 JSON.parse(JSON.stringify()) 深拷贝
2. **projectName 空值 UI 修复**：`project.ts` 新增 `nameFromOutline`/`readProjectName`，loadProject/loadProjectList 在 projectName 为空时从 outline 首行提取；`OutlineWorkspace.handleImport` 设置项目名；loadProject 检测到旧项目无名字时回写保存
3. **插入链路验证脚本修正**：`probe_insert_link.cjs` 真实点击 `#btn-pl-insert-body`，捕获 insert-text 事件，读 editorStore + `.chapter-tabs .tab` DOM

## 经验教训（追加）
1. **CDP 测试选择器必须精确匹配组件实际 class**。PluginMarket 用 pm-overlay 类，但测试脚本用 plugin-market 选择器找不到，导致误报。
2. **v-if 面板的 DOM 测试窗口**：v-if 面板关闭后 DOM 销毁，测试必须在面板打开时立即进行，不能先关再测。
3. **IPC 序列化全面覆盖**：所有 store 的 storageWrite 调用都已检查，唯一遗漏的是 pipeline.ts 的 setStepSkills 中 config 直接传，已修复。
4. **按钮"未找到"不一定是问题**：可能是测试时机不对或选择器不匹配，需要先确认 DOM 结构再下结论。
5. **项目名初始化只在"新建"分支不足**：文件导入/恢复项目时若项目 ID 已存在，`projectName` 不会初始化；必须做数据兜底并从 outline 首行提取，且回写持久化。
6. **验证结论必须同时来自真实人可见 UI**：除了 store 值，还要验证 DOM 显示（本例左侧树项目名）和磁盘回写，不能只报"数据加载成功"。

### 2026-08-16 04:35 补充验证（lastProject/no 用户视角）
- [X] 启动源启动器后 currentProjectId=prj_msbtqnpe_q24wr3，projectName=测试大纲txt内容
- [X] 左侧树 DOM .tree-header 显示测试大纲txt内容，bodyText 不再包含未打开项目
- [X] 磁盘 wa_project_prj_msbtqnpe_q24wr3.json projectName 已回写
- [X] 结论：lastProject:no 只反映内部 ID 空值，不代表用户看到空项目；用户可见结果以 DOM 标题+编辑器可用性为准。验证必须走 store/DOM/磁盘三重一致，不能只看一条数据。

### 2026-08-16 05:12 直接退出保存 E2E 验证
- [X] 源启动器元组启动（electron.exe + CDP 9227），确认窗口出现
- [X] 临时项目流程：移除 lastProjectId → 大纲输入 → 锁定 → 自动生成流水线 → 打开章节 → 编辑器输入正文（不保存）
- [X] 模拟用户点击窗口关闭 → 退出确认弹窗出现 → 点击“直接退出”
- [X] 应用退出后磁盘写入 `wa_project_proj-1786828143728.json`
- [X] 磁盘中的正文包含未保存的标记文本，章节=ch_1786828143736_0_1
- [X] 磁盘中的 outlineText 包含“直接退出保存测试”标记
- [X] 恢复原 lastProjectId（prj_msbtqnpe_q24wr3），删除临时项目文件
- [X] Electron 进程无残留，CDP 端口已释放
- [X] 报告：_audit/DIRECT_EXIT_E2E.md
