# TASK_LEDGER_2026-11-01_deai-mentor-guidance-v4-1

> 后继版本：V5 FINAL 已完成 V1-V4.1 跨版本审计并锁定全部决策点，见 `_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v5-final.md` 与 `_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V5_FINAL.md`。本台账保留为 V4.1 过程证据。

## 1. Objective

用户原话核心：确认升级 V4.1；同时指出“方案写的很好可是每次都执行缺漏和闭环缺失”，要求重新研磨执行条例防执行缺漏。本轮交付物：V4.1 方案、V4.1 台账、开发日志、主索引登记、V4 台账指向。不改生产代码。

## 2. Gate Evidence

- G0.6 成熟度四层：`_audit/神意开发经验总结_v9.md:60`
- G0.7 正反推：同文件 `:68`
- G0.9 七面影响圈：同文件 `:84`
- G0.10 七层清零与五证：同文件 `:92-104`
- G0.12 台账七节：同文件 `:114-126`
- G1.4 验证真实性与分层：同文件 `:280` 附近
- G1.5 验证器质量与脆弱断言：同文件 `:292` 附近
- G2.9 单一裁判：同文件 `:524-544`

## 3. Routing Decision

采纳：G0.6、G0.7、G0.9、G0.10、G0.12、G1.4、G1.5、G2.9。

排除：G0.11 真实 UI 冒充禁令，本轮无 UI 实施，列入 Phase B 门禁；G2.10 真实 trace 回放，列入实施验证。

## 4. Impact Circle And Author Counter-Evidence

改动：仅新增 `_audit` 五个文档项。

可能碰到的：无生产代码、无测试、无配置。

关键证伪：

1. 混源缺陷是否真实：`DeAiSettings.vue:321-359` 扫描 runs，未按 source 过滤；`useDeAi.ts:623` 为 `source:'home'`。
2. blocking 是否真实参与裁判：`PipelinePanel.vue:6177-6187` 证明写入 errors 且决定 success。
3. 声纹预算是否被 V4 漏算：`deaiVoiceProfile.ts:32` 为 700，V4 只写 1200。
4. step 4 耦合是否多点：`de-ai.js:1254`、`skillDeaiContract.ts:97`、`DeAiSettings.vue:345`、`PipelinePanel.vue:2680,6404,6549`。
5. 预检是否放行 warning：`skillPackageManager.ts:78-91`、`skillDeaiContractValidation.ts:66-69,113`。

## 5. Stop Conditions

1. 用户未批准前不改生产代码。
2. 任一 Phase Task 缺预写验证命令，该 Phase 禁止开始。
3. Task 无原始验证输出，状态只能未完成。
4. 隔离、零 diff、并发、手动回归任一失败，停止前进。
5. 七层清零或五证缺一，禁止封装。
6. provisional 校准未解除，禁止输出总分或语义 verdict。

## 6. Execution Evidence

1. V4.1 漏项证据复核命令输出：`DeAiSettings.vue:321-359`、`useDeAi.ts:623`、`PipelinePanel.vue:6177-6187,6223,6369-6500,6404`、`deaiVoiceProfile.ts:32,34-77`、`de-ai.js:1254`、`skillDeaiContract.ts:97,118-146`、`skillPackageManager.ts:78-91`、`skillDeaiContractValidation.ts:66-69,113`、`skillRouter.ts:62,213`、`deai-injection-policy.spec.ts:79`。
2. V4 结构复读：`PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V4.md` 21 项四件套与 Phase A/B/C。
3. V4 台账与 DEV_LOG 复读完成。

## 7. Gap List

1. V4.1 为方案文档，生产代码未改。
2. 10 个漏项的处置待用户批准后实施。
3. 影子配对数据尚不存在。
4. 本轮不升版、不封装、不提交 git。
