# 神意助手 UI 视觉基准（V2）

> 目标：统一界面、按钮、字体。每个改动先按本基准执行，再构建+截图验证，禁止批量模糊替换。
> 基准源：`src/styles/tokens.css` + `src/styles/global.css` + `src/styles/modal.css`

## 1. 字号 4 级（UI 控件强制）

| 级别 | Token | 值 | 用途 |
|------|-------|----|----|
| 微观 | `--font-size-xs` | 11px | 徽章、状态点、tooltip、角标 |
| 小号 | `--font-size-sm` | 12px | 辅助文字、次要操作、表单标签、面包屑 |
| 常规 | `--font-size-md` | 13px | 按钮、输入框、普通正文、设置项 |
| 大号 | `--font-size-lg` | 15px | 面板标题、主操作按钮、弹窗标题 |

例外：编辑器正文允许 14-16px（写作区域，不使用 UI 字号）。
禁止：UI 控件继续使用 9px、10px、17px-24px 等 4 级之外的零散字号。

## 2. 按钮标准

| 规格 | 高度 | 内边距 | 字号 | 圆角 |
|------|------|--------|------|------|
| 小按钮 | 28px | 4px 12px | 12px | 6px |
| 常规按钮 | 32px | 6px 16px | 13px | 6px |
| 大按钮 | 38px | 8px 20px | 15px | 6px |
| 图标按钮 | 28px | 0 | 图标自身 | 6px |

- 主操作：`btn-primary`（accent 渐变底 + text-on-accent）
- 次要操作：`btn-secondary`（透明底 + border）
- 危险操作：`btn-danger`（danger 底 + 白字）
- 禁用态：opacity 0.5，禁用时不允许改样式结构，只允许视觉降级。
- 同一面板内按钮高度必须一致（默认 32px），严禁同排按钮 28/34/38 混用。

## 3. 弹窗标准

| 部分 | 标准 |
|------|------|
| 遮罩 | 全屏 fixed、bg-overlay、blur 4px、z-index 1000+ |
| 容器 | 圆角 12px、shadow-lg、宽 480/640/800（sm/md/lg） |
| 头部 | 16px 24px、min-height 48px、标题 15px/600 |
| 主体 | 16px 24px、overflow-y auto |
| 底部 | 12px 24px、按钮右对齐、同高 32px |
| 关闭 | 右上角 X，透明底、hover 突出 |

- 所有弹窗必须使用 `modal-overlay` + `modal-content` 基类，禁止组件各自造一套遮罩/容器样式。

## 4. 输入标准

| 规格 | 标准 |
|------|------|
| 高度 | 32-34px（select/input/textarea 统一） |
| 内边距 | 8px 12px |
| 字号 | 13px |
| 圆角 | 6px |
| 背景 | `--bg-input` |
| 边框 | `--border-color`，聚焦 `--accent` |

## 5. 间距标准

仅使用 5 档：4px / 8px / 12px / 16px / 24px，对应
`--space-xs` / `--space-sm` / `--space-5` / `--space-md` / `--space-lg`。
面板区块间距 16px，按钮组间 8px，按钮内 4px 间距。

## 6. 面板标准

| 部分 | 标准 |
|------|------|
| 圆角 | 8px |
| 背景 | `--bg-secondary` |
| 边框 | 1px `--border-color` |
| 头部 | 高 40px、padding 8px 12px、标题 15px/600 |
| 主体 | padding 16px |

## 7. 递归检查范围

主页面：App / SidebarNav / ChapterTree / EditorPanel / ChatPanel
次级页面：SettingsModal 全标签 / ScPanel / PipelinePanel / MemoryPanel
弹窗级：ProjectModal / SkillBindModal / DiffModal / ExitConfirmModal / PluginMarket / DashboardModal

每个层级检查规则：按钮同高同距、字号 4 级、弹窗基类、输入规范、遮罩层级、文本不溢出。

## 8. 验收门槛

1. `npm run build:vue` 通过。
2. CDP 打开应用截图，主页面按钮/字体与基准一致。
3. 逐个打开次级页面和弹窗截图，嵌套场景无样式回归。
4. 每一批改动记录到 `_audit/UI_FIX_LEDGER.md`，标注文件、改动、验证截图。
