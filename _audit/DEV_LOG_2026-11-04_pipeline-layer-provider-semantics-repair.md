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

## 回头看缺口执行（2026-11-04）

1. 新增三条真实 Electron UI 断言：供应商导入同 ID upsert、生成探针按钮链路、运行记录面板显示层绑定供应商来源。相关入口为 `scripts/verify-pipeline-provider-channel-electron.mjs` 的 `assertImportUpsertThroughRealUi`、`assertGenerationProbeThroughRealUi`、`assertRunTraceLayerSourceThroughRealUi`。
2. 顺手修复两个真实溯源接缝：`ApiSettings.vue` 三个供应商测试探针显式声明 `providerSource: none`；`useAiCallTrace.begin()` 补传 options 中已有的 `providerSource`；`runTrace.startApiCall()` 允许通道裁决后把该来源安全回填到 run 级。
3. 复跑 Electron UI 验证输出 `[PASS] layer provider UI, persistence, warnings, and routing verified; mode=mock-four-layer-providers; requests=6`。新增请求量来自导入 upsert 后的生成探针。
4. 版本指纹偏差说明：此前旧 report 记录 `runtimeFingerprint.appVersion=3.112.0`，是“功能代码已是 3.113.0，但 renderer 由 3.112.0 时序构建”的构建产物，不是版本回退。本轮 `npm run build:vue` 后，`body-trace.json:21-23` 已显示 `appVersion=3.113.0`，偏差解除。

## 回头看

旧 `agent > layer > global` 语义已从执行裁决、生产测试、验证器与文档同批退役；辅助记忆链路不再是未声明来源。验证器继续区分真实 UI、真实 Electron、mock 请求与真实供应商 observational，避免互相冒充。

## 边界

- 本轮 Electron 证据为真实 UI 与 mock 四层供应商请求，不声明真实供应商内容质量。
- 不做负载均衡、健康切换、自动回退或额外 preflight。
- 经验文件无需本轮变更：type-check 先于 build 已由 v10 G1.4 覆盖。

## 回归修因（2026-11-04 收口）

- `realS2ProtectedContract.integration.spec.ts` 在 HEAD `21e7f227` 复跑为红，A/B stash 后仍红，判定为 HEAD 既有回归，非本轮供应商溯源修复引入。
- 诊断 dump 显示失败码为 Vivid-SKILL 0.4.1 新增的结构契约：`段落中位3500字，高于作者基准P95上限51`。测试旧样本是一整段重复文本，已不再符合活体 SKILL 的段落约束。
- 修复方式是让测试样本适配活体 SKILL 新契约：改用确定性生成、每段 40 个唯一汉字的多段正文，上导游离样本净字数 3200，候选样本净字数 3500；原有重复【正文交接】折叠与受保护契约下传断言不变。
- 收口验证：`npx vue-tsc --noEmit` exit 0；`npx vitest run` `Test Files 247 passed (247)`、`Tests 2653 passed (2653)`；`npm run build:vue` exit 0。
