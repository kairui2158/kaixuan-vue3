# DEV_LOG_2026-11-01_deai-mentor-guidance-v3

## 目标

按用户五条裁决升级内嵌降AI方案：区分流水线内嵌降AI与应用手动去AI味；补齐旧内嵌降AI退场；角色收敛为唯一“方法指导者”；评估耗时影响；明确应用 UI 体现。

## 交付

1. 新增方案：`_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V3.md`。
2. 新增台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v3.md`。
3. V2 台账头部补 V3 指向，避免历史版本混淆。
4. 主索引登记本日志。

## 关键结论

1. 两套系统不是文案混淆，而是状态共享：流水线在 `PipelinePanel.vue:6093` 读取 `deAiStore.hardRuleMode`，`:6103-6105` 与 `:6220` 会在 `legacy-auto/deep-fix` 时改写流水线正文。V3 将其列为 Phase A 第一优先级隔离。
2. 角色唯一化：内嵌降AI只做方法指导者；确定性检测结果降为 advisory 教学材料，不承担阻断职责；平台合同与叙事 verdict 裁判权不变。
3. 效率保护：每步最多 6 条、1200 字符、本地构造 5ms；影子期 20 章、2 题材、2 模型；中位耗时或首 token 劣化超 10% 时先降条数复测。
4. 退场闭环：旧三段提示词、流水线改写分支、跨 store 读取、旧 trace 枚举、测试守护、文档与构建产物纳入 G0.10 七层清零和五证验收。
5. UI 体现：徽章“内嵌降AI：方法指导”、实际条数日志、可折叠教学反馈面板、效率指标与 informational-only 标签；手动去AI味设置页不变。

## 验证

- 只读对账：`de-ai.js:1222-1267`、`skillDeaiContract.ts`、`PipelinePanel.vue:2776-2837,3713-3775,6090-6294`、`deai.ts:65-243`、`useDeAi.ts:246-369`。
- 测试守护扫描：`rg -n -g "*.spec.ts"` 确认旧三段提示词与旧模式至少由 `de-ai.spec.ts`、`skillDeaiContract.spec.ts`、`deaiChainVariantIntegration.spec.ts`、`deai-voice-profile-injection.spec.ts`、`deai-injection-policy.spec.ts`、`runTrace.spec.ts` 守护。
- 本轮未改生产代码，不运行应用测试；后续阶段按 V3 验证计划执行。

## 边界

- 待用户审核；审核通过前不改生产代码。
- 不升版、不封装、不提交 git。
- 不改手动去AI味功能。
- 教学有效性保持未验证状态；阈值、词库、评分权重保持 provisional。
