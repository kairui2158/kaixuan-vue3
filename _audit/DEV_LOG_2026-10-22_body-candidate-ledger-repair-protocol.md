# 2026-10-22 正文候选账本与修复反馈协议

## 任务目标

- 台账：[_audit/TASK_LEDGERS/2026-10-22_body-candidate-ledger-repair-protocol.md](_audit/TASK_LEDGERS/2026-10-22_body-candidate-ledger-repair-protocol.md)
- 目标：解决正文层提出的两个遗留缺口——schema retry 反馈仍回传候选全文、`lastAttempt` 只保留最后一次候选；并把修复过程纳入 attempt 与 trace 审计，最终升版封装 3.103.0。

## 产品改动

- [src/services/realSkillExecutor.ts](../src/services/realSkillExecutor.ts)
  - 以 per-attempt `candidateLedger` 替代 `lastAttempt`；重试耗尽后保留最优失败候选（valid 优先、错误数更少优先、早 attempt 优先）。
  - 新增 `schema-validation-best-candidate-retained` warning 与 `apiMeta.retainedCandidateIndex`。
  - 删除模块级 `lastFinalStepCandidateBySkill`；终步 schema retry 反馈显式传入当前候选，消除跨任务候选泄漏。
- [src/services/bodyArtifactOrchestrator.ts](../src/services/bodyArtifactOrchestrator.ts)
  - targeted repair 不再注入旧稿全文；prompt 明确“旧稿全文不进入本次请求”，要求基于上游权威产物重新生成。
  - 删除 `【上一版正文】` 全文块与 `禁止整篇重写` 旧语义。
- [src/components/pipeline/PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue) 与 [src/stores/runTrace.ts](../src/stores/runTrace.ts)
  - 新增正文反馈审计状态与 `body-feedback-audit` 事件，记录候选字符数、反馈字符数、锚点数、预览长度、抑制字符数。
  - attempt 开始时清空旧审计，并在 `body-artifact-attempt` 写入 `feedbackAudits`；审计归属统一使用本地 `runId`，避免 `trace.runId` 与 store 当前 run 分叉。
- 测试同步迁移并新增：`realSkillExecutor.spec.ts` 最优候选保留、`bodyArtifactOrchestrator.spec.ts` 旧全文负向断言、`runTrace.spec.ts` 反馈审计生命周期。

## 验证

- 定向：`npm run test:services -- src/stores/runTrace.spec.ts src/services/realSkillExecutor.spec.ts src/services/bodyArtifactOrchestrator.spec.ts` → 3 files / 170 tests passed。
- Electron：`node scripts/verify-body-repair-ledger-electron.mjs` → PASSED；2 次物理请求完成 328 字失败稿到 2460 字合格稿的 targeted repair，修复请求不携带旧稿全文。
- 旧语义扫描：`lastFinalStepCandidateBySkill` 0 命中；`【上一版正文】`、`禁止整篇重写` 仅测试负向断言保留。
- 全量与封装验证见本文件末尾“收尾验证”，均为本轮新鲜执行结果。

## 诚实边界

- Electron 场景使用本地 OpenAI-compatible provider，不是外部 live 供应商矩阵；外部供应商行为登记 `untested`。
- 最优候选保留策略只依据 schema/postProcess 的 valid 与错误数量排序，不评估文学质量；文学质量仍由契约与后续验收负责。
- `retainedCandidateIndex` 只在 schema retry 执行路径有值；无 schema 校验或非 folder 执行路径保持 `0`。

## 经验回写

- 经验文件升级 v8.20：G2.9 补入候选账本质量保留契约；G1.17 补入 runId 单源契约。

## 收尾验证

- `npm run type-check` → exit 0，无类型错误。
- `npm run test:services` → exit 0，188 files / 2128 tests passed。
- `npm run build:vue` → exit 0，renderer 构建成功。
- `node scripts/verify-body-repair-ledger-electron.mjs` → exit 0，输出 `===== BODY REPAIR LEDGER ELECTRON PASSED =====`；2 次物理请求，attempt 1 `too_short`（328 字），attempt 2 targeted repair `complete`（2460 字），修复请求不含旧稿全文。
- `npm version 3.103.0 --no-git-tag-version` → `v3.103.0`。
- `npm run build` → exit 0，electron-builder 产出 `dist/win-unpacked/神意助手.exe` 与 `dist/神意助手-Setup-3.103.0.exe`。
- `node scripts/verify-packaging-3-103-0.mjs` → exit 0，输出 `===== PACKAGING 3.103.0 VERIFICATION PASSED =====`；asar 版本 `3.103.0`，renderer 文件 81 个，`electronAPI` 方法 77 个，SHA256 `09a8e118223814558fd71c082d60e34f0364a6bb05de6ad4bdd3814d7cd1b67c`，证据在 [_audit/verification-packaging-3-103-0/packaging-evidence.json](verification-packaging-3-103-0/packaging-evidence.json)。
- `node scripts/cleanup-dist-3-103-0.mjs` → exit 0，删除 3.102.0 安装包与 blockmap，仅保留 3.103.0 产物。
