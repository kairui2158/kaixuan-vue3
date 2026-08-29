# 设定层 P6：API 反馈非阻塞化

## 验证范围

- API 日志与进度条使用独立反馈容器。
- 日志超长时自身滚动，不推动或覆盖设定列表。
- 生成结束后反馈状态仍可保留，生成中由 store 状态驱动显示。

## 证据

- 模板：`#pl-settings-generation-feedback` 使用 `settingsGenerationFeedbackVisible`，由 `pipelineStore.isGenerating || settingsGenerationLogs.length > 0` 驱动。
- 模板：`#pl-settings-api-log` 独立于 `#pl-bound-settings-list`。
- CSS：`.pl-generation-log` 设置 `max-height: 132px; overflow-y: auto`。
- 当前空闲 CDP：反馈容器隐藏；设定列表 `clientHeight=190`、`scrollHeight=493`、`overflowY=auto`，没有反馈容器占位。

## 结论

- P6：PASS。进入 P7 视觉层级和边框降噪。
