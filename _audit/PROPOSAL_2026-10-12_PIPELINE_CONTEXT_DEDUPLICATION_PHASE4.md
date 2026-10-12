# 2026-10-12 流水线效率优化第 4 步方案：重复上下文与无效串行等待

## 目标

基于 `run-1791784391203-1` 的真实 live trace，定位重复上下文注入与无效串行等待，并给出不改变产物契约、不越权接管 SKILL 职责的修复方案。本方案先供用户审核，确认后才动代码。

## 结论

1. **无效串行等待不是本 run 的主要耗时来源。** 12 个 API call 之间的空隙合计约 991ms，最大 248ms；请求构建 17ms、schema 校验 0ms、后处理 115ms。链路没有“本地空等模型”的问题。
2. **真实最大浪费是 Phase 2 的 600 秒总时长超时切断。** 卷 1 S3 第一次物理请求已输出 592,306ms、heartbeat 为 true，仍被超时切断；重试又等待 615,502ms 才拿到首 token。Phase 3 已把根因修为“活跃流不触发总超时”，但尚未用 live run 复证。
3. **卷史事实清单存在应用层双注入。** `PipelinePanel.vue:3673` 把 `volumeHistoryContext` 拼进 `basePrompt`，`volumeBatchOrchestrator.ts:61/74/91` 又在三种分支里第二次拼接。请求中 `[已生成卷事实清单]` 出现 2 次，`029` 甚至出现 3 次。
4. **S4 上下文膨胀主因是 S3 全文传递，且这是 SKILL 显式契约。** `l3-s3/l3-s2/l3-s4` 的 `meta.json` 都声明 `chainHandoff.previousOutput: "full"`，trace 中 `declaredMode: "full"`，不是应用静默回退。S3 输出 12,119-32,598 字符后，S4 的 previous 段膨胀到 12,142-32,621 字符。
5. **style reference 是每个 S4 请求的固定重复成本。** S4 的样本注入约 3,823 字符，每个卷的 S4 各注入一次。S1/S2/S3 为 171-195 字符，S4 是 SKILL `sampleCount: 2` 与样本内容共同导致，属于可优化但非缺陷的 SKILL 配置。

## 证据

| 项 | 证据 |
|---|---|
| API 间空隙 9-248ms，合计 991ms | `run-trace.json` 12 个 apiCalls 的 `startedAt/endedAt` |
| 本地处理 17+0+115ms | `run-trace.json` `timingLedger` |
| 超时重跑浪费约 1,447,227ms 物理 + 615,502ms 首等待 | Phase 2 `api-1791784865025-186` 两次 physicalCalls |
| 卷史双注入 | `PipelinePanel.vue:3673-3679`、`volumeBatchOrchestrator.ts:58-96`、请求 `HistoryCount=2/3` |
| S4 previous 12K-32K 字符 | 请求 `019/039/059` 解剖；`chain-handoff-delivery` `fullTextLength=13892/32598/12119` |
| full 是显式声明 | `D:/codex/玄武规划SKILL/L3-卷纲层/l3-s2/s3/s4/meta.json`；trace `declaredMode: "full"` |

## 修复方案

### A. 应用层修复：确定性去重

1. `PipelinePanel.vue` 生成 `basePrompt` 时不再追加 `volumeHistoryContext`，只保留编排器作为历史事实清单的唯一注入源。
2. `volumeBatchOrchestrator.ts` 的 prompt builder 增加防御性去重：如果 `basePrompt` 已包含 `[已生成卷事实清单]`，历史块只注入一次，并以 trace 记录 `duplicate-history-context-suppressed`。这个防御只做兜底，不改变正常路径。
3. 单测覆盖三分支：batch、single-volume、repair，都断言历史块只出现一次；另加一个“上游已带历史块”的兼容测试。

### B. 应用层修复：重复指令检测进账本

在 timing ledger 或 prompt audit 中增加 `repeatedPromptBlocks` 统计：`[已生成卷事实清单]`、`[大纲]`、`[style reference]`、`[上一步 SKILL 完整输出]`。禁止只统计 token，要让重复块在 trace 里可直接定位。验收以本次 12 个请求为 fixture：修复后历史块每个请求最多 1 次。

### C. 契约硬化：full 声明必须有理由

1. `chainHandoff.previousOutput: "full"` 继续有效，但 meta 需要新增 `reason` 字段说明为什么必须全文，trace 将其透出。
2. 无 `reason` 时仍执行 full（兼容第三方 SKILL），但 trace 记 warning，不阻断。
3. 不把“应用猜测哪些内容重要”作为方案。语义判断归 SKILL，应用只执行声明契约并留下观测。

### D. SKILL 层建议（不越权修改）

1. `l3-s2/l3-s3/l3-s4` 建议把 `previousOutput: "full"` 改为 `structured` 并声明 `requires`，S3 的卷纲定稿字段可确定性提取。
2. S4 的 `sampleCount: 2` 建议降为 1 或改 smartSamples；style reference 从 3,823 字符降到约 1.9K，且不牺牲契约。
3. 这两项由 SKILL 层自行验证输出质量；应用层只提供 trace 对账，不替 SKILL 决定语义。

## 四层成熟度

| 层 | 状态 | 说明 |
|---|---|---|
| 执行器 | 成熟 | 去重逻辑是纯函数 + 编排器单点，无模型语义判断 |
| 应用方案 | 成熟 | 应用只修确定性重复与观测，不接管 SKILL 职责 |
| 实现接线 | 待执行 | 本阶段未改代码，等待用户确认 |
| 验证标准 | 成熟 | 单测 fixture + trace 对账 + Phase 3 修复后的 live 复证 |

## 验证方案

1. 单测：`volumeBatchOrchestrator.spec.ts` 覆盖 batch/single/repair/上游重复四类；timing ledger 重复块统计测试。
2. 回放：以本次 12 请求作为 fixture，断言历史块次数、S4 previous 长度、`declaredMode` 不变。
3. live 复证：跑同一 `verify-pipeline-timing-ledger-electron.mjs`，验收四项：无 600 秒活跃流切断；历史块最多 1 次；local overhead 非负；输出仍为 3 卷 success。

## 不做的事

1. 不由应用猜测截断 SKILL 全文；quality-first 的 `full` 契约继续保留。
2. 不引入受控并发；这是第 5 步，且当前 run 已证明本地串行等待不是瓶颈。
3. 不把第 4 步和模型路由/增量校验混在一个改动里。
