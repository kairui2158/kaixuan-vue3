# 跨层 SKILL blocking gate 审计

日期：2026-11-05
范围：`realSkillExecutor` 主链、工作台 SKILL 引擎、复合链、卷纲/章节/设定批次链
结论：主链已闭环；工作台存在两处真实语义缺口，已补修；复合链已拒绝；其他批次链无 folder blocking 通路。

## 1. 审计反转

补修前曾假设工作台 folder chain 能把 `failed/blocked` 带非空输出映射成 `success` 并静默进入产物验收。源码复核否定了该假设：

- `skillRouter.ts:223-236` 在 `folderResult.status === 'failed' || 'blocked'` 时直接抛错；
- `workspaceSkillEngine.ts` 的 folder 成功/降级路径不会先构造可用 meta 再进入验收；
- 因此“failed/blocked 输出被静默验收”的通路不存在。

真实缺口收窄为：

1. folder `degraded + blockingGateFailed` 时，`WorkspaceSkillRunMeta` 丢失结构化 blocking 证据；
2. body 产物验收调用未透传 `blockingGateFailed`，验收层无法执行同一二级防线；
3. 无 body 契约时终态可能按 postProcess warning 显示，而不是 blocking 终态。

## 2. 各执行面对账

| 执行面 | blocking 通路 | 状态 |
|---|---|---|
| 正文/流水线 folder chain | `executeRealSkill` 返回 `blockingGateFailed`；PipelinePanel 透传；`acceptStepArtifact` 拒绝 degraded + blocking；真实 UI E2E 已有场景 A-D | 已闭环 |
| 工作台 chain / compose | folder `failed/blocked` 由 `skillRouter` 抛错；folder `degraded + blockingGateFailed` 现在写入 meta、透传给 body 验收，并把无契约终态收敛为 `blocked/post-process-blocked` | 本轮闭环 |
| 工作台直接 body 契约 | `acceptWorkspaceArtifact` 新增 `blockingGateFailed`，复用 `acceptStepArtifact` 二级防线 | 本轮闭环 |
| 复合链 `skillOrchestrator` | `failed/blocked` 直接终止；`degraded + no_contract` 由 `acceptStepArtifact` 拒绝，不因契约空位静默放行 | 已闭环 |
| 卷纲/章节/设定批次链 | 编排器不消费 folder SKILL postProcess blocking verdict；如未来接入，必须先补同一结构化 verdict，不得按本审计推断安全 | 无通路，不改 |

## 3. 证据

- `npm run type-check`：exit 0。
- 定向回归：`workspaceArtifactAcceptance.spec.ts + workspaceSkillEngine.spec.ts + realSkillExecutor.spec.ts + stepArtifactAcceptance.spec.ts`，4 files / 146 tests 全绿。
- 新增用例：
  - body 契约通过但 `blockingGateFailed=true` 时必须 reject；
  - 工作台 folder chain 返回 `degraded + blockingGateFailed=true + blocking postProcess issue` 时 run 终态为 `blocked/post-process-blocked`。

## 4. 诚实边界

- 工作台 folder blocking 路径未做真实 Electron live E2E；当前由服务层单测锁定语义。
- 旧 3.114.1 安装包在 3.114.2 新包核验通过后清理。
- 复合链未额外传入 `blockingGateFailed`，因为其 `degraded + no_contract` 已必然拒绝；该路径没有可放行的夹缝。
