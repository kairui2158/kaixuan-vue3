# 2026-09-17 收敛请求双层 signal 成熟修复方案 V2

**方案成熟度：成熟。** 结论依据四层评估：执行器/工具层成熟、应用方案层成熟、实现接线层成熟、验证标准层成熟。本文是执行前审核稿；未获用户确认前不改业务代码。

## 0. 目标语义

用户可感知行为只有四条：

1. 工具轮到达上限后，收敛救场请求继续执行，不被已耗尽的外层 300 秒总死线杀掉。
2. 收敛请求进行中，用户点“取消”，请求立即中止，运行记录出现 `canceled` 物理请求，界面按“用户取消”收口，不再继续空等。
3. supervisor 因停滞/总死线/重复工具错误中止主链路时，不追杀已经进入的收敛救场请求。
4. 全应用所有带工具调用入口的收敛救场请求都恢复用户取消能力；不是只修大纲 direct 一条链。

反过来说：本次不做“supervisor 中止后仍无限等待收敛请求”。收敛请求仍有 provider/default 超时兜底；用户取消仍然随时生效。

## 1. 根因

当前 `OutlineWorkspace.vue` 的 direct 对话用一个 `generationController` 承载两种语义：

| 信号源 | 当前实现 | 应有语义 |
|---|---|---|
| 用户取消 | `cancelGeneration()` 直接 abort `generationController` | 全链路传染，包括收敛请求 |
| supervisor 死线 | `createToolRunSupervisor({ controller: generationController })` 直接 abort 同一 controller | 只中止主工具循环，不传染救场请求 |

M25 修掉了“收敛请求继承外层 signal 被杀”的事故，但把 `signal: undefined` 一刀切，用户取消也被一起屏蔽。这是半成熟的根因：取消语义没有分层。

应用级反推还发现第二个连带缺口：主页 ChatPanel、大纲 skill 模式、realSkillExecutor、workspaceSkillEngine 这些入口没有 supervisor，传入的 `signal` 本来就是用户取消；但 M25 的一刀切发生在服务层，导致这些入口的收敛请求同样无法被用户取消。也就是说，断点不是大纲特有，而是服务层全局行为。

## 2. 方案比较与择优

| 方案 | 做法 | 结论 |
|---|---|---|
| A. 恢复继承 `params.signal` | 收敛请求直接传外层 signal | 淘汰。supervisor 和用户取消混在同一 signal，必然复现 M25“无正文”事故。 |
| B. 冻结快照 | 启动收敛前读取 `params.signal.aborted`，已中止则不再救场 | 淘汰。只能判断“启动时”，无法处理“收敛进行中用户取消”；且仍无法区分 supervisor 与用户取消。 |
| C. 双 controller 拆语义 + 服务层兜底 | 用户取消与 supervisor 各持 controller；服务层收敛请求挂 `cancelSignal ?? signal` | 采纳。同时解决大纲混合 signal 和无 supervisor 入口的用户取消。 |
| D. 重构全部调用参数为多 signal 结构 | 全应用统一强制改造 | 淘汰。爆炸半径过大。可选字段加兜底已能覆盖全部现有入口。 |

社区证据：OpenAI Agents `modelRetry.ts` 每次尝试派生 controller，父级取消永远传导，超时只作用于本次尝试；LangGraph `retry.ts` 每次重试前检查 `signal?.aborted`。两者共同点是“用户级取消与本次限时分离”。

## 3. 目标设计

### 3.1 服务层新增字段与收敛请求

`CallAiParams` 增加可选字段：

```ts
cancelSignal?: AbortSignal
```

收敛请求由：

```ts
timeoutMs: undefined,
signal: undefined,
```

改为：

```ts
timeoutMs: undefined,
signal: params.cancelSignal ?? params.signal,
```

注意：这里不能只写 `params.cancelSignal`。理由是应用级反推：

- 主页 ChatPanel：`activeAbortController.signal` 是用户取消，没有 supervisor。
- 大纲 skill 模式、续生成：`generationController.signal` 是用户取消，没有 supervisor。
- realSkillExecutor / workspaceSkillEngine：调用方传入的 signal 是用户/项目取消，没有 supervisor。

这些入口都不会传 `cancelSignal`，所以必须 `?? params.signal` 兜底，才能把全应用收敛请求的用户取消能力一次恢复。

### 3.2 服务层取消兜底

收敛请求 catch 里的判断由：

```ts
if (params.signal?.aborted) throw error
```

改为：

```ts
if ((params.cancelSignal ?? params.signal)?.aborted) throw error
```

这样无 `cancelSignal` 入口的用户取消会被上抛；大纲 direct 的 supervisor abort 因 `cancelSignal` 未 abort，会回落本地摘要兜底或正常收敛结果，不会误判为用户取消。

### 3.3 工具执行

工具执行当前传入 `abortSignal: params.signal`。改为：

```ts
abortSignal: combineSignals(params.signal, params.cancelSignal)
```

若两个 signal 均未传，保持不组合，避免 `combineSignals` 的 `no signals` 异常。语义上 `params.signal` 已覆盖这些入口，`cancelSignal` 只是补充大纲 direct 的用户专线。

### 3.4 大纲工作台拆 controller

`OutlineWorkspace.vue` direct 对话新增 `cancelController`，与 `generationController` 同点创建、同点清空：

```ts
generationController = new AbortController()
cancelController = new AbortController()
```

接线规则：

- `callAi.signal = generationController.signal`（supervisor 仍可中止主循环）
- `callAi.cancelSignal = cancelController.signal`（用户取消专线）
- `toolRunSupervisor.controller = generationController`（只杀主循环）
- `cancelGeneration()` 同时 abort 两个 controller（用户取消必须仍然能杀主循环）
- `toolRunSupervisor.controller = generationController`
- `cancelGeneration()` 同时 abort 两个 controller
- finally 同步清空两个 controller，并调用 `toolRunSupervisor.dispose()`
- catch 判断顺序不变：先看 supervisor reason，再看取消/AbortError，最后归为用户取消

其他三个 outline 入口（skill 模式、续生成、fallback 生成）不接 supervisor，继续共享 `generationController` 作为用户取消 signal，不改 `cancelSignal`。

### 3.5 supervisor 在收敛阶段停用

应用级反推发现：如果 supervisor 在收敛请求期间继续计时，300 秒总死线仍可能在救场期间触发，界面显示“停滞请求已自动中止”，但收敛请求会继续跑并可能成功返回正文，最终状态互相矛盾。

因此，服务层在启动收敛请求前，通过已有 `toolPolicy` 增加可选回调：

```ts
onConvergenceStart?: () => void
```

`callAiWithTools` 在发起收敛请求前调用一次。大纲 direct 在回调中执行 `toolRunSupervisor.dispose()`，停用后续 idle/hard 判定，避免状态冲突；用户取消 controller 仍然独立生效。

不接 supervisor 的入口不实现该回调，零影响。

### 3.6 有意不动的部分

- `maxToolIterations` 默认值 6 → 10 属于 P1，不在本方案混做，避免一个 diff 承载两个目标。
- 主页 ChatPanel 接入 ToolRunSupervisor 属于 P1。
- runTrace schema v9、结构化异常、prompt 版本属于 P2。
- 对话链 handoff 决策器属于 P2。

## 4. M12 正反推研磨

### 4.1 目标倒推

| 用户可感知目标 | 实现链路 | 是否闭环 |
|---|---|---|
| supervisor 死线不杀救场 | supervisor 只 abort `generationController`；收敛请求在大纲 direct 只挂 `cancelSignal` | 是 |
| 大纲 direct 收敛期间用户取消生效 | `cancelController.abort()` → `cancelSignal` → 收敛 fetch abort | 是 |
| 主页/流水线/skill 收敛期间用户取消生效 | `cancelSignal ?? signal` 兜底，现有用户取消 signal 直接传导到收敛请求 | 是 |
| 取消后记录不残留 running | `callAiWithoutTools.throwCanceled()` 已收口物理请求 `canceled`；组件 `finishRun` / `cancelRunningApiCalls` 收口运行记录 | 是 |
| supervisor 中止仍按 failed 收口 | catch 先判 `supervisorReason`，分类顺序不变 | 是 |
| 收敛期间不再显示互相矛盾的 supervisor 状态 | `onConvergenceStart` 停用 supervisor | 是 |

### 4.2 应用级场景矩阵

| 入口 | 当前应用行为 | 修复后行为 |
|---|---|---|
| 大纲 direct + tools，工具上限后收敛中用户取消 | 无法取消，继续等到超时或完成 | 立即取消，运行记录 canceled，UI 用户取消 |
| 大纲 direct + tools，supervisor 死线触发后 | 主循环中止；如已进入收敛，救场仍可能被杀或状态矛盾 | 主循环中止；救场不被追杀，supervisor 停用 |
| 大纲 direct 空正文后 API 抛错 | catch 归 failed，`plain_dialogue_failed` | 不变 |
| 大纲 skill 模式收敛中用户取消 | 无法取消 | `generationController` 是用户取消，传导到收敛请求，可取消 |
| 大纲续生成中取消 | 非工具循环路径，本来就以 `signal` 取消 | 不变，且若未来接入工具不受影响 |
| 主页 direct 对话收敛中用户取消 | 无法取消 | `activeAbortController` 传导到收敛请求，可取消 |
| 主页直出重试中用户取消 | 显式 callAi 传 `signal` | 不变 |
| 流水线调用 realSkillExecutor/workspaceSkillEngine | 调用方 signal 传导；预算/上下文行为不变 | 不变，但收敛请求同样恢复可取消 |
| 无 signal 调用（naming、memory 等） | 收敛请求无取消 | 不变 |

### 4.3 正推风险

1. **用户取消触发 supervisor 状态竞争**：用户取消会 abort `generationController`，若 supervisor 未提前 dispose，可能误发“自动中止”。执行时需确认取消路径不提前 `dispose()`，仍由 finally 统一清理；同时 catch 分类以 supervisorReason 优先，避免把用户取消误报为 failed。
2. **`cancelSignal ?? signal` 让主页收敛请求重新可取消**：这是有意的应用级行为恢复，但会引入“收敛请求进行中用户点取消”的新路径。必须补单测和 E2E，证明取消后物理请求为 canceled，且不会把本地摘要误当成功正文。
3. **主进程网络层 abort 传导**：`callAiWithoutTools` 已有 providerNetAbort 通路，但必须用物理请求 canceled 断言实测，不能只相信源码阅读。
4. **双 controller 生命周期不同步**：两者必须同点创建、同点清空；执行时用 `rg` 盘点 direct 函数内两个 controller 的赋值/清空点，防止一个置空一个残留。
5. **catch 分类回归**：`cancelController` 不进入 catch 判定，否则“用户取消”会被误判为 supervisor failed。
6. **旧测试语义冲突**：`aiService.spec.ts` 现有测试把“外层已 abort 但收敛仍成功”作为 M25 断言，需要改为正交双用例，不能简单保留。

### 4.4 反推有效性

| 反推问题 | 结论 |
|---|---|
| 如果 supervisor 在收敛请求启动前 abort？ | `generationController` 已 abort，主循环不再进入收敛；不会额外触发救场。 |
| 如果用户在收敛请求启动前取消（大纲 direct）？ | `cancelController` 已 abort，`callAiWithoutTools` 入口 `params.signal?.aborted` 直接 `throwCanceled()`，不发起救场网络请求。 |
| 如果用户在收敛请求启动前取消（主页/skill）？ | `cancelSignal ?? signal` 已 abort，同样直接 canceled。 |
| 如果用户在收敛请求进行中取消？ | fetch abort，`callAiWithoutTools` 收口 `canceled`；外层 catch 因 supervisorReason 为空归为用户取消，物理请求不残留 running。 |
| 如果收敛请求失败但用户未取消？ | `cancelSignal ?? signal` 未 abort，回落 `tool_converged_local`，既有本地摘要兜底不变。 |
| 如果调用方不传任何 signal？ | 收敛请求 signal 为 undefined，保持 M25 行为，无取消入口不发生行为变化。 |
| 如果主页取消发生在收敛请求完成后？ | callAi 已返回，外层 catch 不触发，正常成功收口；无状态竞争。 |
| 如果 supervisor 先中止，收敛请求已返回正文？ | supervisor 已停用；主循环已中止则不会启动新收敛；若收敛已启动，结果按正常返回或本地摘要收口，不会互相改写状态。 |
| 主页对话是否被破坏？ | 不传 cancelSignal 时，`?? signal` 兜底；行为从“不可取消”恢复为“可取消”，失败/成功路径不变。 |
| 大纲 skill 模式是否被破坏？ | 不接 supervisor，收敛请求挂用户取消 signal；工具循环主链路行为不变。 |

### 4.5 优先级证据化

- P0：本方案。理由：用户取消是产品级底线能力，且已被 M25 修复间接屏蔽；社区双层 signal 是成熟模型。
- P1：默认 `maxToolIterations` 6 → 10；主页 ChatPanel 接入 supervisor。
- P2：runTrace schema v9 结构化异常与 prompt 版本；对话链接入 handoff 决策器。

## 5. 分层实现清单

| 层 | 文件 | 改动 |
|---|---|---|
| 服务接口 | `src/services/aiService.ts` | `CallAiParams.cancelSignal?: AbortSignal`；`toolPolicy.onConvergenceStart?: () => void` |
| 服务执行 | `src/services/aiService.ts` | 收敛请求 `signal: params.cancelSignal ?? params.signal`；catch 使用同一取消信号判断；工具执行组合取消信号；收敛启动回调 |
| 组件接线 | `src/components/common/OutlineWorkspace.vue` | direct 对话新增 `cancelController`，callAi 传 `cancelSignal`，取消按钮 abort 双 controller，`onConvergenceStart` 停用 supervisor，finally 双清空 |
| 测试 | `src/services/aiService.spec.ts` | 改造 M25 用例 + 新增双取消源正交用例 + 本地摘要回归 |

不修改：主页 ChatPanel、流水线、realSkillExecutor、workspaceSkillEngine、runTrace schema、toolRunSupervisor。

## 6. 测试与验证矩阵

### 6.1 单元测试

1. 大纲 direct 语义：supervisor 侧 signal 已 abort、cancelSignal 未 abort，收敛请求仍成功，返回 `tool_converged`，物理 phase 为 `tool_convergence`。
2. 大纲 direct 语义：cancelSignal 在收敛请求进行中 abort，请求拒绝为 `kind: canceled`，物理请求状态序列 `running → canceled`。
3. 通用应用语义：不传 cancelSignal、signal 为用户取消并在收敛中 abort，请求拒绝为 canceled。该用例覆盖主页/skill/executor 等入口。
4. cancelSignal 启动前已 abort：不发起收敛网络请求，直接 canceled。
5. 收敛请求失败且取消信号未 abort：回落 `tool_converged_local`，本地工具摘要保留。
6. `onConvergenceStart` 回调只调用一次，且发生在收敛请求前。

### 6.2 回归

- `npm test -- aiService.spec.ts`
- `npm run type-check`
- `npm run build:vue`
- `node scripts/verify-outline-silent-wait-fix-e2e.mjs`
- 既有取消分类测试：已中止请求归 canceled、请求中 abort 物理记录收口。
- 大纲 direct 真实用户路径补充验证：收敛期间点取消，确认 UI 显示已取消、runTrace 导出含 canceled 物理请求，无 running 残留。

### 6.3 M17 回头看清单

1. `rg` 全仓 `callAi(` 带工具调用点，确认所有入口均通过 `cancelSignal ?? signal` 获得取消能力。
2. `rg` 全仓 `createToolRunSupervisor` 调用点，确认无第二混合 signal 入口。
3. `rg` `cancelController` / `cancelSignal` / `onConvergenceStart`，确认无未清理引用。
4. 核对 `generationController` 在 direct 函数的创建、使用、catch、finally 四段生命周期。
5. 核对 runTrace 中收敛请求 canceled 物理记录是否落盘。
6. 核对 DiagLogger / DEV_LOG 是否记录取消语义分层与 supervisor 收敛期停用。
7. 复核所有验证证据属于本轮命令输出，不引用旧结果。
8. 若执行后封装，交付物必须检查最终安装包产物，禁止只看源码。

## 7. 四层成熟度评估

| 层 | 评估 | 证据 |
|---|---|---|
| 执行器/工具层 | 成熟 | `AbortController`/`AbortSignal.any`、`combineSignals`、`throwCanceled`、providerNetAbort 均已存在并被测试覆盖 |
| 应用方案层 | 成熟 | 双 controller 拆分用户取消与 supervisor 死线；`cancelSignal ?? signal` 覆盖全部现有应用入口；收敛期停用 supervisor 避免状态矛盾 |
| 实现接线层 | 成熟 | 改动集中在 2 个生产文件；其他入口零改动并列入应用级场景矩阵 |
| 验证标准层 | 成熟 | 6 条单测 + 6 类回归 + M17 八项回头看，覆盖双取消源、通用入口取消、旧调用兼容、回调时序 |

## 8. 执行顺序

1. 服务层 `cancelSignal`、`onConvergenceStart`、收敛请求与 catch 接线。
2. 工具执行组合取消信号。
3. 大纲 direct 双 controller、取消按钮、supervisor 停用接线。
4. 单测改造与新增。
5. 回归、真实用户路径验证、M17 回头看、DEV_LOG 记录。
6. 用户确认后按项目流程决定是否升级版本与封装。

## 9. 结论

本方案把 M25 的“救场请求完全脱离取消”升级为社区双层模型：用户取消永远传染，supervisor 死线只管主循环，并且通过 `cancelSignal ?? signal` 让全应用入口一次性恢复取消能力。收敛期停用 supervisor 消除了“已中止但仍成功”的状态矛盾。断点已消除，旧调用兼容路径保留，验证矩阵覆盖应用级正反推所有分支。**方案成熟度：成熟，可执行。**
