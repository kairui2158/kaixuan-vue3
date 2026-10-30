# 2026-10-31 word-gap 上游事实链骨架任务台账

## 1. Objective

落实 SKILL 方建议：word-gap 反馈缺候选骨架时，不应直接降级为“按原始任务输入重建正文”的全链重建提示；应优先使用 FACT_LOCK 与末章/上游事实链重建【正文交接】账本，只补足缺口。

## 2. Root Cause

1. `realSkillExecutor.ts` 已经接收 `chainUpstreamContext` 并注入 user prompt，但两处 `buildSchemaRetryFeedback` 调用未传入该字段。
2. `buildSchemaRetryFeedback` 的输入接口和内部实现没有上游上下文概念，`buildWordGapScaffold` 只能从候选输出的【正文交接】提取骨架。
3. 候选缺账本时，反馈器只能落到旧的 `none` 分支，发出“按原始任务输入重建正文”指令；即使上游已有 `[上一章事实]`、场景骨架和 `FACT_LOCK`，也不会被利用。
4. 042804 trace 实证该断链：请求输入已含上游事实，重试反馈仍为降级文案。

## 3. Changes

- `src/services/schemaRetryFeedback.ts`：
  - `SchemaRetryFeedbackInput` 新增 `chainUpstreamContext?: string`。
  - `SchemaRetryFeedbackResult` 新增 `scaffoldSource: 'candidate' | 'upstream' | 'none'`。
  - 新增 `buildUpstreamWordGapScaffold`，只提取 `[上一章事实]`、`【场景N】`、`POV`、`FACT_LOCK` 事实行，并做 800 字符有界截断。
  - word-gap 骨架优先级改为 `candidate -> upstream -> none`。
  - upstream 分支新增文案：`基于 FACT_LOCK 与上游事实链重建【正文交接】账本，只补足缺口，不要整段正文重写`。
- `src/services/realSkillExecutor.ts`：
  - 两处 `buildSchemaRetryFeedback` 调用均传入 `chainUpstreamContext`。
- `src/components/pipeline/PipelinePanel.vue`：
  - `schema-retry-feedback-composed` trace 事件与 `bodyFeedbackAudit.schema` 增加 `strategy`、`scaffoldSource`、`scaffoldChars`、`scaffoldFieldCount`，便于后续 trace 判定反馈是否真的走上游骨架。
- `src/services/schemaRetryFeedback.spec.ts`：
  - 新增 upstream 分支用例：候选缺交接但上游含事实链时，反馈包含上游事实、重建指令，且不出现旧降级文案。
  - 新增 none 分支用例：候选与上游都不可用时，才允许保留“无法提供结构骨架”。
- `src/services/realSkillExecutor.spec.ts`：
  - 在真实调用链用例中补 `chainUpstreamContext`，断言第二次物理请求系统提示包含上游 `FACT_LOCK` 与重建文案。
- `src/services/realS2ProtectedContract.integration.spec.ts`：
  - 夹具补外部 S2 新增必填字段 `事件增量`，为测试适配，不是产品逻辑改动。
- `_audit/FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md`：
  - word-gap 语义改为三级骨架优先级，并声明上游骨架只传事实行，不回传上游正文全文。

## 4. Command Output

```text
npx vitest run src/services/schemaRetryFeedback.spec.ts src/services/realSkillExecutor.spec.ts src/services/realS2ProtectedContract.integration.spec.ts
Test Files  3 passed (3)
Tests       71 passed (71)
Duration    8.36s
```

```text
npm run type-check
> vue-tsc --noEmit
exit 0
```

```text
git diff --check
exit 0
```

## 5. File/Line Before-After

| 文件 | Before | After |
|---|---|---|
| `src/services/schemaRetryFeedback.ts:8` | 输入无上游上下文 | `chainUpstreamContext?: string` |
| `src/services/schemaRetryFeedback.ts:86` | 无上游骨架提取器 | `buildUpstreamWordGapScaffold`，事实行 + 800 字符上限 |
| `src/services/schemaRetryFeedback.ts:193-226` | 候选缺账本即降级 `none` | `candidate -> upstream -> none`，upstream 带重建账本指令 |
| `src/services/realSkillExecutor.ts:1242-1246` | 反馈合成缺上游输入 | 传入 `chainUpstreamContext` |
| `src/services/realSkillExecutor.ts:1324-1329` | 同上 | 同上 |
| `src/components/pipeline/PipelinePanel.vue:2638-2640` | trace 无骨架来源 | `scaffoldSource/scaffoldChars/scaffoldFieldCount` |
| `src/components/pipeline/PipelinePanel.vue:2959-2977` | trace 无法判定降级原因 | 输出骨架来源与容量 |
| `src/services/schemaRetryFeedback.spec.ts:105-143` | 无 upstream/none 独立断言 | 两个分支均有红绿锚点 |
| `src/services/realSkillExecutor.spec.ts:1102` | 集成链路未传上游 | 传入上游并断言重试请求内容 |
| `_audit/FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md:91-115` | 仅候选骨架语义 | 三级优先级与不回传正文约束 |

## 6. Boundary Cases

- 候选自带【正文交接】：继续使用候选骨架，标记 `candidate`，不引入上游重复信息。
- 候选缺账本、上游可用：提取事实行重建骨架，标记 `upstream`，明确“只补缺口，不整段重写”。
- 候选与上游都缺：保留旧 `none` 降级语义，明确“无法提供结构骨架”，不伪造骨架。
- 上游上下文含【正文交接】块：该块被显式跳过，避免上游交接正文混入骨架。
- 上游事实超过 800 字符：截断并声明“上游事实链超长，已截断”。
- 非 word-gap（bounded-summary）策略：`scaffoldSource` 固定 `none`，行为不变。
- 不回传候选全文与上游正文全文，避免反馈滚动放大与复述先验。

## 7. Verification

- 单测与集成：3 files / 71 tests passed。
- 类型检查：`vue-tsc --noEmit` exit 0。
- Diff 检查：`git diff --check` exit 0。
- Trace 对账：042804 输入已含上游事实链，旧实现反馈仍为降级文案；新实现由 `schemaRetryFeedback.spec.ts:105-143` 与 `realSkillExecutor.spec.ts:1102` 覆盖。
- 边界：本轮未发起 live 供应商请求；升版、封装与 git 提交不在本台账内。
