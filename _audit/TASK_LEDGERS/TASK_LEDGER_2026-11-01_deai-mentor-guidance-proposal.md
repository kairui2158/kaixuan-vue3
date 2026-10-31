# TASK_LEDGER_2026-11-01_deai-mentor-guidance-proposal

> 本台账登记 V2 方案产出。V3 升级台账见 `TASK_LEDGER_2026-11-01_deai-mentor-guidance-v3.md`。

## 1. Objective

用户原始目标：在 V1“编译器式诊断”方案基础上解除核心限制，进行20轮深入思考，判断降AI是否应升级为“指导者”，并评估 `D:/codex/去AI味资料说明.md` 的资料能否支撑该角色。

最终可感知行为：用户可审核一份 V2 方案，明确“方法论指导者 + 确定性门禁”的职责边界、资料支撑度、接口契约、三阶段实施与验收门禁。

本轮交付物：

1. `_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V2.md`
2. `_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-proposal.md`
3. `_audit/DEV_LOG_MASTER_INDEX.md` 登记

## 2. Gate Evidence

- G0.1 目标对齐：`_audit/神意开发经验总结_v9.md:20`，关键句“每轮任务先复述原始目标与最终可感知行为”。
- G0.3 诚实闭环：同文件 `:36`，关键句“完成声明必须与实际证据一致”。
- G0.5 回头看：同文件 `:52`，关键句“每次任务收尾前必须执行回头看”。
- G0.6 方案成熟度：同文件 `:60`，关键句“必须分别评估执行器/工具层、应用方案/交互闭环、实现接线、验证标准四层”。
- G0.7 正反推研磨：同文件 `:68`，关键句“目标倒推、爆炸半径矩阵、正推生效证据、反推质询、优先级证据化修订”。
- G0.9 影响圈声明：同文件 `:84`，关键句“至少覆盖生产入口、服务层、UI、测试、脚本、规格文档、日志/trace 字段七面”。
- G0.10 新旧并存清零：同文件 `:92-104`，关键句“覆盖源码、测试、脚本、规格、日志、运行状态、构建产物七层”。
- G0.12 门禁执行台账：同文件 `:114-126`，关键句“必须包含七节，缺任何一节不得进入完成声明”。
- G1.22 检测/评分类校准：同文件 `:412-424`，关键句“整体判定的 provisional 只能由样本结构解锁，不能由单测数量解锁”。
- G1.23 契约开关四件套：同文件 `:424`，关键句见“契约开关四件套”节。
- G2.9 终稿与流水线：同文件 `:524-538`，关键句“双层验收必须按维度单一裁判”。
- G2.13 SKILL 执行中立：同文件 `:586`，关键句“SKILL guidance 只允许改变提示词、领域能力与上下文组织”。

## 3. Routing Decision

采纳：G0.1、G0.3、G0.5、G0.6、G0.7、G0.9、G0.10、G0.12、G1.22、G1.23、G2.9、G2.13。

排除：

- G0.11 真实交互冒充禁令：本轮无 UI 实测目标；已列入 Phase 2 验收。
- G1.24 语义域口径：本轮不改字数测量；指导包与反馈实现时按测试替身纪律覆盖。
- G2.10 真实 trace 回放：本轮是方案输出；回放列入验证计划。
- G2.14 默认存储位置：不涉及存储迁移。

## 4. Impact Circle And Author Counter-Evidence

打算改的：仅新增 `_audit` 三个文档文件，并在主索引末尾追加登记。

可能碰到的：上一轮与当前工作区已有未提交改动；本轮不修改、不回滚、不提交。

方案最可能错的假设与证伪方式：

1. 假设资料足以支撑方法论指导者。证伪方式：逐条对账 story-deslop 原文锚点，确认三层框架、白话报告、三测试、风格优先级存在且语义一致。
2. 假设指导包可以避免规则挤压。证伪方式：Phase 1 检查每步上限 6 条、`omittedOverlaps` 非空时是否真实省略。
3. 假设教学反馈不引入旧稿先验。证伪方式：run-trace 回放断言 `candidateFullTextIncluded: false` 且请求体无候选全文。
4. 假设 `guidanceOwnership` 推导不抢 SKILL 权。证伪方式：`skill-wins` 用例断言应用只保留编译器门禁。
5. 假设语义 advisory 不会被误接成重试。证伪方式：负向测试断言 advisory 只进报告不改变终态。

## 5. Stop Conditions

- 用户未确认方案前，禁止进入生产代码修改。
- Phase 1 影子观察未达 20 章、2 题材、2 模型前，禁止宣称教学有效性已验证。
- Phase 1 行为断言发现正文输出变化时，停止并回查实现。
- Phase 2 skill-wins 迁移五证缺任一项时，禁止 Phase 3。
- 阈值、词库、评分权重或整体 verdict 解除 provisional 前缺少分层样本报告时，停止。

## 6. Execution Evidence

1. 用户资料入口：`D:/codex/去AI味资料说明.md`，一句话定位为“本地写作 lint，不是 AIGC 检测器”。
2. 三层诊断与报告原则：`D:/codex/oh-story-claudecode/skills/story-deslop/SKILL.md:4`、`:17`、`:20`、`:48`。
3. 表达层方法：`skills/story-deslop/references/expression.md:21`、`:36`、`:42-44`。
4. 叙事用笔与三测试：`skills/story-deslop/references/narrative-focus.md:9-15`、`:21-27`。
5. 故事因果边界：`skills/story-deslop/references/story-logic.md:18`、`:36`。
6. 风格优先级：`skills/story-deslop/references/style-resolution.md:7`、`:11`。
7. 应用注入现状：`src/services/de-ai.js:1222-1260` 三段提示词与链步分发。
8. 契约现状：`src/services/skillDeaiContract.ts:157-169` skill-wins 分支；`src/services/skillDeaiContractValidation.ts:23-31` 默认 report 与 suffix-only 等价 on。
9. 流水线消费点：`src/components/pipeline/PipelinePanel.vue:2776-2837`、`:3713-3775`、`:6093-6294`。
10. V1 前置方案：`_audit/PROPOSAL_2026-11-01_DEAI_DIAGNOSE_ROUTE_RETURN_V1.md`。
11. V2 方案产出：`_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V2.md`。

## 7. Gap List

1. 方案未执行生产代码改动；`deaiGuidancePack`、`DeaiTeachingFeedback`、契约 V2、trace 与 UI 均待用户审核后实施。
2. 影子观察数据尚不存在，教学有效性保持未验证状态。
3. folder SKILL 侧适配说明与手册更新待方案批准后执行，避免未批准先扩合同。
4. 旧三段提示词与 legacy-auto/deep-fix 退役需 Phase 3 七层清零验收。
5. 本轮不升版、不封装、不提交 git。
