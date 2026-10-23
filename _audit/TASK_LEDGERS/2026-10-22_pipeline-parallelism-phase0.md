# 2026-10-22 流水线依赖并行 V3.3 Phase 0 执行台账

## 1. 目标与原话

**用户原话**：

> 以经验文件总结为底，诚实的按照方案每一步执行，现在确认批准 V3.3，开始执行

**目标**：按 `_audit/PROPOSAL_2026-10-21_PIPELINE_DEPENDENCY_PARALLELISM_V3.md` V3.3 唯一执行版，从 Phase 0 开始。Phase 0 的交付物是红测试与单 run 只读性能基线，先证明现有串行/串线/覆盖风险真实存在，禁止在本阶段直接修生产代码。

**最终可感知行为**：测试报告能明确列出“哪些并行硬伤已被红测试钉住、哪些已有绿灯守护、哪些属于后续 Phase 的实现面”。

## 2. 门禁读证

本轮已复读 `_audit/神意开发经验总结_v9.md` 相关条目：

- G0.1（第 20 行）、G0.3（第 36 行）、G0.4（第 44 行）、G0.6（第 60 行）、G0.9（第 84 行）、G0.10（第 92 行）、G0.12（第 112 行）。
- G1.4（第 156 行）、G1.5（第 166 行）、G1.8（第 208 行）、G1.9（第 226 行）、G1.11（第 244 行）、G1.17（第 298 行）、G1.19（第 335 行）、G1.20（第 351 行）。
- G2.8（第 423 行）、G2.9（第 431 行）、G2.11（第 463 行）。

## 3. 路由判定

**加入**：G0.1/G0.3/G0.4/G0.6/G0.9/G0.12/G1.4/G1.5/G1.8/G1.9/G1.11/G1.17/G1.19/G1.20/G2.8/G2.9/G2.11。

**排除**：

- G0.11：本轮只写单测红测试，不包含 Electron UI 用户交互验证；Phase J 再加入。
- G1.13：同上，本轮不是 Electron 验收阶段。
- G1.12：本轮不封装，不进入发布收尾。
- G2.13：本轮不改变 SKILL 权限语义，只暴露执行层状态风险。

## 4. 影响圈与作者反证

**打算改**：

- 新增 `_audit/TASK_LEDGERS/2026-10-22_pipeline-parallelism-phase0.md`
- 新增 Phase 0 红测试文件 `src/services/pipelineParallelismPhase0.spec.ts`
- 本 DEV_LOG 追加与总索引登记

**可能碰到**：

- `src/stores/pipeline.ts`（只读消费，不修改）
- `src/stores/runTrace.ts`（只读消费，不修改）
- `src/services/agentTraceBridge.ts`（只读消费，不修改）
- `src/stores/project.ts`（只读消费，不修改）
- `src/services/aiService.ts`（只读消费，不修改）

**最可能错的假设**：

假设“当前实现一定会在并行场景下串线”。证伪方式是红测试全部通过；若通过，则 V3.3 的现状风险判断需要重新审计，不允许继续按原方案开工。

**作者反证**：本台账先声明预期红灯。若测试意外全绿，登记为方案证据缺口并回报用户，禁止为了开工强行解释。

## 5. 停止条件

**完成条件（机器可判定）**：

1. Phase 0 红测试文件存在。
2. `npx vitest run src/services/pipelineParallelismPhase0.spec.ts` 输出每个测试的 pass/fail 与失败断言。
3. 台账第 6 节记录真实红绿结果，不使用推断值。
4. 已有守护测试结果同轮登记，区分“已有绿灯”与“Phase 0 新增红灯”。

**失败条件**：

1. 测试文件不存在。
2. 测试无法运行（import 失败、夹具崩溃）。
3. 全部测试意外通过但未重新审计 V3.3 风险清单。
4. 只登记通过的测试，隐瞒失败测试。

## 6. 执行证据

### 6.1 Phase 0 红测试（2026-10-22 实测）

第一轮补齐（2026-10-22）：

```text
npx vitest run src/services/pipelineParallelismPhase0.spec.ts --reporter=verbose
```

新增 3 项后结果：`14 tests: 7 failed / 7 passed`。其中：

1. `red: pipeline must expose run-scoped reentry lifecycle states` 失败于 `runs` 不存在，证明四格再入所需的生命周期承载面缺失；成功终态后再次进入无法区分新旧 run。
2. `baseline: quota soft errors stop with one physical request` 通过，`fetch` 实际调用 1 次，错误为 `quota_exhausted/auth/402`；该测试把已有三形态服务级守护拉入本 Phase 0 文件，run 级 trace 归属仍留 Phase G。
3. `baseline: queued project saves read the latest state in this interleaving` 通过。作者反证：原拟红测未复现旧快照覆盖，说明该交错形态下队列会读取最新 state；不伪造成红灯，保留为守护，完整临界区契约仍留 Phase E。

最终命令：

```text
npx vitest run src/services/pipelineParallelismPhase0.spec.ts --reporter=verbose
```

结果：`14 tests: 7 failed / 7 passed`，duration `1.58s`。红灯即现状缺陷证据，绿灯为已有守护；本阶段禁止把红灯改成绿灯来“通过”。

**红灯（证明 V3.3 现状缺陷真实存在）**：

1. `red: second generation must not abort the first run`：第二次 `startGeneration()` 后第一个 run 的 signal 被置为 `aborted`。断言失败在 [pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:47)，现状锚点为 [pipeline.ts](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:21)。
2. `red: progress must stay isolated per run`：第二个 run 写入 80 后全局 `generationProgress` 被覆盖，第一层进度丢失。断言失败在 [pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:58)，现状锚点为 [pipeline.ts](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:7)。
3. `red: terminal events must not be swallowed after cancel`：取消后再 `failGeneration('保存失败')`，状态仍停在 `canceled`，失败终态被吞。断言失败在 [pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:70)，现状锚点为 [pipeline.ts](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:42)。
4. `red: runTrace startRun must not auto-abandon an active task run`：第二个 pipeline run 启动后第一个 run 状态变为 `failed`。断言失败在 [pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:94)，现状锚点为 [runTrace.ts](/d:/codex/novel-workshop-vue3/src/stores/runTrace.ts:1134)。
5. `red: agent bridge fallback must not steal another run trace`：无显式 runId 的旧桥接形态把卷纲事件写入更新的章节 run。断言失败在 [pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:150)，现状锚点为 [agentTraceBridge.ts](/d:/codex/novel-workshop-vue3/src/services/agentTraceBridge.ts:28)。
6. `red: concurrent step config updates must not lose writes`：并发更新 step 3/4 后 `chapter-agent` 丢失，读取值为空。断言失败在 [pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:168)，现状锚点为 [pipeline.ts](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:120)。
7. `red: pipeline must expose run-scoped reentry lifecycle states`：`pipeline.runs` 不存在，成功终态后再次进入无法产生新 run，也不能保留旧 run 的 `succeeded` 终态。断言失败在 [pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:282)，现状锚点为 [pipeline.ts](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:7)。

**绿灯（已有能力或守护）**：

1. `red: concurrent volume/chapter writes must not lose either target`：当前微任务合并队列在“卷/章交错写 + project_p1 异步持久化窗口”这一形态下两者都落盘，226ms。不能据此证明写队列临界区安全，Phase C/E 仍需“队列临界区内读最新 state”的形态。
2. `baseline: independent tool budgets are not serialized by creation order`：`createToolRunBudget` 对象级隔离成立；但 AiService 单例 `activeToolRunBudget` 的服务级并发归属仍由 Phase A 红测试钉住。
3. `baseline: chat sessions do not abandon each other`：chat sessionKind 已不受 `abandonRunningRun` 影响。
4. `baseline: quota terminal errors are already classified without retry`：证据来源为既有 `aiService.spec.ts` 的三形态额度软错误测试；Phase 0 不重复重型 mock，Phase G 再移入 run 级测试。
5. `red: progress channel must reject events without runId`：当前不存在 `updateRunProgress` API，run trace 无 progress 事件，缺失能力被证明而非伪装通过。
6. `baseline: queued project saves read the latest state in this interleaving`：第一保存进行中追加 chapters，第二保存后 `volumes=[vol-1]` 且 `chapters.vol-1=[ch-1]` 均落盘。这是本轮作者反证出的意外绿灯；只守护该交错形态，不证明全部临界区语义。
7. `baseline: quota soft errors stop with one physical request`：HTTP 200 额度软错误被分类为 `auth/402/quota_exhausted`，`fetch` 实际调用 1 次；同文件已有测试继续覆盖纯文本、SSE、正文自然出现额度词三形态。

### 6.2 全量回归（2026-10-22 实测）

命令：

```text
npx vitest run --reporter=default
```

补齐前结果：`189 test files: 188 passed / 1 failed；2139 tests: 2133 passed / 6 failed`，duration `47.51s`。

补齐后复跑结果（2026-10-22 实测）：

```text
npx vitest run --reporter=default
```

结果：`189 test files: 1 failed / 188 passed；2142 tests: 7 failed / 2135 passed`，duration `46.26s`。

对账结论：

1. 唯一失败的测试文件是 [pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:1)，7 个失败全部为本阶段目标红灯，且与 6.1 的 7 条现状缺陷一一对应。
2. 既有 `2133` 个测试无新增回归；本轮新增 3 项后总量从 `2139` 增至 `2142`，其中新增 `quota` 软错误与保存队列两条绿灯通过，未破坏既有守护。
3. 本结果仅证明“新增红测试 + 既有回归”无生产代码破坏；不能证明 Phase A-J 任一目标语义已实现。7 个红灯在 Phase A/B/D 实现前必须保持红。

### 6.3 单 run 只读性能基线（2026-10-22 抽取）

数据源：用户提供的当前 HEAD 实测章节层 trace `C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-章节层-20261021-143230-deep/run-trace.json`（deep 与 standard 导出的账本一致）。只读解析，未发起网络请求，未修改生产代码。

```text
runId: run-1792564350585-1743
step: 3 章节层
model: deepseek-v4-pro
status: success
durationMs: 1,793,484
apiCalls: 4
physicalCalls: 4
retryPhysicalCallCount: 0
physicalDurationSumMs: 1,792,214
firstTokenSumMs: 40,908
outputSumMs: 1,751,306
localOverheadSumMs: 189
requestBuildSumMs: 5
schemaValidateSumMs: 0
retrySumMs: 0
postProcessSumMs: 27
```

分步物理耗时：

| Step | durationMs | firstTokenMs | outputMs | inputTokens | outputTokens |
|---|---:|---:|---:|---:|---:|
| S1 章节解析 | 173,443 | 14,671 | 158,772 | 115,384 | 10,297 |
| S2 章节推演 | 1,202,932 | 6,156 | 1,196,776 | 未记录 | 未记录 |
| S3 章节填充 | 246,876 | 10,653 | 236,223 | 64,175 | 12,950 |
| S4 章节校验 | 168,963 | 9,428 | 159,535 | 68,633 | 10,227 |

基线结论（仅描述该 run）：

1. 当前单 run 的本地候选开销极小（`localOverheadSumMs=189`），耗时主体是模型流式输出 `outputSumMs=1,751,306`，不是应用本地等待。按 G1.19，本数据不支持“先做本地性能优化”的决策。
2. S2 的 usage 未记录（inputTokens/outputTokens 为 0）且耗时占 67.1%，属于观测缺口；Phase B 修 trace schema 时必须补齐 usage 归因，禁止用该字段做容量结论。
3. 服务层 250ms/500ms 初始预算未被该 run 证伪；但点击反馈 100ms、主任务 200ms、freeze 2s 属于 Electron UI 维度，本轮未采样，仍为工程假设。

## 7. 缺口清单

1. **保存合并窗口红灯未复现**：6.1 的两条保存绿灯只证明当前微任务合并队列在已试交错形态下安全，不证明队列临界区“读最新 state 后修改落盘”在所有并发窗口安全。该 P0 形态保留给 Phase 0-A/C/E 的真实队列临界区测试，不能宣布风险不存在。
2. **四格再入矩阵未进入本轮测试**：`{执行模式} × {新鲜启动/断点恢复/成功终态后再次进入/失败终态后再次进入}` 属于 Phase 0-A 交付面，本轮只登记未执行。
3. **`quota_exhausted` 证据为指针而非本轮重复测试**：三形态软错误已有 `aiService.spec.ts` 守护，但 run 级“无第二次物理请求 + trace 挂载”仍待 Phase G。
4. **`activeToolRunBudget` 服务级并发红灯未执行**：对象级预算隔离已绿灯，AiService 单例归属串账测试属于 Phase A。
5. **Electron UI 性能基线未采样**：真实窗口点击反馈、long task、freeze watchdog、并行 3 run 压力测试均未执行；Phase H/J 前不得宣称性能预算达标。
6. **S2 usage 观测缺口**：当前 trace 中 S2 输入/输出 token 为 0，无法做成本与容量归因；Phase B trace schema 升级时必须闭环。
7. **红灯保持策略**：7 个红灯在 Phase A/B/D 实现前必须保持红；任何提前改断言、删测试或只修表面让测试变绿的行为均违反 G0.3/G1.5。
8. **quota run 级归属未测**：服务级“单次物理请求 + 终态错误”已绿灯，但 `quota_exhausted` 挂到具体 run trace、其他 run 不受污染仍属 Phase G。

## 8. Phase A-C 执行账（2026-10-22）

### 8.1 Phase A

交付：`PipelineRunRegistry` run 级生命周期、每请求工具预算由 run 显式持有。目标测试由红转绿；本轮全量回归未发现 Phase A 新增失败。

### 8.2 Phase B

交付：非 chat 场景 auto-abandon 删除；trace bridge 仅接受显式 `runId`，无 fallback 抢账路径。目标测试由红转绿。

### 8.3 Phase C

新增门禁测试：[pipelineConfigMigration.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineConfigMigration.spec.ts:1)，先红后绿：

1. `PipelinePanel.vue` 内 `pipeline_step_config` 直写命中数为 0；四个历史 RMW 入口全部改走 `pipelineStore.writeStepConfig`。
2. 四个 `startGeneration` 调用全部显式传入 `configSnapshot`，层级/目标分别为 settings/volumes/chapters/body。
3. 正文链断点 owner key 升级为 `pipeline:{projectId}:step-4:chapter-{chapterId}`；步骤 2/3 仍保持 `pipeline:{projectId}:step-{step}`。

实现位置：

- [PipelinePanel.vue:1775](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1775)：`saveStepConfig` 事务化。
- [PipelinePanel.vue:1813](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1813)：绑定导入事务化。
- [PipelinePanel.vue:1832](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1832)：全书字数事务化。
- [PipelinePanel.vue:1847](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1847)：卷/章字数配置事务化。
- [PipelinePanel.vue:1944](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1944)：run 启动快照读取与失败 trace。
- [PipelinePanel.vue:1961](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1961)：断点 owner key 单源构造。
- [PipelinePanel.vue:3143](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:3143)：链式断点使用 owner key。
- [PipelinePanel.vue:4957](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:4957)：正文执行计划携带章节目标。
- [pipeline.ts:173](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:173)：事务内快照读取。
- [pipeline.ts:201](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:201)：整配置事务写入，per-step map 深合并。

执行中纠错记录：一次性替换曾把 settings/volumes/chapters 三个启动点参数错位；随后按函数上下文逐处修正，并以 `pipelineConfigMigration.spec.ts` + `rg` 输出复核最终顺序为 settings/volumes/chapters/body。该错误未进入任何完成声明。

### 8.4 Phase C 验证

```text
npx vitest run src/services/pipelineConfigMigration.spec.ts src/services/pipelineConfigTransaction.spec.ts src/services/ownerBreakpointClosureWiring.spec.ts src/services/pipelineParallelismPhase0.spec.ts
```

结果：4 个文件，32 个测试，29 过 / 3 红。3 红全部是 Phase D 预留门禁（run 级进度隔离、cancel 后终态事件、无 runId 进度拒绝）。

```text
npx vitest run
```

结果：192 个测试文件，191 过 / 1 红；2155 个测试，2152 过 / 3 红。唯一失败文件为 `pipelineParallelismPhase0.spec.ts`，3 红与 Phase D 清单一一对应，无其他新增回归。

### 8.5 Phase C 遗留

1. 旧正文共享断点清理目前放在 `genBody` 启动前；清理失败会阻断本次启动并抛错，符合“清理失败不得宣称完成”，但缺少专项测试。Phase D/E 断点生命周期测试需补该分支。
2. `genBody` 的 `isGenerating` 串行守卫仍在，按 V3.3 属 Phase F 移除；Phase C 不越权处理。
3. 配置快照已冻结到 run context，但执行链尚未消费 snapshot 的只读副本，仍读当前配置。该消费契约属 Phase D/F 的 run 上下文接线，不得宣称“执行中改配置完全隔离”。

## 9. Phase D 执行账（2026-10-22）

### 9.1 Phase D 交付

1. **RunProgressChannel + run registry 接线**：
   - [runProgressChannel.ts:40](/d:/codex/novel-workshop-vue3/src/services/runProgressChannel.ts:40)：同 run 进度事件 `250ms` 合并窗口。
   - [runProgressChannel.ts:49](/d:/codex/novel-workshop-vue3/src/services/runProgressChannel.ts:49)：无 `runId` 拒绝并回调 `onMigrationError`，原因 `missing_run_id`。
   - [runProgressChannel.ts:63](/d:/codex/novel-workshop-vue3/src/services/runProgressChannel.ts:63)：终态 run 的进度事件拒绝，原因 `terminal_run`。
   - [runRegistry.ts:115](/d:/codex/novel-workshop-vue3/src/services/runRegistry.ts:115)：事件最终通过 `applyProgressEvent` 写入唯一 run 槽，通道不维护第二份 run 列表（G1.20 单源）。
   - [runRegistry.ts:133](/d:/codex/novel-workshop-vue3/src/services/runRegistry.ts:133)：拒绝事件进入 `run.rejectedEvents`，取消后的 `fail` 不覆盖 canceled 终态。
2. **store 层**：
   - [pipeline.ts:22](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:22)：`latestRunIdByLayer`。
   - [pipeline.ts:48-51](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:48)：四个 per-layer active run computed。
   - [pipeline.ts:79](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:79)、[94](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:94)、[105](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:105)、[127](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:127)、[156](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:156)：进度/完成/失败/取消/信号获取统一走 `runId || activeRunId || latestRunIdByLayer[activeLayer]`。
   - [pipeline.ts:169](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:169)：`updateRunProgress` 无 `runId` 时先触发 `progress-migration-error` 观测，再对调用方抛错；不允许静默吞错。
   - [pipeline.ts:137-147](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:137)：迁移错误写 trace 事件 `progress-migration-error`，Trace 只观测、不作为进度源。
3. **四个生成器显式 runId 线程化**：
   - settings：[PipelinePanel.vue:4142](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:4142)
   - volumes：[PipelinePanel.vue:4279](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:4279)
   - chapters：[PipelinePanel.vue:4555](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:4555)
   - body：[PipelinePanel.vue:4788](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:4788)
   - 正文硬信号/最小编辑修复链路也显式传递 `bodyRunId`：[PipelinePanel.vue:5079](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:5079)、[5411](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:5411)、[5522](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:5522)、[5623](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:5623)。
4. **UI 迁移**：四个进度条从全局标量改为 per-layer run slot：
   - settings：[PipelinePanel.vue:217-223](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:217)
   - volumes：[PipelinePanel.vue:352-358](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:352)
   - chapters：[PipelinePanel.vue:502-508](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:502)
   - body：[PipelinePanel.vue:574-580](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:574)
   - 生产 UI 模板对 `generationProgress` 的读取为 0；`generationStatus` 仅作 status 文案兜底，其重构属 Phase F/I，不在本轮宣称完成。
5. **13 个 Electron 验证脚本迁移**：全部按层读取 `activeBodyRun/activeChaptersRun/activeVolumesRun/activeSettingsRun`，输出新增 `pipelineRunStatus`，`generationProgress` 只保留 null 兜底。脚本清单见 9.4。

### 9.2 裁定：共享链式进度的兜底归属

[PipelinePanel.vue:3462](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:3462) 的 `runStepSkills` 链式进度调用没有显式 `runId`。裁定为“按 `currentStep` 推导当前层，再取 `latestRunIdByLayer[activeLayer]`”，而不是全局最新 run 兜底：

- 并行期间全局最新 run 会随机落到最后启动的层，进度串线；
- `activeLayer` 依据当前正在执行的面板层，在共享链式调用处语义最接近真实归属；
- 该兜底只用于历史共享调用；四个生成器入口已显式 `runId`，不依赖兜底。

### 9.3 before/after

| 面 | before | after |
|---|---|---|
| 进度读数 | 全局 `generationProgress` 标量，四层互相覆盖 | per-layer active run 槽，四层独立显示 |
| 取消语义 | 全局 cancel 改写所有可见状态 | cancel 指定 run；canceled 终态不被后续 fail 覆盖，失败进 `rejectedEvents` |
| 无 runId 事件 | store 直接 throw，通道拒绝不可观测 | 先写 `progress-migration-error` trace，再 throw；调用方和观测面都能看到 |
| 进度写入频率 | 每个事件直接写 run 槽 | 同 run 250ms 合并，首个事件立即生效 |
| 验证脚本 | 读全局进度，无法判断 run 归属 | 读 per-layer run + `pipelineRunStatus`，可判定 run 生命周期 |

### 9.4 13 个 Electron 脚本迁移账

`node --check` 全部通过（本轮输出：`node --check passed for 13 verify scripts`）：

1. `scripts/verify-body-repair-ledger-electron.mjs`（[282-284](/d:/codex/novel-workshop-vue3/scripts/verify-body-repair-ledger-electron.mjs:282)）
2. `scripts/verify-body-contract-degraded-electron.mjs`（[477-479](/d:/codex/novel-workshop-vue3/scripts/verify-body-contract-degraded-electron.mjs:477)）
3. `scripts/verify-contract-semantics-electron.mjs`（[292-294](/d:/codex/novel-workshop-vue3/scripts/verify-contract-semantics-electron.mjs:292)）
4. `scripts/verify-chapter-batch-contract-electron.mjs`（[341-343](/d:/codex/novel-workshop-vue3/scripts/verify-chapter-batch-contract-electron.mjs:341)）
5. `scripts/verify-hard-signal-stop-net-electron.mjs`（[301-303](/d:/codex/novel-workshop-vue3/scripts/verify-hard-signal-stop-net-electron.mjs:301)）
6. `scripts/verify-outline-context-scope-electron.mjs`（[304-306](/d:/codex/novel-workshop-vue3/scripts/verify-outline-context-scope-electron.mjs:304)）
7. `scripts/verify-owner-breakpoint-closure-electron.mjs`（[378-380](/d:/codex/novel-workshop-vue3/scripts/verify-owner-breakpoint-closure-electron.mjs:378)）
8. `scripts/verify-owner-breakpoint-failure-injection-electron.mjs`（[381-383](/d:/codex/novel-workshop-vue3/scripts/verify-owner-breakpoint-failure-injection-electron.mjs:381)）
9. `scripts/verify-pipeline-repair-feedback-electron.mjs`（[426-428](/d:/codex/novel-workshop-vue3/scripts/verify-pipeline-repair-feedback-electron.mjs:426)）
10. `scripts/verify-pipeline-timing-ledger-electron.mjs`（[335-337](/d:/codex/novel-workshop-vue3/scripts/verify-pipeline-timing-ledger-electron.mjs:335)）
11. `scripts/verify-reasoning-only-stall-electron.mjs`（[286-288](/d:/codex/novel-workshop-vue3/scripts/verify-reasoning-only-stall-electron.mjs:286)）
12. `scripts/verify-settings-lock-projection-electron.mjs`（[732-734](/d:/codex/novel-workshop-vue3/scripts/verify-settings-lock-projection-electron.mjs:732)）
13. `scripts/verify-pipeline-artifact-contracts-electron.mjs`（[352-422](/d:/codex/novel-workshop-vue3/scripts/verify-pipeline-artifact-contracts-electron.mjs:352)）

live 复跑归 Phase J：本节只证明脚本已切到新读数，不宣称 Electron live 行为验收完成。

### 9.5 Phase D 验证（2026-10-22 实测）

定向测试：

```text
npx vitest run src/services/runProgressChannel.spec.ts src/services/runRegistry.spec.ts src/services/pipelineParallelismPhase0.spec.ts src/services/proseHardSignalWiring.spec.ts src/services/pipelineProgressReaders.spec.ts
```

结果：5 个测试文件，33 个测试全部通过。

类型检查：

```text
npx vue-tsc --noEmit
```

结果：退出码 0，无输出错误。首次运行曾报 `PipelinePanel.vue:4747/:4750` 的 `settingsRunId` 作用域错误（TS2304），已修正为 `chaptersRunId` 后复跑通过。

全量测试：

```text
npx vitest run
```

结果：

```text
Test Files  194 passed (194)
Tests  2162 passed (2162)
Duration  39.49s
```

构建门禁：

```text
npm run build:vue
```

结果：`vite build` 与 `vite build --config vite.protocols.config.mts` 均成功；仅保留既有 chunk 体积 warning，无编译错误。

### 9.6 Phase D 遗留

1. 13 个 Electron 脚本尚未在真实窗口 live 复跑，属 Phase J 交付面；不得宣称 Electron UI 实机验收完成。
2. `generationProgress` 仍在 store 内部保留，生产 UI 模板零读取；最终删除属 Phase I 收口（G0.10 过渡态）。
3. `generationStatus` 仍在四个进度条作文案兜底；status 文案重构属 Phase F/I。
4. `isGenerating` 串行守卫仍在，Phase F 移除后才能开放真正的四层同时运行。

## 10. Phase E：项目保存队列事务与产物提交语义（2026-10-22）

### 10.1 红灯复现

```text
npx vitest run src/stores/project.spec.ts --reporter=verbose
```

失败：`runs another save after an in-flight save finishes → expected 1 to be greater than or equal to 2`。

根因：

1. 旧 `saveProject` 在 pending 期间直接返回 in-flight tail；同步修改虽置 dirty，但快照发生在修改后，合并为一次写是合理行为。
2. 真实缺口是物理写挂起后的新修改：旧实现不会追加第二次落盘。

### 10.2 修复

- [project.ts](/d:/codex/novel-workshop-vue3/src/stores/project.ts:832)：`saveProject` 改为 request-sequence + drain loop。同步调用仍合并为一次写；`persistProject` 挂起期间的新调用使 `saveRequestSeq` 前移，追加一次读最新 state 的落盘；写失败即停止 drain 并保持队列可用。
- [project.spec.ts](/d:/codex/novel-workshop-vue3/src/stores/project.spec.ts:46)：测试先等待第一次物理写真正挂起，再修改 volumes，断言至少两次写且最后一次包含 `vol-2`。
- [PipelinePanel.vue](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:4683)：章节批次提交不再用“启动时快照整数组替换”，改用 `mergeChapterCommit` 按章节 ID 合并，保留并行 run 在 API 等待期间写入同卷的新章节。
- [chapterArtifactCommit.ts](/d:/codex/novel-workshop-vue3/src/services/chapterArtifactCommit.ts:1)：新增纯函数合并器；[chapterArtifactCommit.spec.ts](/d:/codex/novel-workshop-vue3/src/services/chapterArtifactCommit.spec.ts:1) 锁住并行 run 新章不丢失、无 id 章节不重复放大。

### 10.3 验证

```text
npx vitest run src/services/chapterArtifactCommit.spec.ts src/stores/project.spec.ts --reporter=verbose
```

结果：2 files / 15 tests 全绿（含红转绿的 in-flight 用例、旧 coalesce 用例、失败后队列可用用例）。

```text
npx vue-tsc --noEmit
```

结果：exit 0。过程中曾出现测试 executor TS2349（`releaseFirstWrite` 被窄化为 `never`），改为确定赋值断言后通过；这不是放宽门禁。

## 11. Phase F：目标级并行与全局串行守卫拆除（2026-10-22）

### 11.1 红灯

新增 `red: target locks permit cross-layer runs and queue same-target runs`。初始失败：

```text
expected 'running' to be 'queued'
```

### 11.2 修复

- [runRegistry.ts](/d:/codex/novel-workshop-vue3/src/services/runRegistry.ts:88)：`createRun` 支持 `queuedReason`；新增 `activateQueuedRuns(layer, target)`，同目标前置 run 终态后激活排队 run。
- [pipeline.ts](/d:/codex/novel-workshop-vue3/src/stores/pipeline.ts:62)：`startGeneration` 对同层同目标 running run 判 busy，新 run 入队并记录排队原因；`finish/fail/cancel` 后续激活或取消同目标队列；`isGenerating` 改为“存在 active run”派生语义，不再作为互斥开关。
- [PipelinePanel.vue](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:7)：顶部新增每个 active run 的独立取消按钮；四个生成按钮改用 `isTargetGenerating(layer, target)` 目标锁，不再被其他层运行禁用。

### 11.3 验证

```text
npx vitest run src/services/pipelineParallelismPhase0.spec.ts src/services/runRegistry.spec.ts --reporter=verbose
```

结果：2 files / 21 tests 全绿。

```text
npx vue-tsc --noEmit
npx vitest run
```

结果：类型检查 exit 0；全量 `195 files / 2167 tests` 全绿。

### 11.4 诚实边界

1. 同层编辑控件的只读/禁用仍部分读取全局 `isGenerating`，允许并行期间编辑其他层；同目标写冲突由目标锁与提交合并共同约束。Phase I 将移除残留全局语义。
2. 排队 run 激活后，实际生成函数尚未感知“从队列恢复”；当前语义是注册表级排队与防双开，不等于完整任务队列调度器。
3. Electron 真实窗口四层同时运行未验证，属 Phase J。

## 12. Phase G：Provider 调度、软错误终态与排队观测（2026-10-22）

### 12.1 交付

1. **Provider 并发槽位调度**：
   - [providerScheduler.ts:3](/d:/codex/novel-workshop-vue3/src/services/providerScheduler.ts:3)：`ProviderQueueEvent` 显式携带 `providerId/status/position/waiting/maxConcurrencyPerProvider`。
   - [providerScheduler.ts:85](/d:/codex/novel-workshop-vue3/src/services/providerScheduler.ts:85)：`acquire` 按供应商槽位排队；取消信号触发 `ProviderSchedulerCanceledError`，排队中取消不发起物理请求。
   - [aiService.ts:2294](/d:/codex/novel-workshop-vue3/src/services/aiService.ts:2294)：每次 `_rawCall` 前获取 provider 槽位，成功/失败统一释放 [aiService.ts:2323](/d:/codex/novel-workshop-vue3/src/services/aiService.ts:2323)。
2. **排队观测接线**：
   - 主页对话：[ChatPanel.vue:962](/d:/codex/novel-workshop-vue3/src/components/chat/ChatPanel.vue:962) 写 `provider-queue` trace；直出重试 [ChatPanel.vue:4378](/d:/codex/novel-workshop-vue3/src/components/chat/ChatPanel.vue:4378)、主调用 [ChatPanel.vue:4140](/d:/codex/novel-workshop-vue3/src/components/chat/ChatPanel.vue:4140)、续写 [ChatPanel.vue:4668](/d:/codex/novel-workshop-vue3/src/components/chat/ChatPanel.vue:4668) 均挂接。
   - 大纲工作台：[OutlineWorkspace.vue:1912](/d:/codex/novel-workshop-vue3/src/components/common/OutlineWorkspace.vue:1912) 写 `provider-queue` trace；主调用 [OutlineWorkspace.vue:5913](/d:/codex/novel-workshop-vue3/src/components/common/OutlineWorkspace.vue:5913)、风格分析 [OutlineWorkspace.vue:2714](/d:/codex/novel-workshop-vue3/src/components/common/OutlineWorkspace.vue:2714)、续写 [OutlineWorkspace.vue:6602](/d:/codex/novel-workshop-vue3/src/components/common/OutlineWorkspace.vue:6602) 均挂接。
   - 生成流水线：[PipelinePanel.vue:1086](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1086) 写 `provider-queue` trace；folder 调用 [PipelinePanel.vue:2415](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:2415)、风格分析 [PipelinePanel.vue:2823](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:2823)、Agent 调用 [PipelinePanel.vue:3106](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:3106) 均挂接。
   - Agent/终稿链路透传：[agentOrchestrator.ts:760](/d:/codex/novel-workshop-vue3/src/services/agentOrchestrator.ts:760)、[finalDraftRunner.ts:369](/d:/codex/novel-workshop-vue3/src/services/finalDraftRunner.ts:369)、[finalDraftService.ts:1364](/d:/codex/novel-workshop-vue3/src/services/finalDraftService.ts:1364)、[continuationService.ts:35](/d:/codex/novel-workshop-vue3/src/services/continuationService.ts:35)、[realSkillExecutor.ts:941](/d:/codex/novel-workshop-vue3/src/services/realSkillExecutor.ts:941)、[skillRouter.ts:179](/d:/codex/novel-workshop-vue3/src/services/skillRouter.ts:179)。
3. **软错误终态与 run 归属**：
   - [aiService.ts:1194](/d:/codex/novel-workshop-vue3/src/services/aiService.ts:1194)：供应商额度/软错误统一归一为 `quota_exhausted`，`auth/402`，`softError=true`。
   - [aiService.ts:4111](/d:/codex/novel-workshop-vue3/src/services/aiService.ts:4111)：softError 是终态，禁止物理重试；排队中取消不消耗物理请求安全网。
   - [runTrace.spec.ts:202](/d:/codex/novel-workshop-vue3/src/stores/runTrace.spec.ts:202)：新增 run 级归属测试，失败 run 记录 `quota_exhausted`，同源并发 run 保持 running，不被连带失败或污染。

### 12.2 修复过程中的实错登记

1. 接线阶段 `aiService.spec.ts` 的 deferred Promise 使用了 `Promise.withResolvers` 形态，与当前 `ES2022` 目标不兼容，随后被误改成 `resolve = () => {}` 的假 resolve；这会让排队用例永久挂起。已修复为标准 executor 赋值 deferred，并删除所有 `resolve(undefined)` 调用 [aiService.spec.ts:1635](/d:/codex/novel-workshop-vue3/src/services/aiService.spec.ts:1635)。该错误未进入完成声明。
2. `runTrace.spec.ts` 新增软错误断言时误把错误文案写入 `responseText`，导致 trace 事件 `api-failed.detail` 不含 `quota_exhausted`。已改为 `error` 字段后复跑通过 [runTrace.spec.ts:198](/d:/codex/novel-workshop-vue3/src/stores/runTrace.spec.ts:198)。
3. 复查接线时发现四个漏挂点：主页直出重试、大纲风格分析、流水线 folder 调用未接 `onProviderQueue`。已补齐并复跑 `vue-tsc` 通过。该漏项在完成声明前被发现并修复，不隐瞒。

### 12.3 验证

```text
npx vue-tsc --noEmit
```

结果：exit 0，无类型错误。

```text
npx vitest run src/services/aiService.spec.ts src/services/providerScheduler.spec.ts src/services/finalDraftRunner.spec.ts
```

结果：3 个测试文件，202 个测试全部通过。

```text
npx vitest run src/stores/runTrace.spec.ts src/services/pipelineParallelismPhase0.spec.ts
```

结果：2 个测试文件，114 个测试全部通过。

```text
npx vitest run
```

结果：196 个测试文件全部通过，2175 个测试全部通过，duration 60.91s。

### 12.4 验收门对账

| 12.9.8 验收门 | 状态 | 证据 |
|---|---|---|
| 同供应商并发上限生效，超出请求排队且可见 | 通过 | [aiService.spec.ts:1634](/d:/codex/novel-workshop-vue3/src/services/aiService.spec.ts:1634) 排队测试；`provider-queue` trace 三入口可见 |
| 并发预算隔离，A 耗尽不影响 B | 通过 | [pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:1) 预算隔离守护；[runTrace.spec.ts:192](/d:/codex/novel-workshop-vue3/src/stores/runTrace.spec.ts:192) 同源 run 隔离 |
| 三种 quota 形态只终结当前 run、无第二次物理请求、runId trace 归属 | 通过 | 三形态服务级测试 [aiService.spec.ts:1517](/d:/codex/novel-workshop-vue3/src/services/aiService.spec.ts:1517)、[1537](/d:/codex/novel-workshop-vue3/src/services/aiService.spec.ts:1537)、[1592](/d:/codex/novel-workshop-vue3/src/services/aiService.spec.ts:1592)，均断言 1 次物理请求；run 级归属 [runTrace.spec.ts:192](/d:/codex/novel-workshop-vue3/src/stores/runTrace.spec.ts:192) |
| 保存/写入失败副作用断言面 | Phase E 已交 | [project.ts:832](/d:/codex/novel-workshop-vue3/src/stores/project.ts:832) drain loop；[chapterArtifactCommit.ts:1](/d:/codex/novel-workshop-vue3/src/services/chapterArtifactCommit.ts:1) 并行提交合并；Phase J live 再验 |
| 断点清理与 attempt 产物对账 | Phase C 已交，live 属 Phase J | [PipelinePanel.vue:1961](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:1961)、[3143](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:3143) |

### 12.5 诚实边界

1. Provider 调度目前按供应商 ID 全局串行/并发控制，尚未按“供应商 × 层级”做差异化限额；不同层共享同一供应商槽位时仍会互相排队。这是设计内行为，Phase J 压测后再决定是否分层限额。
2. `provider-queue` 事件目前写 trace，不写运行中心的 `queuedReason`；流水线运行中心的排队文案由目标锁负责，供应商槽位排队在 trace 里可见。若 Phase J 判断用户不可感知，需要再接 UI 提示。
3. 真实 Electron 并行压测尚未执行，本节只证明服务层与 trace 接线正确，不宣称发布级性能达标。

## 13. Phase H：性能与稳定性观测（2026-10-22）

### 13.1 交付

1. **long task / freeze / 点击反馈观测**：新增 [performanceMonitor.ts](/d:/codex/novel-workshop-vue3/src/services/performanceMonitor.ts:1)。`start()` 注册 PerformanceObserver `longtask`；`tick()` 用 500ms watchdog 的超期时间近似主线程冻结；`clickFeedback()` 记录点击到反馈的耗时并按 100ms 预算标记慢反馈；事件环保留最新 200 条，避免观测本身造成无界内存。
2. **应用启动接线**：[App.vue:246](/d:/codex/novel-workshop-vue3/src/App.vue:246) 挂载时启动 observer 与 500ms watchdog，[App.vue:311](/d:/codex/novel-workshop-vue3/src/App.vue:311) 卸载时停止并清理 timer。
3. **崩溃/重启后的非终态 trace 不再静默丢失**：[runTrace.ts:2672](/d:/codex/novel-workshop-vue3/src/stores/runTrace.ts:2672) 读取持久化 run 后，若其状态仍是 `running/blocked`，转为新增终态 `interrupted`，补 `endedAt`，并写入 `run-startup-interrupted` warn 事件。`RunTraceStatus`、状态级别、状态文案、可恢复集合同步更新 [runTrace.ts:12](/d:/codex/novel-workshop-vue3/src/stores/runTrace.ts:12)、[653](/d:/codex/novel-workshop-vue3/src/stores/runTrace.ts:653)、[662](/d:/codex/novel-workshop-vue3/src/stores/runTrace.ts:662)、[2623](/d:/codex/novel-workshop-vue3/src/stores/runTrace.ts:2623)。
4. **3 run 合成压测（合并语义层）**：[runProgressChannel.spec.ts:103](/d:/codex/novel-workshop-vue3/src/services/runProgressChannel.spec.ts:103) 用 3 个 run 各发 300 个高频进度事件，断言落库写入不超过每 run 2 次、最终进度独立收敛到各自 run，窗口互不串线。

### 13.2 修复过程中的实错登记

1. 第一版恢复实现只移除了读取后的过滤，但列表层的 `item.status === 'running'` 前置过滤仍直接 `continue`，导致新逻辑没有机会执行；测试先失败暴露该短路，随后删除前置过滤后转绿。该错误未进入完成声明。
2. `performanceMonitor.spec.ts` 初版把 50ms 点击反馈误断言为慢反馈；修正测试数据为 120ms 后复跑通过，生产逻辑未改动。

### 13.3 验证

```text
npx vue-tsc --noEmit
```

结果：exit 0，无类型错误。

```text
npx vitest run src/services/performanceMonitor.spec.ts src/services/runProgressChannel.spec.ts src/stores/runTrace.spec.ts
```

结果：3 个测试文件，109 个测试全部通过。

### 13.4 验收门对账

| 12.9.7 验收门 | 状态 | 证据 |
|---|---|---|
| 3 run 合成流式压测无超过 200ms long task、无超过 2s freeze | 观测已接入，服务级合成压测通过；真实 Chromium 数字属 Phase J | [performanceMonitor.spec.ts:16](/d:/codex/novel-workshop-vue3/src/services/performanceMonitor.spec.ts:16)、[runProgressChannel.spec.ts:103](/d:/codex/novel-workshop-vue3/src/services/runProgressChannel.spec.ts:103) |
| 点击启动三个 run，均在 100ms 内出现 UI 反馈 | 计时器与预算判定已接入，真实 UI 点击采样属 Phase J | [performanceMonitor.spec.ts:49](/d:/codex/novel-workshop-vue3/src/services/performanceMonitor.spec.ts:49) |
| 多批次连续运行后内存不无界增长 | run 数量 `maxRuns=20` trim、流式文本增量存储、观测事件环 200 条、点击反馈事件不落 trace | [runTrace.ts:1126](/d:/codex/novel-workshop-vue3/src/stores/runTrace.ts:1126)、[runTrace.ts:2008](/d:/codex/novel-workshop-vue3/src/stores/runTrace.ts:2008)、[performanceMonitor.ts:20](/d:/codex/novel-workshop-vue3/src/services/performanceMonitor.ts:20) |
| 崩溃前 trace 不只存在内存 | 既有 5s 流式落盘 + 终态 flush；本轮补齐重启后非终态 run 转 `interrupted` | [runTrace.ts:915](/d:/codex/novel-workshop-vue3/src/stores/runTrace.ts:915)、[runTrace.ts:2672](/d:/codex/novel-workshop-vue3/src/stores/runTrace.ts:2672) |

### 13.5 诚实边界

1. `PerformanceObserver.longtask` 在 Electron/Chromium 的真实采样结果尚未回读，Phase J 必须输出 long task / freeze / 点击反馈三项实测数字。
2. freeze watchdog 用“timer 超期”近似主线程阻塞，能发现 2s 以上冻结，但不替代 Chromium tracing 级归因。
3. 单 run trace 的事件与 API payload 尚无字符级压缩策略；当前以 `maxRuns`、流式增量存储、5s 落盘和事件环上限控制增长。若 Phase J 出现内存增长，再按第 0.2 节契约补“超限压缩预览，不丢关键 trace 事件”。

## 14. Phase I：旧全局语义清零（2026-10-22）

### 14.1 交付

1. **删除 `generationProgress`**：`src/stores/pipeline.ts` 中定义、写入、导出全部移除；生产代码零引用。唯一保留是 [pipelineProgressReaders.spec.ts:8](/d:/codex/novel-workshop-vue3/src/services/pipelineProgressReaders.spec.ts:8) 的防回归断言，防止旧 UI 读取复活。
2. **删除 `generationAbortController`**：abort 语义统一由 run registry 的 per-run controller 提供；`getGenerationSignal` 不再有全局 fallback，显式按 `runId` 解析当前层 run。

### 14.2 验证

```text
rg -n "generationProgress|generationAbortController" src tests
```

结果：仅命中 `src/services/pipelineProgressReaders.spec.ts:8` 的防回归字符串断言。

```text
npx vue-tsc --noEmit && npx vitest run src/services/pipelineProgressReaders.spec.ts src/stores/runTrace.spec.ts src/services/performanceMonitor.spec.ts src/services/runProgressChannel.spec.ts
```

结果：exit 0；4 个测试文件，111 个测试全部通过。

### 14.3 遗留与后续

### 14.4 Phase I 后续收尾（同日补齐）

1. **`activeToolRunBudget` 清零核验**：`rg -n "activeToolRunBudget" src tests electron scripts` 全仓 0 命中，Phase A 已完成 per-run 预算传递；本项不是残留，不重复修改。
2. **版本升级**：[package.json:3](/d:/codex/novel-workshop-vue3/package.json:3) 与 [package-lock.json:3](/d:/codex/novel-workshop-vue3/package-lock.json:3) 从 `3.103.0` 升级为 `3.104.0`。
3. **构建验证**：`npm run build:vue` exit 0，主构建与 `vite.protocols.config.mts` 协议构建均成功；输出显示 3.104.0。
4. **全量回归**：`npx vitest run` 结果 197 个测试文件全部通过，2180 个测试全部通过，duration 42.73s；`git diff --check` 通过（仅输出 Windows 换行提示）。

### 14.5 仍属 Phase J 的收尾

1. NSIS/asar 封装、真实启动、electronAPI、安装路径与 SHA256、旧产物清理未执行。
2. 13 个 `scripts/verify-*-electron.mjs` live 复跑未执行。
3. 真实 Electron 可见窗口、四格再入矩阵、3 run live 压测与性能预算报告未执行。

## 15. Phase J 启动记录（2026-10-23）

1. **章节批 live 证据**：`verify-chapter-batch-contract-electron.mjs`，run `run-1792692922313-1`，status `success`，12 章分 3 批全部 `complete`，12 次 API `success/toolCallCount=0`；证据 [_audit/verification-chapter-batch-contract-live/summary.json](_audit/verification-chapter-batch-contract-live/summary.json)。
2. **run 无关取消/信号/入口锁负向门禁**：[pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:446) 断言执行层禁止无 runId 取消/信号与全局入口锁。修复前 4 个入口锁命中：[PipelinePanel.vue:3011](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:3011)、[5770](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:5770)、[6231](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:6231)、[6245](/d:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue:6245)。
3. **修复语义**：删卷锁卷纲/章节/正文活动 run；删章卡、保存章详情锁章节/正文活动 run；打开章详情不再全局封死。`genBodyForSelected` 修正为 `selectedBodyTarget.value`。
4. **路由透传缺口**：[skillRouter.ts](/d:/codex/novel-workshop-vue3/src/services/skillRouter.ts:41) 增加 `userPromptSuffix` 并透传给执行器，`skillRouter.spec.ts` 增加断言；避免终步重试协议丢失。
5. **验证输出**：`pipelineParallelismPhase0.spec.ts` 17/17 绿；`vue-tsc --noEmit` exit 0；`skillRouter.spec.ts + realSkillExecutor.spec.ts` 55/55 绿；全量 `npx vitest run` 197 files / 2185 tests 绿。
6. **未完成**：`verify-pipeline-parallelism-electron.mjs` 尚未建成；真实双 run 并行、互不取消污染、性能预算实测、四格再入矩阵、封装核验未执行。
