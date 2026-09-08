# 开发日志：亮色主题配色体系 + 密度系统

日期：2026-09-05
版本：3.21.0 -> 3.22.0
方案：PROPOSAL_2026-09-05_LIGHT_THEME_COLOR_SYSTEM.md

## 改动范围

| 文件 | 阶段 | 改动内容 |
|------|------|---------|
| src/styles/tokens.css | P0 | 亮色body.light-theme块全量替换为暖色系：背景#FAFAF8暖白、正文#37352F暖深灰、阴影rgba(60,55,45,...)、选中态alpha 0.12->0.16 |
| src/styles/tokens.css | P1 | 新增4个间距语义别名：--space-s(6px)/--space-sm-plus(12px)/--space-md-plus(20px)/--space-2xl(48px) |
| src/styles/tokens.css | P2 | 新增7个行高配对：--lh-display(1.2)/--lh-title-lg(1.25)/--lh-title(1.3)/--lh-body(1.55)/--lh-small(1.5)/--lh-label(1.4)/--lh-caption(1.4) |
| src/styles/tokens.css | P3 | [data-density]属性选择器三档：comfortable(默认)/compact/dense，含按钮高度/卡片padding/表单高度/列表间距/面板padding |
| src/styles/base-components.css | P3 | .btn/.card引用从旧--btn-*-height/--card-padding替换为--density-btn-*-height/--density-card-padding |
| src/stores/theme.ts | P4 | 默认主题值从dark改为light |
| src/components/settings/AppearanceSettings.vue | P3-P4 | 新增密度下拉选择器+onDensityChange()函数；主题下拉增加light选项 |

## 关键决策

1. 暖色调而非纯白纯黑：参考Notion #FAFAF8/#37352F方案，降低长时间阅读眼疲劳
2. 阴影从纯黑改为暖色：rgba(0,0,0,...) -> rgba(60,55,45,...)，亮色下更自然
3. 选中态alpha提升：0.12在白底几乎不可见，提升至0.16
4. 密度纯CSS切换：属性选择器不涉及JS重渲染，旧token名保留兼容
5. 亮色默认化：只改theme.ts默认值，不影响已保存的用户偏好
6. 旧亮色重复声明清理：删除tokens.css中残留的5行旧值声明，避免CSS后声明覆盖新值

## 验证结果

- npm run build:vue exit 0，CSS 254.54->256.14 kB (+1.6kB)
- rg扫描确认src/目录无硬编码旧色值残留
- CDP视觉验证不可用（经验V2 §2规则37 Electron 33 Runtime域假死），降级为构建+rg+用户实测
- 密度切换/data-density已在tokens.css+base-components.css+AppearanceSettings.vue三处落地

## 未验证项

- 亮色全量视觉验证（需用户真实启动应用逐页面检查）
- 密度三档切换视觉验证（需用户实测）
- 暗色主题回归验证（需用户实测）

## 客户实操入口

1. 启动应用，默认显示亮色主题（暖白背景）
2. 设置 -> 外观 -> 主题：可切换亮色/暗色
3. 设置 -> 外观 -> 密度：可切换舒适/紧凑/密集
