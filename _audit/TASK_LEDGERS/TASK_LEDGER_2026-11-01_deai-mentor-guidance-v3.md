# TASK_LEDGER_2026-11-01_deai-mentor-guidance-v3

状态：已被 V4 方案接续。V4 修正了本版 21 项推演中的纠缠面漏项、overlap 机制失真、终步检测断链与 `suffix-only` 等价现状。最新版本见：`_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V4.md`

## 1. Objective

用户五条裁决：区分两套降AI、补齐旧内嵌降AI退场、只做方法指导者、评估效率影响、明确应用体现。V3 的最终可感知行为是用户可审核一份覆盖五条裁决的方案，且方案明确生产代码待审核后实施。

## 2. Gate Evidence

- G0.1 目标对齐：`_audit/神意开发经验总结_v9.md:20`。
- G0.3 诚实闭环：同文件 `:36`。
- G0.5 回头看：同文件 `:52`。
- G0.6 方案成熟度：同文件 `:60`。
- G0.7 正反推研磨：同文件 `:68`。
- G0.9 影响圈声明：同文件 `:84`。
- G0.10 新旧并存清零与五证：同文件 `:92-104`。
- G0.12 门禁执行台账：同文件 `:114-126`。
- G1.22 检测/评分类校准：同文件 `:412-424`。
- G2.9 单一裁判：同文件 `:524-538`。
- G2.13 SKILL 执行中立：同文件 `:586`。

## 3. Routing Decision

采纳：G0.1、G0.3、G0.5、G0.6、G0.7、G0.9、G0.10、G0.12、G1.22、G2.9、G2.13。

排除：

- G0.11 真实交互冒充禁令：本轮无 UI 实测；已列入 Phase B 验收。
- G2.10 真实 trace 回放：列入实施阶段验证。
- G2.14 默认存储：不涉及。

## 4. Impact Circle And Author Counter-Evidence

改动：新增 V3 方案、V3 台账、V3 开发日志、主索引登记。

不改动：生产代码、手动去AI味链路、既有未提交文件。

主要假设与证伪方式：

1. 假设流水线与手动链路存在状态纠缠。证伪：`PipelinePanel.vue:6093,6103-6105,6220` 读取 `deAiStore`。
2. 假设旧提示词有测试守护。证伪：`rg -g "*.spec.ts"` 命中 `de-ai.spec.ts`、`skillDeaiContract.spec.ts`、`deaiChainVariantIntegration.spec.ts`、`deai-voice-profile-injection.spec.ts`、`deai-injection-policy.spec.ts`、`runTrace.spec.ts`。
3. 假设指导包可控。证伪：条数、字符数、耗时上限测试与超标降条数测试。
4. 假设隔离可执行。证伪：mock store 改变手动模式后流水线请求与正文不变的负向断言。
5. 假设效率不劣化。证伪：20 章、2 题材、2 模型配对对比；中位耗时或首 token 劣化超 10% 即降条数复测。

## 5. Stop Conditions

1. 用户未审核前禁止改生产代码。
2. Phase A 零 diff 断言失败即停止。
3. 影子样本不足 20 章、2 题材、2 模型前，禁止宣称教学有效。
4. skill-wins 五证缺失时禁止 Phase C。
5. 耗时劣化超过阈值且降条数后仍超标时，Phase B 延期。
6. provisional 校准状态未按样本结构解除前，禁止输出总分或整体 verdict。

## 6. Execution Evidence

1. 手动链路：`src/components/editor/EditorPanel.vue:35`、`src/components/settings/DeAiSettings.vue:3`、`src/composables/useDeAi.ts:246-369`、`src/stores/deai.ts:65-243`。
2. 内嵌旧链路：`src/services/de-ai.js:1222-1267`。
3. 流水线注入：`src/components/pipeline/PipelinePanel.vue:2776-2837`、`:3713-3775`。
4. 跨系统状态读取：`src/components/pipeline/PipelinePanel.vue:6093`、`:6103-6105`、`:6220`。
5. 旧 UI 文案：`src/components/pipeline/PipelinePanel.vue:589`、`:5743-5744`。
6. trace 类型：`src/stores/runTrace.ts:192`、`:571`、`:1668`、`:2048`、`:2398`。
7. 测试守护面：`rg -n -g "*.spec.ts" "DEAI_METHODOLOGY_PROMPT|legacy-auto|deep-fix|..." src` 命中前述 6 类 spec。
8. 经验门禁：`_audit/神意开发经验总结_v9.md:20,36,52,60,68,84,92-104,114-126,412-424,524-538,586`。
9. V2 基础：`_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V2.md`。

## 7. Gap List

1. V3 为方案文档，生产代码未改。
2. Phase A/B/C 均待用户确认后执行。
3. 影子观察数据尚不存在。
4. folder SKILL 契约手册更新待方案批准后执行。
5. 本轮不升版、不封装、不提交 git。
