# 2026-10-22 正文候选账本与修复反馈协议任务台账

## 1. 目标与原话

- 用户原话：`确认执行`，对应正文修复 V3：候选账本单源化、反馈协议统一、targeted repair 走 generator_step 拓扑、删除旧全文回传、测试同批迁移、trace 审计补全。
- 最终可感知行为：重试耗尽后不再“最后一次候选覆盖最优候选”；终步反馈不跨任务读取陈旧候选；targeted repair 请求不携带旧稿全文；运行记录可审计每次反馈的候选规模与抑制量。
- 交付物：`realSkillExecutor` per-pass 候选账本、`bodyArtifactOrchestrator` 修复协议、`PipelinePanel` 反馈审计事件、测试迁移、DEV_LOG 与经验回写。

## 2. 门禁读证

- G0.10（新旧并存清零）：`上一版正文`、`禁止整篇重写`、模块级候选 Map 必须从生产与测试同批清零。
- G0.12（门禁执行台账）：本文件七节执行，缺节不得完成。
- G1.5（验证先行）：先取得旧语义 RED/反向证据，再迁移实现。
- G1.15（四层递进）：症状、链路、组件组合、机制逐层对账。
- G1.17（作者反证）：用“最后一次最差、前一次更优”的候选序列证伪旧 `lastAttempt` 语义。
- G2.9（终稿与流水线）：attempt 单账；终步反馈禁携候选全文。
- G2.13（SKILL 中立）：本轮只改应用反馈协议，不改变 SKILL 执行权限语义。

## 3. 路由判定

- 加入：G0.1、G0.3-G0.5、G0.8-G0.10、G0.12、G1.5、G1.11、G1.15、G1.17、G2.9、G2.10。
- 排除：G0.11 UI 交互门在本轮表现为 trace 审计与真实 Electron 场景断言，不作为组件交互改版；G2.11 不改变供应商协议。

## 4. 影响圈与作者反证

- 打算改：`src/services/realSkillExecutor.ts`、`realSkillTypes.ts`、`bodyArtifactOrchestrator.ts`、`PipelinePanel.vue`、相关 spec。
- 可能碰到：folder 多 pass、终步 polish、schema retry、postProcess retry、compose/chain 降级语义、运行记录导出。
- 作者反证：候选账本用 3 次失败但第 1 次错误更少的序列验证 retained 选择；反馈协议用长候选验证 prompt 不含全文；composite 用既有测试确认语义未被误伤。

## 5. 停止条件

- 生产与测试中旧全文回传语义 0 命中。
- `npm run type-check` 通过。
- 定向测试与 `npm run test:services` 全量通过。
- 真实 Electron + 默认供应商验证 targeted repair 场景，断言物理请求与请求体规模。
- 台账、DEV_LOG、经验文件、提交收口，工作区干净。

## 6. 执行证据

- 实现对账（本轮 diff）：
  - `src/services/realSkillExecutor.ts:498`：终步 schema retry 反馈改为显式接收当前候选，删除模块级 `lastFinalStepCandidateBySkill`，终步反馈不再跨任务读取陈旧候选。
  - `src/services/realSkillExecutor.ts:826`：`lastAttempt` 单值改为 per-attempt `candidateLedger`，每个候选记录 output、validation 与 attempt 序号。
  - `src/services/realSkillExecutor.ts:1246`：重试耗尽后按“valid 优先、错误数更少优先、早 attempt 优先”保留最优候选；多候选时写入 `schema-validation-best-candidate-retained` warning；`apiMeta.retainedCandidateIndex` 记录保留的是第几次候选。
  - `src/services/realSkillTypes.ts:165`：新增 `retainedCandidateIndex` 类型。
  - `src/services/bodyArtifactOrchestrator.ts:173`：targeted repair 删除 `【上一版正文】` 全文块与 `禁止整篇重写` 旧语义，明确“旧稿全文不进入本次请求”，要求基于上游权威产物重新生成。
  - `src/components/pipeline/PipelinePanel.vue:2036`：新增 `BodyFeedbackAuditState`，捕获 schema 与终步反馈的候选规模、抑制量、锚点数、反馈长度。
  - `src/components/pipeline/PipelinePanel.vue:4927`：attempt 开始时以本地 `runId` 清空旧审计；`src/components/pipeline/PipelinePanel.vue:5009` 将 `feedbackAudits` 写入 `body-artifact-attempt`。本轮曾发现 `trace.runId` 与 store 当前 run 可能分叉，已统一使用本地 `runId`。
  - `src/stores/runTrace.ts:883`、`:972`、`:1012`、`:1018`：新增 `BodyFeedbackAuditRecord`、`body-feedback-audit` 事件、按 run 存取与重置 API。
- 测试对账：
  - `src/services/realSkillExecutor.spec.ts:733`：三次候选中第 1 次错误更少，断言 degraded 输出保留第 1 次候选，并出现 `第 1/3 次候选` 诊断。
  - `src/services/bodyArtifactOrchestrator.spec.ts:109`、`:186`：targeted repair 断言旧稿唯一标记、`【上一版正文】`、`禁止整篇重写` 均不进入请求。
  - `src/stores/runTrace.spec.ts:3028`：覆盖反馈审计记录、`body-feedback-audit` 事件、导出包含与 attempt 重置。
  - 定向验证：`npm run test:services -- src/stores/runTrace.spec.ts src/services/realSkillExecutor.spec.ts src/services/bodyArtifactOrchestrator.spec.ts` → 3 files / 170 tests passed（交接轮输出，最终全量另见第 7 节）。
- Electron 对账：`node scripts/verify-body-repair-ledger-electron.mjs` → PASSED；attempt 1 `too_short`（328 字），attempt 2 targeted repair `complete`（2460 字），物理请求 2 次；修复请求不含 `SHORT_BODY`、不含 `【上一版正文】`，包含“旧稿全文不进入本次请求”与“上游权威产物重新生成正文”。证据：`_audit/verification-body-repair-ledger-electron/report.json`、`provider-requests.json`。
- 旧语义扫描：`rg "lastFinalStepCandidateBySkill"` → 0 命中；`【上一版正文】`、`禁止整篇重写` 仅在测试负向断言中出现。

## 7. 缺口清单

- [x] 生产与测试旧全文回传语义清零。
- [x] 定向测试通过。
- [x] 真实 Electron + 本地 provider 验证 targeted repair 反馈协议。
- [x] runId 分叉缺陷发现并统一。
- [x] 本文件第 6 节补齐。
- [x] DEV_LOG 与总索引登记。
- [x] 经验文件升级 v8.20：G2.9 补候选账本契约，G1.17 补 runId 单源契约。
- [x] 版本升级 3.103.0。
- [x] `npm run type-check` 新鲜通过。
- [x] `npm run test:services` 全量新鲜通过。
- [x] `npm run build:vue` 新鲜通过。
- [x] `node scripts/verify-body-repair-ledger-electron.mjs` 新鲜复跑通过。
- [x] 3.103.0 打包、真实启动、asar/renderer 新鲜度、SHA256 核验，旧 3.102.0 产物清理。
- [x] Git 提交，工作区干净。
- 执行中发现并修正：`genBody` 内 attempt 审计与请求指纹统计原本混用 `trace.runId`、store 当前 run、外层旧变量名三套口径；已统一为 `bodyRunId` 并由 type-check 锁定。
