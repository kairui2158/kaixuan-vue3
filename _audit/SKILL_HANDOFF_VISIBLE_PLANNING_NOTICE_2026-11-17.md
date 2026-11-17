# SKILL HANDOFF - Visible Planning Notice - 2026-11-17

## 目的

知会凯旋 folder SKILL 层：应用已对“供应商把输出预算全部投入推理，最后把英文规划文本写入可见输出通道”的失败形态增加独立识别和一次直出重试路由。本文不改 SKILL 代码，也不改变“应用管平台合同、SKILL 管叙事质量”的边界。

## 现役应用行为

1. 分类器新增 `visible_planning`。触发条件为全部满足：
   - 可见输出非空，且英文规划字符占比达到 `VISIBLE_PLANNING_RATIO_THRESHOLD = 0.6`；
   - `finishReason` 属于 `length/max_tokens/max_output_tokens`，或正文输出 tokens 已达到本次 `maxTokens`。
2. 分类器进一步拆分：
   - `planning_only`：无足够中文正文证据，判定不可用；
   - `mixed_planned_body`：规划文本占比较高但保留 CJK 证据不少于 200，判定可用并交给 postProcess。
3. `planning_only` 命中后不再把规划文本当有效产物，会执行一次 `direct_retry`：
   - 供应商推理控制可用时用 `thinking_disabled`；
   - 不可用时提高输出上限；
   - 两种路径都会追加 `【直出模式】` 约束。
4. 重试同型失败且正文证据没有增加不少于 200 CJK，或二次 `reasoning_exhausted`，直接短路并标记供应商级终态；trace/diagnostic 记录 `generation-invalid:visible_planning` 或 `generation-invalid:reasoning_exhausted`。
5. 探测裁决为非 `effective` 时，重试改用 `max_tokens_raised`，不发送已证无效的禁思考参数；trace 事件携带 `thinkingProbeVerdictSource`。

关键边界：只有预算耗尽证据配合高占比规划形态才判定。正常 `stop` 完成的英文正文、中文正文夹少量英文术语，不会被误判。

## 对 SKILL 的合同建议

建议后续在 S1/S2/S3 模板的输出铁律区补充一句防御条款：

> 英文规划、自我提问、步骤清单、协议分析不得进入可见输出；可见输出只能承载当前步骤的最终产物。

这是 SKILL 叙事合同侧的防御层，不是应用替换 SKILL 验收。是否采纳由 SKILL 层决策。

## 对账指纹

| 文件 | 说明 |
| --- | --- |
| `src/services/visiblePlanningText.ts` | 规划占比检测与阈值 |
| `src/services/generationValidity.ts` | `visible_planning` 分类 |
| `src/services/realSkillExecutor.ts` | 直出重试路由与终态收口 |
| `src/services/providerThinkingProbe.ts` | 探测器新增可见规划通道判定 |

## 状态

应用侧 P1-P4 已实现并进入全量验证；本通知为单向知会，无需 SKILL 立即改码。
