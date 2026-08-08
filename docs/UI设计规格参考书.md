# UI设计规格参考书

创建日期: 2026-08-08
来源: styles/tokens.css + renderer.html + style.css

---

# 一、颜色系统

## 1.1 背景
| 变量名 | 值 | 用途 |
|--------|-----|------|
| --bg-primary | #0a0a0c | 主背景 |
| --bg-secondary | #121215 | 次级背景 |
| --bg-tertiary | #1a1a1f | 三级背景(卡片/面板) |
| --bg-elevated | #212129 | 悬浮元素 |
| --bg-input | #15151c | 输入框 |
| --bg-glass | rgba(20,20,28,0.85) | 模态框背景 |
| --bg-hover | rgba(124,140,248,0.06) | 悬浮态背景 |
| --bg-overlay | rgba(0,0,0,0.5) | 遮罩层 |

## 1.2 文字
| 变量名 | 值 | 用途 |
|--------|-----|------|
| --text-primary | #e8e8ec | 主文字 |
| --text-secondary | #a0a2ac | 次级文字 |
| --text-muted | #888a94 | 弱文字 |
| --text-on-accent | #ffffff | 强调色上的文字 |

## 1.3 强调色
| 变量名 | 值 | 用途 |
|--------|-----|------|
| --accent | #7c8cf8 | 主强调色(蓝紫) |
| --accent-hover | #9da9fa | 悬浮态 |
| --accent-active | #6b7af0 | 激活态 |
| --accent-gradient | linear-gradient(135deg,#7c8cf8,#9b6cf8) | 渐变 |

## 1.4 状态色
| 变量名 | 值 | 用途 |
|--------|-----|------|
| --danger | #e0556a | 删除/错误 |
| --success | #4caf88 | 成功 |
| --warning | #f0a050 | 警告 |
| --info | #5b9cf5 | 信息 |

## 1.5 对话气泡
| 变量名 | 值 | 用途 |
|--------|-----|------|
| --user-bubble | #1c2850 | 用户消息气泡 |
| --ai-bubble | #18181e | AI消息气泡 |

## 1.6 边框
| 变量名 | 值 | 用途 |
|--------|-----|------|
| --border-color | #25252e | 普通边框 |
| --border-light | #35353f | 轻边框 |
| --border-focus | #4a4a58 | 聚焦边框 |

---

# 二、字体规格

| 属性 | 值 |
|------|-----|
| 字体族 | -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif |
| 编辑器字体 | 'Noto Serif SC', 'Source Han Serif SC', Georgia, serif |
| 正文字号 | clamp(12px, 0.85vw, 16px) |
| 小字字号 | clamp(12px, 0.72vw, 13px) |
| 标题字号 | clamp(15px, 1.1vw, 20px) |
| 编辑器字号 | clamp(13px, 1vw, 18px) |
| 行高-正文 | 1.6 |
| 行高-编辑器 | 1.8 |
| 字重 | normal(400) / medium(500) / semibold(600) / bold(700) |

---

# 三、间距系统

| 变量名 | 值 |
|--------|-----|
| --space-1 | 2px |
| --space-2 | 4px |
| --space-3 | 6px |
| --space-4 | 8px |
| --space-5 | 12px |
| --space-6 | 16px |
| --space-8 | 24px |
| --space-10 | 32px |
| --space-12 | 40px |

---

# 四、圆角系统

| 变量名 | 值 |
|--------|-----|
| --radius-xs | 4px |
| --radius-sm / --radius-btn | 6px |
| --radius-md | 8px |
| --radius-lg / --card-radius | 12px |

---

# 五、按钮规格

| 类型 | 背景 | 文字 | 边框 | 圆角 | 高度 |
|------|------|------|------|------|------|
| 主按钮 | accent-gradient | #fff | 无 | 6px | 32px (md) |
| 次按钮 | transparent | text-primary | border-color | 6px | 32px |
| 危险按钮 | danger | #fff | 无 | 6px | 32px |
| 图标按钮 | transparent | text-secondary | 无 | 6px | 28-32px |
| xs按钮 | - | - | - | 6px | 24px |
| sm按钮 | - | - | - | 6px | 28px |
| lg按钮 | - | - | - | 6px | 38px |

padding: xs(2px 8px) / sm(4px 12px) / md(6px 16px) / lg(8px 20px)

---

# 六、侧边栏规格

| 属性 | 值 |
|------|-----|
| 宽度 | 48px(纯图标) |
| 按钮尺寸 | 36x36px |
| 按钮间距 | 4px |
| 分隔线 | 1px solid border-color |
| tooltip | 右侧弹出, bg-tertiary背景 |

---

# 七、面板/模态框规格

| 属性 | 值 |
|------|-----|
| 模态框背景 | bg-glass (rgba(20,20,28,0.85)) |
| 遮罩层 | bg-overlay (rgba(0,0,0,0.5)) |
| 模态框宽度 | sm(400px) / md(512px) / lg(640px) / xl(800px) |
| 模态框圆角 | 12px |
| 模态框padding | 24px |
| 面板宽度 | sm(280px) / md(320px) / lg(400px) |
| 面板圆角 | 8px |
| z-index | base(1) / dropdown(100) / overlay(500) / modal(1000) / toast(2000) / tooltip(3000) |

---

# 八、编辑器规格

| 属性 | 值 |
|------|-----|
| 编辑区背景 | bg-primary |
| 文字颜色 | text-primary |
| 字体 | Noto Serif SC, Georgia, serif |
| 字号 | clamp(13px, 1vw, 18px) |
| 行高 | 1.8 |
| textarea | 无边框, 只有底部聚焦线 |
| 工具栏 | 固定顶部, 高40px |
| 查找栏 | 滑出式, 高36px |

---

# 九、对话气泡规格

| 属性 | 值 |
|------|-----|
| 用户气泡 | 背景--user-bubble, 圆角12px, 右对齐 |
| AI气泡 | 背景--ai-bubble, 圆角12px, 左对齐 |
| 最大宽度 | 80% |
| 表格 | max-width 100%, overflow-x auto |

---

# 十、卡片规格

| 类型 | 背景 | 圆角 | padding |
|------|------|------|---------|
| 卷纲卡片 | bg-tertiary | 12px | 16px |
| 章节卡片 | bg-secondary | 8px | 12px |
| 设定卡片 | bg-tertiary | 12px | 16px |
| 通用卡片 | bg-elevated | 12px | 16px |
| 卡片边框 | 1px solid border-color |
| 卡片悬浮 | shadow-md + border-color变亮 |

---

# 十一、左边栏Agent进度面板规格(新增)

| 属性 | 值 |
|------|-----|
| 位置 | 左侧边栏右侧, 可折叠面板 |
| 展开宽度 | 280px |
| 折叠宽度 | 0px(完全隐藏) |
| Agent列表项 | 编号+昵称+状态图标+mini进度条+当前任务简述 |
| 状态颜色 | 绿色(#4caf88)=运行中 / 蓝色(#7c8cf8)=已完成 / 红色(#e0556a)=失败 / 黄色(#f0a050)=等待中 / 灰色(#888a94)=未启动 |
| 日志区 | 底部, 默认显示最新3条, 可展开全部 |

---

# 十二、阴影系统

| 变量名 | 值 |
|--------|-----|
| --shadow-xs | 0 1px 2px rgba(0,0,0,0.25) |
| --shadow-sm | 0 2px 8px rgba(0,0,0,0.3) |
| --shadow-md | 0 4px 16px rgba(0,0,0,0.4) |
| --shadow-lg | 0 8px 32px rgba(0,0,0,0.5) |
| --shadow-glow | 0 0 24px rgba(124,140,248,0.15) |

---

# 十三、过渡动画

| 变量名 | 值 |
|--------|-----|
| --transition-fast | 0.12s ease |
| --transition | 0.2s ease |
| --transition-slow | 0.3s ease |
| --ease-out | cubic-bezier(0.16,1,0.3,1) |
| --ease-spring | cubic-bezier(0.34,1.56,0.64,1) |
| --hover-lift | translateY(-1px) |
| --hover-press | scale(0.97) |

---

本规格书基于 tokens.css 完整提取, 用作Vue 3组件开发的核对标准。
