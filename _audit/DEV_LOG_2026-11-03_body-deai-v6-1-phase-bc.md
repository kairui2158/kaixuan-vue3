# DEV_LOG：正文层内嵌降AI协同 V6.1 Phase B/C

日期：2026-11-03
关联方案：`_audit/PROPOSAL_2026-11-02_BODY_DEAI_COLLABORATION_V6_1.md`
关联台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_body-deai-v6-1-phase-bc.md`

## 开发目标

执行 V6.1 Phase B/C：SKILL 写作、应用送情报。

1. 模型画像：provider/model 维度的校准账本读取、样本门槛与 run 内 immutable 快照。
2. UI 三线：方法论、诊断、校准的独立显示与统一投影。
3. 校准账本：终稿 findings 落账，作为 SKILL 迭代的数据来源。
4. SKILL 迭代报告：真实导出，供 folder SKILL 作者迭代模板使用。

## 实际改动

1. `src/services/deaiModelProfile.ts`（新增）
   - 读取校准账本，按 provider/model 聚合；样本数不足时不注入画像 guidance。
   - run 内 immutable 快照，避免生成中途因账本更新产生口径漂移。
2. `src/services/deaiCalibrationLedger.ts`（新增）
   - 持久化校准账本，记录 provider/model/findings/样本数，不落正文全文。
3. `src/services/deaiSkillReport.ts`（新增）
   - 生成 SKILL 迭代报告：方法论、S2 诊断、终稿诊断、前后差分、变体、误伤候选。
   - 空集合显式输出 `- 无`，不用 falsy 短路。
4. `src/services/deaiGuidanceDisplay.ts`
   - 新增 collaboration 投影，把 methodology/diagnosis/calibration 三线合并为 UI 可读文本。
5. `src/components/pipeline/PipelinePanel.vue`
   - S2 诊断生成与暂存：S2 验收通过且非终步时生成，供 S3 使用并写入 per-run 状态。
   - attempt 重置时显置 `deaiStageDiagnosis = null`，防跨 attempt 串台。
   - 终稿后校准落账、构建报告并写入 per-run 状态。
   - 报告导出走既有 dialog API，不新增 IPC 面。
   - per-run 状态 Map 有界化，新 run 创建时修剪终态 run，保留 40 个。
   - 删除无引用的 `callApiWithAgentVariant` 三行转发包装。
   - 删除死亡变量 `pendingStageDiagnosis`，保留仍被消费的 `pendingStageDiagnosisGuidance`。
6. `src/services/pipelinePerRunUiState.ts`（新增）
   - per-run UI 状态结构化，承载 `deaiStageDiagnosis`、`deaiSkillReport`、`deaiSkillReportExporting`。
7. `scripts/verify-deai-stage-guidance-electron.mjs`
   - 真实 Electron E2E：真实 UI 选择 folder SKILL、真实点击生成按钮、深 trace 导出、物理请求断言。
   - 新增报告本体断言：S2 诊断条数、变体列表、空误伤候选。

## 需求实现说明

Phase B/C 的职责不是替 SKILL 证明写作质量，而是把 SKILL 迭代需要的数据送到位：方法论注入、S2 诊断、终稿诊断、校准账本、报告导出。应用不做第二作者，不改写正文，不影响终态。

## 测试与验证

- 定向测试：6 files / 47 tests passed（2026-11-03 02:55:07）。
- 类型检查：`npm run type-check` exit 0。
- 生产构建：`npm run build:vue` exit 0。
- Electron E2E：`node scripts/verify-deai-stage-guidance-electron.mjs` exit 0，`runStatus=success`，3 个物理请求，报告导出成功；最终复跑 `runId=run-1793646268827-1`，`_audit/verification-deai-stage-guidance-electron/` 证据齐。
- 全量服务测试：245 files / 2623 tests passed。

## E2E 三红灯排查

1. 报告导出按钮不可见
   - 根因：报告生成依赖 `perRunUi(bodyRunId)`，但面板重建后 per-run 状态丢失，导致报告为空、按钮 disabled。
   - 修复：per-run 状态收敛到 `pipelinePerRunUiState`，状态不再因面板重建丢失。
2. 报告 `S2诊断：0条`
   - 根因：终步 else 分支清理 `runUi.deaiStageDiagnosis`，S3 生成后 S2 诊断被清空。
   - 修复：else 分支不再清理；attempt 重置块显置 null，防跨 attempt 串台。
3. 报告 `变体: 无`
   - 根因：报告组装处直接读当前内存常量，未消费真实 trace 的 `deaiPromptVariant` 字段。
   - 修复：新增 `collectDeaiPromptVariants`，从 `runTraceStore.getRun(runId).apiCalls` 去重收集并过滤 `off`。

## 回头看发现的事故

1. 空数组 falsy 陷阱
   - 现象：`arr.map(...) || ['- 无']`，空数组返回 truthy 空数组，默认值永不生效。
   - 修复：改为 `arr.length ? arr.map(...) : ['- 无']`，三处（S2 诊断、终稿诊断、误伤候选）全部修正。
   - 测试：新增空集合测试，断言 `- S2诊断：0条`、`## 误伤候选\n\n- 无`。
2. 类型导入误删
   - 现象：清理死亡变量 `pendingStageDiagnosis` 时，误删同 import 块内仍被 `diagnosisReportInput` 消费的 `type DeaiStageDiagnosis`。
   - 根因：删除范围按标识符周边展开，没有先确认 import 块内每个成员的消费点。
   - 修复：恢复类型导入，`type-check` 复绿。
3. per-run Map 无界增长
   - 现象：面板重建后创建新状态，旧终态 run 状态全部保留。
   - 修复：新 run 创建时修剪终态 run，保留 40 个。
4. 结构性断言源未随状态外移
   - 现象：`pipelineProgressReaders.spec.ts` 仍从 `PipelinePanel.vue` 断言 `feedbackHidden?: boolean`，per-run 状态外移后断言失效。
   - 修复：断言源改为 `pipelinePerRunUiState.ts`，同时保留面板内的消费函数断言。

## 诚实边界

1. 本轮 E2E provider 为 mock；后续真实供应商 observational live 已在五个证据目录中留证，含失败与 running 状态。
2. 真实模型输出下 findings 分布、误伤率与 SKILL 迭代效果保持 observational，不由 mock 证明。
3. 本轮当时不升版、不封装、不提交 git；2026-11-03 用户已授权 3.112.0 交付，发布证据由发布台账接续。

## 门禁回写

- 教训并入经验文件 v9.10.0：
  - 终步清理分支不得误清上游暂存状态；状态必须标 owner 与存活窗口。
  - 空集合默认值禁止依赖 `||` 与 `.map()` 组合；必须用 `length` 判断。
  - E2E 断言必须覆盖报告数值本身，不能只断言文件存在或按钮可点。
