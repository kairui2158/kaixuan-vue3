# R06 Continue 压缩阈值与 buffer 上限

- 仓库：continuedev/continue
- 源码：extensions/cli/src/compaction.ts
- 原始地址：https://github.com/continuedev/continue/blob/main/extensions/cli/src/compaction.ts
- 关键证据：buffer cap 15000，ratio 0.8（19-20,280-285）。
- 机制结论：阈值和 buffer 属于实现参数，不暴露给用户；不同客户端可以按模型窗口动态推导。
- 应用对账：应用设置页把 token 上限当用户可配置项，方向相反。
- 采纳结论：采纳思想，不照抄数值。应用阈值按模型窗口比例推导，参数内部化，并向 runTrace 说明来源。

