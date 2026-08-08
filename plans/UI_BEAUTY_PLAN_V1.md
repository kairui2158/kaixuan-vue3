# 小说工坊 UI 全面深度美容计划 V1

## 一、参考项目（GitHub 开源）

以下项目经过筛选，符合"纯 CSS、无 npm 依赖"约束，可借鉴其设计令牌、间距体系、按钮规范：

| 项目 | GitHub | 星数 | 借鉴点 |
|------|--------|------|--------|
| Open Props | argyleink/open-props | 4.2k+ | CSS 设计令牌体系：间距刻度、尺寸刻度、颜色系统、动画库 |
| Pico CSS | picocss/picocss.com | 14k+ | 无类名 CSS 框架：按钮、表单、排版默认值、间距规范 |
| Vanilla CSS Design System | pattespatte/vanilla-css-design-system | - | 纯 CSS 设计系统，无 SCSS/JS |
| shadcn/ui | shadcn-ui/ui | 70k+ | 现代 UI 组件设计范本：按钮四态、间距、圆角、阴影 |
| GitHub Primer | primer/github | 12k+ | GitHub 官方设计系统：专业、简洁、一致的间距 |
| Seed Framework | helpscout/seed | 1.6k+ | 组件优先 CSS 设计系统：统一间距刻度 |
| Hyper | ilkeryilmaz/hyper | - | 组件优先 CSS 设计系统 |
| CSSonly | marusti/CSSonly | - | 纯 CSS UI Kit：响应式组件 |
| Matcha CSS | seppwc/matchacss | - | 极简 CSS 设计系统，语义化 HTML |
| zi-ui-skill | bravohenry/zi-ui-skill | - | 令牌驱动 CSS 设计系统，打包为 Agent Skill |

## 二、当前问题诊断

### 2.1 按钮间距混乱（最严重）
当前按钮 padding 值有 7 种不同组合：
- 2px 6px（.btn-var, .sc-attr-row .btn-sm）
- 4px 10px（.btn-sm）
- 6px 14px（.btn-primary, .btn-secondary, .btn-danger）
- 7px 18px（某处）
- 4px 12px（.btn-back-sm）
- 2px 8px
- 4px 8px

### 2.2 按钮定义重复
同一类名被多次定义：
- .btn-primary 在 L516, L1229, L1433 三处定义，padding 各不相同
- .btn-secondary 在 L520, L1247, L1437 三处定义
- .btn-sm 在 L561, L1258, L2467 三处定义
- .btn-danger 在 L1265, L1440, L2553 三处定义

### 2.3 间距体系缺失
gap 值有 6 种：3px, 4px, 6px, 8px, 12px, 16px — 没有统一刻度
padding 硬编码值超过 40 种不同组合，大量未使用 CSS 变量

### 2.4 按钮高度不统一
- .btn-var: min-height 24px
- 某些按钮: height 28px
- .btn-sm: 无固定高度
- 工具栏按钮: 无统一高度

### 2.5 其他问题
- 工具栏按钮排列无统一 gap
- 弹窗内按钮间距不统一
- 编辑器工具栏按钮拥挤
- 表单输入框高度与按钮不匹配
- 侧边栏图标按钮间距不一致

## 三、美容方案（10 个领域）

### 领域 1：间距刻度体系（借鉴 Open Props）
建立 8px 基准的间距刻度：
```
--space-0: 0px;
--space-1: 2px;   /* 微间距 */
--space-2: 4px;   /* 小间距 */
--space-3: 6px;   /* 紧凑 */
--space-4: 8px;   /* 基准 */
--space-5: 12px;  /* 中等 */
--space-6: 16px;  /* 标准 */
--space-7: 20px;  /* 宽松 */
--space-8: 24px;  /* 大间距 */
--space-10: 32px; /* 区块间距 */
--space-12: 40px; /* 页面间距 */
```
全局替换所有硬编码间距值为刻度变量。

### 领域 2：按钮设计系统（借鉴 shadcn/ui + Pico CSS）
统一按钮为 4 种尺寸 + 5 种变体：

尺寸：
- xs: padding 2px 8px, height 24px, font-size 11px
- sm: padding 4px 12px, height 28px, font-size 12px
- md: padding 6px 16px, height 32px, font-size 13px（默认）
- lg: padding 8px 20px, height 38px, font-size 14px

变体：
- primary: 强调色背景
- secondary: 三级背景 + 边框
- danger: 红色背景
- ghost: 透明背景，hover 显示
- icon: 方形按钮，仅图标

每个按钮统一四态：default → hover → active → disabled
删除所有重复定义，只保留一套。

### 领域 3：工具栏按钮排列（借鉴 GitHub Primer）
- 统一 gap: var(--space-2) (4px)
- 按钮组之间分隔符: var(--space-3) (6px)
- 所有工具栏按钮统一高度: 28px
- 按钮组用 flex + gap，不再用 margin

### 领域 4：弹窗/对话框 UI（借鉴 shadcn/ui）
- 统一弹窗 padding: var(--space-6) (16px)
- 弹窗标题与内容间距: var(--space-4) (8px)
- 弹窗底部按钮区: 右对齐，按钮间 gap var(--space-2) (4px)
- 弹窗圆角: var(--radius-lg) (12px)
- 弹窗阴影: var(--shadow-xl)
- 背景遮罩: backdrop-blur(8px) + rgba(0,0,0,0.5)

### 领域 5：表单控件统一（借鉴 Pico CSS）
- 所有 input/select/textarea 统一高度: 32px（与 md 按钮匹配）
- padding: 6px 12px
- border-radius: var(--radius-sm) (6px)
- focus 状态: 2px solid var(--accent) + 轻微 glow
- label 与控件间距: var(--space-2) (4px)
- 表单项之间间距: var(--space-4) (8px)

### 领域 6：卡片/列表项 UI（借鉴 shadcn/ui）
- 卡片 padding: var(--space-5) (12px)
- 卡片间距: var(--space-3) (6px)
- 卡片圆角: var(--radius) (8px)
- 卡片边框: 1px solid var(--border-color)
- hover: border-color 变亮 + 微微上浮 (translateY(-1px))
- 卡片内标题与内容间距: var(--space-2) (4px)

### 领域 7：编辑器 UI（借鉴 Typora + Notion）
- 编辑器内边距: 24px 32px
- 段落间距: 1.2em
- 工具栏高度: 36px
- 工具栏按钮: 28px x 28px 方形
- 工具栏按钮 gap: 2px
- 工具栏分组分隔符: 1px solid var(--border-color) + margin 0 4px
- 编辑器最大宽度: 720px 居中

### 领域 8：侧边栏/导航 UI（借鉴 VS Code）
- 侧边栏宽度: 48px（图标模式）
- 图标按钮: 36px x 36px 方形
- 图标按钮 gap: var(--space-1) (2px)
- active 状态: 左侧 2px 强调色竖条 + 背景高亮
- tooltip 出现延迟: 0.3s

### 领域 9：聊天气泡 UI（借鉴 ChatGPT）
- 用户气泡: 右对齐，圆角 12px 12px 4px 12px
- AI 气泡: 左对齐，圆角 12px 12px 12px 4px
- 气泡最大宽度: 80%
- 气泡 padding: var(--space-3) var(--space-5) (6px 12px)
- 气泡间距: var(--space-3) (6px)
- 输入框高度: 40px
- 发送按钮: 32px x 32px 圆形

### 领域 10：动画/过渡系统（借鉴 Open Props）
统一过渡时长：
- --ease-fast: 0.1s ease-out
- --ease: 0.15s ease-out
- --ease-slow: 0.25s cubic-bezier(0.4, 0, 0.2, 1)
- --ease-bounce: 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)

统一动画：
- 按钮点击: scale(0.97) 0.1s
- 面板打开: translateY(8px) → 0, opacity 0 → 1, 0.2s
- Toast 出现: translateY(-100%) → 0, 0.3s bounce
- 列表项 hover: translateY(-1px), 0.15s
- 模态框: scale(0.96) → 1, opacity 0 → 1, 0.2s

## 四、执行顺序

1. 建立间距刻度变量（领域 1）
2. 统一按钮系统，删除重复定义（领域 2）
3. 统一工具栏排列（领域 3）
4. 美化弹窗/对话框（领域 4）
5. 统一表单控件（领域 5）
6. 美化卡片/列表项（领域 6）
7. 美化编辑器（领域 7）
8. 美化侧边栏/导航（领域 8）
9. 美化聊天气泡（领域 9）
10. 统一动画系统（领域 10）
11. 截图验证每个领域
12. 清理重复 CSS 定义
13. 提交推送

## 五、验证标准

- 每个领域修改后截图对比
- CSS 大括号平衡检查
- node --check 语法验证
- 启动应用检查中文无乱码
- 按钮间距用浏览器 DevTools 测量确认统一
- 门禁脚本通过
