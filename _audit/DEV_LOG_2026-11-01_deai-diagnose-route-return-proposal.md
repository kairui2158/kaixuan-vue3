# DEV_LOG_2026-11-01_deai-diagnose-route-return-proposal

## 目标

完成内嵌降AI“诊断-路由-回归”V1方案：吸收 `story-deslop` 的位置化诊断优点，同时保证降AI不改写、不扰乱正文层输出质量，修复权按 owner 回归。

## 交付

1. 方案：[_audit/PROPOSAL_2026-11-01_DEAI_DIAGNOSE_ROUTE_RETURN_V1.md](_audit/PROPOSAL_2026-11-01_DEAI_DIAGNOSE_ROUTE_RETURN_V1.md)
2. 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-diagnose-route-return-proposal.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-diagnose-route-return-proposal.md)
3. 主索引已登记本轮。

## 关键结论

1. 现状确认：`detectBody` 是统计摘要，findings 无 line/column/ruleName；`processBody` 与 deep-fix 仍保留改稿能力。
2. 方案核心：降AI降权为只读诊断器；skill-wins 默认化；findings 位置化；退化指纹独立；修复按 owner 路由；修复后复扫；每章最多2次干预。
3. 旧语义处置：legacy-auto 与 deep-fix 不与新模式长期并存，按 G0.10 七层清零。
4. 成熟度：方案成熟，可分阶段执行；阈值与整体 verdict 继续 provisional。

## 验证

- 只读审计命令核对 `de-ai.js`、`skillDeaiContract.ts`、`skillDeaiContractValidation.ts`、`PipelinePanel.vue`、`useDeAi.ts`、`deai.ts` 与 story-deslop 脚本。
- 经验门禁按 G0.1/G0.5/G0.6/G0.7/G0.9/G0.10/G0.12/G1.22/G2.9/G2.13 对账。
- 本轮无代码改动，因此无测试执行；生产实现与测试列入方案后续阶段。

## 边界

- 不改生产代码、不升版、不封装、不提交 git。
- 不修改 folder SKILL；SKILL 适配说明待方案批准后输出。
- deep-fix 影子观察、真实 UI 验证、run-trace 回放均待执行阶段完成。
