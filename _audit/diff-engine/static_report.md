# Static Detection Report

## Summary
- Total rules checked: 186
- MATCH: 95 (51.1%)
- MISMATCH: 1
- MISSING: 90
- SKIP: 0

## By Layer
| Layer | MATCH | MISMATCH | MISSING | SKIP |
|-------|-------|----------|---------|-----|
| T01 | 10 | 0 | 0 | 0 |
| T02 | 8 | 0 | 8 | 0 |
| T03 | 5 | 0 | 15 | 0 |
| T04 | 0 | 0 | 8 | 0 |
| T05 | 1 | 0 | 2 | 0 |
| T06 | 10 | 0 | 3 | 0 |
| T07 | 12 | 0 | 1 | 0 |
| T08 | 4 | 1 | 0 | 0 |
| T09 | 6 | 0 | 6 | 0 |
| T10 | 3 | 0 | 0 | 0 |
| T11 | 1 | 0 | 0 | 0 |
| T12 | 10 | 0 | 1 | 0 |
| T13 | 6 | 0 | 6 | 0 |
| T14 | 1 | 0 | 8 | 0 |
| T15 | 2 | 0 | 7 | 0 |
| T16 | 1 | 0 | 5 | 0 |
| T17 | 3 | 0 | 7 | 0 |
| T18 | 3 | 0 | 1 | 0 |
| T19 | 2 | 0 | 6 | 0 |
| T20 | 3 | 0 | 1 | 0 |
| T21 | 3 | 0 | 0 | 0 |
| T22 | 0 | 0 | 1 | 0 |
| T23 | 1 | 0 | 4 | 0 |

## MISMATCH Details
### R123 (T08)
- Rule: ### 2.2 存储键命名规范

源码位置: js/storage.js L5-7

所有存储键统一添加前缀wa_防止冲突：var PREFIX = "wa_"
- Detail: Expected: wa_, Found: name
- Evidence: src/services/storage.js (keyword: key)


## MISSING Details
### R014 (T02)
- Rule: retryDelays数组: 20个值硬编码，提取为配置项或常量
- Detail: None of 1 keywords found in 4 files
- Search terms: retryDelays
- Files checked: 4

### R016 (T02)
- Rule: 400自适应减半: 保留逻辑，但注意减半后仍可能触发400(需设下限1024)
- Detail: None of 1 keywords found in 4 files
- Search terms: 400自适应减半: 保留逻辑，但注意减半
- Files checked: 4

### R020 (T02)
- Rule: 消息按钮: Vue3改为组件化，3个按钮用lucide图标
- Detail: None of 2 keywords found in 4 files
- Search terms: Vue3, lucide
- Files checked: 4

### R021 (T02)
- Rule: fetchModels IPC: Vue3中preload.ts暴露fetchModels，主进程代理逻辑不变
- Detail: None of 3 keywords found in 5 files
- Search terms: fetchModels, Vue3, preload
- Files checked: 5

### R023 (T02)
- Rule: 首次空闲15秒触发断流
- Detail: None of 1 keywords found in 4 files
- Search terms: 首次空闲15秒触发断流
- Files checked: 4

### R025 (T02)
- Rule: 3次空闲后阈值降为10秒(更激进)
- Detail: None of 1 keywords found in 4 files
- Search terms: 3次空闲后阈值降为10秒(更激进)
- Files checked: 4

### R027 (T02)
- Rule: 生成唯一_diagKey = 'api-' + Date.now() + '-' + random
- Detail: None of 4 keywords found in 4 files
- Search terms: now, _diagKey, Date, random
- Files checked: 4

### R028 (T02)
- Rule: DiagLogger.perfStart(_diagKey)开始计时
- Detail: None of 3 keywords found in 4 files
- Search terms: perfStart, DiagLogger, _diagKey
- Files checked: 4

### R032 (T03)
- Rule: 5步流水线改Stepper组件
- Detail: None of 1 keywords found in 8 files
- Search terms: Stepper
- Files checked: 8

### R033 (T03)
- Rule: 卷纲3模式改策略模式
- Detail: None of 1 keywords found in 8 files
- Search terms: 卷纲3模式改策略模式
- Files checked: 8

### R037 (T03)
- Rule: 章节卡片改Vue组件
- Detail: None of 1 keywords found in 8 files
- Search terms: 章节卡片改Vue组件
- Files checked: 8

### R039 (T03)
- Rule: 切分算法保留为工具函数
- Detail: None of 1 keywords found in 8 files
- Search terms: 切分算法保留为工具函数
- Files checked: 8

### R040 (T03)
- Rule: 验证器保留为工具函数
- Detail: None of 1 keywords found in 8 files
- Search terms: 验证器保留为工具函数
- Files checked: 8

### R041 (T03)
- Rule: 进度UI改Vue组件
- Detail: None of 1 keywords found in 8 files
- Search terms: 进度UI改Vue组件
- Files checked: 8

### R042 (T03)
- Rule: 硬规则系统保留为独立模块
- Detail: None of 1 keywords found in 8 files
- Search terms: 硬规则系统保留为独立模块
- Files checked: 8

### R044 (T03)
- Rule: 消息列表改v-for组件
- Detail: None of 1 keywords found in 8 files
- Search terms: 消息列表改v-for组件
- Files checked: 8

### R049 (T03)
- Rule: execCommand改编辑器API
- Detail: None of 1 keywords found in 8 files
- Search terms: execCommand
- Files checked: 8

### R050 (T03)
- Rule: 工具栏改Vue组件
- Detail: None of 1 keywords found in 8 files
- Search terms: 工具栏改Vue组件
- Files checked: 8

### R052 (T03)
- Rule: Diff改Vue组件
- Detail: None of 1 keywords found in 8 files
- Search terms: Diff
- Files checked: 8

### R057 (T03)
- Rule: 6个tab改Vue Router式tab组件
- Detail: None of 1 keywords found in 8 files
- Search terms: Router
- Files checked: 8

### R058 (T03)
- Rule: 供应商卡片改Vue组件
- Detail: None of 1 keywords found in 8 files
- Search terms: 供应商卡片改Vue组件
- Files checked: 8

### R059 (T03)
- Rule: 技能编辑器改Vue组件
- Detail: None of 1 keywords found in 8 files
- Search terms: 技能编辑器改Vue组件
- Files checked: 8

### R060 (T03)
- Rule: 去AI味3卡片改Vue组件
- Detail: None of 1 keywords found in 8 files
- Search terms: 去AI味3卡片改Vue组件
- Files checked: 8

### R061 (T04)
- Rule: openOutlineWorkspace()
- Detail: None of 1 keywords found in 6 files
- Search terms: openOutlineWorkspace
- Files checked: 6

### R062 (T04)
- Rule: toggleVolume(id) — 展开/折叠卷
- Detail: None of 1 keywords found in 6 files
- Search terms: toggleVolume
- Files checked: 6

### R063 (T04)
- Rule: openVolumeOutline(id) — 在编辑器显示卷纲要
- Detail: None of 1 keywords found in 6 files
- Search terms: openVolumeOutline
- Files checked: 6

### R064 (T04)
- Rule: openChapterPlot(vid, cid) — 在编辑器显示章节梗概
- Detail: None of 1 keywords found in 6 files
- Search terms: openChapterPlot
- Files checked: 6

### R065 (T04)
- Rule: openChapter(vid, cid) — 在编辑器打开章节正文
- Detail: None of 1 keywords found in 6 files
- Search terms: openChapter
- Files checked: 6

### R066 (T04)
- Rule: deleteChapterFromTree(vid, cid) — 删除章节（stopPropagation）
- Detail: None of 2 keywords found in 6 files
- Search terms: deleteChapterFromTree, stopPropagation
- Files checked: 6

### R067 (T04)
- Rule: addChapter(vid) — 添加章节
- Detail: None of 1 keywords found in 6 files
- Search terms: addChapter
- Files checked: 6

### R070 (T04)
- Rule: showVolumeForm() — 显示添加卷表单
- Detail: None of 1 keywords found in 6 files
- Search terms: showVolumeForm
- Files checked: 6

### R074 (T05)
- Rule: 暗色主题是默认值，不需要额外属性
- Detail: None of 1 keywords found in 7 files
- Search terms: 暗色主题是默认值，不需要额外属性
- Files checked: 7

### R075 (T05)
- Rule: 字体大小通过 CSS 变量动态设置，不依赖主题
- Detail: None of 1 keywords found in 7 files
- Search terms: 字体大小通过 CSS 变量动态设置，不依
- Files checked: 7

### R085 (T06)
- Rule: Vue组件 + getSelection API
- Detail: None of 1 keywords found in 5 files
- Search terms: getSelection
- Files checked: 5

### R086 (T06)
- Rule: Vue组件 + Teleport
- Detail: None of 1 keywords found in 5 files
- Search terms: Teleport
- Files checked: 5

### R090 (T06)
- Rule: hotkeys-js可在Vue中继续使用，或迁移到Vue自定义指令
- Detail: None of 1 keywords found in 6 files
- Search terms: hotkeys
- Files checked: 6

### R107 (T07)
- Rule: Vue组件 + IPC
- Detail: None of 1 keywords found in 4 files
- Search terms: Vue组件 + IPC
- Files checked: 4

### R130 (T09)
- Rule: 重试策略：8次递增重试+不重试客户端错误
- Detail: None of 1 keywords found in 3 files
- Search terms: 重试策略：8次递增重试+不重试客户端错误
- Files checked: 3

### R132 (T09)
- Rule: 流式空闲检测：15秒超时+3次降为10秒
- Detail: None of 1 keywords found in 3 files
- Search terms: 流式空闲检测：15秒超时+3次降为10秒
- Files checked: 3

### R133 (T09)
- Rule: 心跳重连：60秒间隔无限重试
- Detail: None of 1 keywords found in 3 files
- Search terms: 心跳重连：60秒间隔无限重试
- Files checked: 3

### R135 (T09)
- Rule: 模型列表获取：主进程代理绕过CORS
- Detail: None of 1 keywords found in 3 files
- Search terms: CORS
- Files checked: 3

### R137 (T09)
- Rule: 重试参数可配置化（不硬编码8次和delay数组）
- Detail: None of 1 keywords found in 3 files
- Search terms: delay
- Files checked: 3

### R138 (T09)
- Rule: 心跳重连可配置间隔和最大尝试次数
- Detail: None of 1 keywords found in 3 files
- Search terms: 心跳重连可配置间隔和最大尝试次数
- Files checked: 3

### R159 (T12)
- Rule: 去AI味温度策略必须保持。
- Detail: None of 1 keywords found in 6 files
- Search terms: 去AI味温度策略必须保持。
- Files checked: 6

### R162 (T13)
- Rule: 所有18个IPC通道名称不变
- Detail: None of 1 keywords found in 4 files
- Search terms: 所有18个IPC通道名称不变
- Files checked: 4

### R165 (T13)
- Rule: api:fetchModels异步IPC不变。
- Detail: None of 2 keywords found in 4 files
- Search terms: fetchModels, api:fetchModels
- Files checked: 4

### R166 (T13)
- Rule: 可改进：存储IPC从sendSync改为invoke减少阻塞
- Detail: None of 2 keywords found in 4 files
- Search terms: sendSync, invoke
- Files checked: 4

### R167 (T13)
- Rule: 增加IPC消息验证防止参数注入
- Detail: None of 1 keywords found in 4 files
- Search terms: 增加IPC消息验证防止参数注入
- Files checked: 4

### R170 (T13)
- Rule: IPC通道名称必须保持
- Detail: None of 1 keywords found in 4 files
- Search terms: IPC通道名称必须保持
- Files checked: 4

### R171 (T13)
- Rule: 返回值类型必须保持
- Detail: None of 1 keywords found in 2 files
- Search terms: 返回值类型必须保持
- Files checked: 2

### R175 (T14)
- Rule: 6个设置tab
- Detail: None of 1 keywords found in 4 files
- Search terms: 6个设置tab
- Files checked: 4

### R176 (T14)
- Rule: 5个流水线阶段
- Detail: None of 1 keywords found in 4 files
- Search terms: 5个流水线阶段
- Files checked: 4

### R177 (T14)
- Rule: 3种去AI味模式
- Detail: None of 1 keywords found in 4 files
- Search terms: 3种去AI味模式
- Files checked: 4

### R179 (T14)
- Rule: 进度条取消功能
- Detail: None of 1 keywords found in 4 files
- Search terms: 进度条取消功能
- Files checked: 4

### R186 (T14)
- Rule: 设置6个tab必须保持
- Detail: None of 1 keywords found in 4 files
- Search terms: 设置6个tab必须保持
- Files checked: 4

### R187 (T14)
- Rule: 流水线5阶段必须保持
- Detail: None of 1 keywords found in 4 files
- Search terms: 流水线5阶段必须保持
- Files checked: 4

### R188 (T14)
- Rule: 去AI味3模式必须保持
- Detail: None of 1 keywords found in 4 files
- Search terms: 去AI味3模式必须保持
- Files checked: 4

### R189 (T14)
- Rule: 断网续接必须保持。
- Detail: None of 1 keywords found in 4 files
- Search terms: 断网续接必须保持。
- Files checked: 4

### R190 (T15)
- Rule: 必须保留：UTF-8无BOM编码
- Detail: None of 1 keywords found in 4 files
- Search terms: 必须保留：UTF-8无BOM编码
- Files checked: 4

### R191 (T15)
- Rule: JSONL日志格式
- Detail: None of 1 keywords found in 4 files
- Search terms: JSONL
- Files checked: 4

### R192 (T15)
- Rule: safeKey字符替换
- Detail: None of 1 keywords found in 4 files
- Search terms: safeKey
- Files checked: 4

### R194 (T15)
- Rule: 可改进：API请求URL拼接做斜杠处理
- Detail: None of 1 keywords found in 3 files
- Search terms: 可改进：API请求URL拼接做斜杠处理
- Files checked: 3

### R197 (T15)
- Rule: 差异检测规则：文件编码UTF-8无BOM必须保持
- Detail: None of 1 keywords found in 4 files
- Search terms: 差异检测规则：文件编码UTF-8无BOM
- Files checked: 4

### R198 (T15)
- Rule: JSONL格式必须保持
- Detail: None of 1 keywords found in 4 files
- Search terms: JSONL
- Files checked: 4

### R199 (T15)
- Rule: safeKey正则必须保持。
- Detail: None of 1 keywords found in 4 files
- Search terms: safeKey
- Files checked: 4

### R200 (T16)
- Rule: safeStorage加密
- Detail: None of 1 keywords found in 5 files
- Search terms: safeStorage
- Files checked: 5

### R201 (T16)
- Rule: safeKey路径遍历防护
- Detail: None of 1 keywords found in 5 files
- Search terms: safeKey
- Files checked: 5

### R202 (T16)
- Rule: 必须修复：marked输出做XSS sanitize（用DOMPurify）
- Detail: None of 3 keywords found in 5 files
- Search terms: marked, sanitize, DOMPurify
- Files checked: 5

### R203 (T16)
- Rule: IPC参数验证
- Detail: None of 1 keywords found in 5 files
- Search terms: IPC参数验证
- Files checked: 5

### R204 (T16)
- Rule: 编辑器内容sanitize
- Detail: None of 1 keywords found in 5 files
- Search terms: sanitize
- Files checked: 5

### R210 (T17)
- Rule: 新增字段默认值兼容。
- Detail: None of 1 keywords found in 4 files
- Search terms: 新增字段默认值兼容。
- Files checked: 4

### R211 (T17)
- Rule: 必须新增：数据版本字段（version: 1）
- Detail: None of 1 keywords found in 4 files
- Search terms: version
- Files checked: 4

### R212 (T17)
- Rule: 版本迁移函数（v1->v2转换）
- Detail: None of 1 keywords found in 4 files
- Search terms: 版本迁移函数（v1->v2转换）
- Files checked: 4

### R213 (T17)
- Rule: 迁移日志记录。
- Detail: None of 1 keywords found in 4 files
- Search terms: 迁移日志记录。
- Files checked: 4

### R214 (T17)
- Rule: 迁移逻辑必须保持
- Detail: None of 1 keywords found in 4 files
- Search terms: 迁移逻辑必须保持
- Files checked: 4

### R215 (T17)
- Rule: 项目孤儿恢复必须保持
- Detail: None of 1 keywords found in 4 files
- Search terms: 项目孤儿恢复必须保持
- Files checked: 4

### R216 (T17)
- Rule: 默认值回退必须保持。
- Detail: None of 1 keywords found in 4 files
- Search terms: 默认值回退必须保持。
- Files checked: 4

### R224 (T18)
- Rule: 章节树键盘导航
- Detail: None of 1 keywords found in 3 files
- Search terms: 章节树键盘导航
- Files checked: 3

### R232 (T19)
- Rule: NSIS安装器
- Detail: None of 1 keywords found in 4 files
- Search terms: NSIS
- Files checked: 4

### R233 (T19)
- Rule: 安装包命名格式
- Detail: None of 1 keywords found in 3 files
- Search terms: 安装包命名格式
- Files checked: 3

### R234 (T19)
- Rule: 打包前语法检查和测试。
- Detail: None of 1 keywords found in 3 files
- Search terms: 打包前语法检查和测试。
- Files checked: 3

### R235 (T19)
- Rule: 必须改进：打包前自动化测试集成CI
- Detail: None of 1 keywords found in 3 files
- Search terms: 必须改进：打包前自动化测试集成CI
- Files checked: 3

### R236 (T19)
- Rule: 版本号自动递增
- Detail: None of 1 keywords found in 3 files
- Search terms: 版本号自动递增
- Files checked: 3

### R237 (T19)
- Rule: 安装包数字签名
- Detail: None of 1 keywords found in 3 files
- Search terms: 安装包数字签名
- Files checked: 3

### R243 (T20)
- Rule: parallelMap可替换为p-limit等库
- Detail: None of 2 keywords found in 4 files
- Search terms: parallelMap, limit
- Files checked: 4

### R252 (T22)
- Rule: AI调用数据流封装到apiService composable
- Detail: None of 2 keywords found in 5 files
- Search terms: apiService, composable
- Files checked: 5

### R254 (T23)
- Rule: AI API服务封装为apiService模块
- Detail: None of 1 keywords found in 3 files
- Search terms: apiService
- Files checked: 3

### R255 (T23)
- Rule: GitHub API封装为githubService
- Detail: None of 2 keywords found in 3 files
- Search terms: GitHub, githubService
- Files checked: 3

### R256 (T23)
- Rule: 朱雀检测封装为可选验证器模块
- Detail: None of 1 keywords found in 3 files
- Search terms: 朱雀检测封装为可选验证器模块
- Files checked: 3

### R258 (T23)
- Rule: 考虑添加更多AI供应商适配器
- Detail: None of 1 keywords found in 3 files
- Search terms: 考虑添加更多AI供应商适配器
- Files checked: 3

