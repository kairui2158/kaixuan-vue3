# DEV_LOG_2026-11-01_deai-mentor-guidance-v4

## 目标

按用户要求把 V3 的 21 项风险推演升级到“机制、证据、断言、停机条件”齐备，风险不清零不进入实施。

## 交付

1. 新增方案：`_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V4.md`
2. 新增台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v4.md`
3. V3 台账头部补 V4 指向
4. 主索引登记本日志

## 关键修正

1. 纠缠面从 3 项扩为 4 读 1 写：补入 `hardruleEnabled` 与 `setLastDetectReport`，证据 `PipelinePanel.vue:6091,6093,6099,6103,6176`。
2. overlap 不再伪装成元数据声明机制：源码证明是 11 个关键词的字面交集，V4 明确 keyword-lite + declared overlaps 的可审计组合。
3. `finalStepDetection` 必须先修接线：`realSkillExecutor.ts:526-528` 只在 polish retry 分支消费，正常终步断链。
4. `suffix-only` 的等价现状由 `SUFFIX_ONLY_EQUIVALENT_MODE='on'` 与测试共同锁定，分叉必须走独立迁移门禁。
5. 零 diff 限定为确定性构造物比较，不用两次 LLM 采样冒充机制等价。

## 验证

- 只读源码对账：`PipelinePanel.vue`、`skillDeaiContract.ts`、`skillDeaiContractValidation.ts`、`realSkillExecutor.ts`、`runTrace.ts`。
- 守护测试扫描：确认 `deai-injection-policy.spec.ts` 三方文档绑定与 `proseHardSignalWiring.spec.ts` 位置耦合。
- 本轮未改生产代码，不运行应用测试；批准后按 V4 验证矩阵执行。

## 边界

- 待用户审核；审核通过前不改生产代码。
- 不升版、不封装、不提交 git。
- 不改手动去AI味功能。
- 教学有效性与阈值校准保持 provisional。
