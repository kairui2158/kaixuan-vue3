## 导演工作台（第三板块）综合方案 V1.1

### 一、定位与命名变更

原名称：动画/短剧板块
新名称：导演工作台

为什么改名：用户反馈，最终剪辑成像是用外部应用（如剪映）完成的，我们的应用应该做的是素材的拼装与整理，而不是自己做视频渲染。所以这个板块的核心价值是：从写作和记忆数据中提取、组织、排列素材，生成可导出的素材包，让用户拿到任何外部制作工具里直接用。

### 二、三板块连通关系

写作板块（大纲/设定/卷纲/章节/正文）-> 记忆板块（实体/关系/事件/伏笔）-> 导演工作台（素材包输出）

- 正文确认 -> 抽取记忆 -> 提供角色卡/场景卡/分镜表/对白脚本
- 卷纲结构 -> 情节事件线 -> 场景排列/镜头切分
- 设定数据 -> 世界观/道具 -> 场景道具清单/角色档案

### 三、导演工作台核心功能拆解

#### 3.1 分镜表（Storyboard Sheet）
用途：把正文段落拆解为镜头级别的分镜卡片
数据来源：正文文本 + 记忆板块的事件线 + 场景实体
输出格式：可导出为CSV/JSON/PDF的分镜表
每张分镜卡包含：
- 镜头编号（如 1-A-03 表示第1卷A场景第3镜）
- 场景描述（从记忆板块的场景实体拉取）
- 角色出镜（从记忆板块的角色实体拉取）
- 动作描述（AI从正文段落提取）
- 台词/旁白（从正文对白提取）
- 镜头类型（远景/中景/近景/特写，AI标注）
- 时长估算（AI根据内容密度估算）
- 参考图位置（可选，用户可粘贴参考图链接）

#### 3.2 角色卡（Character Sheet）
用途：为每个出场角色生成完整的角色档案卡
数据来源：记忆板块的实体数据（已有人物画像）
输出格式：可独立导出的角色卡
每张角色卡包含：
- 基本信息（姓名/别名/身份/外貌，从记忆实体直接读取）
- 性格特征（从记忆实体personality字段读取）
- 关系网络（从记忆关系数据生成关系图缩略）
- 出场记录（从记忆事件的appearances字段汇总）
- 道具装备（从记忆实体possessions字段读取）
- 角色弧光摘要（AI从事件线中提取该角色的发展轨迹）
- 参考图（可选，用户可粘贴角色参考图链接）

与记忆板块的关系：记忆板块的CharacterCard组件已经实现了角色卡的基本展示，导演工作台的角色卡是它的导出版，格式更规范，可直接交给制作团队。

#### 3.3 场景卡（Scene Card）
用途：为每个场景生成完整的场景档案
数据来源：记忆板块的location类型实体 + 正文场景描写
每张场景卡包含：
- 场景名称/编号
- 场景类型（室内/室外/日景/夜景，AI标注）
- 环境描述（从正文和记忆实体综合提取）
- 出现场次（从事件线中检索该场景出现的所有章节）
- 道具清单（从记忆实体possessions字段 + 正文道具描写）
- 光照/氛围提示（AI根据正文描写提取）
- 参考图（可选）

#### 3.4 对白脚本（Dialogue Script）
用途：把正文中的对白提取为标准剧本格式
数据来源：正文文本
输出格式：支持Fountain格式导出
技术方案：使用 @thombruce/fountainjs（npm包，Fountain剧本标记语言的JS解析器）
处理流程：
- AI从正文段落中提取对白，标注说话人
- 按Fountain格式排版：角色名居中大写，台词缩进
- 旁白/动作描述转为场景标题（INT./EXT.）
- 导出为.fountain文件，可直接导入剧本编辑软件

### 四、技术选型（社区调研结果）

#### 4.1 已有基础（AU3架构现状）
| 组件 | 文件路径 | 状态 |
|---|---|---|
| 记忆面板 | src/components/common/MemoryPanel.vue | 已完成，5种视图 |
| G6画布 | src/components/memory/G6Canvas.vue | 已完成 |
| 角色卡 | src/components/memory/CharacterCard.vue | 已完成 |
| 时间线 | src/components/memory/TimelineView.vue | 已完成 |
| 记忆数据模型 | src/types/memory.ts | 已完成 |
| 记忆抽取 | src/services/memoryExtractor.ts | 已完成 |
| 记忆检索 | src/services/memoryRetriever.ts | 已完成 |
| 记忆合并 | src/services/memoryMerger.ts | 已完成 |
| 记忆版本 | src/services/memoryVersion.ts | 已完成 |

#### 4.2 需要新增的组件
| 组件 | 技术选型 | 用途 |
|---|---|---|
| DirectorPanel.vue | Vue3 SFC | 导演工作台主面板 |
| StoryboardView.vue | Vue3 SFC + G6 | 分镜表视图 |
| CharacterSheetExport.vue | Vue3 SFC | 角色卡导出版 |
| SceneCardView.vue | Vue3 SFC | 场景卡视图 |
| DialogueScriptView.vue | Vue3 SFC + fountainjs | 对白脚本视图 |
| ShotTimeline.vue | Vue3 SFC | 镜头时间线 |
| MaterialExportService.ts | TypeScript | 素材包导出服务 |

#### 4.3 npm依赖选型
| 包名 | 版本 | 用途 |
|---|---|---|
| @thombruce/fountainjs | 2.2.2 | Fountain剧本格式解析/生成 |`n| jszip | 3.10.1 | 素材包ZIP打包（纯JS） |`n| papaparse | 5.7.0 | CSV导出/解析，分镜表用（纯JS） |`n| jspdf-html2canvas | 1.7.0 | 角色卡/场景卡导出PDF（纯JS） |
| vue-draggable-plus | 0.6.1 | 分镜卡片拖拽排序 |
| konva | 10.3.3 | 画布交互（分镜板布局） |
| @antv/g6 | 已安装 | 思维导图/关系图 |

#### 4.4 不需要引入的
- Remotion（58432 stars）：React视频编程框架，我们不做视频渲染
- Excalidraw：React白板，我们用G6已有画布能力
- tldraw：同上
- fabric.js：与konva重叠

### 五、UI架构设计

#### 5.1 侧栏入口
在现有侧栏导航中，在记忆按钮下方增加导演工作台按钮：
[大纲工作台] [生成流水线] [记忆] [导演工作台] [插件市场] [设置] [写作仪表盘]

#### 5.2 导演工作台面板布局
点击侧栏导演工作台后，弹出全屏overlay，内部分为：
- 顶部：标题 + [导出素材包] [关闭]
- Tab切换：[分镜表] [角色卡] [场景卡] [对白脚本] [素材总览]
- 左侧：章节/卷选择器
- 右侧：内容展示区
- 底部：进度条

#### 5.3 各Tab功能详述

Tab 1 分镜表：选择章节 -> 显示分镜卡片列表 -> 拖拽排序 -> 双击编辑 -> 批量生成 -> 导出CSV
Tab 2 角色卡：选择角色 -> 显示完整角色卡 + 关系图缩略 -> 导出JSON/PDF
Tab 3 场景卡：选择场景 -> 显示场景档案 -> 导出
Tab 4 对白脚本：选择章节 -> Fountain格式预览 -> 编辑 -> 导出.fountain文件
Tab 5 素材总览：全局统计 -> 一键导出完整素材包ZIP

### 六、与记忆板块的数据流

#### 6.1 读取方向（记忆 -> 导演工作台）
- entities -> CharacterSheetExport读取character类型，SceneCardView读取location类型
- events -> StoryboardView读取事件生成场景出场次，ShotTimeline排列镜头时间线
- relations -> CharacterSheetExport生成角色关系缩略图
- foreshadowing -> 素材总览显示伏笔追踪状态

#### 6.2 写入方向
导演工作台不直接写入记忆板块。编辑结果保存在独立的directorStore中，保证记忆数据纯净性。

#### 6.3 新增Store
```typescript
// src/stores/director.ts
interface DirectorState {
  storyboards: Record<string, StoryboardCard[]>
  characterSheets: Record<string, CharacterSheet>
  sceneCards: Record<string, SceneCard>
  dialogueScripts: Record<string, string>
  generationProgress: { total: number; done: number; current: string }
}
```

### 七、AI调用设计

#### 7.1 分镜生成
输入：正文段落 + 记忆上下文
输出：JSON数组，每项为分镜卡
调用：aiService.chatJSON()

#### 7.2 角色弧光摘要
输入：角色所有出场事件
输出：200字以内发展轨迹摘要

#### 7.3 场景氛围提取
输入：正文场景描写段落
输出：JSON含光照/氛围/季节/天气

### 八、导出格式规范

#### 8.1 分镜表CSV
镜头编号,章节,场景,角色,动作,台词,镜头类型,时长(秒),备注

#### 8.2 角色卡JSON
结构化数据：name, aliases, type, identity, appearance, personality, relationships, arc, appearances, possessions

#### 8.3 对白脚本Fountain
INT./EXT. 场景标题，角色名居中大写，台词缩进

#### 8.4 完整素材包ZIP
storyboards.csv + characters/ + scenes/ + dialogues/ + manifest.json

### 九、实现计划（分阶段）

第一阶段：基础框架 + 分镜表（1-6）
第二阶段：角色卡 + 场景卡（7-10）
第三阶段：对白脚本 + 导出（11-15）
第四阶段：拖拽排序 + 素材总览（16-19）

### 十、与记忆板块遗留缺口的关系

导演工作台不依赖记忆板块遗留缺口修复。已有记忆数据足够支撑分镜/角色卡/场景卡生成。如果记忆抽取入口修复，数据更新鲜，是增强不是阻塞。

### 十一、风险评估
| 风险 | 严重度 | 应对 |
|---|---|---|
| AI分镜质量不稳定 | 中 | 支持手动编辑修正 |
| npm包兼容性 | 低 | fountainjs纯JS库 |
| 素材包导出ZIP | 低 | JSZip纯JS |
| 记忆数据为空 | 中 | 空状态提示 |
| 正文超token | 中 | 按段落切分800-1500字 |

### 十二、与外部制作软件的对接逻辑

以剪映为例：
1. 用户在导演工作台选择章节，生成分镜表
2. AI提取分镜，用户检查修正
3. 点击导出素材包
4. 应用打包ZIP
5. 用户打开剪映，参照分镜表排列素材
6. 角色卡指导配音/形象选择
7. 对白.fountain导入字幕轨道
8. 场景卡指导背景素材选择

关键原则：不生成视频，不渲染画面，不做音频合成。只做素材的提取、组织、排列、导出。

### 十三、文件结构
```
src/
  stores/director.ts
  components/director/
    DirectorPanel.vue
    StoryboardView.vue
    CharacterSheetExport.vue
    SceneCardView.vue
    DialogueScriptView.vue
    MaterialOverview.vue
    ShotTimeline.vue
  services/
    storyboardGenerator.ts
    materialExport.ts
    fountainExporter.ts
  types/director.ts
```

### 十四补充：第三轮社区调研发现

#### 参考项目：instant-drama-magician (npm 1.10.0)
npm上发现了一个AI短剧桌面工作室项目，用Electron构建，依赖含konva和jszip。这验证了我们的技术选型方向正确。
关键区别：它用React+ffmpeg做实际视频渲染，我们用Vue3且明确不做视频渲染，只做素材包输出。

#### 参考项目：OpenChatCut (GitHub 1604 stars)
开源本地优先的AI视频编辑器，支持多模型对话编辑。它走的是完整视频编辑路线，我们不做这条路。

#### 参考项目：Remotion (GitHub 58432 stars, npm 4.0.521)
React视频编程框架，用代码定义视频。非常成熟但依赖React生态，且定位是生成视频，不是我们需要的素材组织。

#### 技术选型验证结论
三轮调研共搜索GitHub 8个方向、npm 16个包，确认：
1. 没有现成的Vue3导演工作台/素材包工具可直接复用，需要自建
2. 我们的组件选型（G6+konva+vue-draggable-plus+fountainjs+jszip+papaparse+jspdf）覆盖了所有需求
3. 现有类似项目（instant-drama-magician）也选了konva+jszip，进一步验证选型
4. 不需要引入任何React生态依赖

### 十五、总结

导演工作台核心价值：从小说到拍摄指南的桥梁。不做视频，只做素材的提取、组织、排列和导出。与记忆板块只读消费，解耦不污染。技术选型复用G6和aiService，新增2个轻量npm依赖。