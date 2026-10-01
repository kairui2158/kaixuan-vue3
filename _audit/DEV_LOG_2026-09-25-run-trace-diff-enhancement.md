# 2026-09-25 F4 SKILL 调试对比增强

## Scope

让 SKILL 制作方能直接回答“模板修改后，调用行为差在哪里”。增强对象是运行记录两次对比面板，不推翻现有六 Tab 结构。

## Changes

- `src/services/runTraceDiff.ts` 新增：
  - `TemplateVersionDiff`：skillVersion、folderFingerprint、模板内容 hash、参数快照；
  - `ToolSequenceDiff`：调用次数、顺序 key、参数结构指纹、首个不同调用、失败率；
  - `SkillDebugSummary`：把概览、模板、工具序列、首个分叉与输出差异压成一屏摘要。
- `src/components/common/RunTraceDiffPanel.vue` 新增“模板版本”与“工具序列”区块：
  - 显式渲染模板版本指纹差异；
  - 显式渲染工具序列首个分叉与首个不同 API 调用；
  - 序列对齐失败时标注 fallback，不伪造一致。
- 导出保持“摘要 + 双方全文”结构：
  - JSON 导出包含两次运行的完整数据；
  - 不因面板摘要而截断全文。

## Verification Evidence

- `node scripts/verify-run-trace-diff-electron.mjs`
  - `PASS: 10/10 run trace diff rounds`
  - 断言：真实 RunTracePanel 对比流、六个 Tab、模板版本 diff、工具序列首分歧、首个不同 API 调用、导出 JSON 包含双方全文、无溢出、无 page error。
  - 报告：`_audit/verification-run-trace-diff/electron-10-rounds.json`
  - 导出样本：`_audit/verification-run-trace-diff/exports/run-trace-diff-20260925-123232.json` 等每轮一份。
- 服务测试：`src/services/runTraceDiff.spec.ts` 覆盖模板版本与工具序列 diff。
- 全量回归：同 2026-09-25 收口结果，106 files / 1070 tests 全绿，type-check、production wiring、build:vue 均通过。

## Remaining Risk

- 工具序列 diff 依赖 trace 的工具名规范化。后续新增供应商协议时，必须保持 trace 侧 logical tool name 与 wire name 的映射规则，否则会出现假分叉。
