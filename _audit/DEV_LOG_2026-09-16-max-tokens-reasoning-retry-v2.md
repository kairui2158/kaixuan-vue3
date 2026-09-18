# 开发日志：MAX_TOKENS_AND_REASONING_RETRY_V2（2026-09-16）

## 目标

移除输出上限的人为裁剪，让供应商 400 上限、思考耗尽和重试策略在三个 API 入口与运行记录中对账一致。

## 实际交付

1. `providerAdapter.resolveMaxTokens()` 不再用 16384 裁剪请求；`aiService` 的 400 解析会按供应商声明上限降级一次，成功结果携带有效 `maxTokens`。
2. `providerProtocols` 支持已确认的思考关闭参数：OpenAI 兼容与 DeepSeek 写 `reasoning_effort: "none"`，Anthropic 写 `thinking: { type: "disabled" }`。
3. `realSkillExecutor` 直出重试按 1.5 倍提升输出上限；重试事件携带 `retryStrategy` 与有效 `maxTokens`。
4. 主页 `ChatPanel` 直出重试按供应商协议分流：可关闭思考时用 `thinking_disabled`，否则用 `max_tokens_raised`；事件、API 记录和有效性判定使用实际生效值。
5. `runTrace` 的 API 调用与物理请求新增 `retryStrategy`、有效 `maxTokens`；主页、大纲、流水线三处记录器统一透传，诊断日志同步输出。
6. 流水线四层 finally 不再无条件写 `*_generation_complete`；只有真实状态为 success 才写完成 reason，失败/取消/阻断统一写 `generation_failed`。
7. 流水线有效性判定优先使用结果内实际 `maxTokens`，避免 400 降级后仍按入口配置误判截断。

## 验证

- `npx vitest run src/services/aiService.spec.ts src/services/realSkillExecutor.spec.ts src/services/generationValidity.spec.ts`：119 passed。
- `npx vue-tsc --noEmit -p tsconfig.json`：通过。
- `npm run build:vue`：renderer 与 providerProtocols 双构建通过。
- 回头看 `rg`：确认 `retryStrategy`、`maxTokens`、`reasoning` 在三个入口和统一服务层没有漏接。

## 边界

- 思考控制参数只落已确认协议，不猜测未验证字段。
- 本日志只覆盖 MAX_TOKENS_AND_REASONING_RETRY_V2；CHAIN_HANDOFF_EXECUTION_V2 另行执行与登记。
