# TASK_LEDGER_2026-11-03_body-deai-v6-1-overdesign-freeze.md

## 1. 目标与授权

- 用户原话：`批准，然后继续推进，在推进中持续审查有无过度设计的问题`
- 目标：冻结未校准的模型画像 prompt 注入，同时保留 V6.1 已验证的协同观测链路。

## 2. 门禁读证

- G0.3 诚实闭环：不把 observational live 说成质量提升证明。
- G0.5 回头看：同步测试、Electron/live 验证脚本、方案、SKILL 手册与经验文件。
- G0.9 影响圈：只改模型画像发布语义与对应验证/文档，不改诊断、验收、终态和 SKILL 目录。
- G1.1 精准编辑：全部文件改动使用 apply_patch。
- G1.22 检测/评分类校准：样本计数不得替代误伤率、召回率与分层校准结论。

## 3. 影响圈与反证

- 修改：`deaiModelProfile.ts`、`deaiModelProfile.spec.ts`、`deai-stage-guidance.integration.spec.ts`、Electron/live 验证脚本、V6.1 方案、SKILL 适配说明、经验总结、DEV_LOG、TASK_LEDGER。
- 不修改：`deaiStageDiagnosis.ts`、`deaiSkillReport.ts`、`deaiCalibrationLedger.ts`、`PipelinePanel.vue` 的诊断/验收/终态逻辑、folder SKILL 正式目录。
- 反证：若冻结期任何物理请求出现 `【模型事实情报】`，或 trace `injectedRuleCount > 0`、`guidanceChars > 0`，本任务失败。

## 4. 执行证据

- 发布开关：`src/services/deaiModelProfile.ts` 定义 `DEAI_MODEL_PROFILE_RELEASED = false`。
- 冻结行为：`buildDeaiModelProfileGuidance` 首行消费发布开关，未发布直接返回空字符串。
- trace：`buildDeaiModelProfileTraceEvent` 输出 `released=false` 与 `releaseGate='calibration-not-ready'`。
- Electron 断言：`scripts/verify-deai-stage-guidance-electron.mjs` 检查物理请求无画像文本，并断言 `injectedRuleCount=0`。
- live 断言：`scripts/verify-deai-stage-guidance-live.mjs` summary version 3，逐章记录并断言画像冻结。
- 定向测试：2 files / 21 tests passed。
- 脚本语法：两个 verify 脚本 `node --check` 均 exit 0。

## 5. 未完成与边界

- 当前旧 live 进程仍在运行，且启动早于本改动；不得杀进程，也不得把其结果当冻结后复验。
- 冻结后的 Electron E2E 已重跑通过；真实供应商 observational live 已在五个证据目录中留证，含失败与 running 状态。
- 校准解冻条件未满足：真实负样本误伤、真实正样本召回、分层指标、产品预期确认仍缺。
- 本轮当时不升版、不封装、不提交 git；2026-11-03 用户已授权 3.112.0 交付，发布证据由发布台账接续。

## 6. 追加过度设计复查与裁决

- 发现：`deai-skill-report` 在 `RETAINED_AUDIT_EVENT_TYPES` 中登记，但生产代码没有对应 `addEvent` 发射点。
- 裁决：报告导出是用户可见功能，保留按钮、导出、失败提示与误伤登记；运行记录不需要记录用户导出动作，删除 whitelist 死项。
- 修改：`src/stores/runTrace.ts` 删除 `deai-skill-report`；`src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts` 改为负向守护。
- 验证：定向 2 files / 19 tests passed；`npm run type-check` exit 0；`npm run test:services` 245 files / 2631 tests passed。
