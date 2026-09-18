# 移除应用自设 16384 输出上限并修复 reasoning 重试（P0/P1）

> 日期：2026-09-16
> 来源：`run-trace-卷纲层-20260916-031138-deep`
> 状态：待审核
> 方案成熟度：成熟（问题定位来自真实 trace；修复面与验证方式已对齐 M12/M17/M8 门禁）

## 背景

卷纲层 S2 两次物理请求均失败：`finishReason=length`，`completion_tokens=16384`，其中 thinking tokens 全部或近乎全部占满，正文 0。根因是 [providerAdapter.ts](../src/services/providerAdapter.ts) 的 `resolveMaxTokens()` 把所有请求硬压到 16384，而 `glm-5.3-sp` 是 reasoning 模型，thinking token 计入 completion。S2 的长推演任务在思考阶段耗尽预算，无法进入正文输出。

现有直出重试只是在 system prompt 追加 `【直出模式】跳过所有内部思考`，不改变 maxTokens，也不传 thinking 开关，对 reasoning 模型等效于原题重做。

## P0：移除应用自设 16384 硬顶

1. `resolveMaxTokens()` 不再做 `Math.min(raw, 16384)` 裁剪，只负责解析用户/Agent/供应商配置与默认值。
2. 若模型元数据存在真实 `maxOutputTokens`，可用它作为上限，但这属于模型能力，不是应用假设。
3. 请求体如实传递配置值。

## P1：上限错误自动降级

1. 供应商因 `max_tokens` 超限返回 400 时，解析错误响应中的允许上限。
2. 将请求降到供应商允许的最大值并自动重试一次。
3. 写入 `max-tokens-downgraded` 诊断与 run trace 事件，说明原值、降级值、原因。
4. 无法解析上限时，按错误信息中的建议值执行；再失败则保持现有失败闭环，不冒充成功。

## P1：直出重试变成真重试

1. reasoning 模型触发 `reasoning_exhausted` 时，重试策略不再只追加提示词。
2. 按供应商协议尝试关闭 thinking 或设置 reasoning budget（例如 `enable_thinking:false`、`thinking_budget`、`reasoning_effort`；以实际协议支持为准）。
3. 不支持 thinking 控制的协议，则提高重试 maxTokens 并提示“上限包含思考预算”。
4. 重试请求在 run trace 中记录 `retryStrategy: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'`，避免 SKILL 调试方无法分辨。

## P1：失败终态语义修正

1. Pipeline 各层失败时，`finishRun()` 不再使用 `*_generation_complete` 作为 reason。
2. 失败路径传真实错误或 `generation_failed`；完成原因只在成功路径使用。

## 验证矩阵

| 验证 | 覆盖点 |
|---|---|
| 单元测试 | `resolveMaxTokens()` 不裁剪配置；400 降级解析；reasoning 重试策略选择 |
| 集成测试 | S2 形态请求：reasoning 模型 + length + text=0，必须产生 thinking 重试而非同参重发 |
| Trace 对账 | 重试事件、maxTokens 原值/新值、终态 reason 双侧记录 |
| 回归 | 非 reasoning 请求不改变现有行为；无上限错误时不新增请求 |

## 影响面

`src/services/providerAdapter.ts`、`src/services/aiService.ts`、`src/services/realSkillExecutor.ts`、`src/services/generationValidity.ts`（如需状态扩展）、相关 spec、run trace 事件类型与 UI 文案。
