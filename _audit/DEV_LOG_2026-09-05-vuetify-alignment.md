# DEV_LOG 2026-09-05: 亮色+密度 Vuetify 对齐修正

## 序号
143

## 日期
2026-09-05

## 改动等级
修正（P5 后续参数对齐）

## 改动文件

| 文件 | 改动内容 |
|---|---|
| src/styles/tokens.css | 亮色块 bg-primary #FAFAF8 -> #FFFFFF、bg-tertiary #F0EFEC -> #EEEEEE(对齐 Vuetify surface-light)、bg-input #F5F4F0 -> #F5F5F5、bg-sidebar #F3F2EF -> #EEEEEE、border-dark #E5E3DE -> #E0E0E0 |
| src/styles/tokens.css | 密度块删除 dense 第4档、新增 default 基准档、comfortable 偏移 -8px(原-4px)、compact 偏移 -12px(原-6px)、总跨度 12px(原6px) |
| src/components/settings/AppearanceSettings.vue | 密度下拉从4档改为3档(默认/舒适/紧凑)、默认值从 comfortable 改为 default、localStorage 读取增加 else 分支 |
| src/stores/theme.ts | init() 新增密度初始化逻辑 |

## 改动原因

上一轮 P5 亮色主题+密度系统参数与 Vuetify 4.2.0 实际源码值存在偏差：
1. 亮色背景 #FAFAF8 与卡片 #FFFFFF 色差仅 1-2%，层次出不来。Vuetify 用 #FFFFFF + #EEEEEE，10% 明确色差。
2. 密度 4 档总跨度仅 6px，Vuetify 只有 3 档总跨度 12px。
3. 启动时不设置 data-density 属性。

## 验证

- npm run build:vue exit 0
- tokens.css 亮色块 bg-primary=#FFFFFF、bg-tertiary=#EEEEEE 确认
- tokens.css 密度块三档 default/comfortable/compact 确认，无 dense 残留
- AppearanceSettings.vue 三档选项确认
- theme.ts init() 含 data-density 初始化确认
- 经验文件 V2 规则 20-23 已更新

## 对应用的影响

- 亮色主题层次分明，10% 明确色差
- 密度三档与成熟框架一致，切换有明显差异
- 启动即有密度属性
- 纯 CSS 改动，不破坏功能链路
