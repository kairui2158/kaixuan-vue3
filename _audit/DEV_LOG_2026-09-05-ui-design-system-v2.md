# 开发日志：UI 设计系统 V2 升级

日期：2026-09-05
版本：3.20.2 -> 3.21.0
方案文件：`_audit/PROPOSAL_2026-09-05_UI_DESIGN_SYSTEM_UPGRADE.md`

## 开发目标

参考竞品 WriterHelper 的视觉成熟度，在不换架构、不装第三方包的前提下，通过纯 CSS 等价实现提升全应用视觉成熟度。

## 执行阶段（P0-P12）

| 阶段 | 内容 | 修改文件 | 验证 |
|------|------|---------|------|
| P0 | 41 个新 CSS 变量 | tokens.css | build:vue 通过 |
| P1 | 104 个硬编码 fallback 清除 | ChatMessage, EditorPanel, OutlineWorkspace, AiNamingModal | rg 扫描零残留 |
| P2 | 11 个 box-shadow 标准化 | App.vue, HelpGuide, EditorPanel, AiNamingModal, PipelineFlow, DeAiSettings, ApiSettings | build:vue 通过 |
| P3 | 22 个 border-radius 标准化 | App.vue, AiNamingModal, PipelinePanel, EditorPanel, GraphAnalysis, SkillSettings, ApiSettings, HelpGuide, MemoryPanel, AgentSettings, tokens.css, ai-content.css | build:vue 通过 |
| P4 | 52 个 transition 标准化 | global.css, modal.css, base-components.css + 15 个组件 | build:vue 通过 |
| P5 | 5 处表面 elevation 升级 | base-components.css, modal.css | build:vue 通过 |
| P6 | 状态层系统（8 个目标类） | base-components.css | build:vue 通过 |
| P7 | 微交互动画 | base-components.css | build:vue 通过 |
| P8 | 玻璃拟态（glass-panel + 3 处 backdrop-filter） | base-components.css, modal.css, AiNamingModal.vue | build:vue 通过 |
| P9 | 骨架屏闪烁效果 | base-components.css | build:vue 通过 |
| P10 | 渐变系统应用 | base-components.css | build:vue 通过 |
| P11 | 模态动画编排 | global.css | build:vue 通过 |
| P12 | 构建验证 + 清理 | 全量 build:vue 305 modules, CSS 254KB/37KB gzip, 0 残留, 13 临时脚本清理 | 通过 |

## 关键约束遵守

- 未修改任何 DOM/template/script
- 未修改任何布局属性
- P6 例外：position:relative + overflow:hidden 用于 ::before 伪元素定位
- 未安装第三方包，未修改 package.json 依赖
- 未修改 services/stores/electron/composables

## 中途修复的脚本引入 bug

1. P1 正则替换误吞 #hex) 产生 var(--) 空引用 -> 回退后用两阶段正则修复
2. P2 正则替换 rgba fallback 产生双括号 var(--shadow-lg)) -> 手动修复 3 处

## 经验文件更新

`_audit/神意开发经验总结_v2.md` SS5 新增规则 17-19

## 未验证项

- 未启动 Electron 真实 UI 验证（客户实操验证待定）
- 亮色主题下的视觉效果未实测
