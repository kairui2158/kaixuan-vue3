# TASK_LEDGER_2026-11-01_deai-mentor-guidance-v4

> 后继版本：V4.1 已补充 10 个漏项与执行条例，见 `_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v4-1.md` 与 `_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V4_1.md`。本台账保留为 V4 过程证据。

## 1. Objective

把 V3 第 9 节 21 项风险从“有风险 + 新增断言”升级为“机制、证据、断言、停机条件”四件套，并用源码反推修正 V3 失真。产物是可审核的 V4 方案，不改生产代码。

## 2. Gate Evidence

- G0.6 成熟度四层结论：`_audit/神意开发经验总结_v9.md:60`
- G0.7 正反推：同文件 `:68`
- G0.9 七面影响圈：同文件 `:84`
- G0.10 七层清零与五证：同文件 `:92-104`
- G0.12 台账七节：同文件 `:114-126`
- G1.22 provisional：同文件 `:412-424`
- G2.9 单一裁判：同文件 `:524-538`

## 3. Routing Decision

采纳：G0.6、G0.7、G0.9、G0.10、G0.12、G1.22、G2.9。

排除：G0.11 真实 UI 冒充禁令，本轮无 UI 实施，UI 验证列入 Phase B 门禁；G2.10 真实 trace 回放，列入实施验证。

## 4. Impact Circle And Author Counter-Evidence

改动：新增 V4 方案、V4 台账、V4 开发日志、主索引登记、V3 台账头部指向。

不改动：生产代码、手动去AI味、既有未提交文件。

关键证伪：

1. 纠缠面是否完整：`rg` 显示 `PipelinePanel.vue:6091,6093,6099,6103,6176,6223,6369-6500`，V3 漏掉 `hardruleEnabled` 与 `setLastDetectReport`。
2. overlap 现状是否为元数据声明：`skillDeaiContract.ts:118-127,145-146` 证明是关键词字面匹配。
3. 终步开关是否完整接线：`realSkillExecutor.ts:526-528` 证明只在 polish retry 分支消费。
4. `suffix-only` 是否已分叉：`skillDeaiContractValidation.ts:30` 与 `skillDeaiContract.spec.ts:70` 证明当前显式等价。
5. 效率观测是否需新建：`runTrace.ts:197,322-323,375,384,2269-2357` 证明已有基础。

## 5. Stop Conditions

1. 用户未批准前不改生产代码。
2. Phase A 隔离断言或确定性零 diff 失败即停止。
3. 影子样本未满足 20 章、2 题材、2 模型配对结构前，禁止宣称教学有效。
4. 五证缺一或七层未清零，禁止封装。
5. 效率降条数后仍劣化超 10%，Phase B 延期。
6. provisional 校准状态未解除前，禁止输出总分或语义 verdict。

## 6. Execution Evidence

1. 跨 store 读写：`src/components/pipeline/PipelinePanel.vue:6091,6093,6099,6103,6176,6223,6369-6500`
2. overlap 现状：`src/services/skillDeaiContract.ts:118-127,145-146`
3. 契约等价：`src/services/skillDeaiContractValidation.ts:30`、`src/services/skillDeaiContract.spec.ts:70`
4. 终步断链：`src/services/realSkillExecutor.ts:526-528`、`src/services/realSkillExecutor.spec.ts:1830`
5. 文档-测试绑定：`src/components/pipeline/__tests__/deai-injection-policy.spec.ts:22-30`
6. 位置耦合测试：`src/services/proseHardSignalWiring.spec.ts:9`
7. 效率字段：`src/stores/runTrace.ts:197,322-323,375,384,2269-2357`
8. 手动链路不动：`src/components/editor/EditorPanel.vue:35`、`src/components/settings/DeAiSettings.vue:14-28`、`src/composables/useDeAi.ts:246-369`、`src/stores/deai.ts:64-140`

## 7. Gap List

1. V4 为方案文档，生产代码未改。
2. Phase A/B/C 待用户批准后执行。
3. 影子配对数据尚不存在。
4. 契约 V2 手册更新待批准后执行。
5. 本轮不升版、不封装、不提交 git。
