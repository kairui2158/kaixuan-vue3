# 小说工坊 Vue 3 架构迁移详细计划 (v3)

创建日期: 2026-08-08
当前版本: v2.7.63
目标: 从纯HTML/CSS/JS迁移到Vue 3 + Pinia + Vite，Agent分派并行开发，左边栏可见进度，全程防断网目标模式

v3相比v2的6项重大新增:
1. Agent分派总表: 20个Agent(A1-A20)，每阶段标注并行组，能并行的全部并行
2. 左边栏Agent进度可见: 绿色=运行中/蓝色=已完成/红色=失败，用户随时可看
3. 防断网目标模式: 全程启用，429按30s到240s递增重试8次，断点自动续跑
4. GitHub Agent搜索策略: tool_search找不到就去GitHub搜可用Agent
5. 融合全部前期讨论: 降AI三模式/多供应商/真SKILL/6项验证器/38样本/诊断检测器/SKILL编辑器
6. 新增GATE-16(Agent分派强制)/GATE-17(防断网验证)/GATE-18(左边栏可见验证)

---

# 零、四大前置条件（迁移开始前必须全部完成）

## 前置条件1: GitHub备份 + D盘新工作区

### 1.1 GitHub完整备份

门禁GATE-0A: 未完成GitHub备份禁止开始任何迁移工作

步骤:
1. 清理项目根目录: 删除所有临时文件(cdp_*.js, check_*.js, e2e_*.js, _*.txt, electron_*.txt, screenshot_*.png等)
2. 清理dist_old_*目录
3. git add -A
4. git commit -m "v2.7.63 最终备份: Vue 3迁移前的完整快照"
5. git push origin main
6. 验证: GitHub网页端确认所有文件已上传

验收标准:
- [ ] git log确认最新commit在GitHub上可见
- [ ] GitHub仓库文件列表完整
- [ ] 本地git status干净

### 1.2 D盘新工作区创建

门禁GATE-0B: 未在D盘创建工作区禁止开始任何迁移工作

步骤:
1. 在D:\codex\下创建文件夹: D:\codex\novel-workshop-vue3\
2. 将需要迁移的源文件复制过去(不是移动，C盘原项目保留不动)
3. 需要迁移的文件清单:
   - main.js, preload.js, package.json
   - renderer.html, renderer_v2.js, panels.js, style.css
   - js/目录全部16个文件
   - styles/目录全部文件
   - build/目录(图标等打包资源)
   - lessons/目录(经验文件)
   - memory/目录(项目记忆)
   - AGENTS.md, STACK.md, .gitignore
4. 不迁移的文件:
   - node_modules/(D盘重新npm install)
   - dist/, dist_old_*/(旧打包产物)
   - test_evidence/, test_screenshots/(旧测试截图)
   - BACKUP/(旧备份)
   - 根目录所有临时文件
5. 在D盘新工作区初始化git: git init && git remote add origin <新仓库地址>
6. npm install安装现有依赖
7. node --check验证所有JS文件
8. 启动Electron验证旧版能正常运行

验收标准:
- [ ] D:\codex\novel-workshop-vue3\目录创建完成
- [ ] 所有源文件已复制
- [ ] npm install成功
- [ ] 旧版应用在D盘能正常启动运行
- [ ] git初始化完成
- [ ] C盘原项目完整不动

C盘空间说明: 迁移完成后，C盘原项目可作为只读参考保留，不再做任何修改。所有后续开发在D盘进行。

---

## 前置条件2: UI设计规格参考书

门禁GATE-0C: 未完成UI规格记录禁止开始Vue组件开发

创建文件: D:\codex\novel-workshop-vue3\docs\UI设计规格参考书.md

需要记录的UI规格(从styles/tokens.css提取):

### 2.1 颜色系统

| 分类 | 变量名 | 值 | 用途 |
|------|--------|-----|------|
| 背景 | --bg-primary | #0a0a0c | 主背景 |
| 背景 | --bg-secondary | #121215 | 次级背景 |
| 背景 | --bg-tertiary | #1a1a1f | 三级背景(卡片/面板) |
| 背景 | --bg-elevated | #212129 | 悬浮元素 |
| 背景 | --bg-input | #15151c | 输入框 |
| 文字 | --text-primary | #e8e8ec | 主文字 |
| 文字 | --text-secondary | #a0a2ac | 次级文字 |
| 文字 | --text-muted | #888a94 | 弱文字 |
| 强调 | --accent | #7c8cf8 | 主强调色(蓝紫) |
| 强调 | --accent-hover | #9da9fa | 悬浮态 |
| 强调 | --accent-gradient | linear-gradient(135deg,#7c8cf8,#9b6cf8) | 渐变 |
| 危险 | --danger | #e0556a | 删除/错误 |
| 成功 | --success | #4caf88 | 成功 |
| 警告 | --warning | #f0a050 | 警告 |
| 对话 | --user-bubble | #1c2850 | 用户消息气泡 |
| 对话 | --ai-bubble | #18181e | AI消息气泡 |
| 边框 | --border-color | #25252e | 普通边框 |
| 边框 | --border-focus | #4a4a58 | 聚焦边框 |

### 2.2 字体规格
- 字体族: 系统默认(-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)
- 正文字号: 14px / 标题字号: 16px-20px / 小字字号: 12px / 代码字号: 13px
- 行高: 1.5-1.6

### 2.3 间距系统
- 基础单位: 2px (--space-1到--space-10: 2/4/6/8/12/16/24/32px)

### 2.4 圆角系统
--radius-xs: 4px / --radius-sm: 6px / --radius-md: 8px / --radius-lg: 12px

### 2.5 按钮规格
| 类型 | 背景 | 文字 | 边框 | 圆角 | 尺寸 |
|------|------|------|------|------|------|
| 主按钮 | accent渐变 | #fff | 无 | 6px | padding 8px 16px |
| 次按钮 | transparent | text-primary | border-color | 6px | padding 8px 16px |
| 危险按钮 | danger | #fff | 无 | 6px | padding 8px 16px |
| 图标按钮 | transparent | text-secondary | 无 | 6px | 32x32px |

### 2.6 侧边栏规格
- 宽度: 48px(纯图标) / 按钮尺寸: 36x36px / 按钮间距: 4px
- tooltip: 右侧弹出，bg-tertiary背景

### 2.7 面板/模态框规格
- 模态框背景: bg-glass (rgba(20,20,28,0.85))
- 遮罩层: bg-overlay (rgba(0,0,0,0.5))
- 面板宽度: 480px(设置)/640px(流水线)/800px(编辑器)
- z-index: 面板1000/模态框2000/toast 9999

### 2.8 编辑器规格
- 编辑区背景: bg-primary / 文字颜色: text-primary
- textarea无边框，只有底部聚焦线
- 工具栏: 固定顶部，高40px / 查找栏: 滑出式，高36px

### 2.9 对话气泡规格
- 用户气泡: 背景--user-bubble，圆角12px，右对齐
- AI气泡: 背景--ai-bubble，圆角12px，左对齐
- 最大宽度: 80% / 表格: max-width 100%, overflow-x auto

### 2.10 卡片规格
- 卷纲卡片: bg-tertiary, 圆角8px, padding 16px
- 章节卡片: bg-secondary, 圆角6px, padding 12px
- 设定卡片: bg-tertiary, 圆角8px, padding 16px

### 2.11 左边栏Agent进度面板规格(新增)
- 位置: 左侧边栏右侧，可折叠面板
- 宽度: 280px(展开)/48px(折叠)
- Agent列表: 每行显示Agent编号+昵称+状态图标
- 状态颜色: 绿色(#4caf88)=运行中/蓝色(#7c8cf8)=已完成/红色(#e0556a)=失败/灰色(#888a94)=等待中
- 进度条: 每个Agent一个mini进度条(0-100%)
- 日志区: 底部显示最新3条Agent日志，可点击展开全部

验收标准:
- [ ] UI规格参考书创建完成
- [ ] 所有颜色变量已记录(与tokens.css核对)
- [ ] 左边栏Agent进度面板规格已记录

---

## 前置条件3: 链路与功能参考书

门禁GATE-0D: 未完成链路记录禁止开始Vue组件开发

创建文件: D:\codex\novel-workshop-vue3\docs\链路与功能参考书.md

### 3.1 生成流水线链路(核心五层联动)

大纲层到设定层: 输入大纲全文+基调锚点+叙事风格五维度，点击AI生成设定，调_plGenSettings()，输出设定JSON

设定层到卷纲层: 输入大纲+设定JSON+每卷字数，点击AI生成卷纲/自动生成/逐卷生成，输出卷纲JSON数组(含name/outline/summary/suggestedWords)

卷纲层到章节层: 输入单卷蓝图+本卷总章数+单章字数，点击AI生成章节，按卷纲字数除以单章字数=章节数，输出章节JSON数组(含title/plot)。防断网: 每生成一章就展示+保存

章节层到正文层: 输入章节plot+SKILL配置+Agent配置，点击AI生成正文，调_plGenBody()，输出正文文本

### 3.2 供应商管理链路
- 供应商列表: ProviderManager管理，每供应商含name/baseUrl/apiKey/models/temperature/maxTokens
- 供应商用途: generate(生成)/verify(验证)
- 多供应商: A供应商全局生成，B供应商验证(去AI味)，各自独立

### 3.3 SKILL链式执行链路
- SKILL排序: SkillManager管理，支持上下箭头排序
- 链式执行: SkillExecutionEngine.chain()按顺序调用，SKILL1输出到SKILL2输入到SKILL3输入
- 三种模式: 串行链式(chain)/Agent调度(split-merge)/multi-step
- 验证器: first_subject_different/zhuque_check/cross_model_check

### 3.4 去AI味链路
- 触发: 编辑器工具栏点击去AI味按钮
- 串行链式: S1改写(原文上)到硬规则pre到S2验证到硬规则post到写回编辑器
- Agent调度: 切分到并行重述到拼接到写回编辑器
- multi-step: 事件核提取到视角偏转到重组输出到验证到写回编辑器
- 执行顺序(关键): S1先跑(原文上改写)到硬规则清洗到S2验证到硬规则安全网
- 风格样本: 应用层按段落相似度挑2-3个注入S1，S2不拿样本

### 3.5 IPC通信链路(全部16个通道)

| 通道 | 方向 | 用途 |
|------|------|------|
| safe:encrypt/decrypt | 渲染到主 | API Key加密 |
| storage:read/write/remove/list | 渲染到主 | 数据持久化 |
| storage:export/import | 渲染到主 | 数据导入导出 |
| storage:getDataDir | 渲染到主 | 获取数据目录 |
| diag:write/read/export/clear | 渲染到主 | 诊断日志 |
| api:fetchModels | 渲染到主 | 获取模型列表 |
| dialog:saveFile/openFile | 渲染到主 | 文件对话框 |
| app:quit/getVersion | 渲染到主 | 应用生命周期 |
| app:requestClose/closeChoice/finalSave | 双向 | 关闭确认流程 |

验收标准:
- [ ] 所有链路已记录
- [ ] 每条链路的输入到处理到输出完整
- [ ] 所有16个IPC通道已记录

---

## 前置条件4: 教训门禁系统

门禁GATE-0E: 未完成教训门禁升级禁止开始任何迁移工作

创建文件: D:\codex\novel-workshop-vue3\docs\教训门禁系统.md

### GATE-1: 写完代码不等于功能完成
- 门禁: 每个Vue组件开发完成后必须运行CDP行为验证(Input.dispatchMouseEvent)，截图+JSON日志+时间戳三者缺一禁止进入下一波
- 强制等级: BLOCKER

### GATE-2: CDP假阳性
- 门禁: CDP验证脚本中禁止Runtime.evaluate，必须用Input.dispatchMouseEvent模拟真实鼠标
- 强制等级: BLOCKER

### GATE-3: CSS只加不删
- 门禁: Vue组件用scoped CSS隔离，全局样式修改前必须全文搜索。封装前重复选择器检测=0
- 强制等级: BLOCKER

### GATE-4: 封装版与源文件不一致
- 门禁: 每波完成后必须封装一次，安装新版本实测
- 强制等级: BLOCKER

### GATE-5: PowerShell写中文文件
- 门禁: 所有中文文件写入必须用Node.js fs，禁止PowerShell cmdlet
- 强制等级: BLOCKER

### GATE-6: 硬编码API Key/测试数据
- 门禁: 封装前扫描源码中sk-开头字符串、硬编码模型名
- 强制等级: BLOCKER

### GATE-7: token/超时/深度限制
- 门禁: 扫描源码中token_budget/max_tokens<8192/timeout<30000/depth限制
- 强制等级: BLOCKER

### GATE-8: 数据持久化深拷贝问题
- 门禁: Vue 3用Pinia store统一数据源，禁止直接修改store state
- 强制等级: BLOCKER

### GATE-9: 内存泄漏
- 门禁: Vue组件用onUnmounted清理所有定时器/事件监听器。标签页上限20个
- 强制等级: BLOCKER

### GATE-10: 降AI执行顺序
- 门禁: 顺序必须为S1到硬规则pre到S2到硬规则post
- 强制等级: BLOCKER

### GATE-11: 风格样本注入位置
- 门禁: 风格样本注入S1(改写主力)，S2不拿样本
- 强制等级: WARN

### GATE-12: 正则误匹配
- 门禁: 所有正则匹配JSON的地方必须JSON.parse验证，match()调用必须有可选链
- 强制等级: BLOCKER

### GATE-13: reasoning_content未解析
- 门禁: API响应解析同时检查content和reasoning_content字段
- 强制等级: WARN

### GATE-14: 每轮新增规则不删旧规则
- 门禁: 每次添加新GATE时审查所有现有GATE，不适用的标记DEPRECATED
- 强制等级: WARN

### GATE-15: 模态框卡死
- 门禁: Vue组件用v-if控制模态框显隐，不用display:none/flex切换
- 强制等级: BLOCKER

### GATE-16: Agent分派强制执行(新增)
- 门禁: 每个迁移阶段必须检查Agent分派表，能并行的任务必须分派给不同Agent并行执行。禁止一个人串行做完所有任务
- 检查: 每波完成后审查是否所有标注为并行的Agent都实际被spawn了
- 强制等级: BLOCKER

### GATE-17: 防断网目标模式验证(新增)
- 门禁: 每波完成后验证防断网机制是否生效(模拟API中断，检查是否自动重试+断点续跑)
- 检查: 人为中断API请求，验证应用是否能从断点恢复而非从头重来
- 强制等级: BLOCKER

### GATE-18: 左边栏Agent进度可见验证(新增)
- 门禁: 每波完成后验证左边栏Agent进度面板是否正确显示: 运行中的Agent显示绿色、完成的显示蓝色、失败的显示红色
- 检查: spawn Agent后左边栏立即出现绿色条目，Agent完成后变蓝色
- 强制等级: BLOCKER

### 已废弃的旧规则

| 旧规则 | 状态 | 原因 |
|--------|------|------|
| 规则7: 网络重试5次 | DEPRECATED | 被规则20的8次递增替代 |
| 规则19: 工作前强制声明6项 | DEPRECATED | 过于繁琐 |
| STACK.md: 禁止npm依赖 | DEPRECATED | 迁移到Vue 3后需要npm依赖 |
| STACK.md: 禁止前端框架 | DEPRECATED | 本次迁移目标就是Vue 3 |

验收标准:
- [ ] 教训门禁系统文件创建完成
- [ ] 18条GATE全部有检查方法
- [ ] 4条旧规则标记DEPRECATED

---

# 一、目标架构

## 1.1 技术选型

| 层面 | 选型 | 原因 |
|------|------|------|
| 前端框架 | Vue 3 (Composition API + script setup) | 模板语法和现有HTML最接近，迁移成本最低 |
| 状态管理 | Pinia | Vue 3官方推荐，响应式自动同步 |
| 构建工具 | Vite 5 + electron-vite | 极速HMR，Electron集成成熟 |
| CSS方案 | Scoped CSS(组件内) + 全局tokens.css | 组件隔离解决重复选择器 |
| UI组件库 | 不用(自建组件) | 保持应用独特风格 |
| 虚拟滚动 | vue-virtual-scroller | 解决200+章显示限制 |
| 拖拽排序 | vuedraggable-next | SKILL排序功能 |
| 工作区 | D:\codex\novel-workshop-vue3 | D盘空间充足 |

## 1.2 目标目录结构

D:\codex\novel-workshop-vue3\
- electron/ (Electron主进程)
  - main.ts (主进程入口)
  - preload.ts (预加载脚本)
  - ipc/ (IPC处理器: storage/api/dialog/lifecycle/diag/crypto)
  - engine/ (引擎层，MCP+Agent预备)
    - tool-registry.ts (工具注册中心)
    - agent-scheduler.ts (Agent调度引擎)
    - mcp-protocol.ts (MCP协议适配)
  - lib/ (主进程业务逻辑: storage-manager/provider-manager/crypto)
- src/ (Vue 3渲染进程)
  - App.vue / main.ts
  - views/ (页面组件)
  - components/ (可复用组件: editor/pipeline/sidebar/chat/settings/deai/settings-collection/common)
  - composables/ (Vue composables)
  - stores/ (Pinia状态管理)
  - services/ (业务逻辑层)
  - styles/ (全局样式)
  - utils/ (工具函数)
- docs/ (参考书: UI规格/链路功能/教训门禁)
- scripts/ (GATE检查脚本)
- lessons/ (经验文件)
- memory/ (项目记忆)

---

# 二、Agent分派总表(新增)

## 2.1 Agent总览

共20个Agent(A1-A20)，分属不同阶段，同阶段内可并行的标记为并行组(P组)。

| Agent | 昵称 | 阶段 | 并行组 | 职责 |
|-------|------|------|--------|------|
| A1 | 环境搭建师 | 阶段0-1 | P0 | GitHub备份+D盘工作区+Vue3环境初始化+npm install+Vite配置 |
| A2 | 文档架构师 | 阶段0 | P0 | UI设计规格参考书+链路与功能参考书+教训门禁系统(可与A1并行) |
| A3 | IPC重构师 | 阶段2 | P2 | 拆分IPC处理器到electron/ipc/，新增IPC通道，升级preload.ts |
| A4 | 状态架构师 | 阘段3 | P3 | 创建8个Pinia store，编写单元测试 |
| A5 | 服务迁移师甲 | 阶段4 | P4-1 | 迁移第一批service(简单: utils/storage/agent-manager/skill-manager/project-manager/chapter-manager) |
| A6 | 服务迁移师乙 | 阶段4 | P4-1 | 迁移第二批service(中等: provider-manager/skill-template-engine/skill-validators/deai-samples/zhuque-validator/diag/persona-engine)(与A5并行) |
| A7 | 服务迁移师丙 | 阶段4 | P4-2 | 迁移第三批service(复杂: skill-engine拆分/de-ai.js拆分/pipeline-manager拆分)(依赖A5/A6完成) |
| A8 | 组件开发师甲 | 阶段5 | P5-1 | 第一波: 设置页(ApiSettings/SkillSettings/AgentSettings/AppearanceSettings/DeAiSettings) |
| A9 | 组件开发师乙 | 阶段5 | P5-1 | 第二波: 侧边栏(ChapterTree虚拟滚动/ProjectList/QuickActions)+左边栏Agent进度面板(与A8并行) |
| A10 | 组件开发师丙 | 阶段5 | P5-2 | 第三波: 编辑器(EditorToolbar/EditorPane/ChapterTabs/FindBar)(依赖A8设置页完成) |
| A11 | 组件开发师丁 | 阶段5 | P5-2 | 第四波: 对话面板(ChatPanel/ChatMessage修复三个按钮)(与A10并行) |
| A12 | 组件开发师戊 | 阶段5 | P5-3 | 第五波: 设定合集(ScPanel/ScCard/ScEditor/ScBindModal) |
| A13 | 组件开发师己 | 阶段5 | P5-3 | 第六波: 生成流水线(PipelineSteps/5个Step组件/卡片组件/续生成)(与A12并行) |
| A14 | 去AI专家 | 阶段5 | P5-4 | 第七波: 去AI味(DeAiButton/DeAiProgress/DeAiModeCard/DeAiFlowPreview/DeAiSkillSelector/38样本注入) |
| A15 | CSS迁移师 | 阶段6 | P6-A | 261KB style.css拆到组件scoped CSS，tokens.css搬移，重复选择器清零 |
| A16 | 引擎架构师 | 阶段7 | P7-A | 工具注册中心+Agent调度引擎+MCP协议适配 |
| A17 | 清理审计师 | 阶段8 | P8 | 删除旧文件，每删一个先确认功能已替代，全面审计117项 |
| A18 | 封装发布师 | 阶段9 | P9 | 封装前17项检查+封装+安装实测+v3.0.0发布 |
| A19 | 验证专家 | 全程 | - | 每波GATE检查+CDP行为验证+封装安装实测，独立于开发Agent |
| A20 | 防断网监控 | 全程 | - | 监控所有Agent的API调用，429时按递增间隔重试，断点续跑 |

## 2.2 并行组说明

P0组(A1+A2): 前置条件阶段，环境搭建和文档编写可完全并行
P2组(A3): IPC层重构，独立阶段
P3组(A4): Pinia状态管理，独立阶段
P4-1组(A5+A6): 第一批和第二批service迁移可并行
P4-2组(A7): 第三批复杂service迁移，依赖A5/A6完成
P5-1组(A8+A9): 设置页和侧边栏可并行
P5-2组(A10+A11): 编辑器和对话面板可并行
P5-3组(A12+A13): 设定合集和生成流水线可并行
P5-4组(A14): 去AI味组件，独立开发
P6-A组(A15): CSS迁移，依赖所有组件波次完成
P7-A组(A16): 引擎层，依赖服务层和组件层完成
P8组(A17): 旧代码清理，依赖所有Vue组件完成
P9组(A18): 封装发布，最后一波

A19(验证专家)和A20(防断网监控)贯穿全程，不隶属于任何并行组。

## 2.3 GitHub Agent搜索策略

当现有Agent无法满足任务需求时:

1. 首先用tool_search搜索可用工具: tool_search({query: "vue3 component migration agent"})
2. 如果tool_search找不到，去GitHub搜索:
   - 关键词: "vue3 migration agent", "electron vue3 boilerplate", "codex subagent vue"
   - 搜索地址: https://github.com/search?q=codex+subagent+vue3&type=repositories
   - 备选: https://github.com/search?q=electron+vue3+pinia+vite&type=code
3. 评估找到的Agent: 检查stars/最近更新/文档完整性/是否匹配任务
4. 安装并测试: 先在小任务上试跑，确认可用后再分派正式任务
5. 如果GitHub也找不到合适的Agent: 由主Agent(A19验证专家)临时兼任

---

# 三、迁移阶段详细计划

## 阶段0: 前置条件完成(4个GATE)

见上方零、四大前置条件。

Agent分派:
- A1(环境搭建师): GitHub备份+D盘工作区创建+文件复制+npm install
- A2(文档架构师): UI规格参考书+链路功能参考书+教训门禁系统(与A1并行)

门禁: GATE-0A/0B/0C/0D/0E全部PASS后才能进入阶段1

---

## 阶段1: D盘工作区搭建 + Vue 3环境初始化

### 1.1 安装新依赖
cd D:\codex\novel-workshop-vue3
npm install vue@3 pinia vue-router@4
npm install -D vite @vitejs/plugin-vue electron-vite vue-tsc typescript
npm install vue-virtual-scroller vuedraggable@next

### 1.2 配置Vite + electron-vite
- 创建vite.config.ts，配置渲染进程HMR，配置主进程自动重启
- CDP调试端口9223保持不变

### 1.3 创建目录结构
按目标目录结构创建空文件夹和占位文件

Agent分派: A1(环境搭建师)全权负责

验收:
- [ ] npm run dev启动Electron + Vue 3空白页面
- [ ] CDP端口9223正常
- [ ] 旧版代码仍可正常运行(兼容期)
- [ ] GATE-0A到0E全部PASS

---

## 阶段2: 主进程IPC层重构

### 2.1 拆分IPC处理器
把main.js的IPC逻辑拆到electron/ipc/目录(6个文件)

### 2.2 新增IPC通道
- pipeline:generate/resume (生成流水线+续生成)
- deai:process/cancel (去AI味处理+取消)
- skill:execute/validate (SKILL执行+验证)
- provider:getModels/testConnection (供应商模型获取+测试)
- agent:execute (Agent执行)
- agent:spawn/status/cancel (Agent分派+状态+取消，新增)

### 2.3 preload.ts升级
保留现有API(向后兼容)，新增通道，封装为Promise风格

Agent分派: A3(IPC重构师)全权负责

验收:
- [ ] 所有现有IPC功能正常
- [ ] 新IPC通道可被调用
- [ ] agent:spawn/status/cancel通道可用
- [ ] 旧版UI不受影响

---

## 阶段3: Pinia状态管理搭建

8个store: project/provider/skill/agent/pipeline/deai/editor/chapter/settings

每个store创建后写单元测试验证action正确修改state。

GATE-8检查: 禁止直接修改store state，必须用action。

Agent分派: A4(状态架构师)全权负责

验收:
- [ ] 8个store创建完成
- [ ] store间依赖关系清晰
- [ ] 单元测试通过

---

## 阶段4: 服务层迁移

16个service文件从js/迁移到src/services/，改为TypeScript。

第一批(简单，A5): utils/storage/agent-manager/skill-manager/project-manager/chapter-manager
第二批(中等，A6): provider-manager/skill-template-engine/skill-validators/deai-samples/zhuque-validator/diag/persona-engine
第三批(复杂，A7): skill-engine拆分、de-ai.js拆分(114KB变5个文件)、pipeline-manager.js拆分(125KB变5个文件)

第一批和第二批可并行(A5+A6同时跑)，第三批依赖前两批完成。

规则: 纯逻辑不依赖Vue，每个文件不超过500行，每迁移一个写单元测试。

Agent分派:
- A5(服务迁移师甲): 第一批(与A6并行)\+- A6(服务迁移师乙): 第二批(与A5并行)
- A7(服务迁移师丙): 第三批(依赖A5+A6完成)

验收:
- [ ] 16个service迁移完成
- [ ] 单元测试通过
- [ ] 不依赖Vue/DOM
- [ ] GATE-16: A5和A6实际并行执行了

---

## 阶段5: Vue组件开发(7波)

每波开发前: 打开UI设计规格参考书.md和链路与功能参考书.md对照
每波开发后: 运行GATE-1(CDP验证)+GATE-4(封装安装实测)+GATE-16(Agent并行检查)+GATE-18(左边栏可见)

### 第一波: 设置页(A8)
ApiSettings/SkillSettings/AgentSettings/AppearanceSettings/DeAiSettings
包括: 去AI味3张模式卡片(串行链式/Agent调度/multi-step)
包括: 供应商用途选择(generate/verify，人话标签)
包括: 验证供应商状态显示

### 第二波: 侧边栏(A9，与A8并行)
ChapterTree虚拟滚动(解决200+章显示限制)/ProjectList/QuickActions
左边栏Agent进度面板(新增): 实时显示所有spawn的Agent状态

### 第三波: 编辑器(A10，依赖A8完成)
EditorToolbar/EditorPane/ChapterTabs/FindBar

### 第四波: 对话面板(A11，与A10并行)
ChatPanel/ChatMessage(修复三个按钮: 复制/重新生成/应用到编辑区)

### 第五波: 设定合集(A12)
ScPanel/ScCard/ScEditor/ScBindModal(修复模态框卡死，用v-if)

### 第六波: 生成流水线(A13，与A12并行)
PipelineSteps/5个Step组件/卡片组件/续生成
防断网: 每生成一章/一卷就展示+保存，断网后从断点续跑

### 第七波: 去AI味(A14)
DeAiButton/DeAiProgress/DeAiModeCard/DeAiFlowPreview/DeAiSkillSelector
38个风格样本按段落相似度挑2-3个注入S1
执行顺序: S1先跑(原文上改写)到硬规则清洗到S2验证到硬规则安全网
进度条弹窗实时显示百分比+当前步骤
流程预览按模式显示不同流程

每波验收:
- [ ] CDP行为验证PASS(GATE-1+GATE-2)
- [ ] 视觉与UI参考书一致(GATE-3)
- [ ] 功能与链路参考书一致
- [ ] 封装安装实测PASS(GATE-4)
- [ ] Agent并行执行了(GATE-16)
- [ ] 左边栏显示Agent进度了(GATE-18)
- [ ] 无console error

---

## 阶段6: CSS迁移与清理

261KB style.css拆到组件scoped CSS。
tokens.css直接搬，全局重置提取到reset.css。
每个组件只写自己需要的样式。

GATE-3检查: 封装前重复选择器检测=0

Agent分派: A15(CSS迁移师)全权负责

验收:
- [ ] style.css不再存在
- [ ] 重复选择器=0
- [ ] 视觉与UI参考书一致

---

## 阶段7: 主进程引擎层(MCP + Agent)

### 7.1 工具注册中心
把所有功能注册为标准工具(generate_settings/volumes/chapters/body, deai_process, skill_chain, hardrule_process, zhuque_check等)

### 7.2 Agent调度引擎
多步规划/并行执行/重试/状态追踪
与左边栏Agent进度面板联动: 每个Agent spawn时在左边栏创建条目，状态变化时更新颜色

### 7.3 MCP协议适配
外部MCP服务器可注册，应用本身可作MCP服务器

Agent分派: A16(引擎架构师)全权负责

验收:
- [ ] 所有功能注册为标准工具
- [ ] Agent能执行多步任务
- [ ] 外部MCP可加载
- [ ] Agent状态实时同步到左边栏

---

## 阶段8: 旧代码清理与最终整合

删除renderer.html/renderer_v2.js/panels.js/style.css/js/旧文件
每删一个文件先确认功能已被Vue版替代，备份后删，删后验证。

Agent分派: A17(清理审计师)全权负责

验收:
- [ ] 旧文件全部删除
- [ ] 全面审计117项PASS

---

## 阶段9: 封装与发布

封装前17项检查清单全部PASS:

1. GPU硬件加速启用
2. package.json files包含新目录
3. 无硬编码API Key(GATE-6)
4. CSS花括号平衡=0
5. 重复选择器=0(GATE-3)
6. CDP行为验证PASS(GATE-1+GATE-2)
7. 所有面板能打开/关闭
8. 表格不撑爆容器
9. Skill选择器正常
10. 数据持久化正常(GATE-8)
11. reasoning_content解析(GATE-13)
12. Agent配置注入API请求体
13. 封装后安装实测(GATE-4)
14. style.css不存在
15. Toast z-index>9999
16. 正则安全(GATE-12)
17. 无token限制(GATE-7)

Agent分派: A18(封装发布师)全权负责，A19(验证专家)监督

验收:
- [ ] 封装成功
- [ ] 安装后不闪退
- [ ] 用户所有功能可用
- [ ] 版本号v3.0.0

---

# 四、防断网目标模式(新增)

## 4.1 核心原则

全程启用目标模式，确保:
- API断网后自动从断点续跑，不从头重来
- 429限流时按递增间隔重试，不放弃不简化
- 长时间生成(如300章)中途断网，已生成的章节保留

## 4.2 429限流应对SOP

遇到429时的正确做法:
1. 不放弃不简化: 429是临时状态，禁止跳过步骤、禁止用简化方法绕过
2. 目标模式继续运行: 429不阻塞目标模式，防断网机制照常工作
3. 递增重试: 按30s->60s->90s->120s->150s->180s->210s->240s间隔重试，共8次约15分钟
4. 重试期间做本地工作: 读文件、CSS编辑、CDP验证、整理审计，不空等
5. 子Agent触发429时: 关闭旧子Agent释放配额，再重新spawn
6. 8次重试全部失败后: 不终止任务，切换纯本地工作，每5分钟静默重试一次
7. 429解除后: 从断点继续，不从头重来
8. 超时持续等待: 任何超时都持续等待，禁止跳过

## 4.3 章节生成防断网机制

核心: 每生成一章就展示一个单章框架+保存，而非一次性跑完300章

流程:
1. 系统识别到该卷需生成300章
2. 启用机制: 以跑完300章为终点
3. 每生成1章: 立即在界面展示单章框架+保存到IndexedDB
4. 空等时间高于3秒: 自动重新请求API从断点处续跑
5. API无反应: 持续发送启动信号(每5分钟一次)
6. 用户可随时点击续生成按钮: 从已保存的断点继续

## 4.4 卷纲生成防断网机制

同理: 每生成1卷就展示+保存，断网后从断点续跑

## 4.5 去AI味防断网机制

切分后的每一段独立处理，某段失败不影响已完成的段落
multi-step的每一步独立保存中间结果

## 4.6 Agent分派的防断网

A20(防断网监控)Agent贯穿全程:
- 监控所有Agent的API调用状态
- 检测到API中断时: 暂停受影响的Agent，保存断点
- 检测到429时: 按递增间隔重试
- API恢复后: 自动恢复被暂停的Agent，从断点继续
- 左边栏显示: 被暂停的Agent显示黄色(等待中)，恢复后变回绿色

GATE-17验证: 每波完成后人为模拟API中断，验证应用是否能从断点恢复

---

# 五、左边栏Agent进度可见(新增)

## 5.1 设计目标

用户在任何时刻都能看到:
- 当前有多少个Agent在运行
- 每个Agent在做什么任务
- 每个Agent的进度百分比
- 哪些完成了、哪些失败了、哪些在等待

## 5.2 UI设计

### 位置与尺寸
- 位置: 左侧边栏(48px图标栏)右侧，可折叠面板
- 展开宽度: 280px
- 折叠宽度: 0px(完全隐藏)或48px(显示图标)
- 折叠按钮: 左侧边栏最下方，图标为列表图标

### Agent列表项
每行显示:
- Agent编号(如A5)
- Agent昵称(如服务迁移师甲)
- 状态图标(圆形): 绿色=运行中/蓝色=已完成/红色=失败/黄色=等待中(429或断网)/灰色=未启动
- mini进度条(0-100%)
- 当前任务简述(如正在迁移skill-manager.js)

### 日志区
- 位置: Agent列表下方
- 默认显示最新3条日志
- 点击展开显示全部日志
- 每条日志: 时间戳+Agent编号+日志内容

### 交互
- 点击Agent条目: 展开该Agent的详细日志
- 右键Agent条目: 菜单(取消Agent/重试Agent/查看输出)
- Agent失败时: 条目闪烁红色3次，然后稳定红色

## 5.3 数据流

Agent调度引擎(agent-scheduler.ts)维护一个Agent状态Map:

每个Agent状态包含:
- id: A1-A20
- name: 昵称
- status: pending/running/completed/failed/waiting
- progress: 0-100
- currentTask: 当前任务简述
- logs: 日志数组
- startTime: 启动时间
- endTime: 完成时间(如有)

状态变化时通过Pinia store的响应式系统自动更新左边栏UI。

## 5.4 与防断网的联动

当A20(防断网监控)检测到API中断时:
- 受影响的Agent状态变更为waiting(黄色)
- 左边栏显示等待原因(如等待API重试 30s/240s)
- API恢复后Agent状态自动变回running(绿色)

GATE-18验证: spawn Agent后左边栏立即出现绿色条目，Agent完成后变蓝色

---

# 六、验证策略

每波完成后必须过以下GATE:

| GATE | 检查内容 | 强制等级 |
|------|----------|----------|
| GATE-1 | CDP行为验证(Input.dispatchMouseEvent) | BLOCKER |
| GATE-2 | 禁止Runtime.evaluate | BLOCKER |
| GATE-3 | CSS重复选择器=0 | BLOCKER |
| GATE-4 | 封装后安装实测 | BLOCKER |
| GATE-5 | 禁止PowerShell写中文 | BLOCKER |
| GATE-6 | 无硬编码数据 | BLOCKER |
| GATE-7 | 无token/超时/深度限制 | BLOCKER |
| GATE-8 | Pinia store禁止直接修改state | BLOCKER |
| GATE-9 | 内存泄漏检测 | BLOCKER |
| GATE-10 | 降AI执行顺序正确 | BLOCKER |
| GATE-12 | 正则安全 | BLOCKER |
| GATE-15 | 模态框用v-if不用display | BLOCKER |
| GATE-16 | Agent分派强制执行(新增) | BLOCKER |
| GATE-17 | 防断网目标模式验证(新增) | BLOCKER |
| GATE-18 | 左边栏Agent进度可见(新增) | BLOCKER |
| GATE-11 | 风格样本注入S1 | WARN |
| GATE-13 | reasoning_content解析 | WARN |
| GATE-14 | 规则审查(新增时审查旧规则) | WARN |

BLOCKER级GATE未通过禁止进入下一波。WARN级GATE记录但可继续。

A19(验证专家)Agent独立于开发Agent，负责每波GATE检查。

---

# 七、迁移进度总览

| 阶段 | 内容 | 波次 | Agent分派 | 前置GATE |
|------|------|------|-----------|----------|
| 前置0 | GitHub备份+D盘工作区+UI参考书+链路参考书+教训门禁 | 1波 | A1+A2并行 | - |
| 阶段1 | Vue 3环境初始化 | 1波 | A1 | 0A-0E |
| 阶段2 | IPC层重构 | 1波 | A3 | - |
| 阶段3 | Pinia状态管理 | 1波 | A4 | - |
| 阶段4 | 服务层迁移 | 3波 | A5+A6并行->A7 | - |
| 阶段5 | Vue组件开发 | 7波 | A8+A9->A10+A11->A12+A13->A14 | 参考书 |
| 阶段6 | CSS迁移清理 | 2波 | A15 | GATE-3 |
| 阶段7 | 引擎层MCP+Agent | 2波 | A16 | - |
| 阶段8 | 旧代码清理 | 1波 | A17 | 全面审计 |
| 阶段9 | 封装发布 | 1波 | A18+A19 | 17项检查 |
| 总计 | | 约20波 | 20个Agent | |

每波: 开发->GATE检查->封装测试->用户确认->git commit+push->进入下一波

全程: A19(验证专家)+A20(防断网监控)贯穿所有波次

---

# 八、融合前期讨论全部内容(新增)

本节将前期所有讨论中达成的共识和决策融入迁移计划，确保不遗漏。

## 8.1 降AI味三模式

三种模式必须全部迁移到Vue 3版本:

### 串行链式模式(chain)
- 流程: S1改写(原文上) -> 硬规则pre -> S2验证 -> 硬规则post -> 写回编辑器
- 执行顺序(关键): S1先跑在原文上改写，不是硬规则先跑
- 风格样本: 应用层按段落相似度挑2-3个注入S1，S2不拿样本
- SKILL放在system message里，不是user message里(权重更高)
- S2用低温(0.2-0.3)保证最小修正，不用0.7高温

### Agent调度模式(split-merge)
- 切分: 本地代码按语义断点切分，不依赖模型切分。用户可选1000/1500/2000字
- 溢出机制: 用户选1000字，语义在1100字完成则切到1100字，灵活浮动
- 并行重述: 切出的每段用同一SKILL并行调API(Promise.all)
- 拼接: 按顺序join，写回编辑器

### multi-step模式
- 调用1: 提取事件核(结构化文本)
- 代码验证: 检查事件核数量是否足够
- 调用2: 选偏转视角
- 代码验证: 检查偏转方法是否轮换(不连续3个用同一种)
- 调用3: 重组输出(从零重写)
- 代码验证: 首句主语对比原文，相同则重试一次
- 中间步骤输出不展示给用户，只展示最终S2输出
- 串行模式也加切分，每段1500-2000字

## 8.2 多供应商同时启用

- 应用支持同时启用多个供应商
- A供应商: 用途=generate(全局生成)，不含去AI味
- B供应商: 用途=verify(验证)，唯一职责是去AI味
- 供应商下拉用人话标签: 生成用/验证用(不写generate/verify/detect)
- 去AI味界面显示当前验证供应商状态(已连接/未连接)
- 用户切换验证供应商后去AI味界面自动同步

## 8.3 真SKILL架构

### 当前伪SKILL问题
- 当前SKILL是纯文本提示词，放在user message里
- 模型可以把规则当建议忽略
- 运行速度缓慢

### 真SKILL文件夹结构
一个真SKILL是一个独立文件夹:
- SKILL.md (说明书+指令模板)
- template.js (可执行脚本)
- examples/ (示例范本)
- config.json (配置: 执行模式chain/split-merge/multi-step，输出格式，验证规则，切分大小)

### 方式A vs 方式B
- 方式A: SKILL文件夹直接由应用加载，应用解析config.json决定执行方式
- 方式B: SKILL文件夹由Agent调度引擎加载，Agent负责执行流程控制
- 本次迁移先用方式A(应用直接加载)，阶段7引擎层完成后升级到方式B

### 对生成流水线的影响
- 生成流水线各层(大纲/设定/卷纲/章节/正文)的SKILL不需要每次改版本
- 真SKILL的config.json里声明执行模式，应用引擎读config决定怎么调
- 验证代码根据config.json里的验证规则校验输出

### SKILL编辑器升级
- 左侧: Markdown编辑器(写SKILL说明书和规则)
- 右侧: 实时预览(渲染后的效果)
- 执行模式选择: chain/split-merge/multi-step下拉
- 输出格式选择: JSON数组/纯文本下拉
- 验证规则勾选: 章节数量精确匹配/JSON格式校验/最低长度等
- 切分大小输入: 默认1000字
- 这些配置只针对生成流水线，去AI味的模式由用户在去AI味界面选

## 8.4 6项验证器需求(来自SKILL层)

1. 卷纲层field_exists扩展: 校验name/outline/summary/suggestedWords四个字段
2. 章节层plot字段最小长度验证: field_min_length(plot, 200)
3. JSON字符串转义验证器: 检查换行符是否为\n、双引号是否转义
4. 设定层attrs字段存在性验证: field_exists(name, category, attrs)
5. 章节层title非空验证: field_min_length(title, 1)
6. 卷纲层outline字段最小长度验证: field_min_length(outline, 500)

这些验证器在SkillExecutionEngine中实现，生成流水线每层输出后自动校验。

## 8.5 38个风格样本

- 38个人类风格样本嵌入应用层，不进SKILL(防止prompt膨胀)
- 文体分类(novel/script/media)选对应子集
- 相似度匹配从38个里挑2-3个最贴近当前段落的
- 按步骤注入: S1改写师拿到风格样本，S2验证师不拿
- 样本作为user message的参考附录，不进system message
- 每次调用只多300-450字(3个样本)，可控

## 8.6 诊断检测器

- 应用内置自动检测器，检测用户日常使用中遇到的问题
- 生成日志保存在logs/目录
- 覆盖范围: 全应用内内外外
- 不影响应用运行速度(异步写入，非阻塞)
- 检测内容: API调用失败/IPC通道异常/数据持久化失败/UI渲染错误/内存泄漏/正则匹配失败

## 8.7 SKILL编辑器Markdown支持

- 左侧Markdown编辑器，右侧实时预览
- 应用读右侧渲染后的HTML，不是左侧纯文本
- SKILL以代码形式呈现，支持Markdown语法

## 8.8 降AI味设置界面

- 独立设置选项卡，在外观后面
- 3张模式卡片: 串行链式/Agent调度/multi-step
- 每张卡片内放对应的功能(独立SKILL选择器/Agent选择器/硬规则开关)
- 去AI味的SKILL和Agent不和应用层任何地方联动
- 硬规则默认绑定去AI味按钮，不需要单独选项
- 去AI味是正文生成后的独立检测重写机制，不和正文一起用

## 8.9 AI验证AI(cross_model_check)

- 用验证供应商(如不同模型)检测生成供应商的输出
- 验证供应商接入deAiProcess
- cross_model_check在S1输出后执行
- 验证结果反馈到进度弹窗
- 不配验证供应商时流程正常跳过验证不报错

## 8.10 去AI味进度弹窗

- 点击去AI味后弹出进度条框
- 100%是终点，随进度增加
- 显示当前步骤(如正在执行S1改写... 正在执行硬规则清洗...)
- 支持取消按钮
- 流程预览按模式显示不同流程

## 8.11 防断网续生成

- 章节生成: 每生成一章就展示+保存，断网后从断点续跑
- 卷纲生成: 每生成一卷就展示+保存
- 去AI味: 切分后每段独立处理，某段失败不影响已完成段落
- 续生成按钮: 用户可随时点击从断点继续

## 8.12 生成流水线卷纲增量更新

用户修改某卷后，不影响其他卷:
- 修改卷2: 卷2标记为dirty，重新生成卷2，卷3-8保留
- 删除卷3/4: 卷5变卷3，卷6变卷4，卷7变卷5，卷8变卷6
- 保留卷5删除卷4/6: 卷5保留，卷4/6删除，卷号重排
- SKILL参与: 重新生成时联动SKILL

## 8.13 供应商获取模型修复

- 修复获取模型失败问题(默认模型fallback)
- 去AI味同步用户选择的模型(不再只读model和temperature)
- 多供应商同时启用: 生成供应商+验证供应商各自独立

---

# 九、注意事项

1. C盘原项目只读保留，所有开发在D盘进行
2. 新版必须能读取旧版IndexedDB数据(数据兼容)
3. 迁移是搬不是改，功能优化放到迁移后
4. 每波封装一次安装实测
5. UI参考书和链路参考书是核对标准，边做边对照
6. 教训门禁系统是强制约束，BLOCKER级未通过禁止继续
7. 4条旧规则标记DEPRECATED不再适用
8. Agent分派是强制要求(GATE-16)，能并行的必须并行
9. 左边栏Agent进度必须可见(GATE-18)，用户随时可看
10. 防断网目标模式全程启用(GATE-17)，断点自动续跑
11. GitHub找不到合适Agent时由主Agent临时兼任
12. 禁止PowerShell写中文文件(规则13)，用Node.js fs
13. 禁止给应用设置token预算/上限(规则7/GATE-7)
14. 每次任务前读取经验文件(用户强制要求)

---

# 十、经验教训引用

基于全历史复盘_终极总结.md，以下教训在迁移中必须遵守:

1. 编码灾难: PowerShell Set-Content写中文导致双重编码，必须用Node.js fs
2. 数据持久化: StorageManager.get()返回深拷贝导致数据丢失，Vue 3用Pinia统一数据源
3. CSS只加不删: 261KB style.css有大量重复选择器，Vue scoped CSS解决
4. 封装与源文件不一致: 每波封装安装实测
5. 硬编码API Key: v1.0.0犯过，封装前必须扫描
6. token限制: 用户要求无限制但AI自作主张设限制，GATE-7强制扫描
7. 内存泄漏: find-bar监听器/openTabs/autoSaveTimer泄漏，Vue onUnmounted清理
8. 降AI执行顺序: 硬规则在S1之前跑导致AI率反升，必须S1先跑
9. 风格样本注入位置: 38个样本只注入S2导致S1拿不到，必须注入S1
10. 正则误匹配: 贪婪正则误匹配方括号，必须JSON.parse验证
11. reasoning_content: API返回reasoning_content但应用只解析content，必须同时检查
12. 模态框卡死: display=flex但不加.visible类，Vue用v-if解决
13. 每轮新增规则不删旧规则: 规则从1条涨到23条，每次新增时审查旧规则
14. 反复空转不写文件: 上一个回合反复尝试apply_patch但格式报错，导致v3文件迟迟未写入。教训: 文件写入失败时立即换Write工具或Node.js fs，不要在同一个失败方法上反复尝试
15. Agent不并行: 用户反映3-4周预计时间都是一个人做，没有分派Agent并行。本次必须用Agent分派(GATE-16)

---

本计划基于:
- 全历史复盘_终极总结.md的教训
- v2迁移计划(576行)
- 用户4个调整要求(Agent分派/左边栏可见/防断网/GitHub搜索)
- 全部前期讨论内容(降AI三模式/多供应商/真SKILL/6项验证器/38样本/诊断检测器/SKILL编辑器/卷纲增量更新)
- 18条GATE门禁系统

版本: v3
状态: 待审核
创建者: Codex (AI Agent)
审核者: 用户凯瑞
