# 2026-11-18 zero-usage 误杀守卫收口 3.130.0

- 交付：Doubao 网关 `prompt_tokens/completion_tokens` 为 0 但返回合法 LHC 信封或实质流式正文时，应用保留候选送内容验收；短兜底文案仍判 fakeSuccess；fakeSuccess 重试耗尽进入供应商级终态。
- 用途：消除网关 usage 形态异常导致合法产物被误杀、正文编排继续空转的问题。
- 关键代码：`src/services/providerResponseContract.ts` 结构化信封豁免与流式 delta 聚合；`src/services/aiService.ts` credible zero-usage 守卫；`src/services/realSkillExecutor.ts` fakeSuccess 终态标记。
- 验证：全量服务 `npx vitest run` 254 files / 2827 tests PASS；`npx vue-tsc --noEmit` PASS；`npm run build:vue` PASS；`npx electron-builder --win` PASS；`npm run verify:packaging` PASS，安装包 `dist/神意助手-Setup-3.130.0.exe` SHA-256 `57c9e83ae215645a936c71336034caf541387bafb93e31068ebe9bdea838e10c`。
- 边界：不改 SKILL 叙事质量裁决；不改修复编排策略；不新增供应商硬编码、预算系统、调度器或 UI。
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-18_zero-usage-guard-v1.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-18_zero-usage-guard-v1.md)
- 缺陷面枚举：见台账第七节，命中 zero-usage 形态误杀与终态语义；打包期 360 防护锁新产物登记为环境事件，已用 Stop-Service 360rp 窗口完成构建，源码补丁已还原。
