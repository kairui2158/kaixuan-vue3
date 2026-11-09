# 2026-11-09 卷纲层续写自检守卫与预算单源

- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-09_continuation-guard-budget-v1.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-09_continuation-guard-budget-v1.md)
- 交付：续写调用返回【续写检查】自检注释时不再合并进候选产物；SKILL 声明“协议终点/无待续写内容”时保留原候选、清 `finishReason=stop`、移除截断降级并写 `continuation-self-check-skipped` warning；删除 direct-retry 的第二次预算扣费；迁移 folderSkillTest 旧 used=2 断言。
- 根因：`mergeContinuationText` 无差别拼接续写响应，模型返回的元文本污染卷纲；direct-retry 在 attempt 与 `callAiOnce` 两处扣预算，造成 physical calls 超过预算消耗账本。
- 验证：定向 `realSkillExecutor.spec.ts` 78/78 passed（新增自检注释不合并与 direct-retry 预算单源两用例）；`folderSkillTest.spec.ts` 3/3 passed；type-check exit 0；A4 usage/_perf 回归在 `realSkillExecutor.spec.ts:1498` 确认存在。
- 边界：真实 Electron UI 与真实外部供应商本轮未实测，登记 untested；SKILL 磁盘包不修改。
