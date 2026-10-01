# UI设计经验总结：社区学习提取

> 来源：Cloudscape Design System (AWS) / Carbon Design System (IBM) / Blueprint (Palantir) / Naive UI / Element Plus / Radix UI
> 提取时间：2026-08-20
> 用途：指导神意助手后续所有 UI 调整、弹窗、面板、排版工作

---

## 一、弹窗/模态框设计经验

### 1.1 Overlay 基类统一

社区标准（Cloudscape / Blueprint / Radix）：
- overlay 必须用 position: fixed; inset: 0，不用 top/left/right/bottom 四条声明
- 背景统一用半透明+模糊：background: rgba(0,0,0,0.5); backdrop-filter: blur(4px)
- overlay 用 flex 居中内容，不依赖 margin:auto
- 点击 overlay 背景关闭（@click.self），但内容区不透传

神意现役实现（2026-09-20）：
- 所有弹窗 overlay 统一为 `.modal-overlay`，面板加载层使用共享 overlay 样式，旧 overlay 类名已清零。
- 嵌套弹窗使用 `.modal-overlay.modal-nested`，内容层使用 `--z-modal-nested-content`。
- 遮罩背景与模糊只走 `--overlay-level-1`、`--overlay-blur` 两个 token。
- z-index 全部走层级 token，禁止组件硬编码。

统一写法：
```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-level-1);
  backdrop-filter: var(--overlay-blur);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}
.modal-overlay.modal-nested { z-index: var(--z-modal-nested); }
```

### 1.2 弹窗内容容器

社区标准：
- max-width: 90vw; max-height: 85vh（Carbon / Cloudscape 一致）
- 默认宽度 480-720px，大窗 960px
- border-radius: 12px（Cloudscape）或 8px（Carbon），保持一致
- box-shadow: 0 8px 32px rgba(0,0,0,0.3)
- 内容区用 flex column：header(fixed) > body(scroll) > footer(fixed)

神意当前问题：
- OutlineWorkspace 用 1000px，PipelinePanel 无显式宽度，SettingsModal 用 720px
- border-radius 不一致：有的用 var(--radius-lg)，有的用 8px，有的用 var(--radius-md)

### 1.3 弹窗内三段式结构

社区标准（Carbon / Naive UI）：
```
header: 固定高度 48-56px，含标题 + 关闭按钮，不滚动
body: flex:1 + overflow-y:auto，承载所有内容
footer: 固定高度 52-56px，含操作按钮，右对齐，不滚动
```

神意当前状态：modal.css 已有此结构，但部分组件（PipelinePanel、OutlineWorkspace）用自己的 header/body/footer 类名，不引用基类。

### 1.4 z-index 层级表

社区标准（Blueprint / Radix / Cloudscape 一致推荐）：

| 层级 | 值 | 用途 |
|------|-----|------|
| base | 0 | 正常文档流 |
| dropdown | 100 | 下拉菜单 |
| sticky | 200 | 粘性头部 |
| overlay | 1000 | 面板遮罩 |
| modal | 1100 | 模态框 |
| modal-high | 1500 | 嵌套模态框 |
| toast | 2000 | 通知 |
| tooltip | 3000 | 气泡提示 |

神意现役 z-index 表（2026-09-20）：

| 层级 token | 值 | 用途 |
|------|-----|------|
| --z-inline | 20 | 行内浮层 |
| --z-dropdown | 100 | 下拉菜单 |
| --z-overlay | 500 | 面板遮罩/加载层 |
| --z-modal | 1000 | 模态遮罩 |
| --z-modal-content | 1001 | 模态内容 |
| --z-modal-nested | 1100 | 嵌套模态遮罩 |
| --z-modal-nested-content | 1101 | 嵌套模态内容 |
| --z-toast | 2000 | 通知 |
| --z-tooltip | 3000 | 气泡提示 |
| --z-diagnostics | 4000 | 诊断面板 |

`app-confirm=9000` 为全局确认链路专用层级，由独立脚本守护，不进入普通组件层级表。

---

## 二、窗口布局设计经验

### 2.1 三栏布局

社区标准（VS Code / Notion / Obsidian / 大部分桌面写作工具）：
- 左侧栏：固定或可折叠，200-280px
- 中间编辑区：flex:1，最大宽度 700-900px（阅读舒适宽度），居中
- 右侧栏：300-400px，可折叠
- 可拖拽分隔条：4px 宽，hover 变色

神意当前状态：已有此结构（ChapterTree | resizer | EditorPanel | resizer | ChatPanel），响应式断点已定义。

### 2.2 面板弹出方式

社区标准（VS Code / Figma / Notion）：
- 全屏覆盖面板：从右侧滑入或全屏遮罩，z-index 1000
- 侧边面板：push 模式（推挤主内容区）或 overlay 模式（浮在主内容区上）
- 弹出面板和主界面共享同一套字体、颜色、间距

神意现役状态：全局面板复用 `modal-overlay` 基类与层级 token，MemoryPanel 不再使用 absolute 旁路和硬编码 left；宽度拖拽与预设统一走 `useResizers`。

### 2.3 响应式断点

社区标准（Tailwind / Bootstrap / Carbon 一致）：

| 断点 | 宽度 | 行为 |
|------|------|------|
| xs | <600px | 手机，单栏，隐藏侧边栏 |
| sm | 600-1023px | 平板，侧边栏可折叠 |
| md | 1024-1279px | 小桌面，三栏紧凑 |
| lg | 1280-1599px | 标准桌面，三栏舒适 |
| xl | 1600-2559px | 宽屏，编辑区可加大 |
| 2xl | >=2560px | 超宽屏，限制最大宽度 |

神意当前状态：tokens.css 已有断点定义，但 body font-size 在小屏幕上 clamp 到 11-12px，太小了。

社区建议：body 最小 14px，次级文字最小 13px，标签最小 12px。12px 以下不可读。

---

## 三、排版与字体设计经验

### 3.1 字号阶梯

社区标准（Material Design 3 / Carbon / Apple HIG）：

| 用途 | 推荐字号 | 神意当前 | 差距 |
|------|---------|---------|------|
| 正文/编辑器 | 16px | 14px | 偏小 |
| 正文次级 | 14px | 13px (--font-size-md) | 偏小 |
| 按钮文字 | 14px | 13px (--btn-font-size-md) | 偏小 |
| 标签/辅助 | 12px | 12px (--font-size-sm) | 一致 |
| 标题 | 18-20px | 15px (--font-size-lg) | 偏小 |
| 大标题 | 24px | 20px (--font-size-xxl) | 偏小 |

建议：将 --font-size-md 从 13px 提到 14px，--font-size-sm 从 12px 提到 13px，--font-size-lg 从 15px 提到 16px。

### 3.2 间距系统

社区标准（8px 网格）：4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64

神意当前状态：tokens.css 已有 --space-xs/sm/md/lg 体系，基本对齐 8px 网格。

### 3.3 按钮规格

社区标准（Material / Carbon / Naive UI）：

| 尺寸 | 高度 | padding | 字号 |
|------|------|---------|------|
| xs | 24px | 4px 8px | 11px |
| sm | 28px | 4px 12px | 12px |
| md | 32-36px | 6px 16px | 14px |
| lg | 38-44px | 8px 20px | 15px |

神意当前状态：--btn-md-height: 32px 偏矮，--btn-font-size-md: 13px 偏小。

### 3.4 卡片设计

社区标准：
- border-radius: 8px（桌面应用统一）
- padding: 16px（紧凑）或 20px（舒适）
- card-grid: repeat(auto-fill, minmax(280px, 1fr))

神意当前状态：base-components.css 已有此结构，基本一致。

---

## 四、配色系统经验

### 4.1 暗色主题

社区标准（Material Dark / Carbon Gray / Discord）：
- 主背景比次背景深 1-2 个色阶
- 文字对比度 WCAG AA 标准：正文 #e0e0e0+，次级 #a0a0a0+
- 强调色不用纯蓝紫，用偏蓝或偏紫的中间色

神意当前状态：
- --bg-primary: #0a0a0c / --bg-secondary: #121215 / --bg-tertiary: #1a1a1f（层级清晰）
- --text-primary: #e8e8ec / --text-secondary: #a0a2ac（对比度合格）
- --accent: #7c8cf8（蓝紫，可接受）
- 配色系统整体健康，主要问题不在颜色而在字号和间距

### 4.2 避免的配色
- 纯黑 #000（可用 #0a0a0c）
- 纯白 #fff（可用 #e8e8ec）
- 单色调（全蓝或全紫，需要中性色平衡）

---

## 五、交互模式经验

### 5.1 按钮布局

社区标准（Carbon / Material）：
- 操作按钮右对齐
- 主按钮在右，次按钮在左
- 按钮组用 gap: 8px
- 危险操作按钮用红色，和普通按钮保持间距

### 5.2 表单设计

社区标准：
- label 在 input 上方
- input 高度 34-40px
- 必填项用 * 标记
- 错误信息在 input 下方红色显示

### 5.3 列表/树形

社区标准（VS Code / Notion）：
- 树节点 indent 每级 16-20px
- 节点高度 28-32px
- hover 高亮整行
- 选中态用强调色左边框 + 背景色
- 右键菜单 position: fixed

---

## 六、神意专属改进清单

### 已按本方案完成（2026-09-20）
1. 统一所有 overlay 类名为 .modal-overlay，.pl-overlay / .ow-overlay / .pm-overlay / .dash-overlay 等旧类名已删除
2. z-index 统一用 tokens 变量，硬编码层级值已清零
3. MemoryPanel 已改为 fixed overlay
4. 正文字号、次级字号、编辑器字号、AI 气泡字号已按 Graphite Ink v2 token 收口
5. Toast、Tooltip、EmptyState 已统一为单源实现
6. G6 图谱与诊断面板颜色已 token 化
7. 未引用动画、常驻 will-change、组件级 blur 数值已清零

### 后续仍可继续观察
1. 双主题 + 三密度的截图矩阵可以继续扩容，作为视觉回归资产
2. 长列表滚动帧率可以做专项抽样，确认 token 化后的渲染开销
3. 极端长度文案与多语言文案需要持续做溢出检查

### 不需要改
1. 配色系统（健康）
2. 三栏布局结构（合理）
3. 响应式断点定义（合理，只需调字号）
4. 8px 间距网格（合理）
5. CSS 变量体系（合理）

---

## 七、社区参考项目

| 项目 | 参考价值 | 地址 |
|------|---------|------|
| Cloudscape Design | AWS 桌面级应用设计系统 | github.com/cloudscape-design/components |
| Carbon Design | IBM 企业级设计系统 | github.com/carbon-design-system |
| Blueprint | Palantir 桌面级数据应用 | github.com/palantir/blueprint |
| Naive UI | Vue3 组件库，暗色主题参考 | github.com/tusen-ai/naive-ui |
| Element Plus | Vue3 组件库，表单/弹窗参考 | github.com/element-plus/element-plus |
| Radix UI | 无样式组件，交互模式参考 | github.com/radix-ui/primitives |

---

## 八、使用规则

1. 每次做 UI 调整前先读本文件
2. 新建弹窗必须用 .modal-overlay + .modal-content 基类，禁止自定义 overlay
3. z-index 必须用 tokens 变量，禁止硬编码
4. 字号必须用 tokens 变量，禁止硬编码
5. 弹窗宽度超过 720px 必须用 .modal-content.modal-lg
6. 面板内嵌套弹窗用 .modal-overlay.modal-nested + var(--z-modal-nested-content)
7. 所有 overlay 必须用 position: fixed; inset: 0
