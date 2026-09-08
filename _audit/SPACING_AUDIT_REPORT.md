# 全应用间距规格深度审计报告
日期: 2026-09-06
扫描范围: src/components/**/*.vue + src/styles/*.css

## 一、数量级统计

| 类别 | 数量 | 占比 |
|------|------|------|
| 硬编码 padding: Npx | 280 | 28% |
| 硬编码 gap: Npx | 273 | 28% |
| 硬编码 margin: Npx | 19 | 2% |
| 使用 var(--space-*) 令牌 | 420 | 42% |
| 总计间距声明 | ~992 | 100% |
| 硬编码占比 | ~572 | 58% |

## 二、Token 体系现有值

| 变量 | 值 | 语义 |
|------|----|------|
| --space-0 | 0px | 无间距 |
| --space-1 | 2px | 最小 |
| --space-2 | 4px | xxs |
| --space-3 | 6px | s (新增) |
| --space-4 | 8px | xs/sm |
| --space-5 | 12px | sm-plus (新增) |
| --space-6 | 16px | md |
| --space-7 | 20px | md-plus (新增) |
| --space-8 | 24px | lg |
| --space-10 | 32px | xl |
| --space-12 | 48px | 2xl |

## 三、问题分布

### 3.1 非标准硬编码值（不在 token 体系内）
出现频率最高的违规值:
- 1px (多处 border/padding)
- 3px (多处 gap/padding)
- 5px (多处 gap/padding)
- 7px (AgentSettings padding)
- 9px (SkillSettings/AgentSettings padding)
- 10px (多处 gap/padding)
- 13px (AiNamingModal padding)
- 14px (AiNamingModal/MemoryPanel gap)
- 20px (PipelinePanel/HelpGuide margin)
- 40px (AiNamingModal padding)

### 3.2 重灾区文件（按硬编码数量排序）
1. PipelinePanel.vue - 60 padding + 64 gap + 8 margin = 132 处
2. EditorPanel.vue - 19 padding + 16 gap = 35 处
3. SkillSettings.vue - 31 padding + 25 gap + 13 margin = 69 处
4. OutlineWorkspace.vue - 22 padding + 16 gap = 38 处
5. AiNamingModal.vue - 22 padding + 15 gap + 3 margin = 40 处
6. ChatPanel.vue - 17 padding + 10 gap = 27 处
7. ApiSettings.vue - 15 padding + 24 gap = 39 处
8. AgentSettings.vue - 16 padding + 19 gap + 4 margin = 39 处

### 3.3 下拉框/选择器问题
- select 元素没有统一的 padding 规范
- option 元素完全依赖浏览器默认样式
- optgroup 无自定义样式
- 不同页面的 select padding 不一致: 3px/5px/6px/8px/9px 混用

### 3.4 按钮间距问题
- btn padding 定义在 tokens.css 有标准值
- 但组件内按钮仍用硬编码 padding 覆盖
- 按钮间距 gap 值: 2px/3px/4px/5px/6px/8px/10px 混用

### 3.5 框中框问题
- card 内嵌 card 时 padding 叠加不一致
- panel 内嵌 panel 时 gap 无继承
- modal 内嵌 form 时间距凭感觉

## 四、根因分析
1. Token 体系建立时未强制执行，历史代码保留大量硬编码
2. 新功能开发时直接写 px 值，未引用 token
3. 没有 lint 规则检测非 token 间距值
4. select/option 元素从未被纳入 token 体系
5. 组件 scoped CSS 中硬编码无法被全局 token 覆盖

## 五、待社区调研方向
1. Material Design / Vuetify 的间距阶梯方案
2. Ant Design 的 select/option padding 规范
3. Tailwind CSS 的 spacing scale 设计
4. Element Plus 的表单间距统一方案
5. 是否有 PostCSS / Stylelint 插件自动检测非 token 值
