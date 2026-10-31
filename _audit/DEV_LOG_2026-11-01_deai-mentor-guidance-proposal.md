# DEV_LOG_2026-11-01_deai-mentor-guidance-proposal

## 目标

在 V1“诊断-路由-回归”方案基础上，解除“只做编译器”的核心限制，完成20轮深入推演，判断内嵌降AI是否应升级为“指导者”，并评估 `D:/codex/去AI味资料说明.md` 所述 story-deslop 资料的支撑度。

## 交付

1. 新增方案：`_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V2.md`
2. 新增台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-proposal.md`
3. 主索引登记：`_audit/DEV_LOG_MASTER_INDEX.md`

## 关键结论

1. 资料足以支撑“方法论指导者”：三层诊断、白话位置化报告、删除/压缩/展开三测试、风格裁决优先级均可转化为生成前教学与生成后反馈。
2. 资料不足以支撑“自动语义导师”：叙事用笔与故事因果判断需要 LLM 语境理解，本地脚本只覆盖表达层与确定性缺陷。
3. 资料不足以支撑“自动评分导师”：正负样本结构未解除 provisional，教学反馈不输出总分。
4. 资料不足以支撑“自动改稿导师”：故事级修改需要授权；应用自动改稿会重新制造 V1 要退役的第二作者。
5. V2 架构为“生成前方法论指导包 + 生成后位置化教学反馈 + 确定性编译器门禁”；风格卡片仍是唯一风格 owner，叙事 verdict 仍归 folder SKILL。
6. 旧三段提示词 `DEAI_METHODOLOGY_PROMPT / DEAI_CREATIVE_PROMPT / DEAI_POLISH_PROMPT` 将由 `deaiGuidancePack` 接管生产注入职责，并按 G0.10 七层清零退役。

## 验证

- 只读对账 `src/services/de-ai.js:1222-1260`、`src/services/skillDeaiContract.ts:157-169`、`src/services/skillDeaiContractValidation.ts:23-31`、`src/components/pipeline/PipelinePanel.vue:2776-2837`、`:3713-3775`、`:6093-6294`。
- 资料锚点对账 story-deslop 的 `SKILL.md:4,17,20,48`、`expression.md:21,36,42-44`、`narrative-focus.md:9-15,21-27`、`story-logic.md:18,36`、`style-resolution.md:7,11`。
- 方案按 G0.6 给出四层成熟度结论；按 G0.7 完成第20轮反向质询；按 G0.9 声明七面影响圈；按 G0.12 产出台账七节。
- 本轮无生产代码改动，因此不运行应用测试；后续实施阶段按方案验证计划执行。

## 边界

- 待用户审核；审核通过前不改生产代码。
- 不升版、不封装、不提交 git。
- 阈值、词库、评分权重与整体 verdict 保持 provisional。
- 教学有效性在影子观察达标前保持未验证状态。
