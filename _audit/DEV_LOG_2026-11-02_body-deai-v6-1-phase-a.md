# DEV_LOG：正文层内嵌降AI协同 V6.1 Phase A

日期：2026-11-02
关联方案：`_audit/PROPOSAL_2026-11-02_BODY_DEAI_COLLABORATION_V6_1.md`
关联台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_body-deai-v6-1-phase-a.md`

## 开发目标

执行 V6.1 Phase A：SKILL 写作、应用送情报。

1. 修复 S2 retry 的上游事实链解析，避免 S1 骨架可用时降级为全链重建。
2. 新增 S2 后、S3 前的位置化诊断，注入下一步 user prompt。
3. 新增 `deai-stage-guidance` trace 事件，只存摘要与结构化字段。
4. 修复候选账本观测，保留候选输出供响应抽取链路对账。

## 实际改动

1. `src/services/schemaRetryFeedback.ts`
   - `buildUpstreamWordGapScaffold` 支持 legacy【正文交接】内部字段、`场景N：`、`POV为/FACT_LOCK为`。
   - S2 retry 使用有界上游事实链，反馈不携带候选全文。
2. `src/services/deaiStageDiagnosis.ts`（新增）
   - 6 条 / 1200 字符 / 50ms 本地预算；异常降级为 0 条。
   - trace 事件带 `findingCount`、`guidanceChars`、`durationMs`、`hash`，不带候选正文。
3. `src/components/pipeline/PipelinePanel.vue`
   - S2 验收后生成诊断并暂存；下一步 prompt 组合 `stageGuidancePrompt` 后进入物理请求。
   - 诊断不在验收、终态或 retry 判定块内。
4. `src/stores/runTrace.ts`
   - `deai-stage-guidance` 进入 retained audit event 白名单。
5. `src/services/realSkillExecutor.ts`、`src/services/realSkillTypes.ts`
   - candidate ledger 保留候选输出，响应抽取不再只能指回第一次候选。

## 测试与验证

- 新增/更新测试：
  - `src/services/deaiStageDiagnosis.spec.ts`
  - `src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts`
  - `src/services/schemaRetryFeedback.spec.ts`
  - `src/services/realSkillExecutor.spec.ts`
- 定向回归：5 files / 95 tests passed。
- 类型检查：`vue-tsc --noEmit` 通过。
- 全量服务测试：`npm run test:services` → 242 files / 2600 tests passed（2026-11-02 21:25:59 执行）。
- `git diff --check`：无 whitespace 错误，仅 CRLF 提示。

## 测试断言事故与修正

全量回归曾出现 `realS2ProtectedContract.integration.spec.ts` 1 条失败：

- 现象：expected 1, received 2。
- 根因：旧断言用 `split('【正文交接】')` 计数，把“重试交付合同说明文字”里的协议词也算成交接块；不是应用回归。
- 修正：改为 `split('\n【正文交接】\n')` 精确行形态断言。
- 防复发：断言协议块必须按协议边界（独立行）计数，不能按词面出现次数计数。

## 诚实边界

1. Phase A 已验证纯函数、候选账本、源码接线顺序、trace 白名单与组合 prompt 预算。
2. 尚未做真实 Electron 正文链路运行验证；`deai-stage-guidance` 在真实 trace 与 S3 requestMessages 中的端到端一致性留给 Phase B/C 或下一次真实运行对账。
3. Phase B/C 未执行：模型画像、UI 三线显示、校准账本、SKILL 迭代报告。
4. 本轮当时按 V6.1 第 8 节边界不升版、不封装、不提交 git；2026-11-03 用户已授权 3.112.0 交付，发布证据由发布台账接续。

## 门禁回写

- 本轮教训并入经验文件 v9.9.0：
  - 协议块断言必须按协议边界计数。
  - 接线验证必须区分“源码断言”与“运行时请求验证”。
