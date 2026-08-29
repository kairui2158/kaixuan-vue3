# 全应用 UI 升级 V1 对账表

> V1 目标：只改结构、尺寸、字体、排版、弹窗层级和 API 前台布局，不改 V2 配色语义，不改变业务行为。

## 规则

- 行为等价是最高约束。
- 一次只修一个 UI 闭环。
- 每项通过必须有构建、源文件 Electron、真实操作、DOM/样式/状态证据。
- 截图只作辅助，不能替代行为、布局和持久化证据。

## 阶段对账

| 编号 | 闭环 | 状态 | 根因/现状 | 修改文件 | 用户操作 | 预期 | 实际 | 证据 |
|---|---|---|---|---|---|---|---|---|
| V1-P0 | 现状盘点与边界固化 | PASS（盘点） | 多套 token、overlay、字号和 z-index；工作区已有历史改动 | 仅新增总控/对账/日志 | 只读检查 | 队列、边界、风险明确 | 已记录 | 总控状态、当前 Git 输出 |
| V1-P1 | 公共布局、尺寸、溢出 | PASS | 低宽度字号过小；公共 flex 子项缺少 min-width 约束 | `src/styles/tokens.css`; `src/styles/global.css` | 启动应用并读取三栏运行时尺寸 | 主容器不横向溢出，标题可省略 | `.app-main` 1856/1856；`.editor-panel` 1128/1128；`.chat-panel` 519/519 | `node _audit/tmp_v1p1_verify.cjs` 输出；构建输出 |
| V1-P2 | 字体与排版 | PASS | 宽屏响应式字号下限过低；供应商辅助信息和生成中提示使用 xs | `src/styles/global.css`; `src/components/settings/ApiSettings.vue`; `src/components/chat/ChatPanel.vue`; `src/components/editor/EditorPanel.vue` | 源文件启动后读取 API 气泡、输入框、编辑器尺寸与 computed style | 正文/API 可读，文字不挤压，业务行为不变 | API 气泡 16.184px/28.322px；操作区 16.184px；输入 14px；编辑器 16.184px/29.1312px；无横向溢出 | `node _audit/tmp_v1p2_verify.cjs`；构建输出；总控状态 V1-P2 收尾 |
| V1-P3 | 弹窗与递归弹窗 | PASS | overlay/z-index/尺寸多套实现 | `src/styles/tokens.css`; `src/styles/modal.css`; `src/components/settings/SkillSettings.vue`; `src/components/pipeline/PipelinePanel.vue`; `src/components/common/ProjectModal.vue` | 打开设置 → 技能 → 编辑 → 关闭内层 → 关闭主弹窗 | 主弹窗、嵌套弹窗层级统一且可递归关闭 | 主层 `1000/1001`；内层 `1100/1101`；内层关闭保留主层；主层关闭后可见 overlay `0` | `node _audit/tmp_v1p3_verify.cjs`；`npm run build:vue`；Electron CDP 9227 |
| V1-P4 | 主页面三栏与编辑器 | PASS | 编辑器顶栏固定单行且工具组过长；主布局缺少收缩边界 | `src/App.vue`; `src/components/editor/EditorPanel.vue`; `src/styles/global.css` | 源文件启动 → 读取主三栏、长标题工具栏、对话头部和状态栏 | 树、编辑器、对话对齐；长标题局部省略；工具栏可横向滚动；主页面无横向溢出 | `.app-main-content` 1856/1856；树 200；编辑器 1128；对话 520；编辑器头部允许 wrap；工具栏 972/972；全局越界节点 0 | `npm run build:vue`（175 modules）；`taskkill /F /IM electron.exe /T` + `start-electron.bat`；CDP `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`；本轮 DOM 输出 |
| V1-P5 | 生成流水线结构 | PASS | 流水线采用单层可见切换；本轮重点核验层间边界、右侧可用空间和横向溢出 | `src/components/pipeline/PipelinePanel.vue`; `src/components/pipeline/PipelineFlow.vue`; `src/styles/global.css` | 源文件 Electron 启动 → 点击流水线 → 依次点击左侧五层 | 任一时刻仅一层可见；当前层占据右侧可用高度；工具区不挤压内容；无横向越界 | 五次切换均只显示对应 `pl-step-X-content`；右侧 `1624/1624`；当前层 `1576/1576`、高度 `811`；全局越界节点 `0` | CDP 9227 本轮输出：`visible=[pl-step-1-content]` 至 `visible=[pl-step-5-content]`；各层 `display:flex`、`scrollWidth=clientWidth=1576` |
| V1-P6 | 设置/工作台/记忆结构 | PASS | 设置弹窗、大纲工作台和记忆板块需验证递归边界与内部滚动；记忆列表内容高度大于视口但已有内容区滚动边界 | `src/components/settings/SettingsModal.vue`; `src/components/common/OutlineWorkspace.vue`; `src/components/common/MemoryPanel.vue` | 源文件 Electron → 依次打开设置、大纲工作台、记忆；检查可见容器及子节点 | 三个入口不横向溢出；工作台编辑区完整；记忆长列表在内容区内滚动，不撑破页面；嵌套弹窗不越界 | 设置主内容 `958/958`、设置体 `958/958`；大纲工作台 `1904/1904`、内容 `1000x700`、编辑区 `998x572`；记忆面板 `1856x975`、内容区 `927` 高度承载 `3796` 内容并 `overflow-y:auto`；未发现页面级横向越界 | 本轮 CDP 9227 输出；此前 P3 弹窗递归证据；本轮无代码修改 |
| V1-P7 | API 前台工作状态 | PASS（视觉/空闲态） | API 对话气泡、消息操作区、生成状态条、流水线日志/进度/取消入口需要可读且不越界 | `src/components/chat/ChatPanel.vue`; `src/components/chat/ChatMessage.vue`; `src/components/pipeline/PipelinePanel.vue` | 源文件 Electron → 检查对话气泡/操作区/输入区；打开流水线检查生成控制与五层状态反馈入口 | API 正文可读；气泡操作不挤压；空闲态不显示假进度；生成态具备日志、进度和取消的稳定容器 | 气泡 `16.184px/28.322px`、`317/317`；操作区 `285/285`；输入 `14px`、`429/429`；聊天状态条具备 `loading/error/canceled` 样式；流水线头部 `1904/1904`、工具区 `1576/1576`；设定/卷纲/章节反馈均有进度轨道与 API 日志容器；空闲态取消按钮不显示；未发现横向越界 | 本轮 CDP 9227 输出；`PipelinePanel.vue:256-275,335-375,434-445`；`ChatPanel.vue:51-53,860-885`；本轮无代码修改 |
| V1-P8 | V1 冻结回归 | PASS（结构回归） | V1-P1 至 P7 已完成，需联合检查主页面、设置、工作台、记忆和流水线 | 全部 V1 范围 | 源文件 Electron → 依次打开/关闭主要面板 → 五层流水线切换 | 面板切换无遮罩残留；页面无横向溢出；流水线始终单层可见；V1 结构冻结 | 主页面、设置、大纲工作台、记忆、流水线均 `overflow=0`；流水线五次切换均只有对应层可见；页面标题“神意助手”；无业务代码改动 | 本轮 CDP 9227 联合回归输出；`npm run build:vue` exit 0；重启后页面 URL/title 证据 |

## 关键组件范围

`App.vue`、`SidebarNav.vue`、`ChapterTree.vue`、`EditorPanel.vue`、`ChatPanel.vue`、`ChatMessage.vue`、`PipelinePanel.vue`、`PipelineFlow.vue`、`SettingsModal.vue`、`ApiSettings.vue`、`AgentSettings.vue`、`SkillSettings.vue`、`AppearanceSettings.vue`、`DiagLogPanel.vue`、`ProjectModal.vue`、`SkillBindModal.vue`、`DiffModal.vue`、`ExitConfirmModal.vue`、`OutlineWorkspace.vue`、`MemoryPanel.vue`、`DashboardModal.vue`、`DeAiProgress.vue`。
