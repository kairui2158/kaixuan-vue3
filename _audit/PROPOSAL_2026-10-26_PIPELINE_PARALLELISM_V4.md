# 流水线并行 V4 破坏面对账与修复方案（待审核）

> 状态：2026-10-26，基于 V3.3 实测事故反推形成，未获批准前不修改生产代码。
> 基准：V3.3 §0.2 六条目标契约继续作为唯一方向锚；经验文件 `_audit/神意开发经验总结_v9.md` v9.5.0 作为门禁来源。

## 0. 为什么需要 V4

V3.3 Phase 0-I 交付了 registry、per-run controller、进度通道、配置事务、provider scheduler 和性能观测，这些都是有效地基；但 Phase F-J 把“同层多 run、真排队、per-run UI”三个用户契约留在了半实现状态，Phase J mock 又只覆盖“每层一个 run”的形态，导致以下用户实测事故被验证门放行：

1. 并行时 UI 显示错乱：同层第二个 run 覆盖第一个 run 的进度、技能步骤与日志归属。
2. 进度条取消失效：进度条绑定“该层最新 active run（含 queued）”，不是用户正在看的那条 run。
3. 同层排队是假排队：生成函数拿到 runId 后不等待排队解除，直接发起物理请求，`activateQueuedRuns()` 也只改状态标签，不唤醒执行。
4. 运行中心缺失：`rg "运行中心|RunCenter|PipelineRunCenter"` 源码零命中，V3.3 的“顶部运行中心”未交付。
5. 供应商并发观感受限：同供应商 2 并发是设计值，不是新故障；但排队事件被回填到“该层最新 run”，显示在错误运行上。

责任判定：1-4 是 V3.3 实施引入的“半成品破坏”，不是旧债；5 是设计语义，但观测归属接线错误。SKILL 与供应商调度器本身未损坏。

## 1. 事故根因矩阵

| # | 断点 | 源码证据 | 破坏形态 | 责任 |
|---|---|---|---|---|
| A | 同层 runId 单槽位覆盖 | `src/components/pipeline/PipelinePanel.vue:886` `activePipelineRunIds` 每层只有一个字符串槽；`:4342/:4482/:4760/:4999` 第二次启动直接赋值 | 旧 run 的 signal、取消检查、进度、provider queue 全部路由到新 run | V3.3 实施引入 |
| B | 假排队 | `src/stores/pipeline.ts:74-90` 只改 status；`runRegistry.ts:144-150` 激活只改标签；四个生成函数拿 runId 后立即执行，无等待门 | 同层双 run 同时发物理请求，排队只是 UI 标签 | V3.3 实施引入 |
| C | 单实例 UI 状态 | `PipelinePanel.vue:1004` `activeGenerationFeedbackStep` 全局单值；`:242/:377/:527/:599` skill steps 绑定该值；`:245/:380/:530/:602` 取消绑定 `activeXxxRun`（`activeRuns` 里该层最新项，含 queued） | 后启动层隐藏前层技能步骤；进度条取消点错 run | V3.3 实施引入 |
| D | 执行语义共享值 | `PipelinePanel.vue:1195` `currentGenerationVolume`、`:4430` `currentBodyChainContract`、日志数组按 step 共享 | 并行 run 互相污染模板上下文与契约 | V3.3 实施引入（旧共享状态被并行放大） |
| E | provider 排队归属回填 | `PipelinePanel.vue:1157-1173` `recordPipelineProviderQueue()` 从 callId 找 step，再取该层最新 run | 排队原因挂错 run | V3.3 实施引入 |
| F | 运行中心未实现 | `rg "运行中心|RunCenter|PipelineRunCenter"` 0 命中 | 用户无法看到“谁在跑、谁在排队、各自取消” | V3.3 实施未交付 |

## 2. 验证为什么没抓住

1. Phase J mock 场景是“卷纲 + 章节 + 正文各一个 run”，天然绕开同层双 run。
2. Phase 0 红灯断言的是“无全局调用”（`pipelineStore.isGenerationCanceled()`、`getGenerationSignal()`、全局 `isGenerating` 入口锁），没有断言“同层第二 run 不覆盖第一 run”。
3. `pipelineParallelismPhase0.spec.ts` 的 provider queue 测试直接传入正确 runId，绕过了 `recordPipelineProviderQueue()` 的 step→latest-run 回填缺陷。
4. mock 验证的取消走顶部运行清单，没有点击四层进度条自身的取消按钮。
5. Phase F 文档已经诚实登记“registry 排队不等于完整队列调度器”“Electron 真实窗口四层同时运行未验证”，但 Phase J 后续验收没有把这些缺口升为红灯，导致 PASS 被误读为用户契约完成。

这属于 G0.6 半成熟方案未阻断实施 + G0.11 mock 覆盖不足 + G1.17 验证矩阵漏“同层多 run”的组合失效。

## 3. 反推清单

### 3.1 被破坏面（必须修复）

| 面 | 现状 | V4 目标 |
|---|---|---|
| run 归属 | 执行回调按 step 查“该层当前 runId” | 所有回调闭包持有创建时的 runId；删除 `activePipelineRunIds` 与 `activePipelineRunIdForStep()` |
| 排队语义 | queued 只改状态 | queued run 在真实调度门上等待；未激活前不得构造用户可见“生成中”，不得发起物理请求 |
| 进度条取消 | 绑定 latest run | 绑定进度条对应的展示 run；同一层多 run 时由运行中心选择展示 run，进度条取消永远只取消该展示 run |
| UI 状态 | `activeGenerationFeedbackStep` 单值 | per-layer 状态对象：visible、log、skillSteps、contract、volume 均按 run 或 layer 分槽 |
| provider queue | callId→step→latest run | callId 注册时直接登记 runId；`recordPipelineProviderQueue()` 只消费该 runId |
| 运行中心 | 不存在 | 新组件 `PipelineRunCenter.vue`，只消费 registry，不建第二套状态源 |

### 3.2 未实现面（必须补齐）

1. `await waitForRunActivation(runId)` 调度门与取消等待语义。
2. 同层多 run 的 UI 展示与选择语义。
3. run 中心的排队原因、耗时、取消、展开日志。
4. 同层多 run 场景下的 trace 断言与真实 UI 断言。

### 3.3 未改造面（禁止伪装完成）

1. `currentGenerationVolume` / `currentBodyChainContract` 仍是全局共享值。
2. 四层日志数组按 step 共享，尚未 per-run。
3. 依赖锁目前只覆盖“同层同目标”，不同目标写同一数据面的组合风险尚未重审（例如章节层两个不同卷同时提交、正文层两章同卷同时写入）。

## 4. 执行方案

### Phase P0-A：run 归属根修

1. 删除 `activePipelineRunIds` 与 `activePipelineRunIdForStep()`。
2. 每个生成入口创建 run 后，构造 `runContext`：

```text
{
  runId,
  layer,
  signal: () => registry.getRun(runId)?.controller.signal,
  isCanceled: () => registry.getRun(runId)?.status === 'canceled',
  updateProgress: (p, text) => updateProgress(runId, p, text)
}
```

3. `runStepSkills()`、trace、stream、provider queue、finish/fail/cancel 回调全部接收该闭包，禁止再用 step 推导 runId。
4. 红灯先行：新增源码负向断言 `PipelinePanel.vue` 中不得出现 `activePipelineRunIds` / `activePipelineRunIdForStep`。
5. 验收：同层先后启动两个 run，第一个 run 的 signal/progress/provider queue 仍归属第一个 runId。

### Phase P0-B：真实排队调度门

1. `startGeneration()` 对同层同目标 busy 的 run 仍创建 `queued`，并返回 runId。
2. 新增 `waitForRunActivation(runId): Promise<void>`：
   - queued run 在内部 activation promise 上等待；
   - waiting 中 cancel 直接 resolve 为 canceled，不发起物理请求；
   - 前置 run succeed/fail/cancel 后只激活最早一个 queued run；
   - 激活与终态变更必须在同一 registry 变更批内完成，避免竞态。
3. 四个生成函数在构造 trace、日志、进度、物理请求之前 `await waitForRunActivation(runId)`；被取消则走 `canceled` 收口。
4. `activateQueuedRuns()` 从“改状态”改为“激活并唤醒一个”，返回被激活 run 供测试断言。
5. 红灯：同层同目标双 run，第二个处于 queued 时不得出现第二个物理请求；取消第二个 run 不影响第一个。
6. 同层不同目标默认排队还是拒绝：V4 建议默认排队（与 V3.3 已批准的“同层同目标默认排队”语义一致，且避免用户误以为能同层多目标并行）；审核决策点见第 9 节。

### Phase P1-A：per-run UI 状态

1. 将 `activeGenerationFeedbackStep`、四层日志、`skillStepStates`、`currentGenerationVolume`、`currentBodyChainContract` 迁入 run 上下文或 per-run UI 状态 Map。
2. 层进度条读取“该层展示 run”的 per-run 状态；展示 run 规则：默认 running 最早者，无 running 时显示最新 queued，terminal run 只保留关闭按钮，不参与取消。
3. 四层进度条取消按钮改为 `cancelGeneration(displayRunId)`，并移除模板里对 `activeXxxRun?.runId` 的直接取消绑定。
4. 层日志仍可聚合显示本层 run 的事件，但每行携带 run 标识；禁止把新 run 的流式文本写进旧 run 的 trace。

### Phase P1-B：运行中心

1. 新增 `PipelineRunCenter.vue`，数据只来自 `pipelineStore.runs`。
2. 展示：layer、target、status、progress、耗时、queuedReason、provider 排队位置、run 级取消按钮。
3. 页面切换后进度条状态由 registry 恢复，不依赖 `activeGenerationFeedbackStep`。
4. 运行中心不做第二套状态源，不做暂停等作者裁定的交互；只提供 run 级取消与观测。

### Phase P2：验证与门禁硬化

1. 扩展 `pipelineParallelismPhase0.spec.ts`：
   - 同层双 run 覆盖测试；
   - queued 不发物理请求；
   - 取消 queued 只终态该 run；
   - provider queue 归属 callId 对应 runId。
2. 新增 `runRegistry` 激活竞态测试：finish/fail/cancel 后仅唤醒一个 queued run，重复终态不复活 run。
3. 新增 PipelinePanel 源码负向断言：
   - 禁止 `activePipelineRunIds`；
   - 禁止通过 step 推导 runId 的 helper；
   - 禁止进度条取消绑定 latest run。
4. 真实 Electron UI 硬门禁（G0.11）：
   - 同层双 run：进度条与运行中心显示两个 run，取消第二个不影响第一个；
   - 进度条取消按钮真实点击，终态正确；
   - 切层再回切，进度仍正确；
   - provider 排队原因出现在正确 run 上；
   - mock provider 至少覆盖 `maxConcurrency=1` 的排队与唤醒。
5. G1.17 四格矩阵补齐：新鲜启动、断点恢复、成功后再入、失败后再入 × 单 run / 同层双 run / 跨层三 run。
6. 全量 `vitest`、`vue-tsc`、`build:vue`；涉及 preload/主进程时先 `node --check electron/preload.js`。

## 5. 非目标与防偏移

1. 不改 SKILL，不改供应商协议，不改 V3.3 的依赖并行目标。
2. 不移除 provider 2 并发上限；如需调整，另行按观测数据决策。
3. 不引入暂停等待作者裁定状态。
4. 不把 mock PASS 冒充真实链路 PASS；live 供应商验证未执行前登记 `untested`。
5. 所有阶段验收必须回指 V3.3 §0.2 六条契约，缺一条即 FAIL。

## 6. 风险与作者反证（G1.17）

| 假设 | 最可能错在哪 | 证伪方式 |
|---|---|---|
| 删除单槽位后 runId 已全部闭包化 | 可能仍有 runStepSkills 内部用 step 默认值推导 runId | 静态负向断言 + 同层双 run 回归 + trace runId 归属断言 |
| 排队门不会造成死锁 | finish/fail/cancel 全部走显式 runId；若某旧路径漏传 runId，队列可能永远不释放 | 覆盖 succeed/fail/cancel/窗口关闭四条唤醒路径 + 5 秒未激活报警测试 |
| per-run UI 状态不会拖慢渲染 | run 数量上升后响应式对象可能变重 | Phase J 数字回归：点击反馈 <=100ms、freeze=0，超预算即 FAIL |

## 7. 回滚

1. 每 Phase 单独提交，红灯未转绿不进入下一 Phase。
2. 出现同层双 run 无法收敛的破坏时，回退到“同层只允许一个 run，新启动拒绝并提示已有 run”，不回退跨层并行。
3. 运行中心独立于执行器，可单独回滚，不影响 run 调度。

## 8. 成熟度结论（G0.6）

| 层 | 结论 | 断点 |
|---|---|---|
| 应用方案/交互闭环 | 成熟 | 六条契约、用户可见运行机制、排队语义、运行中心范围已明确；同层不同目标的默认策略待审核 |
| 执行器/工具层 | 半成熟 | run 闭包、排队门、per-run UI 状态的接口与红灯已定义，但尚未实现；此断点涉及目标行为本身，未批准前禁止写码 |
| 实现接线 | 半成熟 | 四个生成入口、runStepSkills、trace、provider queue、运行中心的接线点已定位，未实施 |
| 验证标准 | 成熟 | 同层双 run、真排队、进度条取消、四格矩阵、真实 UI、负向断言均已定义；执行结果未产生，不预支 PASS |

整体结论：V4 方案本身可执行、可验收、可回滚；当前应用实现仍是半成品破坏态。用户批准后从 Phase P0-A 开始，红灯先行，任何阶段未过门不得宣称完成。

## 9. 审核决策点

| # | 决策 | V4 建议 | 影响 |
|---|---|---|---|
| D1 | 同层不同目标（例如两个不同卷同时生成章节）默认排队还是拒绝 | 排队 | 避免误导用户认为同层可无限制并行；执行层先收敛为“每层一个执行 run + 其余排队”，跨层仍并行 |
| D2 | 运行中心位置 | 生成流水线顶部固定聚合区 | 与四层进度条联动，切层不丢观测；不新增页面级暂停状态 |
| D3 | queued run 是否在四层进度条中展示 | 展示排队状态，但取消按钮只作用于该 queued run | 用户能看见等待原因，又不会误取消正在执行的 run |
| D4 | provider 2 并发上限 | 保留 | 设计值已验证；如用户体感不足，待真实观测数据后再调 |

