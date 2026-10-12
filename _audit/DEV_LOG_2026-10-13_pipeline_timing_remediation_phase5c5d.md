# DEV LOG 2026-10-13：生成流水线耗时归因与超时修复（Phase 5C / 5D）

## 目标

基于 Phase 5B 的真实 Electron、真实 API、真实 UI 选择 SKILL 六层采样，完成 Step 0 到记忆抽取的耗时归因，修复卷纲层异常耗时来源，并补齐可回归验证。

## Phase 5C 耗时归因

### 层级结论

| 层 | 总耗时 | 物理请求 | 重试 | 结论 |
|---|---:|---:|---:|---|
| Step 0 大纲风格分析 | 14.10s | 1 | 0 | 正常 |
| Step 1 设定层 | 1.60m | 1 | 0 | 正常 |
| Step 2 卷纲层 | 54.58m | 14 | 2 | 异常放大 |
| Step 3 章节层 | 12.02m | 3 | 1 | 主要为契约重试，另行评估 |
| Step 4 正文层 | 11.71m | 5 | 2 | schema 重试放大，另行评估 |
| 记忆抽取 | 26.16s | 1 | 0 | 正常 |

本地 `promptBuild`、`validation`、`persistence` 均为毫秒级，Step 2 的 `promptBuildMs=20`、`validationSumMs=1`、`persistenceSumMs=89`。慢的根因不在本地编排，而在物理请求层。

### 卷纲层两个放大器

#### 1. 活跃流被 600 秒总超时切断

卷纲层 API call seq 4 与 seq 11 的原始物理请求均在 4.45s / 7.78s 开始流式输出，但分别在 600.012s / 600.023s 被切断，错误为“请求超时”，且 `heartbeat=true`，说明流不是死流，而是仍活跃。

随后 retry 从零重新生成：

- seq 4：retry 成功耗时 271.488s
- seq 11：retry 成功耗时 45.091s

这两个请求合计造成约 16 分钟的失败请求耗时，另加 retry 的 5 分钟左右。卷纲层 54.58 分钟中至少 20 分钟来自这两个超时重跑。

根因在 `aiService.ts` 的 `mainNetStream()`：

- 旧实现：`timeoutMs && Date.now() - startedAt > timeoutMs`，无论是否已有流式输出，超过总时长就抛 `AbortError`
- 但同文件 `markStreamOutput()` 的注释明确设计是“wall-clock timeout 只保护到输出开始，之后由 idle/progress watchdog 负责停滞检测”
- 代码与设计不一致，导致活跃流被错误切断

#### 2. retry 首 token 计时口径错误

seq 4 retry 的 `firstTokenMs=604938`，seq 11 retry 的 `firstTokenMs=602549`，精确贴近 600 秒，这是明显的计时污染，不是模型真实响应速度。

根因在 `callAiWithoutTools()` 的 `reportPhysical()`：

- `firstTokenMs = physicalFirstTokenAt - startTime`
- `startTime` 是逻辑请求开始时间，不是当前物理尝试开始时间
- 因此 retry 的首 token 把上一次失败尝试的 600 秒也算了进去

修正后，retry 首 token 从当前物理请求自身起点计算，不再继承失败尝试的 600 秒。

### 正文层与章节层

- 正文层：schema retry 2 次，原因是“正文仅 893 字，低于 1500 字结构下限，疑似坍缩”，每次重试携带更长的上下文重跑完整生成。属内容契约重试策略问题，本期不改变阈值和策略，只保证计时与超时不再放大。
- 章节层：1 次契约重试，同属后续契约策略优化项。

### 供应商吞吐结论

非超时路径的首 token 在 1.45s 到 8.11s 之间，单次请求多数在 1 到 4.5 分钟内完成。供应商侧吞吐正常，慢的根因是应用层重试放大与超时重跑，不是模型本身慢。

## Phase 5D 修复

### 1. 活跃流不再被总超时切断

`src/services/aiService.ts` `mainNetStream()` 修改：

```ts
// 修改前
if (timeoutMs && Date.now() - startedAt > timeoutMs) {
  throw new DOMException('The operation was aborted', 'AbortError')
}

// 修改后
if (timeoutMs && !sawStreamOutput && Date.now() - startedAt > timeoutMs) {
  throw new DOMException('The operation was aborted', 'AbortError')
}
```

这条修复将 `slowStreamTolerant` 路径已有的正确语义推广到普通流式路径，不再需要每层单独开启 `slowStreamTolerant` 才能避免活跃流被总超时误杀。语义统一后，旧 timeout 分支只负责“完全无输出”的失败，不再覆盖“有输出但慢”的场景。

### 2. retry 首 token 改为物理尝试口径

`src/services/aiService.ts` `reportPhysical()` 修改：

```ts
// 修改前
firstTokenMs: physicalFirstTokenAt === null ? undefined : physicalFirstTokenAt - startTime,

// 修改后
firstTokenMs: physicalFirstTokenAt === null
  ? undefined
  : physicalFirstTokenAt - (physicalStartedAt ?? startTime),
```

每次物理请求在开始时重置 `physicalStartedAt`，retry 的 `firstTokenMs` 从该值起算，不再继承前次失败尝试的耗时。

### 3. 卷纲层移除 600 秒硬编码

`src/components/pipeline/PipelinePanel.vue`：

```ts
// 修改前
runStepSkills(2, requestPrompt, 600000, "你是卷纲生成专家。基于大纲和设定生成卷纲。")

// 修改后
runStepSkills(2, requestPrompt, undefined, "你是卷纲生成专家。基于大纲和设定生成卷纲。")
```

卷纲层不再比其他层更严格。`undefined` 会进入统一策略：优先供应商 `provider.timeoutMs`，其次 `DEFAULT_STREAM_TIMEOUT`。结合修复 1，即使最终仍取 600 秒，也只影响无输出流；活跃流由 idle/progress watchdog 保护。

## 验证

### 新增回归测试

`src/services/aiService.spec.ts`：

1. `keeps a normal streaming response alive after output starts past the wall-clock timeout`
   - 流在 500ms 输出首 token，总超时设为 1000ms，最终 1300ms 完成
   - 断言结果完整且 `streamMock` 只调用 1 次，证明没有重启
2. `measures retry first-token latency from the retry physical start`
   - 第一次物理请求失败，retry 成功
   - 断言 retry `firstTokenMs < 2000ms`，证明没有继承失败尝试的耗时

### 实际执行结果

- `npx vitest run src/services/aiService.spec.ts`：1 个测试文件、168 条测试全部通过
- 新增回归用例单跑均通过

## Phase 5E 真实 Electron + 真实 API 复测

### 运行与结论

- 时间：2026-10-12 21:09 前后完成，模型 `deepseek-v4-pro`，供应商 `https://openapi.cloud-ai.cn/v1`，真实 Electron UI 加载 SKILL 执行。
- 结果：Step 0、设定层、卷纲层、章节层、正文层、记忆抽取六层全部 `success`，`summary.json` 可复核。
- 验证脚本：`scripts/verify-pipeline-artifact-contracts-electron.mjs`。
- 证据目录：`_audit/verification-pipeline-artifact-contract-live/`，其中 `summary.json` 为结论层，`timing-analysis.json` / `timing-analysis.md` 为耗时账本，`live-export/` 为全层 trace 与 payload。

### 卷纲层 before / after

| 指标 | Phase 5B before | Phase 5E after | 结论 |
|---|---:|---:|---|
| 总耗时 | 54.58m | 36.66m | 下降约 17.92m |
| 物理请求 | 14 | 12 | 减少 2 次 |
| 超时 retry | 2 | 0 | 活跃流不再被 600 秒总超时切断 |
| `firstTokenSumMs` | 1,248,341ms（约 20.81m，含 retry 口径污染） | 26,968ms（约 26.97s） | 首 token 计时口径修复后归位 |
| `outputSumMs` | 约 36m | 2,170,855ms（约 36.18m） | 生成吞吐量级不变，慢的根因确认为误杀与重跑 |

after 轮 12 个物理请求全部 success，无 retry；首 token 为 1.877s 到 2.713s，最长一次持续流式 369.5s。这证明修复前后的差别来自应用层超时与计时语义，而不是供应商突然变快。

### 其他层结果

| 层 | 总耗时 | 物理请求 | 结果 |
|---|---:|---:|---|
| Step 0 大纲风格分析 | 22.48s | 1 | success |
| Step 1 设定层 | 2.09m | 1 | success |
| Step 3 章节层 | 2.59m | 1 | success |
| Step 4 正文层 | 10.94m | 5 | success，含 2 次 schema retry |
| 记忆抽取 | 15.75s | 1 | success |

### 诚实边界与观察项

- 交接过程中的大写 `PASSED` stdout 标记没有落在 `summary.json`、`electron-run.log` 或 `heartbeat.jsonl` 任何证据文件里；本日志只登记“六层 success + trace 可复核”，不伪造 stdout 证据。
- Electron 退出码 1 是验证器脚本收尾形态，不作为失败判据；功能判据以 `summary.json` 和 trace 为准。
- `_data/pipeline-artifact-contract-live-profile` 已确认清理干净，未纳入 Git。
- 卷纲层 trace 有 9 条 `chain-handoff-delivery` 事件为 `declaredMode: "full"` 且 `fullReason` 为空，触发 `fullReasonMissing` warning；正文层无此问题。它不影响本轮六层 success，登记为观察项，不并入超时修复。

### 证据清理

- 保留 `_audit/verification-pipeline-artifact-contract-live/`：after 全量证据。
- 保留 `_audit/verification-pipeline-timing-ledger-live/`：Phase 5A 成功基线，被现役 DEV_LOG 引用。
- 保留 `_audit/verification-pipeline-artifact-contract-live-archive/2026-10-12T20-05-51-471Z/`：before 侧 600 秒事故唯一完整快照，含 `604938` / `602549` / `600.012` / `600.023` 标记。
- 删除 `artifact-contract-live-archive` 其余 30 个目录。执行前逐目录确认解析路径均位于 `_audit/verification-pipeline-artifact-contract-live-archive` 内；其中 4 个含同类事故标记但缺少完整 summary，且均为同一 `startedAt=1791823097002` 的较早快照，不作为唯一证据保留。
- 清理执行结果：分批使用显式路径 `Remove-Item -LiteralPath ... -Recurse`，删后复核归档目录仅剩 `2026-10-12T20-05-51-471Z`。

## 后续

- 正文层 schema retry 与卷纲层 `fullReasonMissing` 观察项另行立项，不与超时语义混在一起
- 真实 Electron + 真实 API before/after 数据已由 Phase 5E 补齐；后续性能优化继续遵守 G1.19，先采账再决策
