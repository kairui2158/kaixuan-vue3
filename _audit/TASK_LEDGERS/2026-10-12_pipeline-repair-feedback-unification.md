# 2026-10-12 流水线修复反馈统一任务台账

## 1. 目标与原话

- 目标：修复正文层四项反馈（schema 裸重试、warning 不可见、S2 请求口径失真、DEAI 全量压制），建立全流水线共享的修复反馈与链路可观测底座，并用真实 Electron + 真实 API 验证后封装 3.81.0。
- 审核决策：四点均按建议执行；S2 采用 meta 声明上下文，S2 DEAI 用正向风格指令，回显修复阈值 0.85 且仅一次，续写尾部窗口 32,000 字符。

## 2. 门禁读证

- G0.3：schema 失败、回显、降级过程在 trace 与日志中保留，不伪装成完全无损。
- G0.5：回头看发现续写请求丢 system 上下文，已修复并补单测。
- G1.4/G1.5：单测、type-check、Electron live、回放、打包分层登记；验证器默认超时按真实供应商耗时固化。
- G1.8：新增最终物理请求口径门禁，trace 长度必须来自最终 messages。
- G2.9/G2.13：四层流水线共用修复反馈语义；SKILL 只声明上下文需求，执行与验收仍由应用单源决定。

## 3. 路由判定

- 加入：G0.1/G0.3/G0.5/G0.8/G0.9/G0.10/G0.12、G1.4/G1.5/G1.8、G2.9/G2.13。
- 排除：G2.1-G2.7、G2.10-G2.12；本轮不改 API 直写、编辑器、长文档预算、供应商协议。

## 4. 影响圈与作者反证

- 实际改动：`realSkillExecutor`、`PipelinePanel`、`chainExecution`、`chainHandoff`、`skillRouter`、章节/卷纲 orchestrator、`de-ai`、`realSkillTypes`、新增 `pipelineStepLog` 与两个验证器。
- 假设 1：schema 重试只需增加次数。证伪：旧 trace 两次重试请求完全相同，无反馈时模型无法收敛；新重试必须携带具体错误。
- 假设 2：S2 变薄是应用瘦身错误。证伪：真实原因是 folder multi-pass `input=previous`；正确修复是显式记录并由 meta 声明上游需求，而不是默认塞回全文。
- 假设 3：续写只带尾部即可防滚雪球。证伪：回头看发现会丢 SKILL/Agent system 上下文；正确口径是保留非 user 上下文，只限制已输出回显窗口。

## 5. 停止条件

- 四项反馈各有实现、单测与 live 证据。
- 五类 warning 步骤日志可见且聚合。
- 新 trace 回放 `ACCEPTED`，旧 trace `EXPECTED-FAIL`。
- 全量测试、type-check、构建、3.81.0 打包与真实启动核验通过。
- 经验、DEV_LOG、台账、主索引更新，工作区清理并提交。

## 6. 执行证据

- schema 重试：`src/services/realSkillExecutor.ts` `buildSchemaRetryFeedback`、`attemptRequestMessages`。
- 物理口径：`folder-pass-input` 事件与 `chain-context-slim.measurement=upstream_prompt_only`。
- warning 聚合：`src/services/pipelineStepLog.ts`。
- DEAI 分步：`src/services/de-ai.js` `DEAI_CREATIVE_PROMPT`、`resolveDeaiPromptForChainStep`。
- 续写修正：`buildContinuationMessages` 保留非 user 上下文，尾部 32,000 字符；`realSkillExecutor.spec.ts` 断言 system 保留与长度上限。
- 专项测试：83 tests passed；type-check exit 0。
- Electron live：`_audit/verification-pipeline-repair-feedback-live/summary.json`，三场景 success；真实下拉选择 SKILL，无注入冒充。
- 回放：新三份 `ACCEPTED`，旧正文层 `EXPECTED-FAIL`。

## 7. 缺口清单

- 无实现缺口。live 覆盖一个供应商形态（deepseek-v4-pro / openapi.cloud-ai.cn）；其他供应商矩阵不在本轮声明范围。
