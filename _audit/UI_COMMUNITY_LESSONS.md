# 社区方案学习总结

> 来源：Open Props (argyleink/open-props, 5.5k stars) + Reka UI (unovue/reka-ui, 6.7k stars)
> 目的：提炼设计令牌分层方法，不抄代码

---

## 一、Open Props 学到的方法

### 1.1 令牌分层理念
Open Props 把所有设计令牌按类别拆分到独立文件：
- props.fonts.css — 字号、字重、行高、字间距
- props.shadows.css — 阴影层级（shadow-1 到 shadow-5）
- props.sizes.css — 尺寸体系（size-1 到 size-15 + fluid 响应式）
- props.borders.css — 边框粗细 + 圆角层级（radius-1 到 radius-6）
- props.animations.css — 动画命名（fade-in/scale-up/slide-in 等）
- props.colors.css — 颜色体系

**学到的方法：** 令牌按维度独立定义，每个维度有明确的层级编号（1-N），不混用命名风格。

### 1.2 字号体系
Open Props 用 rem 单位（.5rem~3.5rem），7 级 + 4 级 fluid（clamp 响应式）。

**学到的方法：** 字号用层级编号而非语义命名（font-size-1 比 font-size-sm 更灵活），但我们项目用 px 值且已有语义命名，保持现有 xs/sm/md/lg/xl 体系即可，补充 xxs 和 xxl。

### 1.3 阴影体系
Open Props 用 hsl + shadow-strength 计算阴影深度，5 级阴影从浅到深。

**学到的方法：** 阴影应该有明确的层级语义——shadow-1（卡片）、shadow-2（下拉）、shadow-3（弹窗）、shadow-4（大弹窗），而不是随意选 sm/md/lg。

### 1.4 尺寸体系
Open Props 同时提供 rem 和 px 两套，加上 fluid（clamp）响应式。

**学到的方法：** 间距令牌应该覆盖从小到大的完整范围，我们的 space-1~space-10 已经覆盖 2px~32px，但缺少 48px 和 64px 的大间距。

### 1.5 圆角体系
Open Props 用 radius-1~radius-6 编号。

**学到的方法：** 圆角按层级编号比语义命名更灵活，但我们已有 radius-xs/sm/md/lg，保持一致即可。

### 1.6 动画体系
Open Props 为每个动画命名（fade-in/scale-up/slide-in），统一用 ease-3 缓动。

**学到的方法：** 动画应该有命名语义，统一缓动函数。我们已有 transition-fast/transition/transition-slow，可以补充动画命名。

## 二、Reka UI 学到的方法

### 2.1 行为与样式分离
Reka UI 是无样式组件库，只提供行为（打开/关闭/聚焦/键盘导航），样式完全由开发者定义。

**学到的方法：** 组件的行为逻辑（打开/关闭/状态管理）和视觉样式应该分离。我们的 Vue 组件已经通过 store 管理状态，样式应该统一用 token，不在组件内重复定义。

### 2.2 可访问性原语
Reka UI 的弹窗/下拉/选择器都内置了键盘导航、焦点陷阱、aria 属性。

**学到的方法：** 弹窗应该有统一的焦点管理和键盘交互，但这属于功能层面，本次 UI 统一不涉及。

## 三、适合神意的 5 条原则

### 原则 1：令牌单一来源
所有设计令牌只在 tokens.css 定义一次，其他 CSS 文件和组件只引用 var(--xxx)，禁止重复定义。

### 原则 2：层级语义明确
每个令牌有明确的使用场景：
- 字号：xxs(10px 标签) / xs(11px 辅助) / sm(12px 按钮) / md(13px 正文) / lg(15px 标题) / xl(18px 大标题) / xxl(20px 页面标题)
- 阴影：shadow-sm(卡片) / shadow-md(下拉) / shadow-lg(弹窗) / shadow-xl(大弹窗)
- 圆角：radius-xs(4px 标签) / radius-sm(6px 按钮) / radius-md(8px 卡片) / radius-lg(12px 弹窗)
- 间距：space-1~10(2px~32px) + space-12(48px) + space-14(64px)

### 原则 3：递归穿透
令牌定义后，必须在所有 3 个层级（主页面 / 弹窗 / 弹窗内弹窗）统一使用，不允许某一层级用硬编码。

### 原则 4：新规格替换旧规格时删除旧规格
替换 token 变量时，必须同时删除被替换的硬编码值和旧 class，不留冗余。

### 原则 5：不抄社区代码，只学方法
社区方案的设计理念可以学习，但不引入新的依赖库，不复制代码，只优化自己的 tokens.css 和组件样式。

---

> 本文件为 P0 阶段产出，后续阶段以此为指导。
