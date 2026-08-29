# 全应用 UI 升级 V2 配色对账表

> V2 只有在 V1-P8 通过并冻结后启动。V2 不得改变 V1 的布局、字号、按钮位置、弹窗尺寸或业务行为。

| 编号 | 配色闭环 | 状态 | 范围 | 验证 |
|---|---|---|---|---|
| V2-P0 | 颜色盘点与 token 设计 | PASS | tokens、硬编码颜色、主题、可见运行时页面 | 语义映射 + 源码扫描 + Electron/CDP 基线 |
| V2-P1 | 基础主题 token | PASS | 深色/浅色基础变量、公共按钮、焦点、选中态 | 构建 + 源文件 Electron/CDP computed style + 溢出 |
| V2-P2 | 主页面配色 | PASS | 三栏、顶栏、编辑器、AI 气泡与生成前台 | 构建 + Electron/CDP computed style + 溢出 |
| V2-P3 | 递归弹窗、遮罩与设置区域配色 | PASS | 主弹窗、项目/差异弹窗、流水线子弹窗、统计遮罩、诊断日志 | 构建 + 源文件 Electron/CDP 可见颜色、层级、边界与关闭残留 |
| V2-P4 | 生成流水线五层配色 | PASS | 五层步骤栏、当前/完成状态、反馈、卷纲卡片、进度条 | 构建 + 源文件 Electron/CDP 五层互斥与颜色/边界 |
| V2-P5 | 设置与供应商卡片 | PASS | 设置子页、供应商/智能体卡片、表单 | 构建 + 源文件 Electron/CDP 卡片尺寸/状态/文字边界 |
| V2-P6 | 记忆板块配色 | PASS | 四视图、实体、状态 | 2026-08-26 源文件 Electron/CDP 五视图真实挂载、可见、页面横向溢出 0 |
| V2-P7 | 硬编码颜色清理 | PASS（生产 Vue3 范围） | 当前 Vue3 生产组件已接入语义 token；旧 `pipeline-manager.js` 是未被生产入口引用的历史兼容基准，不纳入生产 UI 范围 | 2026-08-26 组件最小修复后构建与 Electron/CDP 复核；引用闭包确认无生产入口 |
| V2-P8 | 深浅色联合验证 | PASS | 全应用主页面、聊天前台、主题切换、横向边界 | 2026-08-26 源文件 Electron/CDP 深浅主题切换、页面横向溢出 0 |

## V2-P0 配色基线（2026-08-23）

### 语义映射

| 语义 | 暗色当前值 | 浅色当前值 | 使用边界 | 结论 |
|---|---|---|---|---|
| 页面底色 | `--bg-primary: #0a0a0c` | `--bg-primary: #f5f5f7` | body、编辑器背景 | 层级清楚，保留 |
| 主面板 | `--bg-secondary: #121215` | `--bg-secondary: #fff` | 顶栏、章节树、对话栏 | 层级清楚，保留 |
| 次级面板 | `--bg-tertiary: #1a1a1f` | `--bg-tertiary: #eaeaef` | 分组、输入区外层 | 后续逐页收敛 |
| 浮起层 | `--bg-elevated: #212129` | `--bg-elevated: #fff` | 卡片、弹窗内容 | 浅色靠边框/阴影区分 |
| 主文字 | `--text-primary: #e8e8ec` | `--text-primary: #1a1a2e` | 正文、标题 | 合格 |
| 次文字 | `--text-secondary: #a0a2ac` | `--text-secondary: #555560` | 元信息、说明 | 合格，需防硬编码孤岛 |
| 强调色 | `--accent: #7c8cf8` | `--accent: #5b6bdb` | 主按钮、选中、焦点 | 保留，避免扩展成单一蓝紫 |
| AI 气泡 | `--ai-bubble: #18181e` | `--ai-bubble: #f0f0f5` | AI 回复正文 | 与面板有区分 |
| 用户气泡 | `--user-bubble: #1c2850` | `--user-bubble: #e0e8ff` | 用户消息 | 保留，后续检查对比度 |
| 语义状态 | danger/success/warning/info | 同左的浅色变体 | 错误、成功、进行中、提示 | 不改含义，只统一来源 |

### 真实运行时基线

源文件 Electron/CDP 页面：`file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，CDP `9227`。

| 可见区域 | background | color | 横向溢出 |
|---|---|---|---|
| body | `rgb(10,10,12)` | `rgb(232,232,236)` | 0 |
| `.app-header` | `rgb(18,18,21)` | 继承主文字 | 0 |
| `.chapter-tree` | `rgb(18,18,21)` | 继承主文字 | 0 |
| `.editor-panel` | `rgb(10,10,12)` | 继承主文字 | 0 |
| `.chat-panel` | `rgb(18,18,21)` | 继承主文字 | 0 |
| `.message-bubble.assistant` | `rgb(24,24,30)` | `rgb(232,232,236)` | 0 |
| `.message-bubble.user` | `rgb(28,40,80)` | `rgb(232,232,236)` | 0 |

### 风险与边界

源码扫描发现颜色 fallback/硬编码主要集中在 `DashboardModal.vue`、`DiffModal.vue`、`ProjectModal.vue`、`OutlineWorkspace.vue`、`MemoryPanel.vue`、`PipelinePanel.vue`、`EditorPanel.vue`、`DiagLogPanel.vue`、`PipelineFlow.vue` 和 `RelationGraph.vue`。本阶段不批量替换，后续按页面闭环逐一改为语义 token；不改业务行为、store、API 或持久化。

## V2-P1 基础主题 token 收敛（2026-08-23）

- 修改：`src/styles/tokens.css` 增加 `--control-primary-*`、`--control-secondary-*`、`--control-danger-*`、`--control-focus-ring`、`--control-selected-*` 语义变量；`global.css` 和 `base-components.css` 的公共按钮、焦点环、选中态改为引用这些变量。
- 行为边界：只改变颜色来源和状态表现；按钮尺寸、位置、禁用逻辑、点击事件、store、API、持久化均未改动。
- 构建证据：`npm run build:vue`，`175 modules transformed`，生成 `index-B8kcs-bt.css`、`index-h-JjdUk8.js`，exit 0。
- Electron/CDP 证据：`start-electron.bat` 启动成功，页面标题 `神意助手`；暗色 body 背景 `rgb(10,10,12)`、主文字 `rgb(232,232,236)`；可见次按钮背景 `rgba(0,0,0,0)`、文字 `rgb(160,162,172)`、边框 `rgb(37,37,46)`；可见危险按钮语义色 `rgb(224,85,106)`；主页面 `.app-main` `1856/1856`、`.editor-panel` `1128/1128`、`.chat-panel` `519/519`。
- 限制：主页面当前没有可见的 primary 按钮，primary 只读取到隐藏节点的 computed 颜色，不能作为可见主按钮证据；主按钮将在后续打开设置/流水线等真实页面时复测。
- 结论：V2-P1 PASS；下一闭环进入 V2-P2 主页面配色，不回跳 V2-P0/P1。

## V2-P2 主页面与 API 前台配色（2026-08-23）

- 修改：`src/styles/tokens.css` 增加聊天状态和操作区语义变量；`ChatMessage.vue` 的消息操作按钮、`ChatPanel.vue` 的生成状态点和发送按钮改为统一 token。
- 真实聊天证据：AI 气泡 `rgb(24,24,30)` / 主文字 `rgb(232,232,236)` / 边框 `rgb(37,37,46)`；用户气泡 `rgb(28,40,80)`；消息操作按钮 `rgb(21,21,28)` / `rgb(160,162,172)` / `rgb(37,37,46)`；发送按钮 `rgb(124,140,248)` / 白色文字；以上节点均可见且自身无横向溢出。
- 真实流水线证据：打开 `#btn-pipeline` 后，`.pl-overlay`、`.pl-content`、`.pl-steps` 和当前层均可见；背景分别为 `rgba(0,0,0,0.5)`、`rgba(20,20,28,0.85)`、`rgb(18,18,21)`、当前层透明继承；宽度/scrollWidth 分别 `1904/1904`、`1904/1904`、`279/279`、`1576/1576`。
- 空闲态边界：未发起 API 请求，生成状态条和 API 日志没有可见实例；不以隐藏节点冒充“生成中”配色验证。
- 结论：V2-P2 PASS；下一闭环进入 V2-P3 递归弹窗与设置区域配色。

## V2-P3 递归弹窗、遮罩与设置区域配色（2026-08-23）

- 修改：`DashboardModal.vue`、`PipelineFlow.vue`、`DiffModal.vue`、`ProjectModal.vue` 和 `DiagLogPanel.vue` 的背景、边框、文字、阴影改为统一语义 token；保留原有尺寸、层级、滚动、事件和业务状态。
- 构建证据：`npm run build:vue`，`175 modules transformed`，输出 `index-CKO3wBy1.css`、`index-BTwkHWRy.js`，exit 0。
- 源文件 Electron/CDP 证据：`taskkill /F /IM electron.exe /T` 后 `start-electron.bat` 启动，页面标题 `神意助手`，CDP `9227` 可连接。
- 递归真实操作：点击“项目”打开项目管理；可见项目弹窗背景 `rgb(10,10,12)`、边框 `rgb(37,37,46)`、内容 `558/558`、`199/199`，主遮罩 `rgba(0,0,0,0.5)`、`z=1000`、弹窗 `z=1001`；按当前可见弹窗的 `×` 关闭后可见遮罩数量 `0`。
- 空闲态边界：未打开统计、诊断日志和流水线保存/加载子弹窗，不把隐藏节点当作工作态可见证据；这些组件本轮完成源码 token 收敛。
- 结论：V2-P3 PASS；下一闭环进入 V2-P4 流水线五层配色，不回跳已通过阶段。

## V2-P4 生成流水线五层配色（2026-08-23）

- 修改：`src/styles/tokens.css` 增加流水线步骤、当前态、完成态、卡片、反馈容器、进度轨道和值的语义 token，并同时提供暗色/浅色主题值；`PipelineFlow.vue`、`PipelinePanel.vue` 改用这些 token。
- 行为边界：未修改五层 `v-show`、`pipelineStore.currentStep`、生成逻辑、API 调用、按钮事件、store、持久化和层间联动。
- 构建证据：`npm run build:vue` exit 0，`175 modules transformed`，输出 `dist-renderer/assets/index-BfAy0coR.css` 与 `index-B5r2n098.js`；仅有既有 Vite 配置和 chunk size 警告。
- Electron/CDP 证据：源文件 Electron 启动成功，CDP `9227` 可连接，页面标题 `神意助手`；流水线遮罩 `rgba(0, 0, 0, 0.5)`，步骤栏 `rgb(18, 18, 21)`，当前步骤背景 `rgba(124, 140, 248, 0.12)`、边框 `rgb(124, 140, 248)`；流水线与步骤栏分别为 `1904/1904`、`279/279`，全局横向溢出为 `0`。
- 五层真实切换证据：依次点击第 1 至第 5 层时，可见面板集合严格为 `[1]`、`[2]`、`[3]`、`[4]`、`[5]`，证明配色改动未造成层级融合。
- 结论：V2-P4 PASS；下一闭环为 V2-P5 设置与供应商卡片配色。

## V2-P5 设置与供应商卡片配色（2026-08-23）

- 根因：供应商卡片与智能体卡片仍直接使用通用背景、边框和状态色；智能体卡片还缺少明确的卡片背景和边框，运行时显示为透明底和亮色边框，造成设置页卡片视觉不统一。
- 最小修改：`src/styles/tokens.css` 增加设置卡片语义 token；`ApiSettings.vue` 将供应商卡片、用途开关、ON/OFF 状态、模型标签、添加卡和编辑卡接入 token；`AgentSettings.vue` 补齐卡片背景/边框/悬停/编辑态与模型标签 token。未修改 provider/agent store、保存、删除、用途绑定、模型请求或业务事件。
- 构建证据：`npm run build:vue` exit 0，`175 modules transformed`，输出 `dist-renderer/assets/index-DCgIdhBP.css` 与 `index-BXo4gJDT.js`；仅有既有 Vite 配置与 chunk size 警告。
- 源文件 Electron/CDP 证据：`start-electron.bat` 启动成功，页面标题 `神意助手`，CDP `9227` 可连接；API 设置可见供应商卡片尺寸均为 `344 x 257.875`，背景 `rgb(33, 33, 41)`、激活边框 `rgb(124, 140, 248)`；智能体可见卡片尺寸均为 `349 x 84.796875`，背景 `rgb(33, 33, 41)`、边框 `rgb(37, 37, 46)`。
- 边界证据：供应商卡片和智能体卡片 `scrollWidth - clientWidth = 0`，设置页面 `document.documentElement.scrollWidth - clientWidth = 0`；切换 API/智能体标签时使用真实可见入口，未强制点击被遮罩拦截的节点。
- 结论：V2-P5 PASS；下一闭环为 V2-P6 记忆板块配色。

## V2-P6 记忆板块配色（2026-08-23）

- 状态：PASS。
- 修改：记忆语义 token 接入主面板、关系图、图谱分析、思维导图、时间线和实体卡。
- 行为边界：未修改视图切换、筛选、图谱计算、导入导出、来源跳转、store、API 或持久化。
- 构建：npm run build:vue，175 modules transformed，exit 0；输出 index-bDsG24xf.css 与 index-Br1ZbDbb.js。
- CDP：真实点击记忆入口和五个视图入口；当前视图互斥可见，全局横向溢出 0。
- 下一阶段：V2-P7 硬编码颜色清理。

## V2-P6 新鲜复核（2026-08-26）

- 真实入口：通过 `#btn-memory` 打开记忆面板，等待 Vue 完成异步渲染后逐一点击五个可见标签。
- 证据：记忆列表 `.mem-content`、关系图 `.memory-relation-graph`、图谱分析 `.memory-graph-analysis`、思维导图 `.memory-mind-map`、时间线 `.memory-timeline` 均真实可见；每项 `rootWidth=1856/rootScrollWidth=1856`，`bodyOverflow=0`。
- 结论：V2-P6 PASS。首次“面板不存在”是点击后立即读取造成的时序误报，不是产品故障。

## V2-P7 新鲜复核（2026-08-26）

- 最小修改：`OutlineWorkspace.vue`、`SkillBindModal.vue`、`DeAiProgress.vue` 移除组件级颜色/阴影 fallback，改用已有语义 token。
- 构建：`npm run build:vue` 输出 `176 modules transformed`，`built in 1.20s`；保留 Vite native config、无效动态导入和 chunk size 三类非阻断警告。
- 范围结论：`src/services/pipeline-manager.js` 未被当前 Vue3 生产入口引用，引用只存在于历史文档与旧审计脚本；它属于旧行为基准，保留是为了防止误删和行为基准丢失，不是当前运行时 UI。
- 结论：当前生产 Vue3 UI 的颜色清理核销为 PASS；旧文件的硬编码颜色作为历史兼容资产单独登记，不把“全仓库零颜色字符串”误当成生产 UI 验收标准。

## V2-P8 新鲜复核（2026-08-26）

- 源文件 Electron：`start-electron.bat` 输出 `[OK] Application started`，CDP `9227` 可连接，页面标题为 `神意助手`。
- 深色：body `rgb(10, 10, 12)`、主文字 `rgb(232, 232, 236)`、编辑器 `rgb(10, 10, 12)`、聊天面板 `rgb(18, 18, 21)`；主页面 `1904/1904`，编辑器 `1128/1128`，聊天面板 `519/519`。
- 浅色：真实点击 `#theme-toggle-btn` 后 `body.light-theme` 生效，body `rgb(245, 245, 247)`、主文字 `rgb(26, 26, 46)`、聊天面板 `rgb(255, 255, 255)`；页面 `1904/1904`。
- 结论：V2-P8 PASS。该证据只覆盖 UI/主题/边界，不扩展为 API 网络或安装包深度业务验收。

