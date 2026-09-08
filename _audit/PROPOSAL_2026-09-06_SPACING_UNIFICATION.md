# 全应用间距统一方案（修订版 v2）
日期: 2026-09-06
依据: SPACING_AUDIT_REPORT.md + 社区调研 + 两轮补充讨论
修订内容: 增加共享类继承层(P1.5)、三层防线体系、旧声明/重复声明处理规范、每批构建验证、stylelint 强化

---

## 一、现状总结

### 1.1 数量级（实测复核）

| 类别 | .vue 文件 | .css 文件 | 合计 |
|------|----------|----------|------|
| 硬编码 gap:Npx | 264 行 | 9 行 | 273 |
| 硬编码 padding:Npx | 260 行 | 20 行 | 280 |
| 硬编码 margin:Npx | 19 行 | 0 | 19 |
| 硬编码小计 | 543 | 29 | 572 |
| var(--space-*) 引用 | 179 | 241 | 420 |
| 总计间距声明 | | | ~992 |

硬编码占 58%，token 化仅 42%。

### 1.2 重灾区文件（按硬编码数量排序）

1. PipelinePanel.vue — 132 处（padding 60 + gap 64 + margin 8）
2. SkillSettings.vue — 69 处（含 9px 等非标准值）
3. AiNamingModal.vue — 40 处（含 13px、14px、40px）
4. ApiSettings.vue — 39 处
5. AgentSettings.vue — 39 处

### 1.3 select/option 专项问题

全应用至少 7 种互不统一的 select 类名：
- .pl-select（PipelinePanel，padding: 0 10px / 0 8px 混用）
- .diag-select（DiagLogPanel，padding: 3px 6px）
- .co-creation-select（ChatPanel）
- .ow-config-select（OutlineWorkspace）
- .deai-param-select（DeAiSettings）
- .sbm-step-select（SkillBindModal）
- .market-category-select（PluginMarket，padding: 0 8px）

问题：
- select padding 值混用 3px/6px/8px/10px，各组件各自定义
- option 元素完全依赖浏览器默认样式，零自定义
- optgroup 仅 AppearanceSettings.vue 用到，无统一样式

### 1.4 非标准间距值（不在 token 阶梯内）

1px、3px、5px、7px、9px、10px、13px、14px、40px — 散落全应用

---

## 二、社区调研结论

| 来源 | 间距阶梯 | 强制机制 |
|------|----------|----------|
| Material Design / Vuetify | 4/8/12/16/20/24/32/48 | 设计规范文档 |
| Tailwind CSS | 4/8/12/16/20/24/32/40/48 | 工具类约束 |
| Cap-go | xs:4 sm:8 md:12 lg:16 | DESIGN.md 约束 |
| OpenMates | spacing-N 模式 | CSS 变量 |
| Gaia | xs:4 sm:8 md:12 | CSS 变量 |
| latent-scope | 按钮三档 padding | CSS 变量 |

社区共识: 4px 基准阶梯 + stylelint-declaration-strict-value 强制禁止硬编码

---

## 三、目标 Token 阶梯

### 3.1 基础间距阶梯（4px 基准）

- --space-0: 0px
- --space-1: 2px (仅用于 border/stroke)
- --space-2: 4px (xxs - 最小间距)
- --space-3: 6px (保留但标记为过渡值)
- --space-4: 8px (sm - 标准小间距)
- --space-5: 12px (sm-plus - 表单元素间距)
- --space-6: 16px (md - 标准间距)
- --space-7: 20px (md-plus - 区块间距)
- --space-8: 24px (lg - 大间距)
- --space-10: 32px (xl - 页面间距)
- --space-12: 48px (2xl - 最大间距)

### 3.2 语义间距别名

- --space-xxs: var(--space-2)  4px
- --space-xs: var(--space-2)  4px 兼容现有
- --space-s: var(--space-3)  6px 保留
- --space-sm: var(--space-4)  8px
- --space-sm-plus: var(--space-5)  12px
- --space-md: var(--space-6)  16px
- --space-md-plus: var(--space-7)  20px
- --space-lg: var(--space-8)  24px
- --space-xl: var(--space-10)  32px
- --space-2xl: var(--space-12)  48px

---

## 四、三层防线体系

### 核心设计：统一调配 + 共享类继承

改完后是统一调配，不是各自管理。具体通过三层防线实现：

| 层级 | 机制 | 作用 |
|------|------|------|
| 第一层：共享类继承 | 元素挂 .btn / .select-standard / .card 等类名，间距由类决定 | 新增元素挂类名即可，不需要写 padding |
| 第二层：var() 强制 | stylelint 检测 padding/gap/margin 必须使用 var(--space-*) | 拦住硬编码 px |
| 第三层：重复声明警告 | stylelint 检测已有共享类的元素是否重复声明了 padding | 警告覆盖，防止绕过共享类 |

未来新增按钮或界面时：
1. 挂 class="btn btn-sm" 即可，间距自动继承
2. 只有真正特殊的布局场景才显式写 var(--space-*)
3. 直接写 px 的会被 stylelint 拦住
4. 已有共享类还重复写 padding 的会被 stylelint 警告

---

## 五、组件间距规范

### 5.1 Select / Option（共享类）

.select-standard {
  height: var(--input-height, 34px);
  padding: 0 var(--space-sm);       /* 0 8px */
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--font-size-md);
  cursor: pointer;
  outline: none;
}
option {
  padding: var(--space-2) var(--space-4);
}
optgroup {
  font-weight: var(--fw-medium);
  color: var(--text-secondary);
}

社区参考: latent-scope 的按钮 padding 三档
- 小: 3px 8px -> var(--space-1) var(--space-4)
- 中: 6px 12px -> var(--space-3) var(--space-5)
- 大: 10px 16px -> var(--space-5) var(--space-6)

### 5.2 按钮（共享类已定义）

现有 tokens.css 已定义:
- --btn-xs-padding: 4px 8px
- --btn-sm-padding: 4px 12px
- --btn-md-padding: 6px 16px
- --btn-lg-padding: 8px 20px
规范: 组件内不再用硬编码 padding 覆盖按钮

### 5.3 Card / Panel

- --card-padding: var(--space-md) 保持
- --card-gap: var(--space-sm) 保持
- --panel-padding: var(--space-md) 保持
- 框中框: 内嵌 card padding 减半

### 5.4 表单行（共享类）

.form-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);    /* 8px */
  padding: var(--space-2) 0; /* 4px 0 */
}

### 5.5 输入框（共享类）

.input-field {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-5); /* 6px 12px */
  font-size: var(--font-size-md);
  outline: none;
}

### 5.6 Modal / Dialog

现有保持:
- --modal-padding: 24px
- --modal-header-padding: 16px 24px
- --modal-footer-padding: 12px 24px

---

## 六、旧声明与重复声明处理规范

### 6.1 第一类：同文件内重复声明同一选择器

场景：PipelinePanel.vue 里 .pl-select 在 3685 行写 padding: 0 10px，3697 行又写 padding: 0 10px，3702 行写 padding: 0 8px — 三个地方定义同一个类的 padding，值还不一样。CSS 后声明覆盖前声明，实际生效的只有最后一个，前面两个是死代码。

处理方式：合并为一个声明，保留实际生效的那个，删掉死代码行。合并后的值按映射表转成 token。

### 6.2 第二类：组件 scoped CSS 重复声明了共享类已有的间距

场景：元素 template 里写了 class="btn"，但 scoped CSS 里又写了 padding: 6px 12px。共享类 .btn 已经定义了 padding: var(--btn-md-padding)，这个 scoped 声明是在覆盖它。

处理方式分两步判断：
- 如果 scoped 值和共享类值一样（都是 6px 12px）-> 纯属冗余，直接删掉，让共享类接管
- 如果 scoped 值和共享类不一样（比如共享类是 6px 12px，scoped 写了 4px 8px）-> 这是有意覆盖，保留但转成 token，同时加注释标注「此处有意覆盖」

### 6.3 第三类：已经没有任何 template 引用的死 CSS 规则

场景：有些 class 曾经用过，后来 template 改了但 CSS 没清理。这些规则不影响运行，但增加维护噪声。

处理方式：用 rg 逐个 class 名搜 template，确认零引用的标记但不删 — 经验文件 M4 规则明确写了「不确定时不删，标记 TODO」。真正的删除留到 M5 三面引用闭包确认后。

---

## 七、硬编码值映射表

### 7.1 可直接映射的值

| 硬编码值 | 映射到 Token | 说明 |
|----------|-------------|------|
| 1px | --space-1 | border 用，保留 |
| 2px | --space-1 | 对齐到 2px |
| 3px | --space-3 (6px) 或 --space-1 (2px) | 按上下文归并 |
| 4px | --space-2 | 直接映射 |
| 5px | --space-2 (4px) 或 --space-3 (6px) | 归并到最近阶梯 |
| 6px | --space-3 | 直接映射 |
| 7px | --space-3 (6px) 或 --space-4 (8px) | 归并到最近阶梯 |
| 8px | --space-4 | 直接映射 |
| 9px | --space-4 (8px) | 归并 |
| 10px | --space-5 (12px) 或 --space-4 (8px) | 归并到最近阶梯 |
| 12px | --space-5 | 直接映射 |
| 13px | --space-5 (12px) | 归并 |
| 14px | --space-6 (16px) 或 --space-5 (12px) | 归并到最近阶梯 |
| 16px | --space-6 | 直接映射 |
| 20px | --space-7 | 直接映射 |
| 24px | --space-8 | 直接映射 |
| 40px | --space-10 (32px) 或 --space-12 (48px) | 归并到最近阶梯 |

### 7.2 归并规则
- 向上归并: 5px -> 4px, 7px -> 8px, 9px -> 8px
- 向下归并: 13px -> 12px, 14px -> 12px
- 特殊: 40px -> 32px (向下) 或 48px (向上)，按上下文判断

---

## 八、执行计划

### P0: 补全 token 定义 (tokens.css)
- 确认 --space-7 (20px) 已定义
- 确认 --space-3 (6px) 已定义
- 确认 --space-0 (0px) 已定义
- 确认 --space-12 (48px) 已定义
- 添加 select/option 专用 token: --select-padding
- 添加 form-row 专用 token: --form-row-gap, --form-row-padding
- 添加 input-field 专用 token: --input-padding
- 不改任何现有变量值
- 验证: npm run build:vue 通过

### P1: base-components.css 添加共享组件类
- 添加 .select-standard 的统一 padding/border/background
- 添加 option 的行高和 padding
- 添加 optgroup 样式
- 添加 .form-row 共享类
- 确认 .input-field 共享类 padding 已定义
- 确认 .btn / .btn-sm / .btn-lg padding 已定义
- 不改 DOM 结构
- 验证: npm run build:vue 通过

### P1.5: 扩充共享组件类 + 组件内删除重复声明
- 在 base-components.css 里扩充共享组件类，确保按钮、select、input、card、form-row 的标准间距由类承载
- 逐文件检查组件 scoped CSS 中是否有对已有共享类元素的重复 padding 声明
- 按第六章三类处理规范操作：
  - 第一类（同文件重复声明）：合并为一个，删掉死代码行
  - 第二类（覆盖共享类）：值一样则删掉让共享类接管；值不一样则保留转 token 加注释
  - 第三类（零引用死 CSS）：用 rg 搜 template 确认零引用，标记 TODO 不删
- 验证: npm run build:vue 通过

### P2: PipelinePanel.vue 硬编码替换 (132 处)
- 按映射表批量替换 padding/gap/margin
- 优先处理 select（3 种 padding 合并为 1 种）和按钮
- 保持布局属性不变（flex/grid/position 不动）
- 处理同文件重复声明（第 6.1 类）
- 处理共享类覆盖（第 6.2 类）
- 处理零引用死 CSS（第 6.3 类）
- 验证: npm run build:vue 通过

### P3: SkillSettings.vue + AgentSettings.vue (108 处)
- 按映射表替换
- 重点处理 9px -> 8px (--space-4)
- 处理三类旧声明
- 验证: npm run build:vue 通过

### P4: ApiSettings.vue + AiNamingModal.vue (79 处)
- 按映射表替换
- 重点处理 13px -> 12px (--space-5), 40px -> 32px (--space-10)
- 处理三类旧声明
- 验证: npm run build:vue 通过

### P5: EditorPanel.vue + ChatPanel.vue + ChatMessage.vue (62 处)
- 按映射表替换
- 重点处理 3px -> 4px (--space-2) 或 6px (--space-3)
- 处理三类旧声明
- 验证: npm run build:vue 通过

### P6: OutlineWorkspace.vue + MemoryPanel.vue + DiagLogPanel.vue + DeAiSettings.vue + PluginMarket.vue + SkillBindModal.vue + TimelineView.vue + 其余 (191 处)
- 按映射表替换
- 逐文件处理
- 处理三类旧声明
- 验证: npm run build:vue 通过

### P7: Stylelint 配置 + 强化
- 安装 stylelint-declaration-strict-value
- 配置规则1: padding/gap/margin 必须使用 var()（第二层防线）
- 配置规则2: 已有共享类的元素重复声明 padding 时发出 warning（第三层防线）
- 运行检查确认无违规
- 验证: stylelint 零 error

### P8: 源 Electron 启动验证 + 视觉对比
- node_modules\electron\dist\electron.exe . 启动无报错
- 视觉对比 before/after（重点检查重叠、错位）
- 密度模式三档切换生效
- 验证: 启动无报错 + 视觉无异常

---

## 九、风险控制

1. 不改 DOM 结构和布局属性（flex/grid/position 不动）
2. 不改现有 token 变量值
3. 硬编码值按映射表归并，不凭感觉
4. 每批替换后构建验证（P0-P6 每步都构建一次）
5. 保留 --space-3 (6px) 和 --space-1 (2px) 作为过渡值
6. 不改任何功能逻辑代码，只改 CSS 间距声明
7. 经验文件 V2 M 系列遵守：M2 整文件操作禁令、M3 diff 自审、M4 隐藏状态保护
8. 不用浏览器/开发者模式/安装版验证，必须源 Electron 启动

---

## 十、验收标准

- [ ] 0 处硬编码 padding/gap/margin px 值 (border 1px 除外)
- [ ] select padding 全局统一（7 种类名归一为 .select-standard）
- [ ] option/optgroup 有统一样式
- [ ] 共享类（.btn/.select-standard/.card/.form-row/.input-field）在 base-components.css 定义完整
- [ ] 组件内无重复声明共享类已有的 padding（有意覆盖除外且有注释）
- [ ] npm run build:vue 通过
- [ ] 源 Electron 启动无报错
- [ ] 视觉无重叠、无错位
- [ ] 密度模式三档生效
- [ ] stylelint 零 error
- [ ] rg 扫描确认零硬编码 px 残留（border 除外）

---

## 十一、社区参考来源

1. Cap-go DESIGN.md - xs:4px spacing scale
2. OpenMates DESIGN.md - --spacing-N 模式
3. Gaia DESIGN.md - xs:4 sm:8 md:12
4. latent-scope DESIGN.md - 按钮三档 padding
5. stylelint-declaration-strict-value - 强制 token 使用
6. W3C Design Tokens Community Group format
7. Material Design 3 间距规范 - 4px 基准阶梯
8. Tailwind CSS spacing scale - 工具类约束模式
9. Vuetify 4.x spacing-class - 组件类继承间距