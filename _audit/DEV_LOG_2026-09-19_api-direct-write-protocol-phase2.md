# 2026-09-19 API Direct Write Protocol Maturity - Phase 2

## Scope

执行 Phase 2：写入失败反馈成熟化。保留既有 tool loop 与重复写入 guard，只补失败反馈的信息完整度。

## Changes

1. `editorEditDiagnostics.ts`：
   - 新增 `EditorWriteFailedDiagnostics`
   - 新增 `buildEditorWriteFailedDiagnostics()`，统一错误码目录与修复策略
   - 错误目录覆盖 invalid_input、missing_field、ambiguous_target、target_not_found、version_changed、locked、permission_denied、duplicate_write_blocked、integrity_failed
   - 修复策略明确“只修正 failedItems；succeededIndexes 不要重发”
2. `editorEditBatch.ts`：
   - 批次失败诊断统一包裹 `buildEditorWriteFailedDiagnostics`
   - 重提数量不匹配时同样返回错误目录与修复策略
3. `editorTools.ts`：
   - schema 校验失败返回合法 operation 枚举、错误目录、修复策略
   - 多命中失败保留 failedItems、suggestion、matches 与 retryCommand
   - 成功写入返回 batchId + repairPolicy，明确禁止重复提交同批次参数
4. `OutlineWorkspace.vue`：
   - integrity_failed 的错误信息补充修正指引，明确原文未变且不要重发原批次
5. E2E 证据写入增加 Windows 句柄重试，避免验证结果被证据文件写入失败污染。

## Verification

- `npm run type-check` → exit 0
- `npx vitest run` → 70 files / 671 tests passed
- `npx vitest run src/services/editorTools.spec.ts` → 18 tests passed（含新增失败反馈断言）
- `npm run verify:production-wiring` → 271 modules / 897 dependencies, no violations
- `npm run build:vue` → success
- `node scripts/verify-api-direct-write-v2-e2e.mjs` → `API DIRECT WRITE V2 E2E PASSED`
  - 多命中 tool result 中包含 errorCatalog、repairPolicy、failedItems、matches
  - 14 个真实 UI 场景全部通过

## Lessons

1. 成功结果也要带防重复语义：只告诉模型“成功”不够，必须告知 batchId 已生效且不要重发同参数。
2. 证据文件写入是验证链路的一部分，Windows 下遇到短暂句柄占用必须重试，否则会把“应用通过”误报成“验证失败”。
