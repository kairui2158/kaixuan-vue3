# 2026-09-19 意图路由 V5 收尾开发日志

## 发生了什么

V5 主实施已在前一段完成：路由三态、入口单源、等待恢复、初始化韧性、postProcess 终态单源与回归测试。回头看时发现旧链路矩阵仍有两处真实残留：

1. 大纲工作台入口在调用 `runWorkspaceSkills()` 前仍用 `routingDecision.forcedIntent || 'auto'` 自行构建工具面并写入 trace，违反 V5 的“入口不自行组装工具面”约束。
2. fallback 推荐意图推断在引擎、主页、大纲三处各写一份，语义相同但类型收窄程度不同，属于 M16/M26 禁止的同款逻辑分叉。

## 怎么修

1. 删除大纲入口的预组装工具面代码，`startOutlineRun()` 与 `onApiCallStart()` 不再用入口预估值填 `toolSurface`；真实工具面由引擎 `resolveAuthorizedToolSurface()` 和 `routing_result` 回调统一写入。
2. 将引擎内 `inferFallbackIntent()` 导出为 `inferRoutingFallbackIntent()`，chain / compose 两个内部调用点与主页、大纲两个恢复按钮全部改为消费同一函数。
3. `ChatPanel.continueRoutingFallback()` 的 `routing` 类型从 `unknown` 收窄为 `ChainRoutingResult`，缺失旧路由时用显式 `no_match/low-confidence/await-user` 兜底，不再靠运行时猜测。

## 怎么验

- `npm run type-check`：通过。
- `npx vitest run src/services/chainIntentRouter.spec.ts src/services/workspaceSkillEngine.spec.ts`：2 个文件 41 个测试通过。
- `npm run evaluate:chain-intent`：classification 20/20，routing 20/20，saturated routing 20/20 类失败为空，saturated corpus 253 条。
- `npx vitest run src/stores/runTrace.spec.ts src/services/realSkillExecutor.spec.ts src/services/stateTransitionGuard.mappings.spec.ts`：3 个文件 101 个测试通过。
- 旧链路扫描：`forcedIntent || 'auto'` 仅剩 `workspaceSkillEngine.ts:1147` 的路由后兜底；`editor.propose_edits` 仅剩负向断言；`no-keyword-overlap` 在生产源码只剩路由器 reason 定义。

## 旧链路清零结论

| 面 | 结论 |
| --- | --- |
| 生产入口 | 大纲旧预组装工具面已删除；主页入口无 `forcedIntent || 'auto'` 残留 |
| 服务层 | `workspaceSkillEngine.ts` 内 `|| 'auto'` 是路由结果后的兜底语义，不是旧入口自行组面，保留 |
| UI | 两入口 fallback 恢复统一消费 `inferRoutingFallbackIntent()`；不再自行复制推断 |
| 测试 | `chainIntentRouter.spec.ts` 的 `no-keyword-overlap` 是路由器行为断言，保留 |
| 脚本 | `evaluate-chain-intent-router.mjs` 输出 routing / saturated failure categories，均空 |
| 规格 | 09-13 旧方案文档保留为历史记录，不改写历史方案 |
| 日志字段 | `routingFallback` 保留为消息状态字段；runTrace 记录 `routing.fallbackMode`，语义为 V5 三态 |

## 遗留与边界

1. 完整 resumeToken 恢复结构未实现，属 V5 增强项；现有 `next_turn` 恢复、routingFallback 气泡重发与 `awaiting_confirmation` run 状态已形成可用闭环。
2. 本轮未封装安装包；放行条件中的 E2E 双侧对账仍按 V5 方案保留为后续客户实操验证面。
