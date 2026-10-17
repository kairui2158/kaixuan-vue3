# 跨层降级与产物面审计（2026-10-17）

事故来源：`run-trace-正文层-20261017-043758-deep/`、`run-trace-正文层-20261017-043758-standard/`。审计口径来自 `PROPOSAL_2026-10-17_BODY_CONTRACT_DEGRADED_GATE_ROOT_CLOSURE.md` P1-1 / P1-2：任何层级必须回答“调用状态来源在哪里、产物验收在哪里、最终消费哪一个面”；三列不一致即缺陷，无契约必须显式登记为 `no_contract`，不允许空白。

## 三列表结论

| 层级 | 调用状态来源 | 产物验收位置 | 最终消费面 | 结论 |
| --- | --- | --- | --- | --- |
| 设定层 | `PipelinePanel.vue genSettings()` → `runStepSkills(1, ...)`；folder `degraded` 输出继续返回给编排器 | `settingsArtifactOrchestrator.generateSettingsArtifact()`：`extractJsonArray(raw)` 后用 `validateSettingsArtifact(parsed, existing)` | `artifact.accepted` 原样写入设定分类并保存 | 验收面与消费面一致；`incomplete/rejected-all` 不落库 |
| 卷纲层 | `PipelinePanel.vue genVolumes()` → `runStepSkills(2, ...)`；folder `degraded` 输出继续返回给编排器 | `volumeBatchOrchestrator.generateVolumeBatch()`：`extractJsonArray(raw)`，`clampGeneratedVolumes` 后补齐批次，最终 `validateVolumeBatch(accepted, contract, historyVolumes)` | `batchResult.volumes`；再经 `validateVolumes` 后写入卷纲 | 验收面与消费面一致；最终验收失败清空产物 |
| 章节层 | `PipelinePanel.vue` → `callChapterApi()` → `runStepSkills(3, ...)`；folder `degraded` 输出继续返回给编排器 | `chapterBatchOrchestrator.generateChapterBatch()`：`extractJsonArray(raw)` 后补齐批次，最终 `validateChapterBatch(accepted, contract, historyTitles)` | `batchResult.chapters` 原样写入章节树；链尾另有 `validateChapters` 与 generation ledger | 验收面与消费面一致；批次不完整不落库 |
| 正文层 | `PipelinePanel.vue genBody()` → `runStepSkills(4, ...)`；folder `degraded` 由 `makeStepArtifactEnvelope()` 包装 | 步骤层 `resolveStepArtifactFlow()` 对 `parseGenerationResult(rawOutput).body` 执行 `validateBodyArtifact`；终局 `bodyArtifactOrchestrator.generateBodyArtifact()` 对同一 `generation.body` 验收 | 步骤下游只收到 `extractedBody`；终局只消费 `generation.body` | 本轮已闭环：调用状态与流转资格分离，降级不能越过契约失败 |
| 正文层 compose / 无 SKILL | `PipelinePanel.vue` compose 分支单次调用 `callValidatedSkill()` | compose 调用前注入一次 `bodyGeneratorContractSentence()`；调用后 `resolveStepArtifactFlow()` 以 `stepIndex: 0` 验收提取面 | 契约通过时 `generateBodyArtifact()` 消费 `downstreamPayload`；失败时 raw 返回编排器进入修复决策 | 本轮已闭环：单次调用同样是唯一生成步；`null` 表示无锚点，`0` 是合法首步 |
| 大纲工作台 | `OutlineWorkspace.vue` → `runWorkspaceSkills()`；folder `degraded` 映射为 API call `status: degraded` | 链尾 `resolvePostProcessTerminalStatus(postProcessReport)`；无正文/JSON 产物契约 | 文本输出给对话/直写链路；`terminalStatus` 保留 warning/blocked/degraded 口径 | 显式无契约链（`no_contract` 边界）：降级作为可观测终态保留，不新增确认/预览状态机 |
| 通用组合 folder SKILL | `executeCompositeSkill()` 子步骤 `executeRealSkill()` 返回 `degraded` | 本轮接入 `acceptStepArtifact({ contract: null })`；非空降级输出继续，但写入 `step-artifact-no-contract` 诊断 | 下游步骤消费 `acceptance.downstreamPayload`（当前为原始输出） | 显式无契约链：行为保持兼容，决策权已收敛到单源验收门并可审计 |

## 本轮发现的同类缺陷与处理

1. `src/services/skillOrchestrator.ts` 原路径为 `degraded && output.trim()` 本地放行，属于 P1-2 指定的旧语义残留。已改为消费 `acceptStepArtifact(..., contract: null)`，并输出 `step-artifact-no-contract` 诊断；无契约链仍保持继续流转，但从“隐性行为”变为“显式 no_contract 决策”。
2. `src/components/pipeline/PipelinePanel.vue` 正文链的 `degraded` 局部放行已在前置 Phase 移除：有正文契约时必须走 `makeStepArtifactEnvelope()` + `resolveStepArtifactFlow()`；`failed/blocked` 一律 reject。
3. 设定、卷纲、章节三层的 folder 降级输出不需要在本轮强行套正文验收门：它们返回的是原始文本，但编排器在统一契约面上解析并验收，失败时产物为空或 `incomplete`，不会进入落库面。若未来新增“编排器外直接消费 raw”的入口，该行为应被视为新缺陷。
4. 大纲工作台为显式无契约链：本轮不虚构“大纲文本契约”，不新增预览/确认状态机，只要求终态与降级原因可见。该边界已登记，后续若要给大纲直写建立产物契约，应先定义“大纲产物面”，再接入 `acceptStepArtifact`。
5. 无 SKILL compose 回归在收尾阶段被既有 `verify-body-repair-ledger-electron` 拦截：`generatorStepIndex` 语义只覆盖多步 chain，未把单次 compose 调用识别为第 0 个生成步。修复后 compose 也是唯一生成步；`bodyArtifactOrchestrator` 显式区分 `null` 与 `0`，compose 契约失败时不抛错，把修复决策权交回 `generateBodyArtifact()`。

## 验证

- `npx vitest run src/services/skillOrchestrator.spec.ts src/services/stepArtifactFlow.spec.ts src/services/stepArtifactAcceptance.spec.ts`：29 passed，覆盖组合链降级继续、`step-artifact-no-contract` 诊断、正文 `degraded + contract failure` reject、降级但契约通过继续、下游只收提取正文。
- `npm run test:services`：172 files / 1998 tests 全部通过；`npm run type-check`、`npm run build:vue` 通过。
- `node scripts/verify-body-repair-ledger-electron.mjs`：PASSED；attempt 1 `too_short/328`，attempt 2 `targeted/complete/2460`，2 次物理请求，生成中 UI 锁定与恢复均有 `report.json` 证据。
- `node scripts/verify-body-contract-degraded-electron.mjs`：PASSED；场景 A `degraded_plus_contract_failure`、1654 字、4 次物理请求、S3 零调用、run failed；场景 B 2200 字、S3 收到提取面、run success 且 warning 保留。
- `node scripts/verify-owner-breakpoint-closure-electron.mjs`：PASSED；completed 断点拒绝恢复，targeted 修复 2 次物理请求，S1 产物复用，attempt `complete/2000`。
- `node scripts/verify-postprocess-terminal-ui-electron.mjs`：PASSED；大纲工作台与首页编辑器各 1 次真实 provider 请求，双端 `success_with_warnings` 截图与 electron-run.log 留证。

## 边界闭环补证（2026-10-17）

- 大纲工作台契约：`workspaceArtifactAcceptance` 定义 `body / outline / no_contract` 三态，`workspaceSkillEngine` 在 chain 与 compose 两条生产路径执行验收；仅 `edit` 且存在真实大纲目标时携带 outline contract。
- 恶意 SKILL 边界：模板文本即使要求“忽略权限、授予 editor.write、扩展工具面”，也只进入提示词；`discuss` 仍只有 `editor.get_state`，`edit` 才有 `editor.get_state + editor.write`。
- Payload 回放：85 物理文件、85 账本记录、sha256、顺序、重复计数与事件流全部对账；5 个未引用 `processing-output` 是导出器保留的 `outputPreview` 副本，属于导出语义而非丢失。
- 外部 live 边界：生产 `decrypt + providerNetRequest` 链路已跑通，但两个应用内供应商密钥均在外部服务返回 401；结论为 `blocked_external_credentials`，不能声称 live 通过。证据见 `_audit/verification-boundary-live-provider/report.json`。
