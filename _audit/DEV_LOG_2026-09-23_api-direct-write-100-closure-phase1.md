# DEV LOG 2026-09-23 - API 直写 100% 闭环 Phase 1（上下文容量模型）

## 目标

执行 `PROPOSAL_2026-09-23_API_DIRECT_WRITE_100_CLOSURE_FINAL.md` Phase 1：为 API 直写建立请求前上下文容量模型，让每次请求都能显式看到供应商窗口、输入估算、预算决策与真实 usage 对账结果。

本阶段不设 token 预算；验收前不升版本、不封装。

## 范围与实现

1. 新增 `src/services/contextBudget.ts`：
   - 输入窗口使用 `contextWindowTokens`，禁止把输出 `maxTokens` 冒充输入窗口。
   - 中文/英文分语言保守估算输入 token；窗口未声明时按保守窗口处理并标记 `windowDeclared=false`。
   - 输出三态决策：`fits` / `needs_segmentation` / `exceeds_provider`，超窗明确失败，禁止静默截断。
   - `buildUsageReconciliation()` 用真实 usage 的 `prompt_tokens` 对账估算值，输出 `actualInputTokens / driftRatio / correctedRatio`。
2. `src/services/aiService.ts`：请求前统一执行预算决策；成功、heartbeat、retry、tool-loop 相关路径返回 `contextBudget` 与 `usageReconciliation`。
3. `src/components/common/OutlineWorkspace.vue`：direct trace 的 api-call start、finish、retry 与最终回填统一写五个预算字段。
4. `src/stores/runTrace.ts`：apiCall、physicalCall 类型与回填逻辑支持 `providerContextWindowTokens / estimatedInputTokens / contextBudgetDecision / contextBudgetEstimateSource / usageReconciliation`。
5. `src/services/contextBudget.spec.ts`、`src/services/aiService.spec.ts`：覆盖 0、未声明窗口、128K、1M、超窗、分段、usage 对账与不同 usage 字段形态。

## 本轮根因与修复

### 根因

Electron 压测曾持续报“预算字段缺失”。复查确认服务层无缺口：`callAiWithoutTools` 成功与 heartbeat 返回均已带 `contextBudget / usageReconciliation`。真正断点是 `scripts/verify-api-direct-write-electron.mjs` 的 `latestRun()` 白名单映射没有导出预算字段，Node 侧断言永远读取 `undefined`。这是 M41/M61 已登记的“验证器口径缺陷”再次出现，不是产品缺陷。

### 修复

只修验证器，不改产品：

- `latestRun()` 顶层 apiCall 映射新增 5 个预算字段。
- `physicalCalls` 映射新增 4 个预算字段。

### 修复后断言口径

- `providerContextWindowTokens = 5000`
- `contextBudgetDecision = fits`
- `estimatedInputTokens > 0`
- `usageReconciliation.actualInputTokens = 5230`
- `driftRatio / correctedRatio` 为数字

## 验证证据

- `node --check scripts/verify-api-direct-write-electron.mjs` → exit 0。
- `npm run test:services -- --run src/services/aiService.spec.ts src/services/contextBudget.spec.ts` → 2 files / 126 tests passed。
- `npm run build:vue` → 成功；仅保留既有 Vite chunk 体积与 `__dirname` warning，无新增 warning。
- `node scripts/verify-api-direct-write-electron.mjs` → 完整通过，末行：
  `===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====`

压测覆盖：context-budget 5K 只读、写入/修改/删除循环、跨轮权限翻转、停滞重试、部分失败恢复、trace 导出。全部证据保留在 `_audit/verification-api-direct-write-electron/`。

## 回头看

- 生产接线：`aiService.ts`、`OutlineWorkspace.vue`、`runTrace.ts`、`contextBudget.ts` 四处字段口径一致；trace 存储层与 UI 消费层无单侧缺口。
- 验证器口径：白名单映射已补齐，产品断言未放宽。
- 新旧并存：`deltaTokens`、旧“任务已暂停”合同残留扫描为 0。
- 影响圈：Phase 1 未修改意图路由阈值、EditTask 状态机、供应商协议与版本号。
- 经验回写：新增 M63“trace 字段与验证器白名单同步门禁”，登记 v5.38 修订记录。

## 遗留

- Phase 1 产品与验证已闭环。
- Phase 2-8 按 FINAL 方案顺序执行：文档地图与分段读取、EditTask 自动升级、供应商矩阵、协议防线与语料、观测日志、三档 Electron 实测、回归与封装。
- 100K / 1M 三档实测、五类供应商 live、1M 真实模型验证仍属后续阶段，当前不得宣称已达成 100%。
