# SKILL 适配说明：正文层 run-trace 归因字段

## 1. 新字段

- `apiCalls[].retainedCandidateIndex`：1-based，指向 `candidateLedger` 中最终保留的候选；0 表示没有保留候选。
- `candidateLedger[].sourceResponseHash`：候选对应的物理响应指纹，格式 `fnv1a32_xxxxxxxx`。
- `bodyCandidateLedger` / `bodyCandidateRetention`：仅 generator 步（S2）存在，S1/S3 没有 body 契约，不应期待该字段。
- `chapter-narrative-verdict.detail`：四态 `declared_ready/declared_not_ready/undeclared/unreadable_because_missing_handoff`；带候选归因时包含 `sourceCandidateIndex/sourceResponseHash`。
- `body-artifact-attempt.detail.traceAuditFields`：同上两个字段，用于把 attempt 归因到具体候选。
- `body-artifact-terminal/validated.detail`：`terminalReason`、`decisionPath`。

## 2. 版本语义

- `runtimeFingerprint.manifestVersion=1` 是构建清单 schema 版本，来自 `vite.config.mts`。
- `run.schemaVersion=20` 与 `run.exportSchemaVersion=20` 是运行记录导出 schema 版本。
- 两者不可互换判断；SKILL 侧对账请使用 `exportSchemaVersion`。

## 3. 读取建议

- 判断“最终验收用了哪版候选”：先读 `retainedCandidateIndex`，再回 `candidateLedger`、`sourceResponseHash`。
- 判断失败路径：读 `body-artifact-terminal.terminalReason/decisionPath`，不要只看最终错误文本。
- 判断叙事判定：读 `chapter-narrative-verdict`，并检查其候选归因是否与 S2 retained candidate 一致。
- 深度导出的正文请通过 `payloads/` 与 `apiResponseIndex` 读取，主 JSON 不再内联全文。

## 4. 稳定边界

这些是应用侧观测协议，不改变 SKILL 的生成职责。`retained=0` 在独立审计中只统计 degraded 调用，success 调用以 `retainedCandidateIndex>0` 判断。
