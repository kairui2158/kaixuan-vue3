# DEV LOG — 2026-11-13 — body-layer LHC K73 trace-172317 修复

## 运行事实
- Trace: run-trace-正文层-20261113-172317-deep
- 断点恢复 step 3/3（S1未执行）
- S3 3次物理调用全败，耗时约887秒
- S2候选净CJK=2889，地板=2800，真实预算=89字
- Attempt输出: 2751 / 2787 / 2730

## 四根因（SKILL层）
1. LHC新分隔行`--- 上一步结构化交接（终步账本） ---`含12CJK未被`extractDiagnosticBody`识别，基线虚高至2901。
2. 打磨预算仅建议无结构化闸，模型整段压缩P14段153→45。
3. S2/S3 `quotedDialogue`缺直引号`"…"`计数，attempt2误报"无对白回合"。
4. S3三败无上游S2回退路由（应用侧决策面）。

## SKILL修复
| # | 文件 | 改动 |
|---|------|------|
| 1 | kaixuan-s3/script.js | extractDiagnosticBody 剥离新分隔行 |
| 2 | kaixuan-s2/script.js + kaixuan-s3/script.js | quotedDialogue 补直引号 |
| 3 | kaixuan-s3/script.js | buildPolishBudget <100字收敛合同 + 旧预算剥离 |
| 4 | kaixuan-s3/script.js | 打磨预算标签泄漏检测 |
| 5 | kaixuan-s3/template.md | 贴地板结构性删减禁令 |
| 6 | tests/trace-20261113-172317-regression.js | 新增5用例回归 |

## 现役指纹
- S2 = 5E2ABBDF / 49222B
- S3 = E4B3C58F / 73332B
- 全源码树无旧指纹残留（backup目录只读）

## 验证
- 新回归 5/5 PASS
- 全量 57个独立测试JS FAILED_COUNT=0
- S2/S3 node --check PASS
- K73 已入经验总结与教训记录.md:5052

## 应用侧转达
1. S3三败无上游S2回退路由，需应用侧新增S3→S2重发机制。
2. deai-model-profile calibration-not-ready 未注入（0规则），等校准数据。
3. postProcess usage 未注入，S1 _perf 警告静默跳过。

## 2026-11-13 应用侧待办改判与 LHC 声明同步

- 方案：`_audit/PROPOSAL_2026-11-13_LHC_ARCH_SYNC_AND_APP_TODO_ROUTES_V1.md`
- LHC：S1 现役为骨架字符串 + `【正文交接】`；S2/S3 现役为 `{body, metadata.extractedMeta[0]}`。应用已兼容双形态，本轮是现役适配声明，不新增兼容层；`requiresFullUpstreamContext=false` 与输出形态是独立约束。
- 指纹：S1 `DA9D0338/28640B`、S2 `5E2ABBDF/49222B`、S3 `E4B3C58F/73332B`。
- 待办改判 1：`postProcess usage` 实为已解决。`realSkillExecutor.ts:1382-1385` 已传 `{output,usage}`；S1 `script.js:587-601` 已消费并输出 `_perf`；`realSkillExecutor.ts:1400-1420` 已写入 `postProcessReport.perf`。改为“已解决，真实 trace 观测期”。
- 待办改判 2：`deai-model-profile` 不是数据未注入，而是 `deaiModelProfile.ts:11` 冻结门禁 `RELEASED=false` 导致 `:48` 永远返回空 guidance；账本已有 5 样本门槛。改为“冻结门禁待最小释放”。
- 待办改判 3：`S3三败回退` 不是“无路由”。`bodyArtifactOrchestrator.ts:331-337` 首败即编排 targeted，`:203-220` 会从生成步重跑，PipelinePanel `:6555-6569` 展开执行计划；K73 未触发属路由对账问题。改为“现有 targeted/full_chain 路由未触发，先对账再修单点”，不新增修复系统。
- 边界：本段不改 SKILL，不改产品代码，只同步声明与待办状态。

## 2026-11-13 LHC 同步方案 Phase B/C 执行

- 方案：`_audit/PROPOSAL_2026-11-13_LHC_ARCH_SYNC_AND_APP_TODO_ROUTES_V1.md`
- Phase B：`PipelinePanel.vue:3554-3562` 在 folder result failed 且存在 `stepArtifactContext` 时保留 `StructuredSkillStepOutput`，不再把硬门禁失败转成裸异常；blocked 叙事路由保持原优先级。focused 测试 30/30、type-check、build:vue PASS，commit `1ae6c6df`。
- Phase C：`deaiModelProfile.ts:11` 与 `:45-97` 从快照规则推导释放；无规则仍空注入，有规则最多 3 条且 600 字符截断；trace 保留 `released/releaseGate/eligibleRuleCount/injectedRuleCount/guidanceChars`。focused 测试 26/26、type-check、build:vue PASS，commit `30205b99`。
- Electron 观测：`scripts/verify-deai-stage-guidance-electron.mjs` PASS；三次 profile 事件均为 `released=true / releaseGate=null / injectedRuleCount=1 / guidanceChars=40`，证据在 `_audit/verification-deai-stage-guidance-electron/run-trace.json:170,403,681`。
- Phase D 边界：真实正文层供应商 trace 仍需对账 `postProcessReport.perf`、`repairScope` 与 profile 注入条数；未回填前不宣称完全闭环。
