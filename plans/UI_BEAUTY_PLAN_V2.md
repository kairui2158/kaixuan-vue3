# 小说工坊 UI 全面深度美容计划 V2（深层版）

## 参考项目（GitHub 开源，纯 CSS 无依赖）

| 项目 | 借鉴点 |
|------|--------|
| Open Props (argyleink/open-props, 4.2k星) | CSS 设计令牌黄金标准：间距/尺寸/颜色/动画刻度体系 |
| Pico CSS (picocss/picocss.com, 14k星) | 按钮表单排版美丽默认值，classless 理念 |
| shadcn/ui (shadcn-ui/ui, 70k星) | 现代 UI 组件范本：按钮四态、圆角、阴影、间距 |
| GitHub Primer (primer/github, 12k星) | GitHub 官方设计系统：专业简洁一致的间距 |
| Vanilla CSS Design System | 纯 CSS 设计系统，无 SCSS/JS |
| Seed Framework (helpscout/seed, 1.6k星) | 组件优先 CSS 设计系统，统一间距刻度 |
| Matcha CSS | 极简 CSS 设计系统，语义化 HTML |

## 深层问题诊断（25 项）

### A. 数值混乱（最严重）

| 问题 | 现状 | 目标 |
|------|------|------|
| 硬编码 font-size | 92 处直接写 px，不使用变量 | 全部替换为 var(--font-size-*) |
| 硬编码 border-radius | 25+ 处：1px/2px/3px/4px/6px/8px/10px 七种 | 全部替换为 var(--radius-*) |
| 硬编码 transition | 20+ 处：0.15s/0.2s/0.3s 混用 | 全部替换为 var(--transition-*) |
| 硬编码 box-shadow | 40+ 处自定义阴影 | 全部替换为 var(--shadow-*) |
| 按钮定义重复 | .btn-primary/.btn-secondary/.btn-sm/.btn-danger 各被定义 3 次 | 每个只保留 1 次定义 |
| 按钮间距 | 7 种不同 padding 组合 | 统一为 4 种标准尺寸 |
| gap 值 | 6 种：3/4/6/8/12/16px | 统一为 8px 基准刻度 |
| line-height | 6 种：1/1.4/1.5/1.6/1.7/1.8 | 3 种：tight(1.3)/normal(1.6)/loose(1.8) |
| font-weight | 4 种混用 bold/500/600/700 | 4 个变量：normal(400)/medium(500)/semibold(600)/bold(700) |
| opacity | 10 种：0/0.3/0.4/0.45/0.5/0.6/0.7/0.85/1 | 5 级刻度：0/0.3/0.5/0.7/1 |
| transform | 30+ 种不同值 | 标准化为 6 种常用变换 |
| letter-spacing | 仅 2 处声明 | 建立标题/正文/标签 3 级 |

### B. 缺失组件

| 缺失 | 影响 | 方案 |
|------|------|------|
| tag/chip 组件 | 无法显示设定标签、技能标签 | 新增 .tag/.chip 组件样式 |
| avatar 组件 | 无用户/AI 头像区分 | 新增 .avatar 圆形组件 |
| 搜索框样式 | 搜索体验差 | 新增 .search-input 带图标样式 |
| 拖拽区域 | Electron 窗口无法拖拽 | 新增 -webkit-app-region: drag |

### C. 可访问性缺失

| 缺失 | 现状 | 目标 |
|------|------|------|
| focus-visible | 152 个交互元素，仅 4 个有 focus-visible | 所有 button/input/link/select 加 focus-visible |
| prefers-reduced-motion | 0 处 | 新增媒体查询，禁用动画 |
| color-scheme | 0 处 | 声明 color-scheme: dark，原生表单/滚动条适配暗色 |
| button min-width | 0 处 | 所有按钮加 min-width 防止文字撑开布局 |

### D. 性能优化缺失

| 缺失 | 影响 | 方案 |
|------|------|------|
| will-change | 动画卡顿 | 在频繁动画元素上加 will-change: transform |
| content-visibility | 长列表渲染慢 | 章节树/设定列表加 content-visibility: auto |
| overscroll-behavior | 滚动穿透 | 面板内滚动区加 overscroll-behavior: contain |

### E. 文本处理缺失

| 缺失 | 影响 | 方案 |
|------|------|------|
| -webkit-line-clamp | 多行截断不优雅 | 新增 .clamp-2/.clamp-3 工具类 |
| user-select 控制 | 用户误选按钮文字 | 按钮加 user-select: none |
| aspect-ratio | 布局抖动 | 头像/图标容器加 aspect-ratio |

## 执行计划（15 个领域，按优先级排序）

### P0：基础设施（必须先做）

**领域 1：设计令牌体系重建**
- 扩展间距刻度：--space-0 到 --space-12（8px 基准）
- 新增排版刻度：--lh-tight/normal/loose, --fw-normal/medium/semibold/bold
- 新增 opacity 刻度：--opacity-0/30/50/70/100
- 新增 letter-spacing：--ls-tight/normal/wide
- 新增 transform 标准集：--tf-press/lift/none
- 声明 color-scheme: dark
- 新增 --ease-bounce 缓动函数

**领域 2：按钮系统统一**
- 删除所有重复按钮定义（每类只保留 1 处）
- 4 种尺寸：xs(24px高)/sm(28px)/md(32px)/lg(38px)
- 5 种变体：primary/secondary/danger/ghost/icon
- 每个按钮统一四态 + focus-visible + min-width + user-select:none
- 所有按钮用 var(--space-*) 替代硬编码 padding

**领域 3：工具栏排列统一**
- 编辑器工具栏：统一 gap var(--space-1)，按钮 28px 高
- 按钮组之间分隔符统一
- 所有工具栏按钮加 white-space: nowrap

### P1：核心组件美化

**领域 4：表单控件统一**
- input/select/textarea 统一高度 32px，与 md 按钮匹配
- 统一 padding/border-radius/focus 状态
- 新增 .search-input 带搜索图标样式
- 新增 checkbox/radio 自定义样式

**领域 5：弹窗/对话框美化**
- 统一 padding/圆角/阴影
- 底部按钮区右对齐 + gap
- 背景遮罩 backdrop-blur
- 弹窗动画统一

**领域 6：卡片/列表项美化**
- 统一卡片 padding/圆角/边框/hover 效果
- 新增 .tag/.chip 组件
- 新增 .avatar 组件
- 列表项加 content-visibility: auto

### P2：区域级美化

**领域 7：编辑器区域**
- 编辑区内边距、段落间距、最大宽度
- 工具栏按钮 28x28 方形
- 字数统计样式

**领域 8：侧边栏/导航**
- 图标按钮 36x36 方形
- active 状态左侧竖条
- tooltip 延迟
- 拖拽区域 -webkit-app-region: drag

**领域 9：章节树**
- 树节点缩进统一
- 展开/折叠图标动画
- 节点 hover/active 状态
- 多行截断 .clamp-2

**领域 10：聊天气泡**
- 用户/AI 气泡圆角不对称
- 气泡间距/padding 统一
- 输入框 + 发送按钮高度匹配
- 代码块样式

**领域 11：面包屑/状态栏**
- 面包屑间距/分隔符样式
- 状态栏固定高度/字体/间距

### P3：全局润色

**领域 12：滚动条/选区**
- 所有滚动区域统一自定义滚动条
- ::selection 统一选区颜色
- overscroll-behavior: contain

**领域 13：动画/过渡统一**
- 替换所有硬编码 transition 为变量
- 统一按钮点击 scale(0.97)
- 统一面板打开/关闭动画
- 新增 prefers-reduced-motion 媒体查询
- 频繁动画元素加 will-change

**领域 14：响应式/断点优化**
- 检查 13 个媒体查询一致性
- 确保全屏/窗口/小屏三种模式都正常
- aspect-ratio 用于固定比例元素

**领域 15：全局硬编码清理**
- 92 处 font-size → 变量
- 25 处 border-radius → 变量
- 40 处 box-shadow → 变量
- 20 处 transition → 变量
- 删除确认无用的 dead CSS

## 验证标准

每个领域完成后：
1. CSS 大括号平衡检查
2. node --check 语法验证
3. 截图对比前后效果
4. 按钮间距用 DevTools 测量确认统一
5. 启动应用检查中文无乱码
6. 门禁脚本通过
7. color-scheme 声明存在
8. focus-visible 覆盖所有交互元素

## 执行顺序

P0（领域1-3）→ P1（领域4-6）→ P2（领域7-11）→ P3（领域12-15）
每个 P 级完成后提交一次，截图验证后再进入下一级。
