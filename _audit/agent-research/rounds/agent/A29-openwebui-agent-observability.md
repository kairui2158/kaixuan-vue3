# A29 Open WebUI Agent 可观测性

- 仓库：open-webui/open-webui
- 源码：backend/open_webui/utils/middleware.py
- 原始地址：https://github.com/open-webui/open-webui/blob/main/backend/open_webui/utils/middleware.py
- 机制：请求、响应、压缩、中间件处理链路有统一观测点。
- 应用对账：runTrace 已深度化，但 Agent 事件还没有独立 schema 与导入导出对齐。
- 采纳：采纳。Agent trace 与 runTrace 事件桥接，保持导出字段稳定。

