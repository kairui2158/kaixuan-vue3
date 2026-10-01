# R09 Open WebUI 压缩 checkpoint 可续接

- 仓库：open-webui/open-webui
- 源码：backend/open_webui/utils/middleware.py（本地缓存名 openwebui-context-compaction.py）
- 原始地址：https://github.com/open-webui/open-webui/blob/main/backend/open_webui/utils/middleware.py
- 关键证据：优先真实 usage，阈值默认 80000，总结 checkpoint 支持续接（58-147,237-251,278-324）。
- 机制结论：压缩不是一次性动作，checkpoint 使压缩中断后可恢复，避免用户长会话丢失。
- 应用对账：应用有 runTrace 与 context service，但压缩 checkpoint 尚无正式结构。
- 采纳结论：采纳。压缩生成 checkpoint，与 runTrace 事件绑定，失败可重试或回退。

