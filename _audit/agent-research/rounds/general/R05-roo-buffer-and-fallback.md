# R05 Roo 压缩缓冲与失败回退

- 仓库：RooCodeInc/Roo-Code
- 源码：src/core/context-management/index.ts
- 原始地址：https://github.com/RooCodeInc/Roo-Code/blob/main/src/core/context-management/index.ts
- 关键证据：10% buffer 与 `allowedTokens` 计算见 171-192；压缩失败回退 `truncateConversation(messages, 0.5)` 见 280-331。
- 机制结论：压缩必须有失败路径，失败后不是硬中断，而是进入保守截断并继续可运行。
- 应用对账：应用已有 400 降档路径（`aiService.ts:2495,2697-2743`），但压缩失败缺少同等明确回退。
- 采纳结论：采纳。压缩失败进入只保留当前任务 + 关键事实的保守快照，并写 `context_compaction_fallback` trace。

