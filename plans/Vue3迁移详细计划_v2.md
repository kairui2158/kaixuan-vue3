 # 小说工坊 Vue 3 架构迁移详细计划 (v2)

 创建日期: 2026-08-08
 当前版本: v2.7.63
 目标: 从纯HTML/CSS/JS迁移到Vue 3 + Pinia + Vite，工作区设在D盘，为MCP和真Agent预留架构空间

 ---

 # 零、四大前置条件（迁移开始前必须全部完成）

 ## 前置条件1：GitHub备份 + D盘新工作区

 ### 1.1 GitHub完整备份

 **门禁GATE-0A：未完成GitHub备份禁止开始任何迁移工作**

 步骤:
 1. 清理项目根目录：删除根目录下所有临时文件（cdp_*.js, check_*.js, e2e_*.js, _*.txt, electron_*.txt, screenshot_*.png等）
 2. 清理dist_old_*目录
 3. git add -A
 4. git commit -m "v2.7.63 最终备份：Vue 3迁移前的完整快照"
 5. git push origin main
 6. 验证：GitHub网页端确认所有文件已上传

 验收标准:
 - [ ] git log确认最新commit在GitHub上可见
 - [ ] GitHub仓库文件列表完整
 - [ ] 本地git status干净

 ### 1.2 D盘新工作区创建

 **门禁GATE-0B：未在D盘创建工作区禁止开始任何迁移工作**

 步骤:
 1. 在D:\codex\下创建文件夹：D:\codex\novel-workshop-vue3\
 2. 将需要迁移的源文件复制过去（不是移动，C盘原项目保留不动）
 3. 需要迁移的文件清单:
    - main.js, preload.js, package.json
    - renderer.html, renderer_v2.js, panels.js, style.css
    - js/目录全部16个文件
    - styles/目录全部文件
    - build/目录（图标等打包资源）
    - lessons/目录（经验文件）
    - memory/目录（项目记忆）
    - AGENTS.md, STACK.md, .gitignore
 4. 不迁移的文件:
    - node_modules/（D盘重新npm install）
    - dist/, dist_old_*/（旧打包产物）
    - test_evidence/, test_screenshots/（旧测试截图）
    - BACKUP/（旧备份）
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

 **C盘空间说明**: 迁移完成后，C盘原项目可作为只读参考保留，不再做任何修改。所有后续开发在D盘进行。

 ---

 ## 前置条件2：UI设计规格参考书

 **门禁GATE-0C：未完成UI规格记录禁止开始Vue组件开发**

 创建文件：D:\codex\novel-workshop-vue3\docs\UI设计规格参考书.md

 需要记录的UI规格:

 ### 2.1 颜色系统（从styles/tokens.css提取）

 | 分类 | 变量名 | 值 | 用途 |
 |------|--------|-----|------|
 | 背景 | --bg-primary | #0a0a0c | 主背景 |
 | 背景 | --bg-secondary | #121215 | 次级背景 |
 | 背景 | --bg-tertiary | #1a1a1f | 三级背景（卡片/面板）|
 | 背景 | --bg-elevated | #212129 | 悬浮元素 |
 | 背景 | --bg-input | #15151c | 输入框 |
 | 文字 | --text-primary | #e8e8ec | 主文字 |
 | 文字 | --text-secondary | #a0a2ac | 次级文字 |
 | 文字 | --text-muted | #888a94 | 弱文字 |
 | 强调 | --accent | #7c8cf8 | 主强调色（蓝紫）|
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
 - 字体族: 系统默认（-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif）
 - 正文字号: 14px
 - 标题字号: 16px-20px
 - 小字字号: 12px
 - 代码字号: 13px
 - 行高: 1.5-1.6

 ### 2.3 间距系统
 - 基础单位: 2px
 --space-1: 2px / --space-2: 4px / --space-3: 6px / --space-4: 8px
 --space-5: 12px / --space-6: 16px / --space-8: 24px / --space-10: 32px

 ### 2.4 圆角系统
 --radius-xs: 4px / --radius-sm: 6px / --radius-md: 8px / --radius-lg: 12px

 ### 2.5 按钮规格
 | 类型 | 背景 | 文字 | 边框 | 圆角 | 尺寸 |
 |------|------|------|------|------|------|
 | 主按钮 | accent渐变 | #fff | 无 | 6px | padding 8px 16px |
 | 次按钮 | transparent | text-primary | border-color | 6px | padding 8px 16px |
 | 危险按钮 | danger | #fff | 无 | 6px | padding 8px 16px |
 | 图标按钮 | transparent | text-secondary | 无 | 6px | 32x32px |
 | 悬浮态 | bg-hover | accent | 无 | 6px | 同上 |

 ### 2.6 侧边栏规格
 - 宽度: 48px（纯图标）
 - 按钮尺寸: 36x36px
 - 按钮间距: 4px
 - 分隔线: 1px solid border-color
 - tooltip: 右侧弹出，bg-tertiary背景

 ### 2.7 面板/模态框规格
 - 模态框背景: bg-glass (rgba(20,20,28,0.85))
 - 遮罩层: bg-overlay (rgba(0,0,0,0.5))
 - 面板宽度: 480px（设置）/ 640px（流水线）/ 800px（编辑器）
 - z-index: 面板1000 / 模态框2000 / toast 9999

 ### 2.8 编辑器规格
 - 编辑区背景: bg-primary
 - 文字颜色: text-primary
 - textarea无边框，只有底部聚焦线
 - 工具栏: 固定顶部，高40px
 - 查找栏: 滑出式，高36px

 ### 2.9 对话气泡规格
 - 用户气泡: 背景--user-bubble，圆角12px，右对齐
 - AI气泡: 背景--ai-bubble，圆角12px，左对齐
 - 最大宽度: 80%
 - 表格: max-width 100%, overflow-x auto

 ### 2.10 卡片规格
 - 卷纲卡片: bg-tertiary, 圆角8px, padding 16px
 - 章节卡片: bg-secondary, 圆角6px, padding 12px
 - 设定卡片: bg-tertiary, 圆角8px, padding 16px

 验收标准:
 - [ ] UI规格参考书创建完成
 - [ ] 所有颜色变量已记录（与tokens.css核对）
 - [ ] 所有按钮类型已记录
 - [ ] 所有面板规格已记录
 - [ ] 可以用作Vue组件开发的核对标准

 ---

 ## 前置条件3：链路与功能参考书

 **门禁GATE-0D：未完成链路记录禁止开始Vue组件开发**

 创建文件：D:\codex\novel-workshop-vue3\docs\链路与功能参考书.md

 需要记录的所有链路:

 ### 3.1 生成流水线链路（核心五层联动）

 **大纲层 → 设定层**
 - 输入: 大纲全文 + 大纲基调锚点 + 叙事风格五维度
 - 动作: 点击"AI生成设定"按钮
 - 处理: _plGenSettings() 读取pl.outlineText，构建约束文本，注入SKILL/Agent配置，调apiGenerate
 - 输出: 设定JSON保存到pl.settings
 - 确认: 点击"保存设定"，settingsGenerated=true，进入步骤3

 **设定层 → 卷纲层**
 - 输入: 大纲 + 设定JSON + 每卷字数分配
 - 动作: 点击"AI生成卷纲"/"自动生成"/"逐卷生成"
 - 处理: _plGenVolumes()/_plAutoGenVolumes()/_plContinueGenVolumes()
 - 输出: 卷纲JSON数组，每项含name/outline/summary/suggestedWords
 - 确认: 点击"全部确认卷纲"
 - 续生成: _plResumeGen() 从断点继续

 **卷纲层 → 章节层**
 - 输入: 单卷蓝图(卷纲outline) + 本卷总章数 + 单章字数
 - 动作: 点击"AI生成章节"/"自动生成章节"
 - 处理: _plGenChapters()/_plAutoGenChapters()，按卷纲字数÷单章字数=章节数
 - 输出: 章节JSON数组，每项含title/plot
 - 确认: 点击"全部确认章节"
 - 防断网: 每生成一章就展示+保存，断网后从断点续跑

 **章节层 → 正文层**
 - 输入: 章节plot + SKILL配置 + Agent配置
 - 动作: 点击"AI生成正文"
 - 处理: _plGenBody() 注入SKILL/Agent，调apiGenerate
 - 输出: 正文文本
 - 确认: 点击"插入到编辑器"→"确认正文"

 ### 3.2 供应商管理链路

 **供应商配置 → 模型获取 → 下拉选择 → API调用**
 - 供应商列表: ProviderManager管理，每供应商含name/baseUrl/apiKey/models/temperature/maxTokens
 - 供应商用途: generate(生成)/verify(验证)/detect(检测)
 - 模型获取: 点击"获取模型"→api:fetchModels IPC→主进程请求→返回模型列表→写入ProviderManager→下拉显示
 - 多供应商: A供应商全局生成，B供应商验证(去AI味)，各自独立

 ### 3.3 SKILL链式执行链路

 **SKILL排序 → 链式调用 → 输出传递**
 - SKILL列表: SkillManager管理，支持上下箭头排序
 - 链式执行: SkillExecutionEngine.chain() 按顺序调用，SKILL1输出→SKILL2输入→SKILL3输入
 - 三种模式: 串行链式(chain) / Agent调度(split-merge) / multi-step
 - 验证器: first_subject_different / zhuque_check / cross_model_check

 ### 3.4 去AI味链路

 **正文 → 去AI味处理 → 结果写回编辑器**
 - 触发: 编辑器工具栏点击"去AI味"按钮
 - 流程: deAiProcess() 按模式执行
   - 串行链式: 硬规则pre → S1改写 → S2验证 → 硬规则post → 写回编辑器
   - Agent调度: 切分 → 并行重述 → 拼接 → 写回编辑器
   - multi-step: 事件核提取 → 视角偏转 → 重组输出 → 验证 → 写回编辑器
 - 执行顺序（关键）: S1先跑(原文上改写) → 硬规则清洗 → S2验证 → 硬规则安全网
 - 风格样本: 应用层按段落相似度挑2-3个注入S1，S2不拿样本
 - 进度: 进度条弹窗实时显示百分比+当前步骤
 - 取消: cancelController中止请求

 ### 3.5 设定合集链路

 **设定创建 → 分类管理 → 绑定到章节/正文**
 - 创建: 添加分类 → 添加条目(name/category/attrs)
 - AI生成: aiGenSettings() 调用流水线genSettings()
 - 绑定: 打开绑定模态框 → 选择章节 → 保存绑定
 - 约束注入: 正文生成时_getBoundSettingsForContext()提取绑定设定注入API请求
 - 数据统一: 所有操作走_getProjectData()获取+_saveProjectData()保存（修复_scData vs _getProjectData问题）

 ### 3.6 编辑器交互链路

 **章节树 → 打开标签页 → 编辑 → 自动保存 → 导出**
 - 打开章节: 章节树点击 → 创建/激活标签页 → 加载章节内容到编辑区
 - 标签页管理: 上限20个（修复无限增长），关闭时清除autoSaveTimer
 - 自动保存: setInterval定时保存，tab关闭时_clearAutoSaveTimer()
 - 查找替换: find-bar事件监听器只绑一次（修复泄漏）
 - 导出: 下拉菜单选格式(md/txt/epub) → exportChapter()
 - 快捷键: Ctrl+S保存, Ctrl+Z/Y撤销重做, Ctrl+F查找

 ### 3.7 项目管理链路

 **新建项目 → 导入大纲 → 锁定大纲 → 生成卷章**
 - 新建: 填写书名+大纲 → createProject()
 - 导入: .docx文件 → ZIP解析+deflate解压+XML提取
 - 锁定: lockOutline() 解析大纲创建默认卷章
 - 切换: 切换项目时编辑器/对话/设定/章节树全部同步刷新

 ### 3.8 对话面板链路

 **发送消息 → SKILL注入 → 流式响应 → 按钮操作**
 - 发送: 输入文本 → 注入SKILL/Agent配置 → 调API流式响应
 - Markdown渲染: marked解析 → 消息气泡显示
 - 三个按钮: 复制 / 重新生成 / 应用到编辑区
 - AI共创大纲: 大纲工作台的对话模式

 ### 3.9 IPC通信链路（全部16个通道）

 | 通道 | 方向 | 用途 |
 |------|------|------|
 | safe:encrypt/decrypt | 渲染→主 | API Key加密 |
 | storage:read/write/remove/list | 渲染→主 | 数据持久化 |
 | storage:export/import | 渲染→主 | 数据导入导出 |
 | storage:getDataDir | 渲染→主 | 获取数据目录 |
 | diag:write/read/export/clear | 渲染→主 | 诊断日志 |
 | api:fetchModels | 渲染→主 | 获取模型列表 |
 | dialog:saveFile/openFile | 渲染→主 | 文件对话框 |
 | app:quit/getVersion | 渲染→主 | 应用生命周期 |
 | app:requestClose/closeChoice/finalSave | 双向 | 关闭确认流程 |

 验收标准:
 - [ ] 所有9条链路已记录
 - [ ] 每条链路的输入→处理→输出完整
 - [ ] 所有16个IPC通道已记录
 - [ ] 可以用作Vue组件开发的核对标准

 ---

 ## 前置条件4：教训门禁系统升级

 **门禁GATE-0E：未完成教训门禁升级禁止开始任何迁移工作**

 基于全历史复盘_终极总结.md，旧教训引用清单已过时。以下为更新后的教训门禁系统，每条都带强制门禁脚本/检查项。

 创建文件：D:\codex\novel-workshop-vue3\docs\教训门禁系统.md

 ### 教训GATE-1：写完代码≠功能完成
 - 旧状态：口号提醒，无强制
 - 新门禁：每个Vue组件开发完成后，必须运行CDP行为验证脚本（Input.dispatchMouseEvent），截图+JSON日志+时间戳三者缺一禁止进入下一波
 - 检查脚本：scripts/gate_cdp_verify.js
 - 强制等级：BLOCKER

 ### 教训GATE-2：CDP假阳性
 - 旧状态：知道但仍然用Runtime.evaluate
 - 新门禁：CDP验证脚本中禁止出现Runtime.evaluate调用，必须用Input.dispatchMouseEvent模拟真实鼠标坐标
 - 检查脚本：scripts/gate_no_runtime_eval.js（扫描测试脚本中是否有Runtime.evaluate）
 - 强制等级：BLOCKER

 ### 教训GATE-3：CSS只加不删
 - 旧状态：规则19写了但一直在违反
 - 新门禁：Vue组件用scoped CSS天然隔离，但全局样式（tokens.css）修改前必须全文搜索选择器。封装前必须运行重复选择器检测脚本，非媒体查询真冲突>0禁止封装
 - 检查脚本：scripts/gate_css_conflicts.js
 - 强制等级：BLOCKER

 ### 教训GATE-4：封装版与源文件不一致
 - 旧状态：源文件验证通过就声称完成
 - 新门禁：每波完成后必须封装一次，安装新版本实测。封装后安装版验证清单全部PASS才算完成
 - 检查脚本：scripts/gate_install_verify.js
 - 强制等级：BLOCKER

 ### 教训GATE-5：PowerShell写中文文件
 - 旧状态：规则13写了但偶尔违反
 - 新门禁：项目根目录放.githooks/pre-commit脚本，扫描暂存区中是否有用PowerShell cmdlet写中文文件的痕迹。所有中文文件写入必须用Node.js fs
 - 检查脚本：scripts/gate_no_powershell_chinese.js
 - 强制等级：BLOCKER

 ### 教训GATE-6：硬编码API Key/测试数据
 - 旧状态：规则8写了但v1.0.0犯了
 - 新门禁：封装前必须运行扫描脚本，检查源码中是否有sk-开头的字符串、硬编码模型名、示例数据
 - 检查脚本：scripts/gate_no_hardcoded.js
 - 强制等级：BLOCKER

 ### 教训GATE-7：token_budget/超时/深度限制
 - 旧状态：用户要求无限制但AI自作主张设限制
 - 新门禁：扫描源码中是否有token_budget/max_tokens<8192/timeout<30000/depth限制，发现就BLOCKER
 - 检查脚本：scripts/gate_no_limits.js
 - 强制等级：BLOCKER

 ### 教训GATE-8：数据持久化深拷贝问题
 - 旧状态：StorageManager.get()返回深拷贝导致数据丢失
 - 新门禁：Vue 3用Pinia store统一数据源，所有数据修改通过store action，action内自动调持久化。禁止直接修改store state（用$patch或action）
 - 检查脚本：代码review检查是否有store.$state.xxx = yyy直接赋值
 - 强制等级：BLOCKER

 ### 教训GATE-9：内存泄漏
 - 旧状态：find-bar监听器/openTabs/autoSaveTimer泄漏
 - 新门禁：Vue组件用onUnmounted清理所有定时器/事件监听器。标签页上限20个。检查脚本扫描组件中是否有setInterval/addEventListener但无对应clear/removeEventListener
 - 检查脚本：scripts/gate_memory_leak.js
 - 强制等级：BLOCKER

 ### 教训GATE-10：降AI执行顺序
 - 旧状态：硬规则在S1之前跑导致AI率反升
 - 新门禁：deAiProcess代码中硬规则pre必须在S1之后执行（顺序：S1→硬规则pre→S2→硬规则post）。检查脚本验证代码顺序
 - 检查脚本：scripts/gate_deai_order.js
 - 强制等级：BLOCKER

 ### 教训GATE-11：风格样本注入位置
 - 旧状态：38个样本只注入S2，S1拿不到
 - 新门禁：风格样本注入S1（改写主力），S2不拿样本。检查脚本验证注入逻辑
 - 检查脚本：代码review
 - 强制等级：WARN

 ### 教训GATE-12：正则误匹配
 - 旧状态：贪婪正则误匹配方括号
 - 新门禁：所有正则匹配JSON的地方，匹配后必须JSON.parse验证，parse失败走报告分支。所有match()调用必须有可选链(?.)
 - 检查脚本：scripts/gate_regex_safe.js
 - 强制等级：BLOCKER

 ### 教训GATE-13：reasoning_content未解析
 - 旧状态：API返回reasoning_content但应用只解析content
 - 新门禁：API响应解析同时检查content和reasoning_content字段
 - 检查脚本：代码review
 - 强制等级：WARN

 ### 教训GATE-14：每轮新增规则不删旧规则
 - 旧状态：规则从1条涨到23条但旧规则可能已不适用
 - 新门禁：每次添加新GATE时，审查所有现有GATE是否仍然适用。不适用的标记为DEPRECATED并说明原因。GATE总数控制在15条以内
 - 检查脚本：人工审查
 - 强制等级：WARN

 ### 教训GATE-15：模态框卡死
 - 旧状态：模态框display=flex但不加.visible类，early return不关闭
 - 新门禁：Vue组件用v-if控制模态框显隐，不用display:none/flex切换。组件卸载时自动清理
 - 检查脚本：代码review
 - 强制等级：BLOCKER

 ### 已废弃的旧规则（标记DEPRECATED）

 | 旧规则 | 状态 | 原因 |
 |--------|------|------|
 | 规则7: 网络重试5次 | DEPRECATED | 被规则20的8次递增替代 |
 | 规则19: 工作前强制声明6项 | DEPRECATED | 过于繁琐，用户后期不再要求 |
 | STACK.md: 禁止npm依赖 | DEPRECATED | 迁移到Vue 3后需要npm依赖 |
 | STACK.md: 禁止前端框架 | DEPRECATED | 本次迁移目标就是Vue 3 |

 验收标准:
 - [ ] 教训门禁系统文件创建完成
 - [ ] 15条GATE全部有检查脚本或review方法
 - [ ] 4条旧规则标记DEPRECATED
 - [ ] GATE检查脚本可运行

 ---

 # 一、目标架构

 ## 1.1 技术选型

 | 层面 | 选型 | 原因 |
 |------|------|------|
 | 前端框架 | Vue 3 (Composition API + script setup) | 模板语法和现有HTML最接近，迁移成本最低 |
 | 状态管理 | Pinia | Vue 3官方推荐，响应式自动同步 |
 | 构建工具 | Vite 5 + electron-vite | 极速HMR，Electron集成成熟 |
 | CSS方案 | Scoped CSS（组件内）+ 全局tokens.css | 组件隔离解决重复选择器 |
 | UI组件库 | 不用（自建组件） | 保持应用独特风格 |
 | 虚拟滚动 | vue-virtual-scroller | 解决200+章显示限制 |
 | 拖拽排序 | vuedraggable-next | SKILL排序功能 |
 | 工作区 | D:\codex\novel-workshop-vue3 | D盘空间充足 |

 ## 1.2 目标目录结构

 ```
 D:\codex\novel-workshop-vue3\
 ├── electron/                    # Electron主进程
 │   ├── main.ts                  # 主进程入口
 │   ├── preload.ts               # 预加载脚本
 │   ├── ipc/                     # IPC处理器
 │   │   ├── storage.ts
 │   │   ├── api.ts
 │   │   ├── dialog.ts
 │   │   ├── lifecycle.ts
 │   │   ├── diag.ts
 │   │   └── crypto.ts
 │   ├── engine/                  # 引擎层（MCP+Agent预备）
 │   │   ├── tool-registry.ts     # 工具注册中心
 │   │   ├── agent-scheduler.ts   # Agent调度引擎
 │   │   └── mcp-protocol.ts      # MCP协议适配
 │   └── lib/                     # 主进程业务逻辑
 │       ├── storage-manager.ts
 │       ├── provider-manager.ts
 │       └── crypto.ts
 ├── src/                          # Vue 3渲染进程
 │   ├── App.vue
 │   ├── main.ts
 │   ├── views/                    # 页面组件
 │   ├── components/               # 可复用组件
 │   │   ├── editor/
 │   │   ├── pipeline/
 │   │   ├── sidebar/
 │   │   ├── chat/
 │   │   ├── settings/
 │   │   ├── deai/
 │   │   ├── settings-collection/
 │   │   └── common/
 │   ├── composables/             # Vue composables
 │   ├── stores/                   # Pinia状态管理
 │   ├── services/                 # 业务逻辑层
 │   ├── styles/                   # 全局样式
 │   └── utils/                    # 工具函数
 ├── docs/                         # 参考书
 │   ├── UI设计规格参考书.md       # 前置条件2
 │   ├── 链路与功能参考书.md       # 前置条件3
 │   └── 教训门禁系统.md           # 前置条件4
 ├── scripts/                     # GATE检查脚本
 │   ├── gate_cdp_verify.js
 │   ├── gate_no_runtime_eval.js
 │   ├── gate_css_conflicts.js
 │   ├── gate_install_verify.js
 │   ├── gate_no_hardcoded.js
 │   ├── gate_no_limits.js
 │   ├── gate_memory_leak.js
 │   ├── gate_deai_order.js
 │   └── gate_regex_safe.js
 ├── lessons/                     # 经验文件（从C盘迁移）
 ├── memory/                      # 项目记忆（从C盘迁移）
 ├── package.json
 ├── vite.config.ts
 ├── electron-builder.yml
 └── tsconfig.json
 ```

 ---

 # 二、迁移阶段详细计划

 ## 阶段0：前置条件完成（4个GATE）

 见上方「零、四大前置条件」。

 GATE-0A/0B/0C/0D/0E全部PASS后才能进入阶段1。

 ---

 ## 阶段1：D盘工作区搭建 + Vue 3环境初始化

 ### 1.1 安装新依赖
 ```
 cd D:\codex\novel-workshop-vue3
 npm install vue@3 pinia vue-router@4
 npm install -D vite @vitejs/plugin-vue electron-vite vue-tsc typescript
 npm install vue-virtual-scroller vuedraggable@next
 ```

 ### 1.2 配置Vite + electron-vite
 - 创建vite.config.ts
 - 配置渲染进程HMR
 - 配置主进程自动重启
 - CDP调试端口9223保持不变

 ### 1.3 创建目录结构
 按目标目录结构创建空文件夹和占位文件

 ### 1.4 验收
 - [ ] npm run dev启动Electron + Vue 3空白页面
 - [ ] CDP端口9223正常
 - [ ] 旧版代码仍可正常运行（兼容期）
 - [ ] GATE-0A~0E全部PASS

 ---

 ## 阶段2：主进程IPC层重构

 ### 2.1 拆分IPC处理器
 把main.js的IPC逻辑拆到electron/ipc/目录（6个文件）

 ### 2.2 新增IPC通道
 - pipeline:generate/resume
 - deai:process/cancel
 - skill:execute/validate
 - provider:getModels/testConnection
 - agent:execute

 ### 2.3 preload.ts升级
 保留现有API（向后兼容），新增通道，封装为Promise风格

 ### 2.4 验收
 - [ ] 所有现有IPC功能正常
 - [ ] 新IPC通道可被调用
 - [ ] 旧版UI不受影响

 ---

 ## 阶段3：Pinia状态管理搭建

 8个store：project / provider / skill / agent / pipeline / deai / editor / chapter / settings

 每个store创建后写单元测试验证action正确修改state。

 **GATE-8检查**：禁止直接修改store state，必须用action。

 验收:
 - [ ] 8个store创建完成
 - [ ] store间依赖关系清晰
 - [ ] 单元测试通过

 ---

 ## 阶段4：服务层迁移

 16个service文件从js/迁移到src/services/，改为TypeScript。

 第一批（简单）：utils/storage/agent-manager/skill-manager/project-manager/chapter-manager
 第二批（中等）：provider-manager/skill-template-engine/skill-validators/deai-samples/zhuque-validator/diag/persona-engine
 第三批（复杂）：skill-engine拆分、de-ai.js拆分(114KB→5个文件)、pipeline-manager.js拆分(125KB→5个文件)

 规则：纯逻辑不依赖Vue，每个文件不超过500行，每迁移一个写单元测试。

 验收:
 - [ ] 16个service迁移完成
 - [ ] 单元测试通过
 - [ ] 不依赖Vue/DOM

 ---

 ## 阶段5：Vue组件开发（7波，每波对照参考书）

 **每波开发前**：打开UI设计规格参考书.md和链路与功能参考书.md对照
 **每波开发后**：运行GATE-1(CDP验证) + GATE-4(封装安装实测)

 第一波：设置页（ApiSettings/SkillSettings/AgentSettings/AppearanceSettings/DeAiSettings）
 第二波：侧边栏（ChapterTree虚拟滚动/ProjectList/QuickActions）
 第三波：编辑器（EditorToolbar/EditorPane/ChapterTabs/FindBar）
 第四波：对话面板（ChatPanel/ChatMessage修复三个按钮）
 第五波：设定合集（ScPanel/ScCard/ScEditor/ScBindModal修复模态框卡死）
 第六波：生成流水线（PipelineSteps/5个Step组件/卡片组件/续生成）
 第七波：去AI味（DeAiButton/DeAiProgress/DeAiModeCard/DeAiFlowPreview/DeAiSkillSelector）

 每波验收:
 - [ ] CDP行为验证PASS（GATE-1 + GATE-2）
 - [ ] 视觉与UI参考书一致（GATE-3）
 - [ ] 功能与链路参考书一致
 - [ ] 封装安装实测PASS（GATE-4）
 - [ ] 无console error

 ---

 ## 阶段6：CSS迁移与清理

 261KB style.css拆到组件scoped CSS。
 tokens.css直接搬，全局重置提取到reset.css。
 每个组件只写自己需要的样式。

 **GATE-3检查**：封装前重复选择器检测=0

 验收:
 - [ ] style.css不再存在
 - [ ] 重复选择器=0
 - [ ] 视觉与UI参考书一致

 ---

 ## 阶段7：主进程引擎层（MCP + Agent）

 ### 7.1 工具注册中心
 把所有功能注册为标准工具（generate_settings/volumes/chapters/body, deai_process, skill_chain, hardrule_process, zhuque_check等）

 ### 7.2 Agent调度引擎
 多步规划/并行执行/重试/状态追踪

 ### 7.3 MCP协议适配
 外部MCP服务器可注册，应用本身可作MCP服务器

 验收:
 - [ ] 所有功能注册为标准工具
 - [ ] Agent能执行多步任务
 - [ ] 外部MCP可加载

 ---

 ## 阶段8：旧代码清理与最终整合

 删除renderer.html/renderer_v2.js/panels.js/style.css/js/旧文件
 每删一个文件先确认功能已被Vue版替代，备份后删，删后验证。

 验收:
 - [ ] 旧文件全部删除
 - [ ] 全面审计117项PASS

 ---

 ## 阶段9：封装与发布

 **封装前17项检查清单全部PASS**

 1. GPU硬件加速启用
 2. package.json files包含新目录
 3. 无硬编码API Key（GATE-6）
 4. CSS花括号平衡=0
 5. 重复选择器=0（GATE-3）
 6. CDP行为验证PASS（GATE-1+GATE-2）
 7. 所有面板能打开/关闭
 8. 表格不撑爆容器
 9. Skill选择器正常
 10. 数据持久化正常（GATE-8）
 11. reasoning_content解析（GATE-13）
 12. Agent配置注入API请求体
 13. 封装后安装实测（GATE-4）
 14. style.css不存在
 15. Toast z-index>9999
 16. 正则安全（GATE-12）
 17. 无token限制（GATE-7）

 验收:
 - [ ] 封装成功
 - [ ] 安装后不闪退
 - [ ] 用户所有功能可用
 - [ ] 版本号v3.0.0

 ---

 # 三、验证策略

 每波完成后必须过以下GATE:

 | GATE | 检查内容 | 强制等级 |
 |------|----------|----------|
 | GATE-1 | CDP行为验证（Input.dispatchMouseEvent）| BLOCKER |
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
 | GATE-11 | 风格样本注入S1 | WARN |
 | GATE-13 | reasoning_content解析 | WARN |
 | GATE-14 | 规则审查（新增时审查旧规则）| WARN |

 BLOCKER级GATE未通过禁止进入下一波。WARN级GATE记录但可继续。

 ---

 # 四、迁移进度总览

 | 阶段 | 内容 | 波次 | 前置GATE |
 |------|------|------|----------|
 | 前置0 | GitHub备份+D盘工作区+UI参考书+链路参考书+教训门禁 | 1波 | - |
 | 阶段1 | Vue 3环境初始化 | 1波 | 0A-0E |
 | 阶段2 | IPC层重构 | 1波 | - |
 | 阶段3 | Pinia状态管理 | 1波 | - |
 | 阶段4 | 服务层迁移 | 3波 | - |
 | 阶段5 | Vue组件开发 | 7波 | 参考书 |
 | 阶段6 | CSS迁移清理 | 2波 | GATE-3 |
 | 阶段7 | 引擎层MCP+Agent | 2波 | - |
 | 阶段8 | 旧代码清理 | 1波 | 全面审计 |
 | 阶段9 | 封装发布 | 1波 | 17项检查 |
 | 总计 | | 约20波 |

 每波：开发→GATE检查→封装测试→用户确认→git commit+push→进入下一波

 ---

 # 五、注意事项

 1. C盘原项目只读保留，所有开发在D盘进行
 2. 新版必须能读取旧版IndexedDB数据
 3. 迁移是搬不是改，功能优化放到迁移后
 4. 每波封装一次安装实测
 5. UI参考书和链路参考书是核对标准，边做边对照
 6. 教训门禁系统是强制约束，BLOCKER级未通过禁止继续
 7. 4条旧规则标记DEPRECATED不再适用

 ---

 本计划基于全历史复盘_终极总结.md的教训 + 当前项目完整结构分析 + 用户4个调整要求编写。
