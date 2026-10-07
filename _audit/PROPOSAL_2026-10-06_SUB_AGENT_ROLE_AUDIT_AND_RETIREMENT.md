# 子 Agent 角色审计与退役方案

> 日期：2026-10-06  
> 任务性质：架构审计 + 处置方案，待用户审核；未获确认不改生产代码。  
> 触发背景：用户指出前面登记的三个遗留项在修复过程中已经偏离当初理念，要求重点排查子 Agent 在应用里的作用是否落伍或过时。

## 1. 审计结论先行

1. `agent.plan` 不是过时能力：Phase 7 live trace 有真实模型调用与成功记录，reasoning 里模型也主动消费计划内容。它属于当前“计划合同 + 防空转”架构的一部分。
2. `agent.spawn / agent.wait / agent.cancel` 是过时能力：历史 trace 中从未出现一次真实模型调用，只存在于工具面声明；同时它们违反 `discuss/analyze` 只读语义，并构成绕过意图路由的架构旁路。
3. 2026-10-05 的“先下架再修复”裁决没有按原方案执行：实际在单测与 Electron mock 通过后直接恢复上架，真实 API 验证明确登记为 `untested`。这不是测试失败，而是执行口径偏离原裁决。
4. 子 Agent 原始设计假设已被新架构完整替代：长文档分批、计划、取消、恢复、防空转现在由主 Agent 单循环 + EditTask + executionPlan + cancelController + 物理请求门禁承担，子 Agent 不再提供不可替代价值。
5. `waiting_agent` 与 `compacting` 两个状态是 V3 设计残留：生产零调用，仅存在于类型定义与状态转移表。

## 2. 审计证据

### 2.1 原始设计与执行偏差

- 原始裁决：[_audit/PROPOSAL_2026-10-05_COMPONENT_LIFECYCLE_RETIREMENT.md](_audit/PROPOSAL_2026-10-05_COMPONENT_LIFECYCLE_RETIREMENT.md) §3.2 要求“Phase 1 生产下架 → Phase 2 生命周期补全 → Phase 3 单测 + Electron + 真实 API 三层验证后再恢复上架”。
- 实际执行：[_audit/DEV_LOG_2026-10-05_component-lifecycle-retirement.md](_audit/DEV_LOG_2026-10-05_component-lifecycle-retirement.md) 登记为“生命周期补全后直接恢复上架”，理由是单测与 Electron mock 通过；真实 API 层登记为 `untested`。
- 差异定性：这是“执行时改变了裁决的放行条件”，不是被否决后的合法变更。用户指出的“和当初理念不同”成立。

### 2.2 代码接线现状

- `src/services/agentToolConflict.ts:319-390`：`createAgentSubAgentTools()` 声明三个工具，全部 `policy: 'read'`，但 `spawn` 启动真实子 Agent 请求循环，`cancel` 中止真实请求，本质是控制类工具，不属于只读语义。
- `src/services/agentOrchestrator.ts:644-663`：只要 `runSubAgent` 存在且 `subAgentDepth < 1`，三个工具就无条件加入工具面，不检查 intent，不检查 operation。
- `src/services/dialogueToolSurface.ts`：授权过滤只区分 `policy !== 'write'`，无法识别“控制类工具”，导致 discuss 轮工具面也挂出 spawn/wait/cancel。
- `src/components/chat/ChatPanel.vue:3551` 与 `src/components/common/OutlineWorkspace.vue:5107`：双入口 `runSubAgent` 实现，子 Agent messages 为 `[{ role: 'user', content: goal }]`，goal 由模型生成，不经过意图路由授权。

### 2.3 客户真实 trace 证据

以下三个客户 trace 均复核一致：

| Trace | API calls | agent 工具面 | 真实调用 |
|---|---:|---|---|
| `run-trace-outline-20261004-075619-deep` | 6 | 第 2-6 次含 `agent.plan, agent.spawn, agent.wait, agent.cancel` | 0 次 |
| `run-trace-outline-20261004-134633-deep` | 3 | 三次均含四个 agent 工具 | 0 次 |
| `run-trace-outline-20261004-162304-deep` | 3 | 三次均含四个 agent 工具 | 0 次 |

关键问题：

1. `discuss` 轮工具面也包含 `agent.spawn/wait/cancel`，违反 G2.4 只读语义。
2. 第 4-6 次调用同时出现“只读 discuss 语义 + editor.write + 控制工具”的混杂工具面，直接干扰模型对权限的判断。
3. 模型 reasoning 中已出现“没有 editor.write 工具”的同时工具面挂着 spawn/wait/cancel 的矛盾信号。

### 2.4 真实使用率

- `agent.spawn/wait/cancel`：全部历史 trace（仓库 `_audit` 验证目录 + 客户桌面 `SKILL调试文件`）中，只出现在工具面声明，真实调用为 0。
- `agent.plan`：`_audit/verification-long-document-operation-phase7/outline-no-skill/.../run-trace.json` 有真实 `tool_call / agent.plan/success`，reasoning 中模型多次主动读取计划，行为正常。

### 2.5 与现行架构的替代关系

| 子 Agent 原设计目标 | 现行承担者 |
|---|---|
| 长文档任务计划 | `agent.plan` + `deriveAgentPlan` |
| 长文档分批 | `longDocumentExecutionPlanner` + `editTaskService` |
| 取消 | `cancelController` + `AbortSignal` 传播 |
| 恢复 | `task.resume` + checkpoint |
| 防空转 | 物理请求预算 + no-progress + repeated-call 门禁 |
| 并行子任务加速 | 当前实现是顺序单任务，本就没有并行收益 |

结论：子 Agent 三工具在当前产品形态中没有不可替代价值，剩余价值为负。

### 2.6 SKILL / Agent 职责边界风险

经验门禁 G2.13 要求 SKILL 只改变提示词与领域能力，不改变执行协议与权限语义。当前子 Agent runtime 注入 `skillGuidance / skillIds`，而子 Agent 的 goal 由模型生成、不经过意图路由。也就是说，模型理论上可以通过 `agent.spawn` 让一个带 SKILL guidance 的子 Agent 以生成语义发起请求，形成权限旁路入口。删除子 Agent 链路即消除该旁路。

## 3. 裁决框架（沿用 2026-10-05 五问）

| 问题 | agent.plan | agent.spawn/wait/cancel | waiting_agent/compacting |
|---|---|---|---|
| 用户入口 | 有，长文档任务计划 | 无真实用户入口，无真实调用 | 无 |
| 不可替代价值 | 有，计划合同与防空转依据 | 无，主循环 + EditTask 已覆盖 | 无 |
| 架构一致性 | 符合统一 Agent 路线 | 违反只读语义与单源权限 | V3 残留 |
| 组合风险 | 低 | 高：权限语义混杂、旁路入口、孤儿请求历史问题 | 误导状态机与 UI 判断 |
| 修复成本 vs 删除收益 | 保留成本低 | 修复成本高且收益为负 | 删除收益高 |
| **裁决** | **保留** | **退役删除** | **删除** |

## 4. 执行方案

### Phase 1 生产下架与语义止血

1. `agentOrchestrator.ts` 删除 `createAgentSubAgentTools()` 注入分支：外层任务工具面不再出现 `agent.spawn/wait/cancel`。
2. `dialogueToolSurface` 权限语义修复：即使未来出现控制类工具，`discuss/analyze/auto` 只读轮也不得包含控制类工具；本项作为断言测试保留，防止同类问题回流。
3. 保留 `agent.plan`，并确认其在 edit 与长文档任务中继续可用。

### Phase 2 子 Agent 链路退役

按 G0.10 / G1.2 做引用闭包清零：

1. 删除 `createAgentSubAgentTools()` 与 `agent.spawn/wait/cancel` 工具定义。
2. 删除 `agentOrchestrator.ts` 的 `runSubAgent` runtime hook、`subAgentDepth` 分支。
3. 删除 `agentDialogueRuntime` 中 `runSubAgent / subAgentDepth` 传递。
4. 删除 `ChatPanel.vue` 与 `OutlineWorkspace.vue` 双入口 `runSubAgent` 实现。
5. 删除 `waiting_agent` 与 `compacting` 状态、状态转移表项、`compact` hook；`AgentProgressPanel.vue` 同步去掉 `compacting` 分支。
6. 同批更新测试：`agentOrchestrator.spec.ts`、`agentDialogueRuntime.spec.ts`、`agentToolConflict.spec.ts` 中旧契约改为负向断言，禁止为绿灯直接删除测试意图。
7. 同批更新规格与 SKILL 说明文档：不得继续宣称存在 `agent.spawn/wait/cancel`。

### Phase 3 验证

1. 单测：外层工具面包含 `agent.plan` 且不包含 `agent.spawn/wait/cancel`；discuss 轮不含控制类工具；子 Agent 相关类型在生产源码命中 0。
2. `npm run type-check`、`npm run test:services`、`npm run build:vue`。
3. Electron 真实 UI 验证：真实窗口、真实 mock 供应商请求，覆盖主页与大纲两条路径，断言运行正常且 trace 工具面无三个退役工具。
4. 回头看：生产源码、测试、脚本、规格、日志语义、trace 白名单、构建产物七层对账，旧工具名执行层命中 0；历史 DEV_LOG 与历史 trace 证据保留为历史，不参与执行。

## 5. 风险与反制

| 风险 | 影响 | 反制 |
|---|---|---|
| 模型失去“拆子任务”能力 | 低 | 主循环 + EditTask 已覆盖当前全部真实用户场景；真实使用率为 0 |
| 误删 agent.plan | 中 | Phase 1 明确保留，测试锁定 |
| 测试契约残留旧断言 | 中 | 负向断言替代删除，防止旧工具面回流 |
| 供应商请求行为变化 | 低 | 退役工具从未被真实调用，请求形状不会因此变化 |

## 6. 成熟度结论（G0.6）

| 维度 | 结论 |
|---|---|
| 执行器 / 工具层 | 成熟：每个改动点已定位到文件与链路 |
| 应用方案 / 交互闭环 | 成熟：用户可见行为不损失，权限语义恢复单源 |
| 实现接线 | 成熟：删除清单与引用闭包已明确 |
| 验证标准 | 成熟：单测、构建、Electron、七层回头看不缺项 |

诚实边界：本方案尚未执行；本文件只是审计与处置提案，不构成完成声明。
