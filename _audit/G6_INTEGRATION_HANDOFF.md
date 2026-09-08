# 神意助手记忆面板 G6 可视化升级交接文件

> **交付对象**：新对话框（无上下文，需完整自包含）
> **施工目标**：D:\codex\novel-workshop-vue3
> **范围**：将记忆面板四视图从纯 DOM/SVG 手写实现升级为 G6 v5 图引擎驱动
> **铁律**：只改记忆可视化相关文件，不碰流水线/去AI味/聊天/设置其他功能

---

## 零、施工前必读

### 0.1 项目位置与启动方式

- 源码根目录：D:\codex\novel-workshop-vue3
- 启动器：根目录下 start-electron.bat（先 npm run build:vue 再启动 Electron）
- 经验文件：_audit/神意开发经验总结_v3.md（按 §1-§9 结构，含全部教训）
- 规则文件：memory/rules.md（规则1-23）
- 错误日志：lessons/ERROR_LOG.md
- 旧交接文件：_audit/MEMORY_V1_HANDOFF_TO_NEW_DIALOGUE.md

### 0.2 技术栈约束

- Vue 3.5 + Pinia + Vite 5 + Electron 30 + TypeScript
- G6 v5.1.1 已安装（@antv/g6@5.1.1，node_modules 2063 文件 7.6MB）
- 禁止引入新 npm 依赖（G6 已安装，不需要额外依赖）
- 禁止用 PowerShell Set-Content 修改含中文源文件（规则13）
- 含中文文件用 apply_patch 或 Node.js fs 写入
- 每次改完立即 node --check 验证语法
- CSS 先搜后改，禁止叠加（规则19）

### 0.3 验证三铁律（规则14）

1. 外部裁判：改完不能靠读代码判断通过。必须用 CDP 实际操作应用，截图+JSON日志+时间戳三者缺一视为未验证
2. 行为验证：不验证「元素存在」，验证「功能能用」。必须验证 操作->预期行为->实际结果 三元组
3. 强制执行：每个阶段有验证清单，任何一项 FAIL 禁止进入下一阶段

### 0.4 防空转协议

- 每步写 _audit/checkpoint.md + update_plan
- 同一方法连续失败2次，强制换路径
- 子Agent必须真正spawn，不能只说「我去派」
- 每30秒给用户一条进度更新，连续两条说同样话=空转信号
- 工具调用前先确认工具在可用列表中，连续两次失败立刻换替代方案
- 脚本必须写 .cjs/.mjs 文件执行，禁止 PowerShell 内联嵌套引号/JSON/正则（经验§2第2条）
- CDP 探针固定三段式：前置快照 -> 业务操作+逐操作断言 -> 恢复原状+清理核销（finally段）（经验§2第9条）

### 0.5 本计划引用的核心经验教训

| 编号 | 教训摘要 | 来源 |
|------|---------|------|
| M1 | 影响圈声明：改文件前用 rg 列出引用者和读写字段 | 经验§1 M系列 |
| M2 | 整文件操作禁令：禁止重写整个文件，用 apply_patch 逐行编辑 | 经验§1 M系列 |
| 规则13 | 禁止 PowerShell Set-Content 写含中文源文件 | memory/rules.md |
| 规则14 | 验证三铁律：外部裁判+行为验证+强制执行 | memory/rules.md |
| 规则19 | CSS先搜后改，禁止叠加 | memory/rules.md |
| §2第2条 | 复杂脚本写 .cjs/.mjs 文件执行 | 经验§2 |
| §2第5条 | CDP screenshot 设 3-15s 超时并降级为视口截图 | 经验§2 |
| §2第9条 | CDP探针三段式 | 经验§2 |
| §2第18条 | 源Electron启动用完整路径，Hidden窗口，等8秒再连CDP | 经验§2 |
| §2第28条 | CDP探针一律用Node WebSocket载体执行JS文件 | 经验§2 |
| §1通用规则5 | store是唯一事实来源，禁止组件本地ref存业务数据 | 经验§1 |

---

## 一、当前架构分析

### 1.1 需要改动的文件清单

| 文件 | 行数 | 当前实现 | 改动范围 |
|------|------|---------|---------|
| src/components/memory/MindMap.vue | ~80 | 纯DOM缩进列表，v-for渲染卷/章/事件 | 全部重写为G6 MindmapLayout |
| src/components/memory/RelationGraph.vue | ~120 | 手绘SVG，余弦布局圆环排列节点 | 全部重写为G6 ForceLayout |
| src/components/memory/GraphAnalysis.vue | ~115 | 纯文本统计卡片，无图可视化 | 重写为G6 ConcentricLayout + 交互 |
| src/components/memory/TimelineView.vue | ~90 | DOM列表+竖线标记 | 重写为G6 SnakeLayout + Timebar |
| src/styles/tokens.css | - | 记忆CSS变量在L68-L85 | 新增G6专用变量 |

### 1.2 禁止修改的文件

| 文件 | 原因 |
|------|------|
| src/components/common/MemoryPanel.vue | 容器组件，props/emits签名不变 |
| src/composables/useMemoryGraph.ts | 数据构建器，保留现有接口 |
| src/types/memory.ts | 数据模型，不改动 |
| src/stores/project.ts | Pinia store，不改动 |
| src/services/memoryRetriever.ts | 检索服务，不改动 |
| src/components/memory/CharacterCard.vue | 画像卡组件，不改动 |

### 1.3 当前数据流

projectStore.memories (Pinia) -> useMemoryGraph.ts (composable) -> 四个视图组件 (props.memories -> computed -> 渲染)

useMemoryGraph 提供四个函数：
- entitiesToGraphData() 返回 { nodes: [{id,label,type,data}], edges: [{id,source,target,label,data}] }
- eventsToTimelineData() 返回 [{ id, chapterId, chapterIndex, title, type, summary, characters, location, data }]
- buildMemoryTree() 返回 [{ id, name, chapters: [{ id, title, events: [{id,title,summary}] }] }]
- toMarkdownTree() 返回 string

### 1.4 数据格式差异：现有输出 vs G6 v5 期望

**现有 entitiesToGraphData() 输出**：nodes 有 label/type 在顶层，edges 有 label 在顶层

**G6 v5 期望**：label/type 放在 node.data 内部，不是顶层

**关键差异**：需要 toG6Data() 转换器，把 label/type 从顶层移到 data 内

**现有 buildMemoryTree() 输出**：用 name/title 和 chapters/events 字段

**G6 treeToGraphData() 期望**：用 label 和 children 字段

**关键差异**：需要 adaptTreeForG6() 适配器，把 name->label, chapters->children, events->children

---

## 二、G6 v5 已验证能力清单

以下能力均通过 node -e 实际调用验证，非文档推测。G6 版本 5.1.1，共 113 个导出。

### 2.1 布局算法（18种）

MindmapLayout, ForceLayout, ConcentricLayout, SnakeLayout, DagreLayout, D3ForceLayout, RadialLayout, GridLayout, CircularLayout, CompactBoxLayout, ComboCombinedLayout, DendrogramLayout, FishboneLayout, ForceAtlas2Layout, FruchtermanLayout, IndentedLayout, MDSLayout, RandomLayout

### 2.2 交互行为（16种）

CollapseExpand, DragElement, DragElementForce, DragCanvas, ZoomCanvas, ScrollCanvas, ClickSelect, HoverActivate, BrushSelect, LassoSelect, CreateEdge, FocusElement, AutoAdaptLabel, FixElementSize, OptimizeViewportTransform

### 2.3 插件（9种）

Minimap, Toolbar, Tooltip, Legend, Timebar, Background, GridLine, History, Hull

### 2.4 节点形状

Circle, Diamond, Donut, Ellipse, HTML, Hexagon, Image, Rect, Star, Triangle

### 2.5 边类型

Line, Polyline, Quadratic, Cubic, CubicHorizontal, CubicVertical, CubicRadial

### 2.6 核心类

Graph（图实例类）：方法包括 setData, render, fitView, fitCenter, destroy, resize, on/off, toDataURL, getElementData, setBehaviors, setPlugins, setLayout, translateBy, zoomBy, focusElement 等

treeToGraphData()：树形数据转G6格式

### 2.7 其他可用导出

BubbleSets, CameraSetting, Contextmenu, EdgeBundling, EdgeFilterLens, Fisheye, Fullscreen, Snapline, Title, Watermark, Badge, Icon, Label, BaseShape, BaseTransform, MapNodeSize, PlaceRadialLabels, ProcessParallelEdges, Shortcut, isCollapsed, idOf, positionOf

---

## 三、四视图升级计划（T0-T4）

### T0：新建 useG6Graph.ts composable

**目标**：提供共享的G6实例管理 + 数据转换器，四个视图组件共用。

**新建文件**：src/composables/useG6Graph.ts

**核心内容**：

1. toG6Data(memories) - 转换器：现有图数据 -> G6 v5 格式（把 label/type 从顶层移到 data 内）
2. adaptTreeForG6(volumes, chapters, memories) - 适配器：现有树 -> G6 树格式（name->label, chapters->children）
3. createGraph(container, options) - 创建G6 Graph实例
4. destroyGraph(graph) - 安全销毁Graph实例

**输入输出契约**：
- toG6Data：输入 MemoryData，输出 {nodes, edges} G6格式（nodes[].data.label 存在）
- adaptTreeForG6：输入 volumes+chapters+memories，输出树形G6数据（root.children[].label 存在）
- createGraph：输入container+options，返回Graph实例
- destroyGraph：输入Graph实例，安全销毁

**禁止**：
- 不修改 useMemoryGraph.ts 的任何现有函数
- 不在 composable 里存业务数据
- 不直接读 projectStore（数据通过props传入）

**验证方法**：
1. node --check 语法验证
2. npm run build:vue 构建验证
3. 单元测试：输入mock MemoryData，断言输出格式符合G6期望

**引用经验**：M1影响圈声明——新建文件不影响任何现有文件

---

### T1：重写 MindMap.vue -> G6 MindmapLayout

**目标**：将纯DOM缩进列表升级为G6思维导图布局，支持折叠展开、缩放、小地图。

**改动文件**：src/components/memory/MindMap.vue（全部重写）

**保留的接口（不变）**：
- defineProps: memories: MemoryData, volumes?: Array<{id?,name?}>, chapters?: Record<string, Array<{id?,title?}>>
- defineEmits: openSource: [payload: { kind: 'event'; id: string }]

**G6配置要点**：
- 布局：MindmapLayout，direction: 'H'
- 交互：CollapseExpand, ClickSelect
- 插件：Minimap, Tooltip, Toolbar
- 节点：rect 圆角
- 边：cubic 曲线
- 数据源：adaptTreeForG6(props.volumes, props.chapters, props.memories)

**保留的功能**：
- 全部展开/全部收起按钮 -> 调用 graph API
- 事件点击 -> graph.on('node:click') -> emit('openSource')
- 节点数量显示

**新增功能**：
- 缩放/平移
- 小地图
- Tooltip 显示事件摘要

**生命周期**：
- onMounted：创建Graph，调用render()
- onUnmounted：调用destroyGraph(graph) 销毁实例
- watch(props.memories, deep:true)：setData + render 更新

**验证方法**：
1. CDP：打开记忆面板->切换到思维导图tab -> 截图验证图渲染
2. CDP：点击折叠按钮 -> 截图验证节点折叠
3. CDP：点击事件节点 -> 检查 openSource emit 触发
4. CDP：修改 memories 后 -> 检查图自动更新

**引用经验**：§2第9条 CDP三段式，§2第18条源Electron启动

---

### T2：重写 RelationGraph.vue -> G6 ForceLayout

**目标**：将手绘SVG升级为G6力导向关系图，支持拖拽、悬停高亮、群组包络。

**改动文件**：src/components/memory/RelationGraph.vue（全部重写）

**保留的接口（不变）**：
- defineProps: memories: MemoryData
- defineEmits: openSource: [payload: { kind: 'entity'; id: string }]

**G6配置要点**：
- 布局：ForceLayout，preventOverlap: true, nodeSize: 40, linkDistance: 120
- 交互：DragElement, DragCanvas, ZoomCanvas, HoverActivate, ClickSelect
- 插件：Minimap, Tooltip, Hull
- 节点：circle, r: 28
- 边：line
- 数据源：toG6Data(props.memories)

**保留的功能**：
- 节点数量/关系数量显示
- 选中节点高亮关联
- 点击节点 -> emit('openSource')

**新增功能**：
- 力导向自动布局（节点不重叠）
- 悬停高亮邻居节点和边
- Hull群组包络（按实体type分组）
- Tooltip显示实体描述

**生命周期**：同T1模式（onMounted创建，onUnmounted销毁，watch更新）

**验证方法**：
1. CDP：切换到关系图tab -> 截图验证图渲染
2. CDP：拖拽节点 -> 截图验证节点移动
3. CDP：悬停节点 -> 截图验证邻居高亮
4. CDP：点击节点 -> 检查 openSource emit
5. CDP：添加实体后 -> 检查图自动更新

**引用经验**：§2第5条 screenshot超时，§2第9条三段式

---

### T3：重写 GraphAnalysis.vue -> G6 ConcentricLayout

**目标**：从纯文本统计升级为可视化图谱分析，节点按中心性排列，支持框选和图例。

**改动文件**：src/components/memory/GraphAnalysis.vue（全部重写）

**保留的接口（不变）**：
- defineProps: memories: MemoryData
- defineEmits: openSource: [payload: { kind: 'entity'; id: string }]

**G6配置要点**：
- 布局：ConcentricLayout, minNodeSpacing: 30, preventOverlap: true
- 交互：BrushSelect, DragCanvas, ZoomCanvas, ClickSelect
- 插件：Legend, Tooltip
- 节点：donut, size: 40（按degree设置大小）
- 数据源：toG6Data(props.memories)

**保留的功能**：
- 实体中心性排名
- 孤立实体数
- 关系类型数
- 自指关系检查

**新增功能**：
- 同心圆布局可视化中心性
- 框选多节点
- 图例按实体type分类
- Donut节点显示degree

**生命周期**：同T1模式

**验证方法**：
1. CDP：切换到图谱分析tab -> 截图验证图渲染
2. CDP：框选多个节点 -> 截图验证选中状态
3. CDP：检查图例显示
4. CDP：点击节点 -> 检查 openSource emit

**引用经验**：M1影响圈声明

---

### T4：重写 TimelineView.vue -> G6 SnakeLayout + Timebar

**目标**：从DOM列表升级为G6蛇形布局时间线，配合Timebar插件做时间筛选。

**改动文件**：src/components/memory/TimelineView.vue（全部重写）

**保留的接口（不变）**：
- defineProps: memories: MemoryData
- defineEmits: openSource: [payload: { kind: 'event'; id: string }]

**G6配置要点**：
- 布局：SnakeLayout, indent: 40, fixSize: 30
- 交互：ZoomCanvas, ScrollCanvas, ClickSelect
- 插件：Timebar, Tooltip
- 节点：rect 圆角
- 边：line
- 数据源：eventsToTimelineData(props.memories.events) 转为节点+顺序边

**保留的功能**：
- 事件数量显示
- 按类型筛选
- 按角色筛选
- 事件点击 -> emit('openSource')

**新增功能**：
- 蛇形布局可视化时间线
- Timebar时间范围筛选
- 节点按类型着色

**生命周期**：同T1模式

**验证方法**：
1. CDP：切换到时间线tab -> 截图验证图渲染
2. CDP：拖动Timebar -> 截图验证筛选效果
3. CDP：点击事件节点 -> 检查 openSource emit
4. CDP：筛选类型 -> 检查图更新

**引用经验**：§2第5条 screenshot超时

---

## 四、任务依赖与执行顺序

T0 (useG6Graph.ts) -> T1 (MindMap) + T2 (RelationGraph) [可并行] -> T3 (GraphAnalysis) -> T4 (TimelineView)

T0 必须先做，因为T1-T4都依赖 useG6Graph.ts 的转换器。
T1和T2可以并行（不同文件）。
T3和T4各自独立，但都依赖T0。
建议执行顺序：T0 -> T1 -> T2 -> T3 -> T4

---

## 五、CSS变量新增

在 src/styles/tokens.css 的记忆变量区块（L68-L85附近）新增以下变量：

--g6-bg, --g6-node-fill, --g6-node-stroke, --g6-node-text, --g6-edge-stroke, --g6-edge-label, --g6-minimap-bg, --g6-toolbar-bg, --g6-tooltip-bg, --g6-tooltip-text, --g6-selected, --g6-hover, --g6-legend-bg, --g6-timebar-bg

**注意**：先搜后改（规则19），用 rg 确认这些变量名不存在再新增。

---

## 六、硬验收门（G1-G22）

以下全部通过才算G6升级完成。任何一项未通过，不算完成。

| 编号 | 验收项 | 验证方法 | 通过标准 |
|------|--------|---------|--------|
| G1 | useG6Graph.ts 语法正确 | node --check | exit 0 |
| G2 | toG6Data 输出格式正确 | Vitest单测 | nodes[].data.label 存在 |
| G3 | adaptTreeForG6 输出格式正确 | Vitest单测 | root.children[].label 存在 |
| G4 | npm run build:vue 构建成功 | 构建输出 | exit 0 无error |
| G5 | MindMap.vue 保留props/emits签名 | 代码审查 | defineProps/defineEmits不变 |
| G6 | MindMap G6图渲染 | CDP截图 | canvas元素存在且非空 |
| G7 | MindMap折叠展开 | CDP操作 | 点击节点后子节点隐藏/显示 |
| G8 | MindMap事件点击触发openSource | CDP | emit记录包含event id |
| G9 | MindMap数据更新自动渲染 | CDP | 修改memories后图变化 |
| G10 | RelationGraph G6图渲染 | CDP截图 | canvas元素存在且非空 |
| G11 | RelationGraph节点拖拽 | CDP操作 | 节点位置改变 |
| G12 | RelationGraph悬停高亮 | CDP截图 | 邻居节点高亮状态 |
| G13 | RelationGraph点击触发openSource | CDP | emit记录包含entity id |
| G14 | GraphAnalysis G6图渲染 | CDP截图 | canvas元素存在且非空 |
| G15 | GraphAnalysis框选功能 | CDP操作 | 多节点选中状态 |
| G16 | GraphAnalysis图例显示 | CDP截图 | 图例元素存在 |
| G17 | TimelineView G6图渲染 | CDP截图 | canvas元素存在且非空 |
| G18 | TimelineView Timebar交互 | CDP操作 | 拖动后节点显隐变化 |
| G19 | TimelineView点击触发openSource | CDP | emit记录包含event id |
| G20 | 所有组件onUnmounted销毁Graph | 代码审查 | destroy调用存在 |
| G21 | 四视图切换无残留 | CDP | 切换tab后旧canvas清理 |
| G22 | tokens.css新增变量无重复 | CSS检查 | 搜索确认变量名唯一 |

---

## 七、验证矩阵（每项验证必须产出）

| 验证层 | 必须证明 | 证据形式 |
|--------|---------|---------|
| 语法层 | TypeScript编译无错误 | tsc --noEmit 输出 |
| 构建层 | Vite构建成功 | npm run build:vue 输出 |
| 单元层 | toG6Data/adaptTreeForG6 输出正确 | Vitest原始输出 |
| 渲染层 | G6 canvas元素存在且非空 | CDP DOM检查 |
| 交互层 | 点击/拖拽/折叠/框选有响应 | CDP操作日志+截图 |
| 数据层 | props.memories变化后图更新 | CDP前后截图对比 |
| 清理层 | 组件卸载后Graph.destroy()执行 | CDP内存检查 |
| 视觉层 | 四视图渲染效果合理 | CDP截图人工判断 |
| 隔离层 | 视图切换无残留实例 | CDP canvas计数 |
| 持久层 | 视图操作不影响存储数据 | CDP前后storage对比 |

---

## 八、禁止事项

1. 禁止修改 MemoryPanel.vue 的 props/emits 接口和tab结构
2. 禁止修改 useMemoryGraph.ts 的现有函数签名
3. 禁止修改 memory.ts 类型定义
4. 禁止修改 project.ts store
5. 禁止修改 CharacterCard.vue
6. 禁止引入新 npm 依赖（G6已安装）
7. 禁止用 PowerShell Set-Content 写含中文源文件
8. 禁止批量正则替换，必须逐文件精准修改
9. 禁止整文件复制旧架构代码
10. 禁止在组件本地 ref 存业务数据（必须读 props.memories）
11. 禁止跳过验证步骤进入下一任务
12. 禁止用空状态冒充真实数据验证

---

## 九、单任务施工模板

每个任务必须严格按以下步骤执行：

1. 读经验文件相关教训（§1 M系列、§2脚本纪律）
2. 读当前源码（具体文件/函数/行号）
3. 用 rg 确认影响圈（谁引用了这个文件/函数）
4. 用 apply_patch 或 Node.js fs 修改
5. node --check 验证语法
6. npm run build:vue 验证构建
7. 写 Vitest 单元测试（如适用）
8. start-electron.bat 启动应用（源Electron模式）
9. CDP/Playwright 行为验证（三段式：快照->操作->清理）
10. 截图 + JSON日志 + 时间戳
11. 更新 _audit/checkpoint.md
12. 更新 update_plan
13. 验证通过后才进入下一任务

---

## 十、CDP验证降级策略

引用经验规则（经验§2第5条、§2第9条、§2第28条）：

1. CDP screenshot 必须设 3-15s 超时（Promise.race），失败降级为视口截图
2. CDP 探针一律使用 Node WebSocket 载体执行 JS 文件（§2第28条）
3. 禁止用 PowerShell ConvertTo-Json 传输含中文/复杂字符串的脚本（§2第28条）
4. CDP 探针固定三段式：前置快照 -> 业务操作+断言 -> 恢复+清理（finally段）
5. Runtime.evaluate 内的 DOM 代码是字符串模板由浏览器执行，Node侧没有 document（§2第12条）
6. page.evaluate 内 electronAPI 调用必须 async/await（§2第4条）
7. v-show 元素验证用 getComputedStyle().display !== 'none'，不用 offsetParent（§2第7条）
8. 脚本执行后必须 process.exit(0/1) 显式退出（§2第6条）
9. 源Electron启动用 node_modules\electron\dist\electron.exe，Hidden窗口，等8秒再连CDP（§2第18条）
10. 每段结果写入同一个 JSON 输出文件，allStepsOk + runtimeErrors:[] 是最终PASS判据（§2第10条）

如果 CDP WebSocket 连续超时3次：
- 换方法：写独立 .cjs 脚本用 Playwright API
- 再失败：手动启动应用，用浏览器开发者工具验证
- 仍失败：标记为 UNVERIFIED，不冒充通过

---

## 十一、G6 v5 API 注意事项

### 11.1 treeToGraphData 格式不匹配

G6 v5 的 treeToGraphData() 期望输入树有 {id, label, children} 结构。现有 buildMemoryTree() 返回 {id, name, chapters: [{id, title, events: [{id, title, summary}]}]}。必须用 adaptTreeForG6() 转换，不要直接传给 treeToGraphData。

### 11.2 Graph.destroy()

组件 onUnmounted 时必须调用 graph.destroy() 释放 canvas 和事件监听。不调用会导致内存泄漏和视图切换后残留 canvas。

### 11.3 Graph.setData() + render()

数据更新时调用 graph.setData(newData) 后必须再调用 graph.render()。只调 setData 不调 render 不会更新画面。

### 11.4 容器尺寸

G6 Graph 需要容器有明确尺寸（width/height）。容器 div 必须设置 width: 100%; height: 100% 或具体像素值。如果容器高度为0，G6不会渲染。建议在容器外层设 min-height: 280px（参考现有 RelationGraph.vue 的 canvasHeight=430）。

### 11.5 事件系统

G6 v5 事件绑定用 graph.on('node:click', (event) => {...})。event.target.id 获取节点ID。事件名格式：node:click、node:pointerenter、canvas:click 等。

### 11.6 布局配置

MindmapLayout 需要 direction: 'H'（横向）或 'V'（纵向）。ForceLayout 需要 preventOverlap: true 防止节点重叠。ConcentricLayout 需要 minNodeSpacing 控制间距。SnakeLayout 需要 indent 控制缩进。

### 11.7 插件实例化

G6 v5 插件在 Graph 构造参数的 plugins 数组中传入。可以直接传类名（如 Minimap）或配置对象（如 { type: 'minimap', size: [120, 80] }）。

### 11.8 ResizeObserver

容器尺寸变化时需要调用 graph.resize() 更新画布。用 ResizeObserver 监听容器元素。

---

## 十二、已知风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| G6 canvas 在 Electron 中渲染异常 | 图不显示 | 确认容器有尺寸，G6 5.x 用 Canvas2D 不依赖 WebGL |
| 内存泄漏 | 视图切换后残留 | onUnmounted 必须 destroy，watch 也要清理 |
| 数据为空时G6报错 | 白屏 | 在 createGraph 前检查 data.nodes.length，为0显示空状态 |
| treeToGraphData 格式不匹配 | 树渲染失败 | 用 adaptTreeForG6 转换，不直接调 treeToGraphData |
| CSS变量名冲突 | 样式覆盖 | 先搜后改（规则19） |
| props.memories 深层变化未触发watch | 图不更新 | watch 用 { deep: true } |
| 容器resize后G6不自适应 | 图溢出 | 用 ResizeObserver 监听容器，调用 graph.resize() |
| 大量节点性能问题 | 卡顿 | MindmapLayout 200+节点时建议默认折叠 |
| TypeScript类型不匹配 | 编译错误 | G6有完整类型定义，按类型写 |
| 视图切换时旧Graph未销毁 | 残留canvas | MemoryPanel用v-if切换，确保onUnmounted触发 |

---

## 十三、执行指令

新对话框执行以下步骤：

1. 先读本文件全文
2. 读 _audit/神意开发经验总结_v3.md 的 §1（改码纪律）和 §2（脚本纪律）
3. 读 src/composables/useMemoryGraph.ts 了解现有数据构建器
4. 读 src/types/memory.ts 了解数据模型
5. 读 src/components/common/MemoryPanel.vue 了解容器结构
6. 严格按 T0 -> T1 -> T2 -> T3 -> T4 顺序执行
7. 每个任务完成后更新 _audit/checkpoint.md
8. 每个任务完成后用 update_plan 标记状态
9. 全部完成后出具验收报告，逐项对照 G1-G22
10. 验收报告必须包含：每项G编号的通过/未通过状态、证据引用（file:line/命令输出/截图路径）、最终判定

**禁止跳过验证。禁止用代码存在冒充行为通过。禁止用空状态冒充真实数据。**

---

## 附录：当前组件文件完整清单（施工前必读）

| 文件 | 行数 | 职责 | 本任务改动 |
|------|------|------|-----------|
| src/components/memory/MindMap.vue | ~80 | 思维导图（纯DOM列表） | 全部重写为G6 |
| src/components/memory/RelationGraph.vue | ~120 | 关系图（手绘SVG） | 全部重写为G6 |
| src/components/memory/GraphAnalysis.vue | ~115 | 图谱分析（纯文本） | 全部重写为G6 |
| src/components/memory/TimelineView.vue | ~90 | 时间线（DOM列表） | 全部重写为G6 |
| src/components/memory/CharacterCard.vue | ~75 | 画像卡（不改） | 不改动 |
| src/composables/useMemoryGraph.ts | ~155 | 数据构建器（不改） | 不改动 |
| src/composables/useG6Graph.ts | 新建 | G6实例管理+数据转换 | 新建 |
| src/components/common/MemoryPanel.vue | ~730 | 容器面板（不改） | 不改动 |
| src/types/memory.ts | ~139 | 数据模型（不改） | 不改动 |
| src/stores/project.ts | ~859 | Pinia store（不改） | 不改动 |
| src/services/memoryRetriever.ts | ~95 | 检索服务（不改） | 不改动 |
| src/styles/tokens.css | - | CSS变量 | 新增G6变量 |
