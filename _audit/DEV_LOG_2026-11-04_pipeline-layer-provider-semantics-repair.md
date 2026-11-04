# 2026-11-04 生成流水线分层供应商语义修复

## 目标

用户核心要求是让生成流水线四层绑定供应商与全局能力同等真实：`settings / volumes / chapters / body` 任一层绑定后，该层全部生成请求必须由层绑定支配，Agent 只能在无层绑定时作为次级来源，最后才允许全局生成供应商；失效时不静默回退。本次已按 `PROPOSAL_2026-11-04_PIPELINE_LAYER_PROVIDER_SEMANTICS_REPAIR.md` 完成实施与验证，版本升级 3.113.0。

## 交付

- 裁决语义固定为 `layer > agent > global`，纯函数裁决面为 `src/services/pipelineProviderChannels.ts:70-88`。
- `realSkillExecutor` 不再用 Agent 二次覆盖层绑定，四层生成、修复与链内请求消费同一 caller profile。
- 辅助外呼明确标记 `providerSource: auxiliary`：`src/services/memoryExtractor.ts:37-44,64-70`，`src/composables/useAiCallTrace.ts` 补齐并透传该类型。
- run trace、api call 与物理请求三面继续同源输出 `providerId + model + providerSource`，详情与导出保留分层语义。
- 真实 Electron 验证目录新增分层供应商证据：`_audit/verification-pipeline-provider-channel/`。

## 验证

- `npm run build:vue` exit 0。
- `node scripts/verify-pipeline-provider-channel-electron.mjs` 输出 `[PASS] layer provider UI, persistence, warnings, and routing verified; mode=mock-four-layer-providers; requests=4`。
- `npx vue-tsc --noEmit` exit 0。
- `npx vitest run` 通过全量回归（最终记录见任务台账执行后补充证据）。
- `npm run verify:packaging` 通过后记录安装包字节数、SHA-256 与 asar version。

## 回头看

旧 `agent > layer > global` 语义已从执行裁决、生产测试、验证器与文档同批退役；辅助记忆链路不再是未声明来源。验证器继续区分真实 UI、真实 Electron、mock 请求与真实供应商 observational，避免互相冒充。

## 边界

- 本轮 Electron 证据为真实 UI 与 mock 四层供应商请求，不声明真实供应商内容质量。
- 不做负载均衡、健康切换、自动回退或额外 preflight。
- 经验文件无需本轮变更：type-check 先于 build 已由 v10 G1.4 覆盖。
