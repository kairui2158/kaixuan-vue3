# 开发日志：设定层"当前设定"内联编辑区移除（2026-08-31）

## 问题

客户反馈设定层生成后，设定卡片下方出现"当前设定"编辑区。它与卡片"信息"弹窗功能完全重复（名称、属性内容、绑定、删除、保存），且固定占用一整行空间，压缩设定卡片区。

## 修复

`src/components/pipeline/PipelinePanel.vue`：

1. 删除模板中 `v-if="selectedSettingItem"` 的内联编辑区块。
2. 删除仅服务于该区块的 `selectedSettingItem` computed。
3. 删除 `pl-setting-detail` / `pl-setting-detail-heading` / `pl-setting-detail-status` / `pl-setting-detail-fields` / `pl-setting-detail-actions` 及其响应式 CSS（注意与信息弹窗的 `pl-setting-detail-modal-*` 类名区分，弹窗样式保留）。

设定编辑、绑定、删除、保存能力全部保留在卡片"信息"弹窗中，行为不变。

## 验证

1. `rg "selectedSettingItem"` 无匹配；`rg "pl-setting-detail"` 仅剩信息弹窗的 `pl-setting-detail-modal-*` 类与 ID。
2. `npm run type-check` 通过。
3. `npm run build:vue` 通过，286 个模块转换成功。
