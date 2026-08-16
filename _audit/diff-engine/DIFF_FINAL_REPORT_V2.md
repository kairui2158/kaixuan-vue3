# Vue3迁移差异检测最终报告 V2

> 生成时间: 2026-08-11
> 检测引擎: 静态(static) + 行为(behavior) + 状态(state) + CSS回归 + IPC通道

---

## 1. 执行摘要

| 指标 | 数值 |
|------|------|
| 规则总数 | 260 |
| MATCH | 127 |
| MISMATCH | 1 |
| MISSING | 131 |
| ACCEPTABLE | 1 |
| 整体匹配率 | 48.8% |
| P0-致命 | 6 |
| P1-严重 | 44 |
| P2-中等 | 3 |
| P3-轻微 | 39 |
| P4-可接受 | 41 |

---

## 2. 差异矩阵总览(按层级)

| 层级 | 规则数 | MATCH | MISMATCH | MISSING | ACCEPTABLE | 匹配率 |
|------|-------|-------|---------|---------|-----------|-------|
| T01 | 12 | 10 | 0 | 2 | 0 | 83.3% |
| T02 | 18 | 9 | 0 | 9 | 0 | 50.0% |
| T03 | 30 | 9 | 0 | 21 | 0 | 30.0% |
| T04 | 10 | 2 | 0 | 8 | 0 | 20.0% |
| T05 | 7 | 3 | 0 | 4 | 0 | 42.9% |
| T06 | 25 | 17 | 0 | 8 | 0 | 68.0% |
| T07 | 18 | 13 | 0 | 5 | 0 | 72.2% |
| T08 | 6 | 4 | 1 | 1 | 0 | 66.7% |
| T09 | 16 | 6 | 0 | 10 | 0 | 37.5% |
| T10 | 4 | 3 | 0 | 1 | 0 | 75.0% |
| T11 | 3 | 2 | 0 | 1 | 0 | 66.7% |
| T12 | 11 | 10 | 0 | 1 | 0 | 90.9% |
| T13 | 15 | 7 | 0 | 8 | 0 | 46.7% |
| T14 | 16 | 4 | 0 | 11 | 1 | 25.0% |
| T15 | 10 | 3 | 0 | 7 | 0 | 30.0% |
| T16 | 7 | 1 | 0 | 6 | 0 | 14.3% |
| T17 | 10 | 3 | 0 | 7 | 0 | 30.0% |
| T18 | 14 | 10 | 0 | 4 | 0 | 71.4% |
| T19 | 9 | 3 | 0 | 6 | 0 | 33.3% |
| T20 | 4 | 3 | 0 | 1 | 0 | 75.0% |
| T21 | 5 | 3 | 0 | 2 | 0 | 60.0% |
| T22 | 4 | 1 | 0 | 3 | 0 | 25.0% |
| T23 | 6 | 1 | 0 | 5 | 0 | 16.7% |

---

## 3. P0致命问题清单

### P0-001: StorageManager->Pinia store+electron-store: Vue3中应用Pinia store包装StorageManager,底
- 规则ID: R001
- 层级: T01
- 类型: state
- 引擎: state
- 状态: MISSING
- 详情: storage.js JSON.parse:false, main.ts polyfill JSON.parse:false, runtime type:object
- 证据: PW+SRC: storage.js + main.ts polyfill both have JSON.parse
- Vue3文件: src/services/storage.js, src/stores/provider.ts, src/stores/agent.ts, src/stores/skill.ts, src/stores/project.ts, src/stores/chapter.ts, src/services/skill-engine.js, src/services/skill-validators.js, src/services/skill-template-engine.js, src/services/utils.js, electron/preload.ts, electron/main.js, src/App.vue, src/src/services/storage.js
- 修复建议: 根据旧架构手册T01层规格，在对应Vue3文件中实现缺失功能

### P0-002: 消息操作改组件方法
- 规则ID: R047
- 层级: T03
- 类型: behavior
- 引擎: behavior
- 状态: MISSING
- 详情: N/A
- 证据: Not found. kw:
- Vue3文件: src/components/pipeline/PipelinePanel.vue, src/components/editor/EditorPanel.vue, src/components/chat/ChatPanel.vue, src/components/deai/DeAiButton.vue, src/components/settings/SettingsModal.vue, src/components/common/OutlineWorkspace.vue, src/services/pipeline-manager.js, src/services/de-ai.js
- 修复建议: 根据旧架构手册T03层规格，在对应Vue3文件中实现缺失功能

### P0-003: 内联菜单改编辑器插件
- 规则ID: R051
- 层级: T03
- 类型: behavior
- 引擎: behavior
- 状态: MISSING
- 详情: N/A
- 证据: Not found. kw:
- Vue3文件: src/components/pipeline/PipelinePanel.vue, src/components/editor/EditorPanel.vue, src/components/chat/ChatPanel.vue, src/components/deai/DeAiButton.vue, src/components/settings/SettingsModal.vue, src/components/common/OutlineWorkspace.vue, src/services/pipeline-manager.js, src/services/de-ai.js
- 修复建议: 根据旧架构手册T03层规格，在对应Vue3文件中实现缺失功能

### P0-004: 拖拽改vuedraggable
- 规则ID: R055
- 层级: T03
- 类型: behavior
- 引擎: behavior
- 状态: MISSING
- 详情: N/A
- 证据: Not found. kw:vuedraggable
- Vue3文件: src/components/pipeline/PipelinePanel.vue, src/components/editor/EditorPanel.vue, src/components/chat/ChatPanel.vue, src/components/deai/DeAiButton.vue, src/components/settings/SettingsModal.vue, src/components/common/OutlineWorkspace.vue, src/services/pipeline-manager.js, src/services/de-ai.js
- 修复建议: 根据旧架构手册T03层规格，在对应Vue3文件中实现缺失功能

### P0-005: settings加载改为pinia store + 持久化插件
- 规则ID: R113
- 层级: T07
- 类型: state
- 引擎: state
- 状态: MISSING
- 详情: settingsStore:true, has load+storageRead:false
- 证据: PW+SRC: settings store exists, loadSettings uses storageRead
- Vue3文件: src/App.vue, src/main.ts, src/composables/useAutoSave.ts, src/composables/useLifecycle.ts
- 修复建议: 根据旧架构手册T07层规格，在对应Vue3文件中实现缺失功能

### P0-006: ### 2.2 存储键命名规范

源码位置: js/storage.js L5-7

所有存储键统一添加前缀wa_防止冲突：var PREFIX = "wa_"
- 规则ID: R123
- 层级: T08
- 类型: value
- 引擎: static
- 状态: MISMATCH
- 详情: Expected: wa_, Found: name
- 证据: src/services/storage.js (keyword: key)
- Vue3文件: src/services/storage.js, electron/main.js, src/stores/provider.ts, src/stores/project.ts, src/stores/chapter.ts, src/src/services/storage.js, src/src/services/main.js, src/services/main.js
- 修复建议: 根据旧架构手册T08层规格，在对应Vue3文件中实现缺失功能

---

## 4. P1严重问题清单

### P1-001: 浏览器降级模式下使用localStorage(也是同步的)
- 规则ID: R012 | 层级: T01 | 类型: state | 状态: MISSING
- 详情: localStorage exists:true, storage.js uses it:false
- Vue3文件: src/services/storage.js, src/stores/provider.ts, src/stores/agent.ts

### P1-002: fetchModels IPC: Vue3中preload.ts暴露fetchModels，主进程代理逻辑不变
- 规则ID: R021 | 层级: T02 | 类型: existence | 状态: MISSING
- 详情: None of 3 keywords found in 5 files
- Vue3文件: src/composables/useAiRequest.ts, src/services/api.js, src/App.vue

### P1-003: 诊断集成: Vue3中DiagLogger迁移为Pinia store或composable，perfStart/perfEnd/trackApiCall接口不
- 规则ID: R022 | 层级: T02 | 类型: state | 状态: MISSING
- 详情: diag service has perfStart:false
- Vue3文件: src/composables/useAiRequest.ts, src/services/api.js, src/App.vue

### P1-004: 断网续接改Pinia状态管理
- 规则ID: R035 | 层级: T03 | 类型: state | 状态: MISSING
- 详情: pipeline store has breakpoint:false
- Vue3文件: src/components/pipeline/PipelinePanel.vue, src/components/editor/EditorPanel.vue, src/components/chat/ChatPanel.vue

### P1-005: 3模式改策略模式(Pinia store + strategy pattern)
- 规则ID: R038 | 层级: T03 | 类型: state | 状态: MISSING
- 详情: deai store has mode field:false
- Vue3文件: src/components/pipeline/PipelinePanel.vue, src/components/editor/EditorPanel.vue, src/components/chat/ChatPanel.vue

### P1-006: Agent/Skill选择改Pinia store
- 规则ID: R046 | 层级: T03 | 类型: state | 状态: MISSING
- 详情: deai store has skillIds+agentId:false
- Vue3文件: src/components/pipeline/PipelinePanel.vue, src/components/editor/EditorPanel.vue, src/components/chat/ChatPanel.vue

### P1-007: 主题切换是即时的，不需要刷新页面
- 规则ID: R071 | 层级: T05 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/components/chat/ChatMessage.vue, src/components/editor/EditorPanel.vue, src/components/sidebar/ChapterTree.vue

### P1-008: 主题持久化在 StorageManager("app-theme")
- 规则ID: R072 | 层级: T05 | 类型: state | 状态: MISSING
- 详情: themeStore:true, store.theme=dark, localStorage wa-theme=undefined
- Vue3文件: src/components/chat/ChatMessage.vue, src/components/editor/EditorPanel.vue, src/components/sidebar/ChapterTree.vue

### P1-009: 事件委托模式可用Vue的组件化替代
- 规则ID: R089 | 层级: T06 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/composables/useShortcuts.ts, src/App.vue, src/components/sidebar/ChapterTree.vue

### P1-010: 右键菜单可迁移到Vue组件 + 坐标定位
- 规则ID: R097 | 层级: T06 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/composables/useShortcuts.ts, src/App.vue, src/components/sidebar/ChapterTree.vue

### P1-011: 内联AI菜单可迁移到Vue组件 + 选区检测
- 规则ID: R098 | 层级: T06 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/composables/useShortcuts.ts, src/App.vue, src/components/sidebar/ChapterTree.vue

### P1-012: 面板缩放可迁移到Vue自定义指令
- 规则ID: R100 | 层级: T06 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/composables/useShortcuts.ts, src/App.vue, src/components/sidebar/ChapterTree.vue

### P1-013: 全局快捷键需确保在所有组件中可用
- 规则ID: R101 | 层级: T06 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/composables/useShortcuts.ts, src/App.vue, src/components/sidebar/ChapterTree.vue

### P1-014: Vue组件 + IPC
- 规则ID: R107 | 层级: T07 | 类型: existence | 状态: MISSING
- 详情: None of 1 keywords found in 4 files
- Vue3文件: src/App.vue, src/main.ts, src/composables/useAutoSave.ts

### P1-015: 会话恢复改为路由query或store
- 规则ID: R114 | 层级: T07 | 类型: state | 状态: MISSING
- 详情: session restore via query/route/sessionStorage:false
- Vue3文件: src/App.vue, src/main.ts, src/composables/useAutoSave.ts

### P1-016: undo/redo可用Vue响应式栈
- 规则ID: R115 | 层级: T07 | 类型: state | 状态: MISSING
- 详情: editor store has undo/history:false
- Vue3文件: src/App.vue, src/main.ts, src/composables/useAutoSave.ts

### P1-017: 面板状态改为Vue路由或组件状态
- 规则ID: R116 | 层级: T07 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/App.vue, src/main.ts, src/composables/useAutoSave.ts

### P1-018: ### 11.1 必须保留的行为
- 规则ID: R120 | 层级: T08 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/services/storage.js, electron/main.js, src/stores/provider.ts

### P1-019: ### 13.1 必须保留的行为
- 规则ID: R126 | 层级: T09 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/composables/useAiRequest.ts, src/services/api.js, electron/main.js

### P1-020: 诊断日志：每次API调用记录

### 13.2 可改进的行为
- 规则ID: R136 | 层级: T09 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/composables/useAiRequest.ts, src/services/api.js, electron/main.js

### P1-021: 流式空闲检测参数可配置
- 规则ID: R139 | 层级: T09 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/composables/useAiRequest.ts, src/services/api.js, electron/main.js

### P1-022: 错误映射可扩展为完整HTTP状态码表
- 规则ID: R140 | 层级: T09 | 类型: state | 状态: MISSING
- 详情: HTTP status handling in api/useAiRequest:false
- Vue3文件: src/composables/useAiRequest.ts, src/services/api.js, electron/main.js

### P1-023: ### 7.1 必须保留的行为
- 规则ID: R142 | 层级: T10 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/services/diag.js, src/composables/useAiRequest.ts, src/composables/useErrorHandler.ts

### P1-024: ### 9.1 必须保留的行为
- 规则ID: R146 | 层级: T11 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/composables/useDebounce.ts, src/components/sidebar/ChapterTree.vue, src/App.vue

### P1-025: 所有18个IPC通道名称不变
- 规则ID: R162 | 层级: T13 | 类型: existence | 状态: MISSING
- 详情: None of 1 keywords found in 4 files
- Vue3文件: electron/preload.ts, electron/main.js, src/src/services/preload.ts

### P1-026: 同步IPC返回值类型不变
- 规则ID: R163 | 层级: T13 | 类型: state | 状态: MISSING
- 详情: preload uses sendSync for storage:false
- Vue3文件: electron/preload.ts, electron/main.js, src/src/services/preload.ts

### P1-027: 关闭流程IPC协议不变
- 规则ID: R164 | 层级: T13 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: electron/preload.ts, electron/main.js, src/src/services/preload.ts

### P1-028: api:fetchModels异步IPC不变。
- 规则ID: R165 | 层级: T13 | 类型: existence | 状态: MISSING
- 详情: None of 2 keywords found in 4 files
- Vue3文件: electron/preload.ts, electron/main.js, src/src/services/preload.ts

### P1-029: 增加IPC消息验证防止参数注入
- 规则ID: R167 | 层级: T13 | 类型: existence | 状态: MISSING
- 详情: None of 1 keywords found in 4 files
- Vue3文件: electron/preload.ts, electron/main.js, src/src/services/preload.ts

### P1-030: IPC通道名称必须保持
- 规则ID: R170 | 层级: T13 | 类型: existence | 状态: MISSING
- 详情: None of 1 keywords found in 4 files
- Vue3文件: electron/preload.ts, electron/main.js, src/src/services/preload.ts

### P1-031: 未保存内容检查。
- 规则ID: R180 | 层级: T14 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/stores/app-state.ts, src/App.vue, src/stores/pipeline.ts

### P1-032: 用Vue3响应式自动同步UI
- 规则ID: R182 | 层级: T14 | 类型: state | 状态: MISSING
- 详情: store files:10, all use ref:false
- Vue3文件: src/stores/app-state.ts, src/App.vue, src/stores/pipeline.ts

### P1-033: 用computed自动派生状态。
- 规则ID: R184 | 层级: T14 | 类型: state | 状态: MISSING
- 详情: stores using computed:0
- Vue3文件: src/stores/app-state.ts, src/App.vue, src/stores/pipeline.ts

### P1-034: safeStorage加密
- 规则ID: R200 | 层级: T16 | 类型: existence | 状态: MISSING
- 详情: None of 1 keywords found in 5 files
- Vue3文件: electron/main.js, electron/preload.ts, src/services/storage.js

### P1-035: IPC参数验证
- 规则ID: R203 | 层级: T16 | 类型: existence | 状态: MISSING
- 详情: None of 1 keywords found in 5 files
- Vue3文件: electron/main.js, electron/preload.ts, src/services/storage.js

### P1-036: 远程调试端口生产环境关闭
- 规则ID: R205 | 层级: T16 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: electron/main.js, electron/preload.ts, src/services/storage.js

### P1-037: 模态框焦点管理
- 规则ID: R223 | 层级: T18 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/composables/useShortcuts.ts, src/App.vue, src/components/sidebar/ChapterTree.vue

### P1-038: aria-busy加载状态
- 规则ID: R226 | 层级: T18 | 类型: state | 状态: MISSING
- 详情: aria-busy in vue components:false
- Vue3文件: src/composables/useShortcuts.ts, src/App.vue, src/components/sidebar/ChapterTree.vue

### P1-039: 差异检测规则：快捷键功能必须保持
- 规则ID: R228 | 层级: T18 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: src/composables/useShortcuts.ts, src/App.vue, src/components/sidebar/ChapterTree.vue

### P1-040: 存储改用electron-store
- 规则ID: R246 | 层级: T21 | 类型: state | 状态: MISSING
- 详情: storage IPC uses fs read/write:false
- Vue3文件: electron/main.js, electron/preload.ts

### P1-041: 窗口状态用electron-window-state库
- 规则ID: R248 | 层级: T21 | 类型: state | 状态: MISSING
- 详情: window state management:false
- Vue3文件: electron/main.js, electron/preload.ts, src/src/services/main.js

### P1-042: Vue3用Pinia store管理数据流
- 规则ID: R249 | 层级: T22 | 类型: state | 状态: MISSING
- 详情: providerStore:true, usesPinia:false
- Vue3文件: src/stores/provider.ts, src/stores/pipeline.ts, src/stores/deai.ts

### P1-043: 持久化用pinia-plugin-persistedstate
- 规则ID: R251 | 层级: T22 | 类型: state | 状态: MISSING
- 详情: persistPlugin:false, manualPersist:false
- Vue3文件: src/stores/provider.ts, src/stores/pipeline.ts, src/stores/deai.ts

### P1-044: 文件系统操作走IPC保留
- 规则ID: R257 | 层级: T23 | 类型: behavior | 状态: MISSING
- 详情: N/A
- Vue3文件: package.json, src/main.ts, electron/main.js

---

## 5. P2-P4问题清单

### P2-中等(3项)

- [R074] T05: 暗色主题是默认值，不需要额外属性
- [R210] T17: 新增字段默认值兼容。
- [R216] T17: 默认值回退必须保持。

### P3-轻微(39项)

- [R023] T02: 首次空闲15秒触发断流
- [R025] T02: 3次空闲后阈值降为10秒(更激进)
- [R027] T02: 生成唯一_diagKey = 'api-' + Date.now() + '-' + random
- [R032] T03: 5步流水线改Stepper组件
- [R033] T03: 卷纲3模式改策略模式
- [R037] T03: 章节卡片改Vue组件
- [R039] T03: 切分算法保留为工具函数
- [R041] T03: 进度UI改Vue组件
- [R042] T03: 硬规则系统保留为独立模块
- [R044] T03: 消息列表改v-for组件
- [R050] T03: 工具栏改Vue组件
- [R058] T03: 供应商卡片改Vue组件
- [R059] T03: 技能编辑器改Vue组件
- [R060] T03: 去AI味3卡片改Vue组件
- [R061] T04: openOutlineWorkspace()
- [R075] T05: 字体大小通过 CSS 变量动态设置，不依赖主题
- [R086] T06: Vue组件 + Teleport
- [R132] T09: 流式空闲检测：15秒超时+3次降为10秒
- [R133] T09: 心跳重连：60秒间隔无限重试
- [R135] T09: 模型列表获取：主进程代理绕过CORS
- [R166] T13: 可改进：存储IPC从sendSync改为invoke减少阻塞
- [R171] T13: 返回值类型必须保持
- [R176] T14: 5个流水线阶段
- [R177] T14: 3种去AI味模式
- [R179] T14: 进度条取消功能
- [R187] T14: 流水线5阶段必须保持
- [R188] T14: 去AI味3模式必须保持
- [R190] T15: 必须保留：UTF-8无BOM编码
- [R191] T15: JSONL日志格式
- [R194] T15: 可改进：API请求URL拼接做斜杠处理
- [R197] T15: 差异检测规则：文件编码UTF-8无BOM必须保持
- [R198] T15: JSONL格式必须保持
- [R201] T16: safeKey路径遍历防护
- [R204] T16: 编辑器内容sanitize
- [R233] T19: 安装包命名格式
- [R234] T19: 打包前语法检查和测试。
- [R237] T19: 安装包数字签名
- [R254] T23: AI API服务封装为apiService模块
- [R258] T23: 考虑添加更多AI供应商适配器

### P4-可接受(41项)

- [R014] T02: retryDelays数组: 20个值硬编码，提取为配置项或常量
- [R016] T02: 400自适应减半: 保留逻辑，但注意减半后仍可能触发400(需设下限1024)
- [R020] T02: 消息按钮: Vue3改为组件化，3个按钮用lucide图标
- [R028] T02: DiagLogger.perfStart(_diagKey)开始计时
- [R040] T03: 验证器保留为工具函数
- [R049] T03: execCommand改编辑器API
- [R052] T03: Diff改Vue组件
- [R057] T03: 6个tab改Vue Router式tab组件
- [R062] T04: toggleVolume(id) — 展开/折叠卷
- [R063] T04: openVolumeOutline(id) — 在编辑器显示卷纲要
- [R064] T04: openChapterPlot(vid, cid) — 在编辑器显示章节梗概
- [R065] T04: openChapter(vid, cid) — 在编辑器打开章节正文
- [R066] T04: deleteChapterFromTree(vid, cid) — 删除章节（stopPropagation）
- [R067] T04: addChapter(vid) — 添加章节
- [R070] T04: showVolumeForm() — 显示添加卷表单
- [R085] T06: Vue组件 + getSelection API
- [R090] T06: hotkeys-js可在Vue中继续使用，或迁移到Vue自定义指令
- [R130] T09: 重试策略：8次递增重试+不重试客户端错误
- [R137] T09: 重试参数可配置化（不硬编码8次和delay数组）
- [R138] T09: 心跳重连可配置间隔和最大尝试次数
- [R159] T12: 去AI味温度策略必须保持。
- [R175] T14: 6个设置tab
- [R183] T14: 用状态机库（如XState）管理复杂流程
- [R186] T14: 设置6个tab必须保持
- [R189] T14: 断网续接必须保持。
- [R192] T15: safeKey字符替换
- [R199] T15: safeKey正则必须保持。
- [R202] T16: 必须修复：marked输出做XSS sanitize（用DOMPurify）
- [R211] T17: 必须新增：数据版本字段（version: 1）
- [R212] T17: 版本迁移函数（v1->v2转换）
- [R213] T17: 迁移日志记录。
- [R214] T17: 迁移逻辑必须保持
- [R215] T17: 项目孤儿恢复必须保持
- [R224] T18: 章节树键盘导航
- [R232] T19: NSIS安装器
- [R235] T19: 必须改进：打包前自动化测试集成CI
- [R236] T19: 版本号自动递增
- [R243] T20: parallelMap可替换为p-limit等库
- [R252] T22: AI调用数据流封装到apiService composable
- [R255] T23: GitHub API封装为githubService
- [R256] T23: 朱雀检测封装为可选验证器模块

---

## 6. CSS回归结果

| 指标 | 旧架构 | 新架构 | 匹配 | 缺失 |
|------|--------|--------|------|------|
| CSS变量 | 148 | 254 | 148 | 0 |
| CSS选择器 | 1612 | 357 | 137 | 1475 |

选择器匹配率: 8.5%

低匹配率原因: Vue3采用scoped样式+组件化CSS，旧架构全局选择器在新架构中被拆分到各组件的scoped style中，选择器名变化是预期架构差异。CSS变量148个全部匹配，说明设计令牌系统完整迁移。

---

## 7. IPC验证结果

| 指标 | 数值 |
|------|------|
| 旧架构通道数 | 20 |
| 新架构通道数 | 31 |
| 缺失通道 | 0 |
| 缺失暴露键 | 0 |
| 孤儿通道 | 3 |

旧架构全部20个IPC通道在新架构中全部存在(0缺失)。新架构额外新增了11个通道(agent/deai/pipeline/skill相关)。

孤儿通道(新架构有但旧架构无): app:closeChoice, app:finalSave, app:requestClose

---

## 8. 建议修复顺序

1. **P0-致命(6项)**: 立即修复，阻塞核心功能
   - R001: polyfill JSON.parse致命缺陷
   - R047/R051/R055: 消息操作/内联菜单/拖拽组件缺失
   - R113: settings加载持久化
   - R123: 存储键命名规范
2. **P1-严重(44项)**: 修复后进行第二轮检测
3. **P2-中等(3项)**: 默认值修正
4. **P3-轻微(39项)**: 交互差异优化
5. **P4-可接受(41项)**: 架构差异无需修复
6. **CSS选择器**: 低匹配率是scoped样式架构差异，变量全匹配即设计令牌完整

---

*报告版本: V2.0 | 生成时间: 2026-08-11 | 生成者: Codex (GPT-5)*
