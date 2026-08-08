# 小说工坊 — 全面深度美容美化计划 v1.0

生成日期: 2026-07-17
目标: 对整个应用进行全面深度UI美化，覆盖按钮、面板、弹窗、编辑器、表单等所有层级

---

## 一、当前问题诊断（审计结果）

### P0 致命问题（7项，核心功能完全不可用）

| # | 问题 | 原因 | 影响范围 |
|---|------|------|---------|
| P0-1 | 设置面板全屏显示(1904x975) | style.css中`#pipeline-panel`用`position:fixed;inset:0`，设置模态框也受影响 | 设置无法正常使用 |
| P0-2 | 设置面板24/30按钮不可见(width=0) | provider-edit-view被`modal-hidden`(display:none)隐藏，但审计时该视图内的按钮全部width=0 | 编辑供应商、获取模型、测试连接、保存全部不可见 |
| P0-3 | 设置面板15/15输入框不可见(width=0) | 同上，所有输入框在隐藏的provider-edit-view内 | 无法填写API配置 |
| P0-4 | 设置面板技能/智能体区域不可见 | section-header和card-grid的width=0 | 无法管理技能和智能体 |
| P0-5 | 流水线29/30按钮不可见 | pl-step-content中非active步骤被隐藏，但审计扫描时active步骤内的按钮也width=0 | 无法操作生成流水线 |
| P0-6 | 大纲编辑器AI聊天输入框不可见(width=0) | ow-chat-input被ow-chat-hidden类隐藏 | 无法与AI共创大纲 |
| P0-7 | 插件市场Token输入框不可见(width=0) | github-token-input和保存按钮在隐藏的token设置区域 | 无法保存GitHub Token |

### P1 严重问题（5项，严重影响用户体验）

| # | 问题 | 原因 | 影响 |
|---|------|------|------|
| P1-1 | 221个零尺寸按钮 | tree-actions按钮在style-p7-final-polish.css中被设为width:1px | 章节树编辑/删除按钮不可见 |
| P1-2 | 所有面板overflow:hidden无滚动 | style.css中panel-body设overflow:hidden | 面板内容超出被裁剪 |
| P1-3 | 19种不同padding值 | 无统一设计令牌，各CSS文件各自定义 | 间距不一致 |
| P1-4 | 侧边栏按钮无tooltip | data-tooltip属性有值但CSS未实现tooltip样式 | 用户不知道按钮功能 |
| P1-5 | body有1599px空白 | body直接子容器1904px宽，子元素只占305px | 大量屏幕空间浪费 |

### P2 设计质量问题（4项）

| # | 问题 | 原因 |
|---|------|------|
| P2-1 | 文字对比度不足(rgb(144,146,156) on rgb(18,18,21)) | --text-secondary对比度低于WCAG AA标准 |
| P2-2 | 14个CSS文件叠加冲突 | style.css(132KB) + 13个override文件 = 430KB CSS |
| P2-3 | 编辑器面板透明背景(rgba(0,0,0,0)) | editor-panel背景设为透明 |
| P2-4 | 面板尺寸不统一 | SC=900px, memory=1200px, pipeline/outline=1400px, settings/plugins=全屏 |

---

## 二、执行方案

### 阶段1: CSS合并统一（消除14文件冲突）

**方法:** 将14个CSS文件合并为1个style.css
- 读取所有CSS文件内容
- 按加载顺序合并（后加载的覆盖先加载的）
- 清除重复规则（保留最后一次出现的）
- 清除冲突的!important声明
- 删除13个override文件的link标签
- node --check验证HTML无语法错误

**验证:** CDP连接Electron，截图所有面板，对比合并前后

### 阶段2: 修复P0致命bug

**P0-1: 设置面板全屏 → 改为居中模态框**
- 修改#settings-modal的position从fixed全屏改为居中模态
- 添加backdrop遮罩层
- 设置max-width: 900px, max-height: 85vh, border-radius, shadow

**P0-2/3/4: 设置面板不可见元素 → 修复视图切换逻辑**
- provider-edit-view的modal-hidden类需要正确切换
- 确保section-header和card-grid在技能/智能体tab可见
- 修复CSS让provider-list-view和provider-edit-view正确互斥显示

**P0-5: 流水线按钮不可见 → 修复步骤内容显示**
- 确保active步骤的pl-step-content正确显示
- 修复pl-step-content的display逻辑

**P0-6: 大纲AI聊天输入框 → 修复ow-chat-input显示**
- 检查ow-chat-hidden类的切换逻辑
- 确保输入框在AI共创区域可见

**P0-7: 插件Token输入框 → 修复token设置区域显示**
- 修复token设置区域的显示/隐藏逻辑

### 阶段3: 修复P1严重问题

**P1-1: 221个零尺寸按钮 → 修复tree-actions按钮尺寸**
- 删除style-p7-final-polish.css中的width:1px
- 设置tree-actions button为合理的min-width/height

**P1-2: 添加滚动容器**
- 所有panel-body设overflow-y:auto
- 设置max-height限制

**P1-3: 统一设计令牌**
- 将19种padding值统一为4的倍数(4/8/12/16/24/32)
- 创建--space-*变量映射

**P1-4: 实现tooltip样式**
- 为sidebar-btn的data-tooltip添加CSS tooltip

**P1-5: 修复body布局空白**
- 修复app-body的flex布局
- 确保各面板占满可用空间

### 阶段4: 深层美化（递归5层）

**第1层: 主框架**
- header高度/背景/阴影
- breadcrumb样式
- sidebar图标/间距/tooltip
- body三栏布局比例

**第2层: 面板容器**
- 统一所有面板尺寸(居中模态，max-width按内容)
- 面板头部/底部/body统一
- 面板动画(入场/关闭)
- 面板遮罩层

**第3层: 卡片和列表**
- provider-card样式
- skill/agent卡片样式
- 设定条目卡片样式
- 记忆条目卡片样式
- 流水线步骤卡片样式

**第4层: 按钮和表单**
- 按钮尺寸层级(xs/sm/md/lg)
- 按钮间距统一
- 输入框/选择框/文本域样式
- 表单分组和标签

**第5层: 微交互**
- hover/active/disabled状态
- 过渡动画
- loading状态(spin/progress)
- toast通知样式
- 对比度修正(WCAG AA)

### 阶段5: 验证和截图

- CDP连接运行中的Electron
- 逐个打开所有面板截图
- 验证所有按钮可见(width>0)
- 验证所有输入框可交互
- 生成验证报告
- 更新LESSONS_LEARNED.md

---

## 三、验证标准（遵守VALIDATION_GATE.md四门禁）

1. **截图门禁:** 每个面板修复后截图，保存到test_evidence/
2. **行为测试门禁:** 修改后用CDP实际点击按钮验证功能
3. **双人裁判门禁:** 完成后用独立脚本重新扫描验证
4. **证据不可撤销门禁:** 所有截图带时间戳，不覆盖

---

## 四、执行顺序

1. 阶段1: CSS合并 → 截图验证
2. 阶段2: P0修复 → 逐个截图验证
3. 阶段3: P1修复 → 截图验证
4. 阶段4: 深层美化 → 逐层截图验证
5. 阶段5: 全面验证 → 生成报告
6. git commit + push
7. 更新LESSONS_LEARNED.md
