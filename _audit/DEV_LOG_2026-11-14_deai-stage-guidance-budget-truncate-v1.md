# DEV LOG — 2026-11-14 — deai-stage-guidance 超预算截断修复 V1

## 缺陷

2026-11-14 真实正文层 trace `run-trace-正文层-20261114-024409-deep-2` 显示 `deai-stage-guidance` 有 5 条合法 findings，但 `budgetExceeded=true` 后被全弃为 0 条：`findingCount=0 / droppedFindingCount=5 / guidanceChars=0 / injected=false`。

根因在 `buildDeaiStageDiagnosis` 把耗时观测字段误用为产物裁剪开关：`src/services/deaiStageDiagnosis.ts:113` 的超预算分支直接 `slice(0, 0)`。它不是新增预算，而是让已完成的检测结果被第二次惩罚。

## 修复

- 方案：`_audit/PROPOSAL_2026-11-14_DEAI_STAGE_GUIDANCE_BUDGET_TRUNCATE_V1.md`。
- 台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-14_deai-stage-guidance-budget-truncate-v1.md`。
- 生产改动：超预算分支不再清空，回到既有 `maxFindings=6` 截断。
- 测试迁移：旧「超预算=0条」契约改为「保留有界 findings」，并新增 `performance.now()` spy 的 trace 级回归。

## 验证

- 定向回归：`npx vitest run src/services/deaiStageDiagnosis.spec.ts src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts` → 2 files / 28 tests passed。
- 类型检查：`npm run type-check` → exit 0。
- 前端构建：`npm run build:vue` → exit 0。
- 确定性 Electron E2E：`node scripts/verify-deai-stage-guidance-electron.mjs` → exit 0 / PASSED；真实请求链中 `deai-stage-guidance` 为 `findingCount=3 / injected=true / budgetExceeded=false / guidanceChars=194`。
- 全量服务测试：`npm run test:services` → 251 files / 2749 tests passed。
- 缺陷清零：`rg "budgetExceeded ? 0"` 全仓 0 命中；旧测试名与旧空 findings 断言 0 残留。

## Release

- 版本：3.127.5 → 3.127.6。
- 完整构建：`npm run build` exit 0。
- Packaging：`npm run verify:packaging` exit 0 / `PACKAGING 3.127.6 VERIFICATION PASSED`；`rendererFiles=87`，`electronAPI methods=94`。
- 安装包：`dist/神意助手-Setup-3.127.6.exe`。
- SHA-256：`C325EF942EA5E9E61B78C9B5E07EA1396109D3303D51EA5F77EE9E67B6EDD91D`。

## 边界

1. `budgetExceeded` 只继续作为观测与 trace warn；不触发 retry、不改终态、不升级失败。
2. 不新增预算系统、配置项、调度器、UI 或第二裁判。
3. `deai-model-profile` 校准门槛与快照释放规则不因本缺陷放宽。
4. 真实供应商 live 未在本轮执行，真实正文层行为登记为 `untested`。
