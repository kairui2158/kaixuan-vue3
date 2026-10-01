# DEV LOG: API 直写协议成熟化 V2 Phase 1

日期：2026-09-19

## 本阶段范围

- 建立供应商工具能力矩阵单源，覆盖 `openai-compatible`、`deepseek`、`anthropic`、`gemini`、`azure-openai`。
- `supportsNativeTools()` 改为消费能力矩阵，删除并行硬编码列表，避免新旧供应商判断并存。
- 新增协议矩阵测试：能力继承、Gemini `unverified` 状态、多工具顺序、非法 JSON 参数、空 tools、Gemini 工具名映射。
- 新增 `scripts/verify-api-direct-write-provider-matrix.mjs`：默认执行协议仿真；配置 live 环境变量后执行真实 OpenAI-compatible 网关验证。

## 实现细节

- `src/services/providerTools.ts`
  - 新增 `providerToolCapabilities`、`getProviderToolCapability()`。
  - 能力字段包括 native tools、streaming tool calls、strict schema、tool result wire format、继承来源。
  - DeepSeek 与 Azure 显式声明继承 `openai-compatible` 工具协议。
  - Gemini 流式工具调用按现状登记为 `unverified`，未实现解析器前不标支持。
  - Gemini 工具名映射保持原有单点还原语义，仅通过 helper 统一编码/解码，避免三处规则漂移。
- `scripts/verify-api-direct-write-provider-matrix.mjs`
  - 协议仿真通过 Vitest 执行 `providerTools.spec.ts`。
  - live 层只通过 `PROVIDER_LIVE_KEY`、`PROVIDER_LIVE_BASE_URL`、`PROVIDER_LIVE_MODEL` 环境变量读取配置，不落盘。
  - 报告中五供应商必须全部出现，防止只测单一触发供应商。

## 验证记录

- `npm exec -- vitest run src/services/providerTools.spec.ts`：11 passed。
- `node scripts/verify-api-direct-write-provider-matrix.mjs`（无 live 配置）：协议仿真 pass，五供应商 live 状态 `untested`。
- live 验证（OpenAI-compatible 网关，模型 `deepseek-v4.1-flash`）：工具调用返回 1 个合法 tool call，状态 `pass`。
- `npm run type-check`：通过。
- `npm run verify:production-wiring`：273 modules / 904 dependencies，无依赖违规。

## live 层协议事实

- 该网关可用模型来自 `/v1/models`，本次选择 `deepseek-v4.1-flash`。
- 该网关拒绝带点函数名（如 `editor.get_state`），错误为 `the tool name is invalid or duplicated`；使用下划线函数名（如 `editor_get_state`）可通过。
- 此限制记录为 openai-compatible 供应商的网关差异，不在本轮全局改应用工具名。

## 遗留与后续

- Phase 2：schema 校验器硬化与 folder schema 归一化。
- Gemini 流式 functionCall 聚合保持 `unverified`，不在本轮实现。
- Anthropic、Gemini、DeepSeek 直连、Azure 直连 live 未配置，报告中保持 `untested`。
