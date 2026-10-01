# A21 OpenHands Action/Observation 强类型

- 仓库：All-Hands-AI/OpenHands
- 源码：src/components/conversation-events/chat/event-content-helpers/get-action-content.ts
- 原始地址：https://github.com/All-Hands-AI/OpenHands/blob/main/src/components/conversation-events/chat/event-content-helpers/get-action-content.ts
- 机制：每个动作与观察都有强类型渲染，不把事件序列化成模糊字符串。
- 应用对账：runTrace 事件已有分层，但 Agent 事件需要独立 schema。
- 采纳：采纳。定义 `AgentTurnEvent/AgentToolEvent/AgentUsageEvent/AgentCompactionEvent`。

