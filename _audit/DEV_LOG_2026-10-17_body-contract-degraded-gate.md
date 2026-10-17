# DEV LOG: 2026-10-17 正文层降级越权与产物契约收口

## 目标

按用户确认的方案完成 2026-10-17 043758 正文层事故根修：`degraded` 不得越过正文产物契约继续流转，契约验收必须绑定下游真实消费的提取面，并完成跨层审计、验证、经验回写、版本升级与提交收尾。

## 根因与修复

- 根因：`skillOrchestrator` 与 `PipelinePanel.callValidatedSkill` 各自持有“降级是否可继续”的判断，caller 状态与产物契约混权；S2 degraded 输出未经过唯一生成步契约门就流入 S3，导致不合格短稿被打磨后继续进入验收。
- 新增 `stepArtifactAcceptance.ts`：单源验收门。degraded folder 输出仅在正文契约步骤包装 `__shenyiStepArtifact` envelope；`acceptStepArtifact()` 用 `parseGenerationResult(rawOutput).body`（提取面）验收；`resolveStepArtifactFlow()` 输出 trace 详情与失败原因。
- `PipelinePanel.vue`：生成步在下游消费前执行统一验收；契约失败抛出并阻断后续步骤；下游只接收 `extractedBody`；attempt 台账记录 `generatorStepIndex`、决策、degraded 步骤与 raw/extracted 差值。
- `chainExecution.ts`：新增 `bodyGeneratorContractSentence()` 与 `isBodyContractStep()`；字数契约只注入唯一生成步，S1/S3 提示词不变。
- `chapterExecutionPackage.ts`：执行包不再由调用方传 targetWords，避免双源字数契约。
- `skillOrchestrator.ts`：清除最后一处局部“degraded 且非空即继续”规则。降级带输出时也必须通过 `acceptStepArtifact`，写 `step-artifact-no-contract` 诊断，下游消费 `downstreamPayload`。

## 收尾补修：无 SKILL compose 回归

- 触发：全量收尾复跑 `verify-body-repair-ledger-electron` 时，无 SKILL compose 路径报“正文生成步骤无法唯一识别”。该验证器是既有守卫，不是本轮新写绕行脚本。
- 根因一：`bodyArtifactOrchestrator` 用 `Number(input.generatorStepIndex)` 判断生成步，`Number(null) === 0` 把“无锚点”误判成第 0 步；修复后 `null` 表示无锚点，`0` 是合法 compose 首步。
- 根因二：compose 分支没有构造 `composeArtifactContext`，也没有注入 `bodyGeneratorContractSentence()`；修复后 compose 单调用被视为唯一生成步，并在调用后记录 `body-step-acceptance`。
- 行为边界：compose 没有下游链步；契约失败时记录 `body-generator-step-rejected`，但不直接抛错，返回 raw 输出让 `generateBodyArtifact()` 统一执行修复决策，避免把可修复短稿变成终局 API 错误。
- 回归：`bodyArtifactOrchestrator.spec.ts` 增加 compose 单调用为唯一生成步断言；`ownerBreakpointClosureWiring.spec.ts` 增加无 SKILL compose 一等生成步接线断言。

## 跨层审计

- 审计文档：`_audit/CROSS_LAYER_DEGRADED_AUDIT_2026-10-17.md`。
- 结论：设定层、卷纲层、章节层的“校验面”与“消费面”同源；大纲工作台是显式 `no_contract` 边界；复合 folder SKILL 现在也走统一验收门并登记 `no_contract`；正文层本轮完成根修。

## 验证

- 定向测试：`npx vitest run src/services/workspaceSkillEngine.spec.ts src/services/skillOrchestrator.spec.ts src/services/stepArtifactFlow.spec.ts src/services/stepArtifactAcceptance.spec.ts` → 67 passed。
- 历史事故回放：`node scripts/verify-body-contract-degraded-replay.mjs` → PASSED。历史 `generation_failed` 事故在当前实现下会在生成步以 `degraded_plus_contract_failure` 阻断，S3 不再被调用。
- 真实 Electron UI：`node scripts/verify-body-contract-degraded-electron.mjs` → PASSED。真实下拉选择 SKILL；场景 A：S2 degraded + 1654 字被拒，S3 零调用，run failed；场景 B：S2 degraded + 2200 字通过，S3 一次调用，run success 且 warning 保留。
- 证据：`_audit/verification-body-contract-degraded-replay/`、`_audit/verification-body-contract-degraded-electron/`。
- 全量回归：`npm run test:services` → 172 files / 1998 tests 全部通过。
- `npm run type-check` → 通过。
- `npm run build:vue` → 通过。
- 无 SKILL 回归：`node scripts/verify-body-repair-ledger-electron.mjs` → PASSED；attempt 1 `too_short/328`，attempt 2 `targeted/complete/2460`，2 次物理请求，UI 生成中锁定与恢复均被断言。
- owner 断点回归：`node scripts/verify-owner-breakpoint-closure-electron.mjs` → PASSED；completed 断点拒绝恢复，targeted 2 次物理请求，S1 产物复用，attempt `complete/2000`。
- postProcess 双工作台回归：`node scripts/verify-postprocess-terminal-ui-electron.mjs` → PASSED；大纲工作台与首页编辑器各 1 次真实 provider 请求，`success_with_warnings` 双端截图与 electron-run.log 留证。

## 经验回写

- `_audit/神意开发经验总结_v7.md` 升级 v8.15。
- G2.9 补入：caller 状态与产物契约分权；`degraded` 不得授予产物越过契约门的权限。
- G1.17 补入：契约类修复先对账“测量面 / 消费面 / 是否同源”，并登记第八类自盲区“测量面盲区”。
- G1.5 补入：验证器必须断言决策结果与下游副作用，不得只看事件存在。
- G2.9 补入：单调用 compose 同样是唯一生成步；必须显式区分 `null`（无锚点）与 `0`（合法首步），禁止把多步链识别口径误套单调用形态。

## 诚实边界

- Electron 验证使用本地 OpenAI-compatible provider，覆盖真实 UI 选择、真实 HTTP 调用与 trace，但不覆盖外部 live 供应商矩阵。
- 历史回放以事故语义复刻为证据，不是逐 token 回放器。
- SKILL 层提示词内容与模板契约未修改；应用侧只保证契约注入与验收职责。
- 字数阈值维持 0.6/2.0 比例与 3500 字目标的既有口径，本轮未放宽。
