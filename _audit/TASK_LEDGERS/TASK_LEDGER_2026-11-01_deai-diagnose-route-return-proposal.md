# TASK_LEDGER_2026-11-01_deai-diagnose-route-return-proposal

## 1. Objective

用户原始目标：以“降AI不得扰乱、打碎正文输出质量”为核心，吸收 `story-deslop` 的编译器式诊断优点，经20轮深入推演后产出可执行方案供审核。

最终可感知行为：用户可审核一份“诊断-路由-回归”方案，明确降AI从改写者降级为诊断器，修复按 owner 回归，旧改稿模式按阶段退役。

本轮交付物：

1. `_audit/PROPOSAL_2026-11-01_DEAI_DIAGNOSE_ROUTE_RETURN_V1.md`
2. `_audit/DEV_LOG_2026-11-01_deai-diagnose-route-return-proposal.md`
3. `_audit/DEV_LOG_MASTER_INDEX.md` 登记

## 2. Gate Evidence

- G0.1 目标对齐：`_audit/神意开发经验总结_v9.md:20`，关键句“每轮任务先复述原始目标与最终可感知行为”。
- G0.5 回头看：同文件 `:52`，关键句“每次任务收尾前必须执行回头看”。
- G0.6 方案成熟度：同文件 `:60`，关键句“必须分别评估执行器/工具层、应用方案/交互闭环、实现接线、验证标准四层”。
- G0.7 正反推研磨：同文件 `:68`，关键句“目标倒推、爆炸半径矩阵、正推生效证据、反推质询、优先级证据化修订”。
- G0.9 影响圈声明：同文件 `:84`，关键句“至少覆盖生产入口、服务层、UI、测试、脚本、规格文档、日志/trace 字段七面”。
- G0.10 新旧并存清零：同文件 `:92-104`，关键句“覆盖源码、测试、脚本、规格、日志、运行状态、构建产物七层”。
- G0.12 门禁执行台账：同文件 `:114`，关键句“必须包含七节，缺任何一节不得进入完成声明”。
- G1.22 检测/评分类校准：同文件 `:412`，关键句“整体判定的 provisional 只能由样本结构解锁”。
- G2.9 终稿与流水线：同文件 `:524`，关键句“双层验收必须按维度单一裁判”。
- G2.13 SKILL 执行中立：同文件 `:586`，关键句“SKILL guidance 只允许改变提示词、领域能力与上下文组织”。

## 3. Routing Decision

采纳：G0.1、G0.3、G0.4、G0.5、G0.6、G0.7、G0.9、G0.10、G0.12、G1.22、G1.23、G2.9、G2.13。

排除：

- G0.11 真实交互冒充禁令：本轮无 UI 实测目标；已写入后续 Phase 2 验收，不在本轮执行。
- G1.24 语义域口径：本轮不改字数测量；后续实现 findings 字段时按测试替身纪律覆盖。
- G2.10 真实 trace 回放：本轮是方案输出；回放列入验证计划，不在本轮执行。
- G2.14 默认存储位置：不涉及存储迁移。

## 4. Impact Circle And Author Counter-Evidence

打算改的：仅新增 `_audit` 四个文档文件。

可能碰到的：上一轮未提交的审计文档改动；本轮不修改、不回滚、不提交。

方案最可能错的假设：

1. 假设 findings 可稳定定位中文正文片段。证伪方式：实现时用真实 run-trace 正文回放，对行号列号抽样核对。
2. 假设 skill-wins 迁移不会破坏旧用户。证伪方式：迁移测试覆盖旧持久化、覆盖导入、磁盘包健康检查。
3. 假设退化指纹不误伤网文复沓。证伪方式：使用真实人写负样本测试对白与弹幕复沓豁免。

## 5. Stop Conditions

- 用户未确认方案前，禁止进入生产代码修改。
- Phase 1 行为断言发现正文输出变化时，停止并回查实现。
- Phase 2 skill-wins 迁移五证缺任一项时，禁止 Phase 3。
- 阈值或 verdict 解除 provisional 前缺少分层样本报告时，停止。

## 6. Execution Evidence

1. 检测现状：`src/services/de-ai.js:378-388` 无位置字段；`src/services/de-ai.js:1055-1193` 为统计报告。
2. 改稿现状：`src/services/de-ai.js:984-1052` processBody；`src/components/pipeline/PipelinePanel.vue:6090-6265` 三模式后处理。
3. 契约现状：`src/services/skillDeaiContract.ts:157-164` skill-wins；`src/services/skillDeaiContractValidation.ts:23-31` 默认 report 与 suffix-only 等价 on。
4. 外部对标：`D:/codex/oh-story-claudecode/skills/story-deslop/scripts/check-degeneration.js:9-62`、`:188-333`。
5. 预算锚点：`src/components/pipeline/PipelinePanel.vue:6645-6663` 硬信号两次上限。
6. 方案产出：`_audit/PROPOSAL_2026-11-01_DEAI_DIAGNOSE_ROUTE_RETURN_V1.md`。

## 7. Gap List

1. 方案未执行生产代码改动；实现、测试、UI 验证待用户审核后启动。
2. deep-fix 影子观察数据尚不存在，Phase 2 放行需真实生成样本。
3. folder SKILL 侧适配说明待方案批准后单独产出，避免未批准先扩合同。
4. 本轮不升版、不封装、不提交 git。
