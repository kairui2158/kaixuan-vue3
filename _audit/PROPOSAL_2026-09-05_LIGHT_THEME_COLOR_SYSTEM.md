# 亮色主题配色体系 + 色彩/间距/排版/密度 全融合升级方案

> 日期: 2026-09-05
> 状态: 待审核，不执行
> 参考: 开发经验V2 §5 UI纪律 | WriterHelper竞品报告 | 社区调研(Notion/语雀/飞书/Material 3/Vuetify 3/Naive UI)
> 前序: PROPOSAL_2026-09-05_UI_DESIGN_SYSTEM_UPGRADE.md (P0-P12 已执行完毕)
> 原则: 纯CSS，不动DOM/布局/功能链路，不装第三方包
> 铁律: 需要用户决定时暂停目标模式等待，不被目标模式推进绕过

---

## 一、问题诊断

### 1.1 当前亮色主题的7个具体缺陷

| # | 缺陷 | 当前值 | 问题 | 影响 |
|---|------|--------|------|------|
| 1 | 纯白卡片背景 | `--bg-secondary: #ffffff` | 无暖色调，长时间阅读刺眼 | 用户眼疲劳 |
| 2 | 纯黑文字 | `--text-bright: #000000` | 对比度过高，视觉生硬 | 标题/强调文字不柔和 |
| 3 | 卡片融入背景 | `--bg-card: #ffffff` 与 `--bg-primary: #f5f5f7` | 层次区分不足 | 信息层次混乱 |
| 4 | 阴影太弱 | `--shadow-sm: 0 2px 8px rgba(0,0,0,0.08)` | 亮色需更强阴影表现层次 | 浮起感不足 |
| 5 | 无暖色基调 | `--bg-primary: #f5f5f7` 冷灰 | Notion用#FAFAF8暖白 | 整体偏冷偏平 |
| 6 | 强调色选中态弱 | `--accent-dim: rgba(91,107,219,0.12)` 在白底几乎不可见 | 选中/激活态反馈弱 | 分不清选中 |
| 7 | 侧边栏无层次 | `--bg-sidebar: #f0f0f2` 纯灰 | 与主区域区分度不够 | 导航与工作区混淆 |

### 1.2 间距系统缺陷

| # | 缺陷 | 现状 | 社区标准 |
|---|------|------|---------|
| 1 | 语义层级太少 | xs/sm/md/lg 四档(2/4/8/12px) | Vuetify 16档, Naive UI 12档 |
| 2 | 缺少中间值 | 6px和8px间无值，12px和16px间无值 | 标准有 6/8/10/12/14/16/20/24 |
| 3 | 命名混用 | `--space-4: 8px` 和 `--space-sm: var(--space-4)` 同时存在 | 应统一 |

### 1.3 排版层次缺陷

| # | 缺陷 | 现状 | 社区标准 |
|---|------|------|---------|
| 1 | 两套字号并存 | `--font-size-*` (旧) + `--text-*` (P0新增) | 应统一为一套 |
| 2 | 行高不自适应 | 全局1.3/1.5 | Material 3: 每级字号对应行高 |
| 3 | 字重梯度不够 | 300/400/500/600/700 | 够用但缺少variable font |

### 1.4 组件密度缺陷

| # | 缺陷 | 现状 | 社区标准 |
|---|------|------|---------|
| 1 | 无密度切换 | 固定一种密度 | M3: compact/comfortable/dense 三档 |
| 2 | 按钮高度单一 | 只有 md=34px | xs=24/sm=28/md=34/lg=40/xl=48 |
| 3 | 卡片内边距单一 | 只有一档 | sm/md/lg 三档 |

---

## 二、社区调研结论

### 2.1 成熟写作/文档应用亮色配色对比

| 应用 | 背景色 | 正文文字色 | 卡片色 | 侧边栏色 | 理念 |
|------|--------|-----------|--------|---------|------|
| Notion | #FAFAF8 暖白 | #37352F 暖深灰 | #FFFFFF | #F7F6F3 | 暖色调纸质感降低疲劳 |
| 语雀 | #F5F6F7 冷灰白 | #3F3F3F 中性灰 | #FFFFFF | #EBECEC | 冷色调技术文档风格 |
| 飞书 | #F5F6F8 冷蓝灰 | #1F2329 冷深灰 | #FFFFFF | #F2F3F5 | 冷蓝调企业风格层次清晰 |
| Material 3 | #FEF7FF 紫暖白 | #1D1B20 暖深紫灰 | #FFFBFE | #F7F2FA | M3 surface tint体系 |
| Vuetify 3 | #F6F2FA 暖紫灰 | #1E1B1E 暖深灰 | #FFFBFE | #F3EDF7 | 跟随M3增加color-mix派生 |

### 2.2 关键设计原则

**原则1: 背景非纯白，而是带1-3%色彩偏移的暖白**
- 纯白#FFFFFF对眼刺激最大，暖白(加2-3%黄/橙)降低刺激
- 我们选择: #FAFAF8 (与Notion一致)
- 理由: 写作应用长时间阅读为主，暖色调降低疲劳

**原则2: 正文文字非纯黑，而是深灰 #333-#3F**
- 纯黑#000与#FAFAF8对比度21:1过高
- 深灰#37352F与#FAFAF8对比度约14:1，远超WCAG AAA 7:1
- 我们选择: #37352F (Notion方案暖深灰)

**原则3: 卡片比背景白1档，侧边栏比背景灰1档**
- 背景层: #FAFAF8 暖白
- 卡片层: #FFFFFF 纯白(比暖白更亮形成微弱提升)
- 侧边栏: #F3F2EF 暖灰
- 层次: 侧边栏 < 背景 < 卡片 < 弹窗

**原则4: 亮色主题阴影需比暗色更强**
- 暗色: alpha 0.3-0.5
- 亮色: alpha 0.10-0.20(白底上弱阴影不可见但太强会脏)
- 同时亮色应使用带色彩的阴影: rgba(91,107,219,0.08) 而非纯黑

**原则5: 亮色选中态需要提高alpha**
- 暗色: --accent-dim alpha 0.12 可见
- 亮色: alpha 0.12 在白底几乎不可见，需提到 0.16-0.20
- 方案: 用color-mix自动按主题调整

### 2.3 间距系统社区标准

Vuetify 3: 4px基准，16档(0/1/2/3/4/5/6/7/8/10/12/14/16/20/24/28)
Naive UI: 4px基准，12档
Material 3: 4px基准，8档(0/1/2/3/4/5/6/8 对应 0/4/8/12/16/20/24/32)

结论: 我们当前4档太少，扩展到10档即可覆盖全场景。

### 2.4 排版层次社区标准

Material 3: 15级(display/title/headline/body/label，每级small/medium/large)
Vuetify 3: 跟随M3，用CSS变量映射
Naive UI: 自定义8级

结论: 我们P0已定义7级，够用。需补充行高配对和旧名别名。

### 2.5 组件密度社区标准

Material 3: compact/comfortable/dense，通过CSS变量组切换
Vuetify 3: 通过全局config在运行时切换密度

结论: 用CSS属性选择器[data-density]切换，纯CSS不动JS。

---

## 三、执行计划 (P0-P8)

### P0: 亮色主题配色体系重建

范围: 仅 tokens.css 的 `body.light-theme` 块

#### P0-1: 背景色层次重建

```
--bg-primary: #FAFAF8;      /* 暖白主背景(替代#f5f5f7冷灰) */
--bg-secondary: #FFFFFF;    /* 纯白卡片层(保持但语义化) */
--bg-tertiary: #F0EFEC;    /* 暖灰三级(替代#eaeaef冷灰) */
--bg-elevated: #FFFFFF;    /* 弹窗/浮层(同卡片) */
--bg-input: #F5F4F0;       /* 输入框暖灰(替代#f0f0f5) */
--bg-card: #FFFFFF;         /* 卡片专用 */
--bg-sidebar: #F3F2EF;      /* 侧边栏暖灰(替代#f0f0f2) */
```

#### P0-2: 文字色层次重建

```
--text-primary: #37352F;    /* 暖深灰正文(替代#1a1a2e冷深灰) */
--text-secondary: #6B6A63; /* 暖中灰次要文字(替代#555560) */
--text-muted: #9B9990;     /* 暖浅灰辅助文字(替代#888894) */
--text-bright: #1A1A18;    /* 暖近黑标题(替代#000000纯黑) */
--text-on-accent: #FFFFFF; /* 强调色上白字(保持) */
```

#### P0-3: 强调色及派生色适配亮色

```
--accent: #5b6bdb;              /* 保持 */
--accent-hover: #4a5ad0;        /* 保持 */
--accent-active: #3d4dc6;       /* 保持 */
--accent-dim: rgba(91,107,219,0.16);  /* alpha从0.12提到0.16，白底可见 */
--accent-glow: rgba(91,107,219,0.24); /* alpha从0.2提到0.24 */
--accent-soft: rgba(91,107,219,0.16);  /* 同accent-dim */
```

#### P0-4: 边框色层次重建

```
--border-color: #E5E3DE;    /* 暖灰边框(替代#d0d0d8冷灰) */
--border-light: #D5D3CC;   /* 暖浅灰边框(替代#c0c0c8) */
--border-focus: #5b6bdb;    /* 保持 */
--border-dark: #E5E3DE;     /* 同border-color */
```

#### P0-5: 阴影系统适配亮色

```
--shadow-xs: 0 1px 2px rgba(60,55,45,0.06);
--shadow-sm: 0 2px 8px rgba(60,55,45,0.08);
--shadow-md: 0 4px 16px rgba(60,55,45,0.12);
--shadow-lg: 0 8px 32px rgba(60,55,45,0.16);
--shadow-xl: 0 16px 48px rgba(60,55,45,0.20);
--shadow-panel-sm: 0 2px 12px rgba(60,55,45,0.06);
--shadow-glow: 0 0 24px rgba(91,107,219,0.12);
--shadow-focus: 0 0 0 3px rgba(91,107,219,0.12);
```
说明: 用rgba(60,55,45,...)暖色阴影替代rgba(0,0,0,...)纯黑阴影，更自然。

#### P0-6: 气泡/覆盖层颜色适配

```
--user-bubble: #E8EDFF;     /* 用户气泡浅蓝(替代#e0e8ff偏冷) */
--ai-bubble: #F5F4F0;      /* AI气泡暖灰(替代#f0f0f5冷灰) */
--bg-overlay: rgba(0,0,0,0.25);     /* 保持 */
--bg-overlay-strong: rgba(0,0,0,0.50); /* 略降从0.55 */
--bg-overlay-soft: rgba(0,0,0,0.06);  /* 保持 */
--bg-glass: rgba(255,255,255,0.88);    /* 略提alpha从0.85 */
--bg-hover: rgba(91,107,219,0.08);    /* 保持 */
```

#### P0-7: V2新Token亮色覆盖(已有但需微调)

```
/* surface overlay: 亮色用black mix */
--surface-overlay-1: color-mix(in srgb, black 2%, transparent);
--surface-overlay-2: color-mix(in srgb, black 4%, transparent);
--surface-overlay-3: color-mix(in srgb, black 6%, transparent);

/* state layer: 亮色需略提alpha */
/* 已在:root定义，亮色不需覆盖因为currentColor自动适配 */

/* glass: 亮色用白色 */
--glass-bg: color-mix(in srgb, #FFFFFF 88%, transparent);
--glass-border: 1px solid color-mix(in srgb, black 10%, transparent);

/* shimmer: 亮色用black mix */
--shimmer-bg: linear-gradient(90deg, transparent 0%, color-mix(in srgb, black 4%, transparent) 50%, transparent 100%);
--skeleton-bg: color-mix(in srgb, #E5E3DE 50%, #F0EFEC);

/* gradient: 保持 */
--grad-accent: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
--grad-card-hover: linear-gradient(135deg, color-mix(in srgb, var(--accent) 4%, #FFFFFF) 0%, #FFFFFF 100%);
```

#### P0-8: 状态色适配

```
--danger: #D04050;      /* 保持 */
--danger-dim: rgba(208,64,80,0.12);  /* 保持 */
--danger-hover: #B03040; /* 保持 */
--danger-light: #E06070; /* 保持 */

--success: #2D9E68;     /* 保持 */
--success-dim: rgba(45,158,104,0.12); /* 保持 */
--success-light: #5DBA9A; /* 保持 */

--warning: #D98030;     /* 保持 */
--warning-dim: rgba(192,128,32,0.12); /* 保持 */
--warning-bright: #D09030; /* 保持 */

--info: #3090E0;       /* 保持 */
--info-dim: rgba(80,112,208,0.12); /* 保持 */
--info-light: #5070D0;  /* 保持 */
```

验证: `npm run build:vue` 成功 + 亮/暗主题切换正常

---

### P1: 间距系统扩展(10档)

范围: 仅 tokens.css `:root` 块

```
/* 扩展数字间距到10档 */
--space-0: 0px;
--space-1: 2px;
--space-2: 4px;
--space-3: 6px;
--space-4: 8px;
--space-5: 10px;    /* 新增 */
--space-6: 12px;
--space-7: 14px;    /* 新增 */
--space-8: 16px;
--space-9: 20px;    /* 新增(替代旧space-7) */
--space-10: 24px;
--space-12: 32px;   /* 新增 */
```

语义别名调整:
```
--space-xxs: var(--space-1);
--space-xs: var(--space-2);
--space-sm: var(--space-3);   /* 从4px改为6px，更紧凑 */
--space-md: var(--space-6);
--space-lg: var(--space-8);
--space-xl: var(--space-10);
--space-2xl: var(--space-12); /* 新增 */
```

注意: --space-sm 从 var(--space-4) 改为 var(--space-3)，即从8px变为6px。这是因为社区标准中sm通常是6px。但这会影响所有引用--space-sm的组件padding/gap。需在P5验证中检查。

验证: `npm run build:vue` 成功 + 关键页面间距无异常

---

### P2: 排版层次统一

范围: 仅 tokens.css `:root` 块

#### P2-1: 行高配对

```
--text-display: 28px;    --lh-display: 1.2;   /* 新增 */
--text-title-lg: 22px;   --lh-title-lg: 1.25; /* 新增 */
--text-title: 18px;      --lh-title: 1.3;     /* 新增 */
--text-body: 15px;       --lh-body: 1.55;     /* 新增 */
--text-small: 13px;      --lh-small: 1.5;     /* 新增 */
--text-label: 12px;      --lh-label: 1.4;     /* 新增 */
--text-caption: 11px;    --lh-caption: 1.4;    /* 新增 */
```

#### P2-2: 旧名→新名别名映射

```
/* 旧名保持兼容，映射到新名 */
--font-size-xxs: var(--text-caption);
--font-size-xs: var(--text-label);
--font-size-sm: var(--text-small);
--font-size-md: var(--text-body);
--font-size-lg: var(--text-title);
--font-size-xl: var(--text-title-lg);
--font-size-xxl: var(--text-display);
```

说明: 旧名继续有效(值不变)，但语义上指向新体系。后续开发优先用新名。

验证: `npm run build:vue` 成功

---

### P3: 组件密度系统(CSS属性选择器)

范围: tokens.css `:root` 新增 + base-components.css 新增密度覆盖

#### P3-1: 密度Token定义

```css
/* 默认密度: comfortable */
:root {
  --density-btn-xs-height: 26px;
  --density-btn-sm-height: 30px;
  --density-btn-md-height: 34px;
  --density-btn-lg-height: 38px;
  --density-card-padding: var(--space-md);
  --density-form-height: 34px;
  --density-form-padding: var(--space-sm) var(--space-md);
  --density-list-gap: var(--space-xs);
  --density-panel-padding: var(--space-md);
}

/* compact 密度 */
[data-density="compact"] {
  --density-btn-xs-height: 24px;
  --density-btn-sm-height: 28px;
  --density-btn-md-height: 30px;
  --density-btn-lg-height: 34px;
  --density-card-padding: var(--space-sm);
  --density-form-height: 30px;
  --density-form-padding: var(--space-xs) var(--space-sm);
  --density-list-gap: var(--space-1);
  --density-panel-padding: var(--space-sm);
}

/* dense 密度(最紧凑) */
[data-density="dense"] {
  --density-btn-xs-height: 22px;
  --density-btn-sm-height: 26px;
  --density-btn-md-height: 28px;
  --density-btn-lg-height: 32px;
  --density-card-padding: var(--space-xs);
  --density-form-height: 28px;
  --density-form-padding: var(--space-1) var(--space-sm);
  --density-list-gap: var(--space-1);
  --density-panel-padding: var(--space-xs);
}
```

#### P3-2: 组件引用密度Token

base-components.css 中替换:
```css
/* 旧 */
.btn-md { height: var(--btn-md-height); }
/* 新 */
.btn-md { height: var(--density-btn-md-height); }

/* 旧 */
.card { padding: var(--card-padding, var(--space-md)); }
/* 新 */
.card { padding: var(--density-card-padding); }
```

说明: --btn-md-height 等旧名保留兼容(值等于密度token)。

#### P3-3: 密度切换入口

在 AppearanceSettings.vue 中添加密度选择器(3个radio按钮)。
切换时在 document.documentElement 上设置 data-density 属性。
存储到 localStorage key: wa-density。

这是本方案唯一需要改动 .vue template 的地方(P3-3)。

验证: `npm run build:vue` 成功 + 三档密度切换视觉正常

---

### P4: 亮色主题默认化

范围: stores/theme.ts

将默认主题从 dark 改为 light:
```ts
const theme = ref<'dark' | 'light'>('light')
```

同时在 AppearanceSettings.vue 中:
- 下拉选择框增加 light 选项
- 初始 isDark 检测改为检测 light-theme class

验证: 应用启动默认亮色 + 切换暗色正常 + 重启保持

---

### P5: 间距变更影响验证

P1 中 --space-sm 从8px改为6px，需检查所有引用点。

验证方式:
1. `rg --count var\(--space-sm\)` 统计引用数
2. 源Electron启动 + 逐页面检查间距无异常
3. 重点检查: 按钮padding、卡片gap、列表间距

回退方案: 如发现问题，--space-sm 回退为 var(--space-4) 即8px

---

### P6: 亮色配色全量视觉验证

验证清单(纯视觉检查，不改代码):
1. 主页编辑器+API对话(亮色)
2. 大纲工作台(亮色)
3. 生成流水线五层(亮色)
4. 设置页面(亮色)
5. 记忆面板(亮色)
6. AI命名弹窗(亮色)
7. 插件市场(亮色)
8. 诊断日志(亮色)
9. 暗色全量(回归检查)
10. 亮暗切换无闪烁

---

### P7: 密度切换验证

验证清单:
1. comfortable(默认) - 所有页面正常
2. compact - 卡片/按钮/表单缩小，无溢出
3. dense - 最紧凑，无文字截断
4. 切换后重启保持
5. 暗色+compact组合
6. 亮色+dense组合

---

### P8: 收尾

1. `npm run build:vue` 最终构建
2. `git diff --stat` 确认只改了 tokens.css + base-components.css + theme.ts + AppearanceSettings.vue
3. `git diff` 逐行审查(M3规则)
4. 更新经验文件V2 §5 新增规则
5. 更新开发日志
6. 版本号升级

---

## 四、严格行为约束

### 4.1 允许改动的文件
| 文件 | 阶段 | 改动内容 |
|-----|------|--------|
| tokens.css | P0-P3 | 亮色覆盖值、间距扩展、排版配对、密度token |
| base-components.css | P3 | 组件引用密度token |
| stores/theme.ts | P4 | 默认主题改为light |
| AppearanceSettings.vue | P3-P4 | 密度选择器、主题下拉light选项 |

### 4.2 禁止改动
- src/services/**/*.ts
- src/stores/**/*.ts (theme.ts除外)
- electron/**/*.js
- components/**/*.vue (AppearanceSettings.vue除外)
- composables/**/*.ts
- vite.config.*
- package.json

### 4.3 禁止改动的CSS属性
display, flex, flex-direction, gap, width, height, position(除P6的relative), z-index, overflow(除P6的hidden), grid, align, justify

---

## 五、与P0-P12(已完成)的关系

本方案是 PROPOSAL_2026-09-05_UI_DESIGN_SYSTEM_UPGRADE.md 的延续和深化:
- 前序P0-P12完成了设计系统基础设施(一致性层+7个新能力层)
- 本方案在此基础上完成亮色主题的精细配色、间距扩展、排版统一、密度切换
- 不回退前序P0-P12的任何改动

---

## 六、风险分析(引用经验V2)

### 最高风险: --space-sm 变更
- P1将--space-sm从8px改为6px，可能影响所有引用组件
- 防御: P5专项验证，回退方案明确
- 参考: §5规则8 flex子项min-width:0

### 高风险: 亮色配色对比度
- 正文#37352F与背景#FAFAF8对比度需验证
- 防御: P6全量视觉验证
- 参考: §5规则4 必须真实打开目标界面

### 中风险: 密度token引用替换
- P3替换--btn-md-height为--density-btn-md-height
- 防御: 旧名保留兼容，P7验证
- 参考: §1 M1 影响圈声明

### 低风险: 亮色默认化
- P4只改默认值，用户已保存的主题不受影响
- 防御: P6验证
- 参考: §5规则1 tokens.css是唯一来源

---

## 七、验收标准

| 项 | 标准 | 验证方式 |
|----|------|--------|
| 亮色背景 | #FAFAF8暖白，非纯白#FFFFFF | tokens.css值确认 |
| 正文文字 | #37352F暖深灰，非纯黑 | tokens.css值确认 |
| 卡片层次 | 卡片#FFFFFF > 背景#FAFAF8 > 侧边栏#F3F2EF | 视觉确认 |
| 阴影 | 带暖色阴影rgba(60,55,45,...) | tokens.css值确认 |
| 选中态 | accent-dim alpha 0.16在白底可见 | 视觉确认 |
| 间距 | 10档(0/2/4/6/8/10/12/14/16/20/24/32) | tokens.css确认 |
| 排版 | 7级+行高配对+旧名兼容 | tokens.css确认 |
| 密度 | 3档切换(comfortable/compact/dense) | 视觉确认 |
| 亮色默认 | 应用启动默认亮色 | 启动验证 |
| 构建成功 | npm run build:vue exit 0 | 命令输出 |
| 无回归 | 暗色主题全量正常 | 视觉确认 |

---

## 八、经验文件引用

### §5 UI纪律
- 规则1: tokens.css是唯一变量来源
- 规则4: 必须真实打开目标界面验证
- 规则8: flex标题min-width:0
- 规则12: 进度弹窗绑定活跃层

### §1 改码纪律
- M1: rg列出引用再改
- M2: apply_patch逐行编辑
- M3: git diff逐行审查

### §3 验证纪律
- 规则1: 构建!=功能完成
- 规则17: build:vue后再做UI探针

---

## 九、执行顺序

P0(亮色配色) -> P1(间距扩展) -> P2(排版统一) -> P3(密度系统) -> P4(亮色默认) -> P5(间距验证) -> P6(亮色验证) -> P7(密度验证) -> P8(收尾)

每步: 改动 -> build:vue -> diff自审 -> 下一步
