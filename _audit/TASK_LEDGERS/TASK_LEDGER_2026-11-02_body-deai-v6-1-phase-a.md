# TASK_LEDGER_2026-11-02_body-deai-v6-1-phase-a.md

## 1. 目标与原话

- 用户原话：`确认执行`
- 方案授权：`_audit/PROPOSAL_2026-11-02_BODY_DEAI_COLLABORATION_V6_1.md`
- 本轮目标：执行 Phase A：修复 S1 骨架事实链解析；新增 S2 后、S3 前位置化诊断；新增 `deai-stage-guidance` trace；证明诊断注入不改变终态与 retry。
- 最终可感知行为：S2 retry 不再因 S1 骨架无法解析而降级为全链重建；S3 收到位置化诊断情报；UI/trace 可审计诊断链路。
- 本轮交付物：生产代码、测试、trace 事件、任务台账、DEV_LOG。

## 2. 门禁读证

- G0.3 诚实闭环：完成声明必须区分已验证/未验证；mock 不冒充真实链路。
- G0.5 回头看：收尾前对账原始目标、逐行审 diff、双向扫描生产与验证器。
- G0.6 方案成熟度：V6.1 已获用户确认，Phase A 执行器、接线、验证标准均成熟。
- G0.7 正反推研磨：正向证明 S3 请求包含诊断；反向证明终态/retry 不因诊断变化。
- G0.9 影响圈声明：只碰 Phase A 相关服务、PipelinePanel、runTrace 与测试。
- G0.10 新旧并存清零：新增语义不得保留未接线的旁路；旧协议解析保持既有行为。
- G0.12 台账七节：本文件即执行凭证。
- G1.1 精准编辑：仅用 apply_patch 逐行编辑；提交前逐行审 diff。
- G1.4 验证真实分层：集成测试必须覆盖真实组装路径，不只测纯函数。
- G2.9 流水线：诊断不参与验收、不改终态、不触发 retry。
- G2.13 SKILL 执行中立：应用只送情报，不改执行协议与 SKILL 地盘。

## 3. 路由判定

- 加入：G0.3/G0.5/G0.6/G0.7/G0.9/G0.10/G0.12/G1.1/G1.4/G2.9/G2.13。
- 排除：G2.10 真实 trace 回放，本轮为新增链路 TDD 与集成验证，不以旧 trace 冒充新行为；Phase C 报告后再按真实 run trace 对账。
- 排除：G2.14 默认存储迁移，本轮不改存储根。

## 4. 影响圈与作者反证

- 打算改：`schemaRetryFeedback.ts`（S1 骨架解析）、新增位置化诊断模块、`PipelinePanel.vue`（S2 后 S3 前接线）、`runTrace.ts`（trace 白名单/事件）、对应测试。
- 可能碰到：`realSkillExecutor.ts` 上游上下文消费、`deaiGuidancePack.ts` 预算逻辑、现有 deai 注入集成测试、UI 显示测试。
- 最可能错假设：S1 骨架有稳定机器可读字段。证伪方式：读取三次实测 trace 的真实 S1 输出 payload，若字段形态不稳定，则解析只做有界锚点，不制造语义幻觉。
- 作者反证：若诊断注入导致终态/retry 变化，或 S3 请求不含诊断，即失败。

## 5. 停止条件

- 完成：RED 测试先失败后通过；定向测试与相关回归通过；集成测试证明 S3 requestMessages 在诊断后包含诊断内容；负向断言证明终态/retry 不变；台账/DEV_LOG 收尾。
- 失败：任一测试未先红、集成断言无法落点、诊断影响验收语义、或存在无法解释的 diff。

## 6. 执行证据

- 实现锚点（before → after）：
  - `src/services/schemaRetryFeedback.ts:101-168`：`buildUpstreamWordGapScaffold` 原先丢弃【正文交接】内部行、只认少量新协议行；现支持 legacy handoff 字段聚合、`场景N：`、`POV为/FACT_LOCK为` 自然语法，S2 retry 可从上游拿到有界事实链，不再默认“修复基础缺失/全链重建”。
  - `src/services/deaiStageDiagnosis.ts:1-176`：新增 S2 后位置化诊断模块；默认最多 6 条、1200 字符、50ms 构造预算；异常降级为 0 条；trace 只存计数、hash、预算字段，不携带候选正文。
  - `src/components/pipeline/PipelinePanel.vue:4185-4188`、`:4371-4376`、`:4510-4516`、`:4746-4768`：S2 验收后构造诊断并暂存，下一步 user prompt 组合 `stageGuidancePrompt`；诊断构造发生在 `current = stepOutput` 之后，物理请求消费该 prompt。
  - `src/stores/runTrace.ts:992`：`deai-stage-guidance` 加入 retained audit event 白名单。
  - `src/services/realSkillExecutor.ts:1318-1321`、`src/services/realSkillTypes.ts:24-29`：candidate ledger 保留候选输出，修复响应抽取链路只指向第一次候选的观测缺陷；单测断言 `output === '骨架一'`。
  - `src/services/realS2ProtectedContract.integration.spec.ts:145-148`：旧断言 `split('【正文交接】')` 会把合同说明文字误算为交接块（expected 1 / received 2）；改为精确行形态 `split('\n【正文交接】\n')`。本轮判定为测试语义误伤，不是应用回归；临时诊断输出已移除。
- 测试证据：
  - RED→GREEN：`schemaRetryFeedback.spec.ts:161-223` 两条新增用例覆盖真实 S1 自然场景交接与 legacy【正文交接】账本，均证明 `strategy=handoff-repair`、`scaffoldSource=upstream`，且反馈不携带候选全文。
  - 运行时诊断测试：`deaiStageDiagnosis.spec.ts` 覆盖位置计算、6 条/1200 字符预算、异常降级、预算超限丢条、trace 不携带正文。
  - 接线与边界测试：`deai-stage-guidance.integration.spec.ts` 覆盖“验收后诊断 → 下一步 prompt 消费”的源码顺序、诊断不进入验收块、trace 白名单、组合 prompt 预算与不携带候选正文。
  - 定向回归命令：`npx vitest run src/services/deaiStageDiagnosis.spec.ts src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts src/services/schemaRetryFeedback.spec.ts src/services/realSkillExecutor.spec.ts src/services/realS2ProtectedContract.integration.spec.ts` → 5 files / 95 tests passed。
  - 全量服务回归命令：`npm run test:services` → 242 files / 2600 tests passed。
  - 类型检查：`npm run type-check` → exit 0，无错误。
  - `git diff --check` → exit 0；仅 CRLF 转换提示，无 whitespace error。
- 证据分级（诚实声明）：
  - 已验证：纯函数行为、候选账本输出保留、PipelinePanel 接线存在与顺序、trace 白名单、组合 prompt 预算。
  - 未验证：真实 Electron 正文流水线运行中 S3 物理 requestMessages 携带诊断的端到端 trace。Phase A 未触发该路径，不能宣称已实测。

## 7. 缺口清单

- 未闭环（Phase B/C 内）：`deaiPromptVariant` skill 接管态观测修复、UI 三线显示、模型画像、校准账本、SKILL 迭代报告。
- 未实测（登记不阻塞 Phase A）：真实 Electron 正文链路 trace 中 `deai-stage-guidance` 事件与 S3 requestMessages 的端到端一致性；需在 Phase B/C 或下一次真实运行对账。
- 测试边界：`deai-stage-guidance.integration.spec.ts` 中 PipelinePanel 部分为源码接线守护，组合 prompt 已有运行时断言；真实 Electron 端到端仍未执行，本台账按证据分级声明，禁止冒充真实链路验证。
- 本轮测试断言修正：`realS2ProtectedContract.integration.spec.ts` 的 2 处计数是“合同说明文字提及协议词”导致的测试误伤；应用生产行为未因此修改，生产代码无对应改动。
