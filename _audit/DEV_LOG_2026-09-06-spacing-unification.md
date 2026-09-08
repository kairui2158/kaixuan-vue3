## 开发日志：全应用间距统一方案执行

**日期**: 2026-09-06
**版本**: 3.27.0
**方案**: _audit/PROPOSAL_2026-09-06_SPACING_UNIFICATION.md

### 完成项|+| 步骤 | 内容 | 用途 ||+|------|------|------||+| P0 | tokens.css 新增组件级间距 token | --select-padding / --form-row-gap / --input-padding 等，为共享类提供变量源 ||+| P1 | base-components.css 新增 .select-standard / option / optgroup / .form-row / .input-field 共享类 | 统一全应用下拉框/选项/表单行/输入框间距，新增元素挂类名即可继承 ||+| P1.5 | 合并 .btn 重复声明 | 消除 base-components.css 中 .btn 选择器两行重复定义，保留 density 版本 ||+| P2 | PipelinePanel.vue 132处硬编码替换 | padding/gap/margin 全部转 token，消除 3px/5px/9px/10px 非标准值 ||+| P3 | SkillSettings.vue + AgentSettings.vue 108处替换 | 9px->8px 等非标准值归并到 token 阶梯 ||+| P4 | ApiSettings.vue + AiNamingModal.vue 79处替换 | 13px->12px / 40px->32px 归并到 token 阶梯 ||+| P5 | EditorPanel.vue + ChatPanel.vue + ChatMessage.vue 62处替换 | 消除 3px/5px 非标准间距 ||+| P6 | OutlineWorkspace + MemoryPanel + DiagLogPanel + DeAiSettings + PluginMarket + SkillBindModal + TimelineView + 其余 191处替换 | 全应用剩余间距归并完成 ||+| P7 | stylelint + stylelint-declaration-strict-value 安装配置 | 第二层防线：padding/gap/margin 必须使用 var() 或 0/auto/inherit，硬编码 px 触发 warning ||+| P8 | 源 Electron 启动验证 | 启动无报错，应用正常加载 ||+
### 量化成果

| 指标 | 改前 | 改后 |
|------|------|------|
| 硬编码 padding/gap/margin px | ~572 | 1 (border -1px 保留) |
| token 引用率 | 42% | ~99.8% |
| 非标准间距值 | 9种 (1/3/5/7/9/10/13/14/40px) | 0 |
| select 类名 | 7种互不统一 | 统一为 .select-standard |
| option 样式 | 浏览器默认 | 共享类统一定义 |
| 共享间距类 | 0 | .select-standard / .form-row / .input-field + option/optgroup |

### 风险控制

- 未改动任何 DOM 结构和布局属性（flex/grid/position 不动）
- 未改动任何功能逻辑代码，仅改 CSS 间距声明
- 未改动现有 token 变量值
- 每步替换后构建验证通过
- 源 Electron 启动无报错
- stylelint 仅 warning 级别，不阻断构建
