# 设定层 P9：极端尺寸与递归溢出验证

## 根因与修复

- 1024x700 和 800x600 下，设定层 flex 子项被压缩，`.pl-setting-detail-fields` 的可见高度曾为 `0`，而内容框 `overflow-y:hidden`，造成编辑区被截断。
- `src/components/pipeline/PipelinePanel.vue`：设定工作区和内容框改为纵向滚动；内容框设置 `min-height: 220px` 并停止 flex 压缩；编辑器保持内容高度。

## 验证

- `P9_SETTINGS_BOUNDS`：1440x900、1280x800、1024x700、800x600 四种视口均无横向边界 violation。
- 修复后四种视口 `.pl-setting-detail-fields` 均为 `clientHeight=88`、`scrollHeight=88`；列表和内容框通过纵向滚动承载长内容。
- 长属性摘要的 `scrollWidth > clientWidth` 是 `text-overflow: ellipsis` 的预期省略，不是边框或控件越界；名称、分类标签和状态均无意外横向溢出。

## 结论

- P9：PASS。已覆盖多尺寸、长属性、长列表、递归内容框边界。
