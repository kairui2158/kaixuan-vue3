# 石墨墨水设计融合方案 v2（现役执行稿）

> 日期：2026-09-20  
> 参考稿：`C:/Users/凯瑞/Desktop/SKILL调试文件/DESIGN (codex).md`  
> 审核状态：用户已确认 4 个决策点，方案放行进入 P0 写码  
> 版本关系：本文件是唯一现役执行方案；v1 已被本版取代，仅作历史过程稿保留

## 0. 方案成熟度声明（M18）

**方案成熟度：方案层成熟；实现未验证。**

| 层 | 成熟度 | 断点 |
|---|---|---|
| 设计原则 / 分区策略 | 成熟 | 已锚定设计稿原文与 47 个组件事实；用户已确认总体策略 |
| Token 映射 | 成熟 | 图标、light 灰阶、dark blur、阶段顺序已全部确认 |
| 交互闭环 / 组件改造 | 半成熟 | 尚未做双主题真实截图与像素级验收 |
| 验证标准 | 成熟 | 命令、截图矩阵、机器门禁已定义，但本轮未执行实现验证 |

放行结论：2026-09-20 用户确认 4 个决策点后，P0-P6 全链路放行；每个阶段仍必须以独立验证输出逐段验收，上一阶段未过门禁不得进入下一阶段。  
本方案证据来自源码扫描与设计稿原文，**未做视觉实现验证**；不得把“方案成熟”表述为“实现已验证”。

## 1. 核心判断

设计稿的价值不是“换成灰白配色”，而是一套完整的降噪机制：

1. **chrome 退后，内容主导**：外壳用低对比、轻边框、少量填充，把注意力让给正文、对话和图谱。
2. **结构靠 1px hairline，不靠阴影**：light 主题下大多数阴影可被 hairline 替代。
3. **状态靠字重、位置和 5% hover veil，不靠装饰色**：但本项目有生成、失败、diff、记忆状态等真实语义，不能全灰阶化。
4. **字号克制**：24px 是展示上限，多数界面应在 11-18px。
5. **动效只负责反馈**：5% veil、短过渡、可预测层级，不做氛围动画。

## 2. 融合总纲

**外壳学它的安静，内容留我们的身份，语义保持可读。**

### 2.1 三域治理

| 域 | 范围 | 设计策略 |
|---|---|---|
| 外壳域 | 侧栏、导航、工具栏、面板 chrome、设置页、普通模态 | 最接近石墨稿：白纸面、灰阶文字、hairline、5% veil、克制圆角 |
| 内容域 | 编辑器、大纲、Chat、Markdown、记忆图谱、diff | 保留 LXGW 文楷、语义气泡、图谱色彩；只降噪 chrome 和容器 |
| 语义域 | success / danger / warning / info / pipeline / diff / 记忆状态 | 绝不灰阶化；继续用颜色承担状态语义 |

### 2.2 吸收清单

| 设计稿元素 | 融合方式 |
|---|---|
| Hairline `#0000001a` | light 主题新增 `--border-hairline`；卡片、面板分隔、设置分组优先使用 |
| Hover veil `#0000000d` | light 主题新增 `--hover-veil`；普通导航、列表、ghost 按钮统一使用 |
| 1px 边框替代阴影 | light 主题下卡片、模态、菜单优先 border；仅 tooltip / 弹层保留轻阴影 |
| 24px 展示上限 | 新 token `--text-display: 24px`；设置页、帮助页、空态标题不得超过 |
| 10px 圆角 | 不照搬为唯一值；现有 4/6/8/12 收敛为 `4/6/8/10/pill` |
| 字重分层 | 600 标题、400 正文、500 强调；弱化 700 的外壳使用 |
| 单层遮罩 | overlay 统一单层；light 与 dark 均去 blur，遮罩透明度用 token 表达 |
| 16px 图标 | 工具栏图标统一 16px 线性图标，视觉盒 28/32px |
| 主动作文案 | 按钮动词化、同流程同词，错误与空态给下一步 |

### 2.3 拒绝清单

| 设计稿要求 | 不采纳原因 |
|---|---|
| 全灰阶、无 CTA | 本项目有生成、删除、危险确认、diff、运行状态，颜色承担数据语义 |
| 1200px 页宽 | 桌面写作工具需要三栏工作区，不能套网页页宽 |
| 全系统字体 | 编辑器字体链路是既有不可推翻项，保留 LXGW 文楷 |
| 完全无阴影 | dark 主题中阴影是层级线索，只降低强度，不全部清零 |
| 10px 单一圆角 | 现有密度系统和小控件更适配多档圆角 |

### 2.4 用户已确认决策（2026-09-20）

| 决策点 | 用户确认 | 执行含义 |
|---|---|---|
| 1. 图标方案 | 采纳方案建议 | 统一 16px 线性图标；不新增 npm 依赖，先建内部 SVG 组件库；替代现有文字符号与手写 SVG |
| 2. light 主题灰阶深度 | 完全采用 | 外壳域使用石墨稿 `#ffffff + #f9f9f9 + #0d0d0d` 灰阶，不再保留 Notion 暖纸倾向；内容域与语义域不受灰阶化影响 |
| 3. dark 主题 blur | 采纳方案建议 | dark 与 light 一致去 blur；遮罩靠透明度与层级表达，不靠 backdrop-filter |
| 4. 阶段顺序 | 按默认走 | P0 → P1 → P2 → P3 → P4 → P5 → P6；不把 P2 提前 |

这 4 项为已锁定决策，P0-P6 执行中不再重新讨论；如需变更必须回到用户审核，并同步更新本方案与 v1 的历史关系。

## 3. 10 轮研磨结论

### 第 1 轮：全应用事实盘点

- 47 个 Vue 组件；最大为 `PipelinePanel.vue`、`OutlineWorkspace.vue`、`ChatPanel.vue`。
- 5 个全局样式源：`tokens.css`、`global.css`、`modal.css`、`base-components.css`、`ai-content.css`。
- 双主题：`:root` dark，`body.light-theme` 覆盖；默认 light。
- 密度三档：`[data-density]` default / comfortable / compact。
- 响应式覆盖 599/600/700/760/800/1023/1024/1280/1600/2560 等断点。
- 既有不可推翻项：间距统一、密度系统、`useModalQueue`、`app-confirm=9000`、`ApiChatInput` 单源、流水线 `v-show`。

### 第 2 轮：交互与可访问性审计

- aria / role 标记集中在模态、tab、toolbar、图表容器，但大量普通按钮仍靠 `title`。
- tooltip 有三套：`SidebarNav` 的 `data-tooltip`、全局 `title`、局部 drag tooltip。
- toast 有三套：notyf、`.toast`、`.dom-toast-container`，还有 `AiNamingModal` 内联临时 toast。
- 空态形态分裂：Chat 空态、`empty-hint`、`naming-empty`、`analysis-empty`、`rtd-empty` 各自实现。
- focus 管理只有 `AppConfirmModal` 较完整；多数模态无焦点陷阱和返回焦点。

### 第 3 轮：交互系统收口

目标：让“反馈”成为一种语言，而不是每处自造。

1. **Toast 单源**  
   建立统一 toast service，保留一个视觉类和四种语义：info / success / warning / danger。  
   收口对象：notyf、`.toast`、`.dom-toast-container`、`AiNamingModal` 内联 toast。  
   视觉：外壳域用 elevated surface + hairline + 3px semantic edge；文案动词化；同一动作的按钮与 toast 名词一致。

2. **Tooltip 单源**  
   统一为 `data-tooltip` + CSS 单实现；废弃裸 `title`，仅截断文本保留 `title` 作为兜底。  
   视觉：light 用 `--color-ink-press` 黑底白字；dark 用 elevated surface + border。  
   延迟：show 300ms、hide 80ms；键盘 focus 也可显示。

3. **EmptyState 组件化**  
   结构统一为：图标 / 标题 / 说明 / 主行动。  
   空态必须回答“这里为什么空、下一步做什么”。  
   所有 `empty-hint`、`naming-empty`、`analysis-empty`、`rtd-empty`、`market-empty` 分批迁移。

4. **确认层保护**  
   `useModalQueue` 的 `app-confirm=9000` 不动。  
   所有危险操作继续走 `appConfirm.confirm({ danger: true })`；禁止组件私有 confirm。

5. **键盘与焦点**  
   模态打开聚焦首个可交互元素，关闭返回触发元素。  
   Escape 统一走 modal queue；输入区 Enter/Shift+Enter 行为保持 `ApiChatInput` 单源。

### 第 4 轮：内容层深挖

1. **编辑器**  
   工具栏降为 hairline 分隔 + ghost 图标按钮；正文保持 LXGW 字体和行高。  
   查找、保存、降 AI、运行记录等按钮统一 16px 图标 + tooltip。

2. **Chat 气泡**  
   用户/AI 气泡保留身份色，但降低背景饱和度和边框强度。  
   工具过程、等待确认、失败批次用状态条而非整卡彩色背景。

3. **Markdown / ai-content.css**  
   标题、列表、代码块的 margin 使用 em 保留阅读节奏；代码块颜色 token 化。  
   light/dark 双主题分别校验 Shiki 主题与容器背景。

4. **输入区**  
   `ApiChatInput` 只做视觉融合，不改交互单源。  
   发送按钮保留 accent；模式切换为 segmented control。

### 第 5 轮：数据密集面板

1. **PipelinePanel**  
   五层 `v-show` 不改结构。  
   层导航、卷表、章节卡、设定列表统一 hairline 分隔；生成中状态用 progress + semantic edge。  
   大表格 hover 只用 veil，不做位移。

2. **RunTrace / Diff**  
   列表、详情、对比面板统一 11-13px 数据字号。  
   diff 增删色保留；不因灰阶牺牲可读性。

3. **MemoryPanel**  
   状态 chip 全部 token 化：pending / confirmed / conflicted / rejected。  
   现有 `rgba(...) + hex` 硬编码状态色迁入 tokens。

4. **Dashboard / DeAi**  
   数据卡改 hairline 卡；关键指标用 20-24px 字号，不做营销 hero。  
   DeAi 进度动画遵守 reduced motion。

### 第 6 轮：模态体系

1. **基类归一**  
   `.modal-overlay`、`.pl-overlay`、`.ow-overlay`、`.pm-overlay`、`.dash-overlay`、`.mem-overlay`、`.rt-overlay`、`.naming-overlay` 全部收敛到 modal 基类或显式继承同名 token。

2. **遮罩单层**  
   light：`rgba(0,0,0,.32-.38)`，无 blur。  
   dark：`rgba(0,0,0,.55-.62)`，可保留轻 blur 或同样去 blur。  
   `RunTracePanel` 的 `rgba(15,23,42,.58)+blur(2px)`、`AiNamingModal` 的 `rgba(3,4,6,.72)+blur` 改为 token。

3. **内容三段式**  
   header 固定、body 滚动、footer 固定；关闭按钮统一 28px 图标按钮。  
   嵌套模态仍由 `useModalQueue` 分配 z-index。

4. **层级表**  
   base < sticky < dropdown < overlay < modal queue < toast < tooltip < app-confirm。  
   不新增魔法 z-index；迁移时保留 `app-confirm=9000`。

### 第 7 轮：双主题递归

| Token | Dark | Light |
|---|---|---|
| `--border-hairline` | `rgba(255,255,255,.08)` | `rgba(0,0,0,.10)` |
| `--hover-veil` | `rgba(255,255,255,.05)` | `rgba(0,0,0,.05)` |
| `--overlay-level-1` | `rgba(0,0,0,.55)` | `rgba(0,0,0,.34)` |
| `--overlay-blur` | `none` | `none` |
| `--surface-canvas` | `--bg-primary` | `#ffffff`（已确认） |
| `--surface-chrome` | `--bg-secondary` | `#f9f9f9`（已确认完全采用石墨灰阶） |
| `--text-ink` | `--text-primary` | `#0d0d0d`（已确认） |
| `--text-mid` | `--text-secondary` | `#5d5d5d` |
| `--text-hollow` | `--text-muted` | `#8f8f8f` |

G6 图谱硬编码色迁入主题 token：`--g6-node-fill`、`--g6-node-stroke`、`--g6-selected`、`--g6-isolated`。  
图谱属于内容域，允许保留蓝紫身份，但必须在 light 下重新校验对比度。

### 第 8 轮：可访问性、响应式与密度

1. **对比度门**  
   外壳正文 ≥ 7:1，次级文字 ≥ 4.5:1，muted 仅限辅助文本。  
   light 下 `#8f8f8f` 不用于可交互控件的唯一说明。

2. **焦点门**  
   所有交互控件可见 focus ring；禁用 `outline: none` 裸用。  
   focus ring 用 accent，保留语义，不灰阶。

3. **响应式复核**  
   断点收敛为 `<600`、`600-1023`、`1024-1279`、`1280-1599`、`1600+`、`2560+`。  
   760px 纵向工作区保留；禁止新增重复断点。

4. **密度三档**  
   只通过 density token 改尺寸，不在组件里另写三档媒体查询。  
   compact 下 tooltip、图标、hit area 不小于可点击标准。

5. **Reduced motion**  
   现有全局规则保留；无限动画只允许 spinner / progress / pulse 三类。

### 第 8.5 轮：格局（布局）体系补研磨

**事实盘点**

1. 主工作区是“侧栏 + 章节树 + 编辑器 + Chat”三栏，可拖拽分隔条调整宽度。
2. `useResizers.ts` 是现有格局单一事实源：chapter 10%-30%（默认 18%）、chat 15%-45%（默认 28%），localStorage 持久化，双击或触屏双击可重置单栏。
3. 大纲工作区是独立的“大纲 + 编辑器 + 可开关 Chat”布局；`chatAreaOpen` 只控制大纲区 Chat，不能与主页布局状态混用。
4. 断点格局：`<799` 隐藏章节树，`800-1023` 侧栏折叠，`1024+` 恢复三栏。

**格局治理**

1. **格局单源**：`useResizers.ts` 是唯一宽度/比例/持久化入口；禁止组件私自读取或写入 `shenyi_resizer_*`。
2. **禁删边界**：拖拽逻辑、min/max/default 比例、双击重置、触屏支持、localStorage key 与用户已保存宽度全部保留；本方案只重画 splitter 与 tooltip。
3. **视觉融合**：6px splitter 改为透明命中区 + hairline 视觉线；hover/drag 使用 `--hover-veil` 与 `--border-hairline`；拖拽 tooltip 改用统一 Tooltip 样式与层级 token，替代当前 `z-index:10000` 局部值。
4. **设置入口**：外观设置新增“布局”组，只提供三栏预设（专注写作 / 平衡 / 对话优先）与“恢复默认布局”操作；预设和恢复必须调用 `useResizers` 的单源配置，禁止旁路直接改 DOM。
5. **持久化分层**：手动拖拽宽度、布局预设、密度、主题各自独立存储；切换主题或密度不得重置布局。
6. **响应式行为**：移动/窄屏隐藏章节树时，必须同时禁用 chapter splitter 的拖拽与命中区，避免隐形可交互点；恢复宽度时按比例重新夹取到 min/max。
7. **大纲工作区**：保持 `chatAreaOpen` 语义；石墨化只作用于大纲容器与分隔线，不改变大纲/编辑/Chat 的面积关系。
8. **验证矩阵扩展**：视觉矩阵在原“主题×密度×视口×页面”外，追加布局状态维度：默认布局、chapter 最小、chapter 最大、chat 最小、chat 最大、自定义后刷新；断言刷新后宽度持久、重置后回到 18%/28%。

### 第 9 轮：性能与机器门禁

1. **backdrop-filter 清理**  
   `.modal-overlay`、`.panel-overlay`、`.loading-overlay`、`RunTracePanel`、`AiNamingModal` 全量 token 化。  
   light 与 dark 均去 blur（用户已确认）；遮罩统一改用 `--overlay-blur: none` 与透明度表达，禁止大面积叠加 backdrop-filter。

2. **will-change 清理**  
   `.btn`、`.card-item`、`.pl-card` 的常驻 `will-change: transform` 移除，仅在动画类上短期使用。

3. **动画收敛**  
   30+ keyframes 归并为 fade、slide、scale、spin、pulse、shimmer 六族。  
   删除未引用 keyframes，同名重复定义只保留一份。

4. **stylelint 修复**  
   当前 `npx stylelint "src/**/*.{css,vue}"` 因缺 Vue custom syntax 报 46 个 CssSyntaxError，并有 15 个 spacing warning。  
   不新增 npm 依赖：先用脚本抽取 Vue `<style>` 到临时文件参与 lint；CSS 文件直接 lint。  
   规则扩展：`font-size`、`color`、`background-color`、`border-color`、`box-shadow`、`border-radius` 必须 token / var。  
   `--shadow-` 空引用清零：`AiNamingModal.vue:365`、`ApiSettings.vue:441/446`。

5. **扫描门禁**  
   每阶段结束执行：硬编码色扫描、空 token 扫描、overlay 类名扫描、z-index 扫描、backdrop-filter 扫描。

### 第 10 轮：验证闭环

每阶段必须通过：

```text
npm run type-check
npm run build:vue
npx vitest run
node scripts/verify-app-confirm-layering.mjs
```

视觉验证矩阵：

| 维度 | 取值 |
|---|---|
| 主题 | light / dark |
| 密度 | default / comfortable / compact |
| 视口 | 375 / 760 / 1024 / 1440 / 1920 |
| 页面 | 主页三栏、大纲、流水线、设置、记忆图谱、运行记录、模态嵌套 |
| 布局状态 | 默认 18%/28%、chapter 最小/最大、chat 最小/最大、自定义后刷新、恢复默认 |

每个阶段保留 before / after 截图；不得用“代码看起来对”替代截图。

## 4. 全组件覆盖矩阵

| 分组 | 组件 | 处理 |
|---|---|---|
| 应用外壳 | App、SidebarNav、ChapterTree、AgentProgressPanel、BreadcrumbBar | P0 hairline / veil / tooltip / icon |
| 主创作 | EditorPanel、ChatPanel、ChatMessage、ApiChatInput、OutlineWorkspace | P1 内容降噪，不改字体与输入单源 |
| 流水线 | PipelinePanel、PipelineFlow、GenerationProgressBar | P2 数据面板统一 |
| DeAI | DeAiProgress、DeAiFlowPreview、DeAiSettings | P2 状态与进度统一 |
| 运行记录 | RunTracePanel、RunTraceDiffPanel、TextDiffView、RealSkillDiagnosticsPanel、DiagLogPanel | P3 数据阅读优化 |
| 记忆 | MemoryPanel、MemoryHistoryModal、G6Canvas、TimelineView、MindMap、RelationGraph、GraphAnalysis、CharacterCard | P3 主题 token + G6 硬编码色清零 |
| 设置 | SettingsModal、AppearanceSettings、ApiSettings、AgentSettings、SkillSettings、McpSettings | P4 设置页灰阶外壳 |
| 通用模态 | AppConfirmModal、ExitConfirmModal、HelpGuide、TopSheet、InlineMenu、DiffModal、ProjectModal、PluginMarket、SkillBindModal、AiNamingModal、DashboardModal | P4 模态基类归一 |
| 样式源 | tokens.css、global.css、modal.css、base-components.css、ai-content.css | P0-P4 单源 token 化 |

## 5. 阶段计划

### P0：Token 底座与坏值清零

- 新增 hairline / veil / ink / overlay token。
- 清理 `--shadow-` 空引用、重复 token、明显坏值。
- 旧实现清零：重复 token、别名 token、`--shadow-` 空引用、已迁移坏值全部删除，不保留“兼容旧名”。
- 验收：type-check、build、stylelint CSS 部分、token 扫描 0 违规、legacy 扫描器 0 命中。

### P1：外壳与反馈系统
 
- Sidebar、ChapterTree、Breadcrumb、工具栏、Toast、Tooltip、EmptyState。
- 格局：splitter hairline 化、拖拽 tooltip 接统一 Tooltip；保留 `useResizers` 行为单源。
- 旧实现清零：旧 tooltip 写法、旧 toast 组件、内联临时 toast、分裂空态类名全部删除或改接单源。
- 验收：双主题截图、键盘路径、tooltip 统一扫描、toast 三套旧实现残留清零、legacy 扫描器 0 命中。

### P2：创作与流水线

- Editor、Chat、Outline、Pipeline、DeAI。
- 旧实现清零：编辑器旧工具栏符号、Chat 旧气泡硬编码色、ai-content 旧代码块色、组件级三档密度样式全部删除。
- 验收：三密度截图、长文滚动性能、生成/失败/取消状态可读、legacy 扫描器 0 命中。

### P3：记忆与诊断

- Memory、G6、RunTrace、Diff、DiagLog。
- 旧实现清零：G6 硬编码色、Memory 旧状态 chip 色、RunTrace/AiNaming 旧 overlay 写法全部删除。
- 验收：G6 硬编码色清零、diff 语义保留、双主题图谱对比度、legacy 扫描器 0 命中。

### P4：模态与设置
 
- modal 基类、overlay 归一、Settings 全页面。
- 外观设置新增布局组：三栏预设与恢复默认布局；全部通过 `useResizers` 单源配置执行。
- 旧实现清零：`.pl-overlay` 等七类旧 overlay 类名、旧三段式局部实现、Settings 旧手写规则清单全部删除。
- 验收：嵌套模态层级、app-confirm 层级回归、设置页视觉一致、legacy 扫描器 0 命中。

### P5：动画与性能

- keyframes 归并、will-change 清理、backdrop-filter 限额。
- 旧实现清零：未引用 keyframes、同名重复定义、常驻 will-change、未 token 化 blur 全部删除。
- 验收：reduced motion、动画引用扫描、渲染帧率抽查、legacy 扫描器 0 命中。

### P6：文档与经验回写

- 更新 UI 规格参考书、DEV_LOG、经验总结。
- 旧实现清零：文档中的旧 token 名、旧类名、旧规则要求、旧验收语句全部重写或删除；经验文件若新增设计门禁，必须合并进 v5 现行章节并删除被替代旧条。
- 验收：文档与 tokens.css 一致，无旧规则残留，`rg` 旧规则名 0 活跃命中。

## 6. 新旧并存清零治理（做新去旧铁律）

这一节是本方案的执行红线，依据现行经验文件 M17、M20、M26、M27、M28 与 §4 规则 10-11 收口。任何阶段只要出现“新规则已上线、旧规则仍可执行”，该阶段一律判 FAIL，不允许用“新规则覆盖率高”替代“旧规则清零”。

### 6.1 治理原则

1. **单一事实源**：每个设计语义只能有一个现役实现。token 定义只在 `tokens.css`；Toast 只能走统一 service；Tooltip 只能走统一指令/属性；EmptyState 只能走统一组件；overlay 层级只能走 modal 基类与统一层级表。
2. **做新必须去旧**：新增 token、类名、组件或验证器时，必须同步删除被替代的旧实现；禁止以注释保留、以别名兼容、以“暂时双轨”名义并存。
3. **兼容例外必须显式**：确因外部数据或第三方 API 需要保留旧名时，只能在方案中列出白名单、写明过期时间和删除阶段；未列入白名单的命中即违规。
4. **文档同权**：规格书、经验总结、DEV_LOG 中的旧规则要求视同旧实现；M20 明确“现役规格、教学与测试不得继续要求已删除链路”。
5. **产物同权**：M28 要求 E2E 读取 `dist-renderer` 前校验 bundle 新于全部 `src` 源文件；不允许新源码配旧产物通过验证。

### 6.2 七面清零矩阵

每个阶段完成前，按 M26 建立旧链路矩阵并逐面清零：

| 面 | 本项目对应物 | 清零标准 |
|---|---|---|
| 生产入口 | 组件模板、样式源、服务层样式常量 | 旧类名/旧 token/旧色值不再被生产代码引用 |
| UI 层 | 47 个 Vue 组件的 class、内联样式、局部 style | 旧写法无活跃命中；负向断言不算残留，必须人工区分 |
| 测试 | spec、E2E、夹具 | 不再断言旧类名、旧 token、旧交互；测试守护新设计意图 |
| 脚本 | `scripts/verify-*`、扫描器、构建脚本 | 不再扫描或生成旧实现；扫描器自身不得残留旧断言 |
| 规格文档 | UI 规格参考书、社区经验提取、本方案 | 旧规则重写或删除；不得继续要求旧链路 |
| 日志 / trace 字段 | DEV_LOG、经验总结、诊断字段 | 观测语义与新规则一致；历史 DEV_LOG 是事实记录不改写，但“现役指引”必须指向新规则 |
| 构建产物 | `dist-renderer`、安装产物 | E2E 前重建并校验新鲜度；旧安装包按 M29 分层清理，不误删未提交源码 |

### 6.3 机器扫描器

新增 `scripts/verify-design-fusion-legacy.mjs`，作为每阶段必跑门禁，不新增 npm 依赖：

1. **旧 token 扫描**：被替代 token 名、`--shadow-` 空引用、重复定义、无消费者 token。
2. **旧类名扫描**：已归一的 overlay 类名、旧 toast 类名、旧空态类名、旧 tooltip 写法。
3. **硬编码值扫描**：已迁移作用域内的 hex / rgba / hsl、非 token 的 blur、组件级密度三档样式。
4. **z-index 扫描**：与层级表冲突的散点值，白名单只允许层级表声明的值。
5. **动画扫描**：未引用 keyframes、同名重复定义、常驻 will-change。
6. **文档扫描**：规格文档与经验文件中的旧规则名，历史 DEV_LOG 与审计事实目录排除。
7. **白名单机制**：白名单必须内联在扫描器顶部，包含文件、模式、理由、删除阶段；扫描输出逐条列出命中与白名单解释。

扫描器退出码规则：非白名单命中大于 0 即 exit 1；输出必须包含扫描范围、命中文件、行号与清理建议，不允许只报数量。

### 6.4 执行流程

1. **阶段前**：为该阶段列“将被替代的旧实现清单”，逐项登记文件与预计删除点；先跑 legacy 扫描器取得 before 基线。
2. **阶段中**：新实现与旧实现删除必须同批完成；测试同步改为守护新契约，禁止让旧测试继续要求旧样式。
3. **阶段后**：跑 legacy 扫描器取得 after 基线，非白名单命中必须为 0；按 M17 回头看对 `src`、`scripts`、`docs`、`_audit` 四面执行 `rg` 旧规则名复核。
4. **判停规则**：扫描器 0 命中但人工抽查发现旧实现仍可执行，视为扫描器缺陷，先修扫描器再重跑；不允许调大白名单换取绿灯。
5. **经验回写**：若本阶段沉淀出新的通用规则，按经验回写铁律并入 `_audit/神意开发经验总结_v6.md` 对应层级，并按 v6 维护规则处置旧条；过程事实只写 DEV_LOG。

### 6.5 新旧并存高危点

| 高危点 | 风险 | 清零动作 |
|---|---|---|
| token 别名 | 新旧 token 都能改同一个视觉 | 删除别名，保留一个语义名 |
| Toast 三套实现 | 同一语义不同动画与层级 | 只留 service，旧组件删除 |
| Tooltip 三套写法 | 可访问性与样式分叉 | 只留统一属性 + CSS，局部实现删除 |
| overlay 七类类名 | 层级和遮罩规则分叉 | 归入 modal 基类，旧类名删除 |
| G6 硬编码色 | light/dark 双主题漏迁移 | 迁入 token 后旧色值删除 |
| 组件级密度样式 | 与 `[data-density]` 双轨 | 删除组件级三档，只走 token |
| 组件旁路写布局 | 绕过 `useResizers` 直接改三栏宽度 | 布局预设与恢复只能走单源配置 |
| stylelint 假门禁 | 旧规则报错被习惯性忽略 | 修好 Vue style 抽取后，坏规则立即删除或改写 |
| 文档旧要求 | 后续开发者按旧规格回写旧实现 | 规格书同步重写，经验文件去旧并入 |
| 旧构建产物 | 新代码配旧 bundle 通过假验证 | E2E 前强制 build 与新鲜度校验 |

### 6.6 删除边界总纲：能删、慎删、禁删

删除不是“顺手清理”。每个候选删除项必须先过四问：①它是不是同一设计语义的旧实现；②它有没有生产消费者；③删除会不会改变交互、数据、层级或权限行为；④它是不是既有方案已固化的不可推翻项。四问答案分别决定“可删”“慎删”“禁删”。

**可删**：仅限“被新单源替代的视觉残留”，且 `rg` 消费者清零或消费者已全部迁移。删除前登记文件与行号，删除后跑 legacy 扫描器和构建验证。

**慎删**：有消费者但语义重复、或删除会触发跨组件样式级联。必须先迁移消费者，再删除旧名；禁止先删后等报错。

**禁删**：交互、数据、层级、权限、输入、字体链路、用户设置和已验证的结构骨架。即使视觉上“看起来可合并”，也只改外观 token，不动行为面。

删除操作必须遵守 M1 影响圈与 M2 整文件操作禁令：先列“打算删的”和“可能碰到的”，逐行 patch，不做整文件重写；历史 DEV_LOG 与审计事实目录不删不改。

#### A. 可删清单（本方案负责删除）

| 删除对象 | 证据 | 删除阶段 | 迁移要求 |
|---|---|---|---|
| `--shadow-` 空引用 | `AiNamingModal.vue:365`、`ApiSettings.vue:441/446` | P0 | 直接删除或改为有效 token；不改布局 |
| `--radius-btn` / `--btn-radius` 双名 | `tokens.css` 同时定义，消费者混用 `--btn-radius` | P0 | 全部统一为 `--btn-radius` 后删 `--radius-btn` |
| `--space-xxs/xs/sm/md/lg/xl/s/sm-plus/md-plus/2xl` 别名层 | `tokens.css:139-151`；统计显示消费者集中在少量组件 | P0 | 消费者改数值名后删别名；`space-s/sm-plus/md-plus/2xl` 先确认无生产消费者再删 |
| `--shadow-xs/sm/md/lg/xl` 重复定义 | light 主题先定义一套、后一套覆盖 | P0 | 保留一套暖影定义，删除被覆盖的旧块 |
| `--accent-dim/glow/soft` 重复定义 | light 主题同值两段定义 | P0 | 保留最终 alpha 0.16/0.24/0.16 一套 |
| Toast 旧组件与内联 toast | AiNamingModal 内联 toast；DOM/notyf/组件三套并存 | P1 | 统一 service 后删除旧入口 |
| Tooltip 旧写法 | `title` 兜底与局部 tooltip | P1 | 统一 data-tooltip 后删除局部实现 |
| 分裂空态类名 | `empty-hint`、`naming-empty` 等 | P1 | EmptyState 接管后删除旧类 |
| Chat 旧硬编码色 | Chat 气泡和状态色未全 token | P2 | 迁入语义 token 后删硬编码 |
| ai-content 旧代码块色 | 代码块颜色未 token | P2 | token 化后删旧值 |
| G6 组件内硬编码色 | MindMap、RelationGraph、TimelineView 等仍有旧色 | P3 | 迁入 `--g6-*` 后删旧色值 |
| Memory 状态 chip 旧 rgba/hex | 组件局部硬编码 | P3 | 迁入状态 token 后删 |
| 七类 overlay 旧类名 | `.pl-overlay/.ow-overlay/.pm-overlay/.dash-overlay/.mem-overlay/.rt-overlay/.naming-overlay` | P4 | 归入 modal 基类后删旧类 |
| 未引用 keyframes | `global.css` 大量历史 keyframes | P5 | 引用扫描 0 后删除 |
| 同名重复 keyframes | `toastSlideInRight/Out` 等重复定义 | P5 | 保留六族标准动画 |
| 常驻 `will-change` | `.btn/.card-item/.pl-card/.panel-overlay/.loading-overlay` | P5 | 删除常驻声明，仅动画期使用 |
| 文档旧规则名 | 规格书与经验文件要求旧 token/类名 | P6 | 重写为新规则后删旧句 |

#### B. 慎删清单（先迁移，后删除）

| 慎删对象 | 原因 | 迁移条件 |
|---|---|---|
| `--space-7/--space-12/--space-0` | 目前在 `:root` 补丁区定义，但大量组件消费 | 先补进基础 spacing 尺度，确认数值不变，再移出补丁区 |
| `--danger-hover/--accent-dim/--success-dim` 空引用风险 | `:root` 段被引用但定义在 light 段或补丁区 | 先把基础色阶补进 dark `:root`，验证 dark/light 后再整理 |
| `--btn-lg-height` 与 density token fallback | `--density-btn-lg-height` 使用 fallback | 先确认 fallback 是否真实兜底，再决定保留或删除 |
| `--font-size-md` | 注释说明与 `--text-*` 无对应 | 不在本方案删除；仅在设计系统重构阶段处理 |
| `.toast/.notyf/.dom-toast-container` 样式 | 统一 Toast service 后仍需容器样式 | 先确认新容器类名接管，再删旧容器样式 |
| `.confirm-backdrop/.confirm-dialog` | 语义与 app-confirm 相近但服务旧确认链路 | 先确认生产入口为 0，再删除；`app-confirm=9000` 不动 |
| 组件级 `z-index:100/2000/2100/2200/5000/9997/9999/10000` | 直接删除会造成层级坍塌 | 先迁入层级表 token，再删散点值 |
| `--ls-tight` | 负字距与本项目“0 字距”设计原则冲突 | 若迁移到 0，需先跑双主题文本截图；不作为本方案必删项 |
| `--will-change-transform/opacity` | 无消费者则删；有动画消费者则改为局部使用 | 引用扫描后再定 |
| 旧 overlay 尺寸/背景/圆角样式 | 只删类名会破坏容器 | 先让组件消费 modal 基类，再删局部样式 |
| 历史规格文档旧描述 | M20 要求现役文档清零，但历史 DEV_LOG 是事实 | 规格书重写；DEV_LOG 保留原文，只在索引标注现行版本 |

#### C. 禁删清单（本方案不碰）

| 禁删对象 | 原因 | 保护方式 |
|---|---|---|
| `useModalQueue.ts` 与 `app-confirm=9000` | 全局模态队列与确认层级骨架 | 只改视觉 token；保留队列行为与测试 |
| `ApiChatInput.vue` 输入交互单源 | Enter/Shift+Enter、发送、禁用逻辑 | 只做视觉融合；交互测试守护 |
| PipelinePanel 五层 `v-show` 结构 | 既有行为边界，改 `v-if` 会引入挂载/状态回归 | 样式降噪，不改模板结构 |
| `[data-density]` 三档 token 系统 | Vuetify 对齐密度系统，设置持久化依赖 | 只允许调 token 值，不允许改机制 |
| `theme.ts` 默认 light 与主题切换链路 | 用户设置与启动状态 | 不改状态机 |
| LXGW 文楷字体链路 | 内容域不可推翻项，`fonts.css` 本地字体加载 | 不改字体族和加载 |
| 语义色 token：success/danger/warning/info/diff/记忆状态 | 语义域不灰阶化 | 只可调对比度，不可删除或改义 |
| `--z-modal/--z-toast/--z-tooltip` 基础层级 token | 层级表骨架 | 只可新增中间层 token，不可删除基础层 |
| `AppearanceSettings` 的密度/主题持久化逻辑 | 用户数据 | 禁止用视觉重构覆盖配置 |
| `useResizers.ts` 的拖拽/夹取/重置/持久化逻辑 | 布局行为骨架与用户已保存宽度 | 只改视觉层与增加单源预设入口，不改行为 |
| 大纲工作区 `chatAreaOpen` 状态 | 大纲区独立布局语义 | 只降噪容器视觉，不改开关语义 |
| `shenyi_resizer_chapter/chat` localStorage key | 用户格局数据迁移边界 | 禁止改名；新增设置不得复用旧 key |
| `reduced-motion` 全局规则 | 可访问性 | 只允许收紧，不允许删除 |
| 历史 DEV_LOG、审计事实、对账表 | 过程事实与证据链 | 不删不改；现役指引指向新方案 |
| 测试中守护行为契约的断言 | M10 禁止为了视觉改动削弱行为测试 | 只改样式选择器断言，不改行为断言 |

### 6.7 删除判定门

每个删除动作执行前必须生成一行判定记录，格式固定：

```text
DELETE-CHECK | 对象 | 类别(可删/慎删/禁删) | 消费者数 | 行为影响 | 迁移点 | 阶段 | 证据命令
```

执行规则：

1. **可删**：`rg` 消费者数为 0，或消费者已在同一批 diff 迁移；跑 type-check / build / legacy 扫描器。
2. **慎删**：先输出迁移 diff，再输出删除 diff；两者必须同阶段完成；删除后必须有双主题截图证据。
3. **禁删**：禁止进入删除 diff；如视觉需要变化，只允许修改外观 token，并在 DEV_LOG 登记原因。
4. **判定冲突**：当对象同时出现在多个清单时，以最严格类别为准；扫描器发现禁删对象被删除时直接 FAIL。
5. **回滚单元**：可删项按语义分组回滚；禁删项不进入回滚范围，防止回滚动作破坏行为骨架。

### 6.8 文件级删除边界

| 文件 / 层 | 边界 |
|---|---|
| `src/styles/tokens.css` | 可删别名、重复定义、空引用；禁删基础语义 token、密度系统、层级 token、字体 token |
| `src/styles/global.css` | 可删未引用 keyframes、旧 toast 样式；慎删共享组件类；禁删全局 focus / reduced-motion / 主题入口 |
| `src/styles/modal.css` | 可删被替代局部规则；禁删 modal 基类结构与嵌套层级 token |
| `src/styles/base-components.css` | 可删常驻 will-change、重复 `.btn` 定义；慎删旧 confirm 样式；禁删按钮/卡片基础结构 |
| `src/styles/ai-content.css` | 可删旧硬编码色；禁删 Markdown 内容排版与 em 阅读节奏 |
| 组件 `<style>` | 可删被 token 替代的硬编码值；慎删局部布局；禁删模板结构和行为类 |
| `scripts/verify-*` | 可删假门禁与被替代旧扫描器；慎删旧 E2E；禁删层级验证与行为回归 |
| `docs` 现役规格 | 可删旧规则句；禁删历史对账表与事实记录 |
| `_audit` | 只新增 DEV_LOG / 更新索引；禁删历史日志、方案、对账、经验规则原文归档 |
| `dist-renderer` / 安装产物 | 按 M28/M29 清理旧产物；禁删未提交源码 |

## 7. 风险与回滚

| 风险 | 防线 |
|---|---|
| light 主题灰阶过度，语义弱化 | 三域策略 + 语义色不迁移 + 截图审查 |
| 模态层级回归 | `verify-app-confirm-layering.mjs` + 嵌套模态矩阵 |
| token 改动爆炸半径 | 每阶段只开一个主题域，先样式源后组件 |
| 图谱 light 可读性差 | G6 token 化后单独做对比度截图 |
| Vue lint 假门禁 | 临时抽取脚本 + CSS lint + 自定义扫描器并行 |
| 交互单源被破坏 | ApiChatInput、modal queue、v-show 结构不动，测试守护 |
| 新规则上线后旧规则残存 | legacy 扫描器 0 命中 + M17 四面 `rg` 复核 + 白名单显式化 |
| 白名单变成永久豁免 | 白名单必须带删除阶段；P6 复审未删除即 FAIL |

回滚原则：只回滚当前阶段的视觉 token，不推翻已验证的结构收口；发现新 bug 时精准修复，不整体回退。

## 8. 用户决策记录（已全部确认）

2026-09-20 用户确认结果：

1. **图标方案**：统一采纳建议。执行为 16px 线性图标、内部 SVG 组件库、不新增 npm 依赖。
2. **light 主题灰阶深度**：完全采用石墨灰阶。外壳域 `#ffffff / #f9f9f9 / #0d0d0d`，不再保留 Notion 暖纸倾向。
3. **dark 主题 blur**：接受建议。dark 与 light 一致去 blur。
4. **阶段顺序**：按默认 P0-P6 顺序执行。

以上 4 项已锁定并同步写入 §2.4；任何执行阶段的方案文本不得再出现“待确认”“二选一”“建议取舍”表述。
