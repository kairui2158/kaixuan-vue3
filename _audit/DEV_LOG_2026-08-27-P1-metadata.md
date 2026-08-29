# DEV_LOG 2026-08-27 P1 正文与 metadata 分离

## 目标

将正文文本、来源追踪、校验报告和执行状态从单一字符串边界中分开，避免 `【来源覆盖】`、来源编号和调试字段进入最终正文。

## 实施

1. 新增 `src/services/generationResult.ts`，定义 `GenerationResult` 与 `GenerationMetadata`。
2. 新增 `src/services/generationResult.spec.ts`，覆盖旧纯文本、JSON 信封、代码围栏、thinking 标签和非法信封。
3. `PipelinePanel.vue/genBody` 在写入前解析结果：正文写入 `chapter.body`，元数据写入 `chapter.generationMetadata`。
4. 章节管理器同步和 `insert-text` 事件只接收正文 body。

## 验证

- focused：5/5
- 全服务：44/44
- `npm run type-check`：退出码 0
- `npm run build:vue`：177 modules transformed，构建成功
- Electron/CDP：编辑器实际值为 `正文段落一。\n正文段落二。`，`bodyHasMetadata=false`

## 保留边界

未配置真实生成 API，因此不声称真实 API 信封端到端已验证；该项进入 P8。工作区既有历史改动未清理、未回滚。
