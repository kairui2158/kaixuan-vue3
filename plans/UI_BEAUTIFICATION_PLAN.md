# UI 全面美容计划

> 生成时间: 2026-07-16
> 目标: 对小说工坊应用进行全维度 UI 美容，覆盖按钮、弹窗、面板、编辑器、表单、动画等方方面面

## 一、当前状态诊断

### CSS 统计
| 指标 | 数值 | 问题 |
|------|------|------|
| 总行数 | 2,304 | 偏大，有冗余 |
| 选择器总数 | 520 | - |
| 唯一类选择器 | 399 | - |
| :root 变量 | 52 | 体系较完整 |
| 媒体查询 | 7 | 响应式覆盖一般 |
| 关键帧动画 | 13 | 偏少 |
| 过渡声明 | 84 | 数量可以 |
| 滚动条规则 | 13 | - |
| :root 外硬编码颜色 | 77 | 严重：主题不一致 |
| 硬编码 px 值 | 1,234 | 严重：间距不统一 |
| :focus 规则 | 32 | 不足：键盘导航差 |
| :active 规则 | 7 | 严重不足：按钮无按压感 |
| :disabled 规则 | 10 | 不足：禁用态不明确 |
| z-index 声明 | 24 | 层级散乱(0~10001) |
| 空规则 | 1 | 需清理 |
| HTML 无 CSS 的类 | 6 | 缺样式(.pm-close 等) |
| CSS 无 HTML 的类 | 215 | 死代码占 53% |

### 截图分析
- 暗色主题 + 紫色主调(#7c8cf8)，底色 #0a0a0c
- 左侧图标侧边栏、章节树面板、中间编辑器、右侧对话框
- 整体功能完整但视觉层次较扁平，缺乏深度和精致感

## 二、美容分七大领域

### 领域 A: 设计令牌体系 (Design Tokens)
**问题**: 77 个硬编码颜色 + 1,234 个硬编码 px 值散落在 CSS 各处
**目标**: 所有颜色、间距、圆角、阴影统一走 CSS 变量

| 序号 | 任务 | 方法 |
|------|------|------|
| A1 | 清理硬编码颜色 | 逐一替换为 var(--xxx)，删除已废弃的十六进制值 |
| A2 | 清理硬编码 px | 替换为 var(--space-xs/sm/md/lg) 或计算值 |
| A3 | 统一 z-index 层级 | 定义 --z-dropdown:100 / --z-modal:1000 / --z-toast:9999 等 |
| A4 | 补充缺失变量 | 为缺失的颜色/间距新增变量定义 |
| A5 | 清理死 CSS | 删除 215 个未使用的类选择器 |
| A6 | 补齐 HTML 缺失类 | 为 6 个无 CSS 的类添加样式 |

### 领域 B: 按钮系统 (Button System)
**问题**: :active 仅 7 条，按钮按压感几乎为零
**目标**: 所有按钮统一四态(hover/active/focus/disabled) + 五种变体

| 序号 | 任务 | 方法 |
|------|------|------|
| B1 | 定义按钮变体 | primary / secondary / ghost / danger / icon 五种 |
| B2 | 补齐交互四态 | 每个变体补充 :hover/:active/:focus/:disabled |
| B3 | 按钮按压动画 | :active 增加 transform:scale(0.97) |
| B4 | 图标按钮优化 | 统一尺寸 32x32、hover 背景变化、tooltip 对齐 |
| B5 | 按钮间距规范 | 用 --gap 变量统一间距，删除硬编码 margin |

### 领域 C: 弹窗与浮层系统 (Modal & Overlay)
**问题**: 模态框动画不一致，部分缺少遮罩层
**目标**: 所有弹窗统一动画、遮罩、关闭交互

| 序号 | 任务 | 方法 |
|------|------|------|
| C1 | 统一模态框动画 | 入场 fadeIn+scaleUp，出场 fadeOut |
| C2 | 遮罩层标准化 | 全部使用 #panel-backdrop，backdrop-filter:blur(4px) |
| C3 | 弹窗尺寸规范 | 小(400px) / 中(600px) / 大(800px) / 全屏 |
| C4 | 关闭交互统一 | ESC 关闭 + 点击遮罩关闭 + 右上角关闭按钮 |
| C5 | 弹窗内表单布局 | 统一 label-input 间距、按钮区右对齐 |

### 领域 D: 面板与布局系统 (Panel & Layout)
**问题**: 面板边界不清晰，间距不一致
**目标**: 每个面板有明确的视觉边界和层次

| 序号 | 任务 | 方法 |
|------|------|------|
| D1 | 侧边栏美化 | 图标 hover 发光、active 高亮条、tooltip 优化 |
| D2 | 章节树美化 | 树形缩进线、节点 hover 高亮、拖拽手柄 |
| D3 | 编辑器面板 | 工具栏分组视觉分隔、字数计数器美化 |
| D4 | 对话框面板 | 消息气泡圆角优化、AI 头像、流式动画 |
| D5 | 技能区美化 | 当前 agent/skill 状态清晰展示 |
| D6 | 分隔线美化 | resizer 拖拽手柄增加 hover 视觉反馈 |

### 领域 E: 表单控件系统 (Form Controls)
**问题**: input/select/textarea 样式不统一
**目标**: 所有表单控件统一外观和交互

| 序号 | 任务 | 方法 |
|------|------|------|
| E1 | 输入框统一 | border + focus 发光 + placeholder 颜色 |
| E2 | 下拉框美化 | 自定义箭头、option 样式、选中态 |
| E3 | 文本域美化 | resize 手柄、滚动条、字数提示 |
| E4 | 开关按钮 | 统一 toggle 样式和动画 |
| E5 | 复选框美化 | 自定义勾选动画 |

### 领域 F: 动画与微交互 (Animation & Micro-interaction)
**问题**: 13 个动画不够，缺少微交互
**目标**: 补充状态转换动画和细节微交互

| 序号 | 任务 | 方法 |
|------|------|------|
| F1 | 面板切换动画 | fadeIn/fadeOut + 轻微 slideX |
| F2 | 列表项增删动画 | 新增 slideIn、删除 slideOut |
| F3 | 按钮波纹效果 | 点击时 ripple 动画 |
| F4 | 加载态动画 | spinner 统一、骨架屏 |
| F5 | 空状态美化 | 友好的空状态文字 + 图标 |
| F6 | Toast 通知优化 | 统一入场/出场动画 + 自动消失 |

### 领域 G: 响应式与适配 (Responsive)
**问题**: 7 个媒体查询，部分断点不合理
**目标**: 覆盖从 800px 到 4K 的全尺寸适配

| 序号 | 任务 | 方法 |
|------|------|------|
| G1 | 断点优化 | 800/1024/1280/1600/1920/2560 六档 |
| G2 | 弹性布局检查 | 所有 flex/grid 在各断点下无溢出 |
| G3 | 字号自适应检查 | clamp() 在各尺寸下可读 |
| G4 | 面板折叠 | 小屏下面板可折叠/抽屉化 |

## 三、执行顺序与依赖

```
A(令牌体系) → B(按钮) + E(表单) 并行 → C(弹窗) + D(面板) 并行 → F(动画) → G(响应式)
```

每完成一个领域，执行以下验证:
1. node --check 验证语法
2. 启动 Electron + CDP 截图对比
3. 检查中文渲染正常(无乱码)
4. 门禁脚本通过

## 四、GitHub 参考资源

| 需求方向 | 搜索关键词 | 参考项目 |
|---------|-----------|---------|
| 暗色主题设计系统 | dark theme design system css | GitHub Dark Mode, VS Code Theme |
| 按钮微交互 | button micro interaction css | Tilt (ux.dpl), sbuttons |
| 模态框动画 | modal animation css | micromodal, a11y-dialog |
| 纯 CSS 动画库 | css animation library no dependency | animate.css, motion-ui |
| 滚动条美化 | custom scrollbar css | screen-ui, override.css |
| 表单控件美化 | custom form controls css | spectre.css, pico.css |

> 原则: 只参考设计思路，不安装 npm 依赖，所有样式手写融入 style.css

## 五、验证标准

| 检查项 | 标准 |
|--------|------|
| 硬编码颜色 | :root 外 0 个 |
| 硬编码 px | :root 外 <= 50 个(仅特殊场景) |
| :active 规则 | >= 30 条 |
| :focus 规则 | >= 50 条 |
| :disabled 规则 | >= 20 条 |
| 死 CSS 类 | <= 20 个(动态生成的不计) |
| z-index 层级 | 全部使用变量 |
| 响应式断点 | 6 档覆盖 800~2560px |
| 截图验证 | 4 个视口尺寸无溢出 |
| 中文渲染 | 零乱码 |
| 门禁脚本 | PASS |

## 六、风险控制

- 每次修改前 Copy-Item 备份到 BACKUP/
- 含中文文件用 Node.js fs 修改(不用 PowerShell Set-Content)
- 修改后 node --check 验证
- 清理死 CSS 前确认不是 panels.js 动态生成的类名
- 不修改 meta charset UTF-8
- 每完成一个领域 git commit + push
