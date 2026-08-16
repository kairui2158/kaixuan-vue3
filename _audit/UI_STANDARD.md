# 神意 UI 统一规范

> 生成时间：2026-08-17
> 依据：社区方法学习（Open Props + Reka UI）+ 项目实际令牌体系
> 约束：所有 UI 元素在主页面、弹窗、弹窗内弹窗三层递归穿透一致

---

## 一、视觉令牌规范（tokens.css）

### 1.1 字号体系（7 级）
| Token | 值 | 使用场景 |
|-------|-----|--------|
| --font-size-xxs | 10px | 标签内辅助文字、时间戳 |
| --font-size-xs | 11px | 辅助文字、状态栏、徽章 |
| --font-size-sm | 12px | 按钮文字、表单标签、下拉项 |
| --font-size-md | 13px | 正文、输入框文字、列表项 |
| --font-size-lg | 15px | 卡片标题、弹窗标题、面板标题 |
| --font-size-xl | 18px | 页面主标题、大号数字 |
| --font-size-xxl | 20px | 仅用于特殊强调标题 |

### 1.2 颜色体系
| Token | 使用场景 |
|-------|--------|
| --text-primary | 主要文字（标题、正文、输入值） |
| --text-secondary | 次要文字（描述、标签） |
| --text-muted | 辅助文字（时间戳、占位符） |
| --text-on-accent | accent 背景上的文字 |
| --accent | 主色调（按钮、高亮、选中态） |
| --accent-hover | accent hover 态 |
| --accent-active | accent active 态 |
| --danger | 危险操作（删除、停止） |
| --success | 成功状态 |
| --warning | 警告状态 |
| --info | 信息提示 |
| --bg-primary | 页面背景 |
| --bg-secondary | 侧栏/面板背景 |
| --bg-tertiary | 三级背景（嵌套区域） |
| --bg-elevated | 弹窗/卡片背景 |
| --bg-input | 输入框背景 |
| --border-color | 默认边框 |
| --border-light | hover 边框 |
| --border-focus | 聚焦边框 |

### 1.3 字重体系
| Token | 值 | 使用场景 |
|-------|-----|--------|
| --fw-normal | 400 | 正文（默认） |
| --fw-medium | 500 | 按钮文字、标签 |
| --fw-semibold | 600 | 卡片标题、面板标题 |
| --fw-bold | 700 | 页面主标题、强调 |

### 1.4 行高体系
| Token | 值 | 使用场景 |
|-------|-----|--------|
| --lh-tight | 1.3 | 标题、按钮 |
| --lh-normal | 1.5 | 正文、列表 |
| --lh-loose | 1.8 | 阅读区域（编辑器、聊天消息） |

### 1.5 圆角体系
| Token | 值 | 使用场景 |
|-------|-----|--------|
| --radius-xs | 4px | 标签、徽章 |
| --radius-sm | 6px | 按钮、输入框 |
| --radius-md | 8px | 卡片、面板 |
| --radius-lg | 12px | 弹窗 |

### 1.6 阴影体系
| Token | 使用场景 |
|-------|--------|
| --shadow-xs | 微小阴影（分割线替代） |
| --shadow-sm | 卡片 hover |
| --shadow-md | 下拉菜单、弹出层 |
| --shadow-lg | 弹窗 |
| --shadow-xl | 大弹窗、全屏弹窗 |
| --shadow-glow | accent 高亮发光 |
| --shadow-focus | 聚焦光环 |

### 1.7 间距体系
| Token | 值 | 使用场景 |
|-------|-----|--------|
| --space-1 | 2px | 最小间距（图标与文字） |
| --space-2 | 4px | 紧凑间距（按钮组内） |
| --space-3 | 6px | 小间距 |
| --space-4 | 8px | 标准间距（按钮内、列表项） |
| --space-5 | 12px | 中间距（卡片内） |
| --space-6 | 16px | 大间距（面板内、弹窗 body） |
| --space-8 | 24px | 弹窗 padding |
| --space-10 | 32px | 大区块间距 |
| --space-12 | 48px | 页面级间距 |
| --space-14 | 64px | 最大间距 |

### 1.8 过渡动画体系
| Token | 值 | 使用场景 |
|-------|-----|--------|
| --transition-fast | 0.12s ease | 按钮 hover、输入框聚焦 |
| --transition | 0.2s ease | 弹窗开关、面板展开 |
| --transition-slow | 0.3s ease | 页面切换、大面板过渡 |
| --transition-button | 0.15s ease | 按钮综合过渡 |

### 1.9 别名系统（统一引用）
以下别名指向同一值，禁止重复定义硬编码值：
```
--space-xxs → var(--space-1)
--space-xs  → var(--space-2)
--space-sm  → var(--space-4)
--space-md  → var(--space-6)
--space-lg  → var(--space-8)
--space-xl  → var(--space-10)
--radius    → var(--radius-md)
--radius-btn → var(--radius-sm)
--accent-light   → var(--accent)
--accent-lighter → var(--accent-hover)
```

---

## 二、组件规范

### 2.1 按钮体系（3 级类型 × 4 级尺寸）

**类型：**
| Class | 用途 | 样式 |
|-------|------|------|
| .btn-primary | 主操作（确认、保存、生成） | accent-gradient 背景 + 白字 |
| .btn-secondary | 次操作（取消、关闭） | 透明背景 + border-color 边框 |
| .btn-ghost | 轻量操作（图标按钮、工具栏） | 透明背景，hover 显示 bg-hover |

**尺寸：**
| Class | 高度 | 字号 | padding |
|-------|------|------|---------|
| .btn-xs | 24px | --font-size-xs(11px) | 4px 8px |
| .btn-sm | 28px | --font-size-sm(12px) | 4px 12px |
| .btn-md | 32px | --font-size-md(13px) | 6px 16px |
| .btn-lg | 38px | --font-size-lg(15px) | 8px 20px |

**删除的旧 class：** btn-confirm、btn-cancel、btn-stop、btn-danger、btn-loading、btn-disabled、btn-back-sm
（这些旧 class 在 P8 阶段统一替换为 .btn-primary/.btn-secondary/.btn-ghost + .btn-xs/sm/md/lg）

### 2.2 弹窗体系（3 级宽度）

| Class | 宽度 | 使用场景 |
|-------|------|---------|
| .modal-content-sm | 520px | 确认弹窗、小表单 |
| .modal-content（默认） | 720px | 标准弹窗（设置、编辑） |
| .modal-content.modal-lg | 960px | 大弹窗（设置主弹窗、流水线） |

**弹窗结构统一：**
```
.modal-overlay > .modal-content > .modal-header + .modal-body + .modal-footer
```

**删除的旧样式：** base-components.css 中的 .modal、.modal-actions、.modal-tab、.modal-tabs 等在 P6 阶段并入 modal.css

### 2.3 输入框/表单
- 高度统一：var(--form-height) = 34px
- padding 统一：var(--form-padding) = 8px 12px
- 边框：1px solid var(--border-color)
- 聚焦：border-color 变 var(--border-focus) + var(--shadow-focus)
- 字号：var(--font-size-md) = 13px
- 占位文字颜色：var(--text-muted)

### 2.4 标签/徽章
- 统一用 .badge 基类 + 修饰类：
  - .badge-skill：accent-dim 背景 + accent 文字
  - .badge-provider：bg-hover 背景 + text-muted 文字
  - .badge-status：根据状态用 success/warning/danger
- 字号统一：var(--font-size-xs) = 11px
- padding 统一：2px 8px
- 圆角统一：var(--radius-xs) = 4px

### 2.5 图标
- 按钮内图标：16px
- 标签内图标：14px
- 导航图标：20px
- 图标与文字间距：var(--space-2) = 4px

---

## 三、布局规范

### 3.1 弹窗定位
- 所有弹窗固定居中（flex: center + center）
- 距离顶部最小：10vh（通过 max-height: 85vh + margin: auto 实现）
- 不可同时打开两个同级弹窗

### 3.2 按钮位置
- 弹窗 footer 按钮：右下角右对齐，按钮间距 var(--space-4) = 8px
- 弹窗 header 右侧：关闭按钮（.btn-ghost .btn-icon）
- 页面内操作按钮：标题栏右上角
- 工具栏按钮：左对齐排列，间距 var(--space-2) = 4px

### 3.3 面板比例
- 侧栏导航：48px（图标导航）
- 章节树：240px（可调）
- 主面板（编辑器）：flex: 1
- 右侧面板（聊天）：360px（可调）
- 弹窗内面板比例复用同一套比例

### 3.4 分割线
- 统一用：1px solid var(--border-color)
- 使用位置：modal-header 底部、modal-footer 顶部、panel-header 底部

### 3.5 滚动条
- 宽度/高度：6px
- 圆角：3px
- 颜色：var(--border-color)
- hover 颜色：var(--border-light)

---

## 四、交互规范

### 4.1 hover
- 按钮（primary）：opacity: 0.9
- 按钮（secondary/ghost）：background 变 var(--bg-hover)，文字变 var(--text-primary)
- 卡片：border 变 var(--border-light) + var(--shadow-sm)

### 4.2 active
- 按钮：transform: scale(0.97)（var(--tf-press)）

### 4.3 focus
- 输入框：border-color 变 var(--border-focus) + var(--shadow-focus)
- 按钮：outline: 2px solid var(--accent)（focus-visible）

### 4.4 空状态
- 统一用 .empty-state 基类
- 居中显示：flex column center
- 图标（32px）+ 灰色文字提示（var(--text-muted)）

### 4.5 加载态
- 统一用 spinner（旋转动画）
- 半透明 overlay 遮罩（var(--bg-overlay)）
- 加载中按钮：opacity: 0.7 + pointer-events: none

### 4.6 错误态
- 边框：1px solid var(--danger)
- 文字：var(--danger)
- 背景：var(--danger-dim)

### 4.7 响应式
- <768px：侧栏折叠为图标，章节树隐藏，弹窗宽度改 90vw
- 768-1023px：侧栏缩窄，章节树缩窄
- 1024-1279px：标准布局
- ≥1280px：标准布局，主面板可扩展

---

## 五、递归穿透要求

### 5.1 三层定义
- 第 1 层（主页面）：App.vue、SidebarNav、ChapterTree、EditorPanel、ChatPanel
- 第 2 层（弹窗）：SettingsModal、PipelinePanel、DiffModal、ProjectModal、PluginMarket、DashboardModal、MemoryPanel、ExitConfirmModal、OutlineWorkspace
- 第 3 层（弹窗内弹窗）：SkillBindModal、ScPanel 内次级弹窗、DeAiProgress、SkillSettings 内编辑弹窗

### 5.2 穿透标准
- 同一维度的 token 在三层中必须引用同一个变量
- 不允许第 1 层用 var(--font-size-md) 但第 2 层用 13px 硬编码
- 不允许第 2 层用 var(--radius-lg) 但第 3 层用 12px 硬编码

---

> 本规范为 P2-P4 阶段产出，后续 P5-P8 执行时以此为准绳。
