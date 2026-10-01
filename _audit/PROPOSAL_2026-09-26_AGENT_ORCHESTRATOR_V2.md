# 内置 Agent 编排器与 Tokens 无感化 V2 方案

## 结论先行

本方案基于 10 轮总体社区调研与 30 轮内置 Agent 专项调研，对照 11 个真实开源项目的源码证据后形成。**方案成熟度：半成熟，允许进入详细设计审核；未获审核前禁止写码。**

半成熟的原因很明确：

1. **项目成熟方案：成熟。** 目标、架构、边界、状态机、可观测性、防冲突设计均已有真实源码支撑，不再有方向性空白。
2. **应用适配方案：成熟。** 已确认复用现有 `dialogueToolSurface`、`editTaskService`、`runTrace` 单源，不另建第二套工具面或状态机。
3. **实现接线方案：半成熟。** Agent IPC、主进程状态源、压缩生命周期属于新实现，接线点已列出，但尚未有实现与测试。
4. **验证方案：半成熟。** Electron 级实测矩阵已定义，但尚未执行。按 M40，实测未完成前不得宣称闭环。

## 问题定义

1. 用户侧 token 上限语义错误：应用让用户手填上限，未知模型还会合成 `8192/32768` 假值，导致模型能力被应用人为截断。
2. Agent 只是 UI 外壳：`electron/main.js:269-294` 的 agent IPC 全是 `renderer_handled` 空壳，无真实状态源。
3. 执行语义不足：长文档任务缺少计划、分批、等待、恢复、取消的统一状态机。
4. 可观测性断层：模型为什么说没权限、为什么循环调用、上下文水位多少，用户和 SKILL 层都不能实时看到。

## 架构设计

### 1. Tokens 无感化

- 新建 `ModelCapabilityService`：内置模型能力目录，支持远端刷新、本地缓存、未知态显式表达。
- `providerAdapter.resolveMaxTokens` 不再默认 8192；能力未知时按供应商协议省略输出上限或进入探测。
- 设置页删除普通 token 上限配置，只保留高级模式下的显式覆盖。
- 真实 usage 优先：每次请求后用 `inputTokens/outputTokens/contextWindow` 回写校准记录，估算值不得覆盖真实值。
- 压缩阈值按模型窗口比例推导，参数内部化，并写入 runTrace 来源说明。

### 2. ContextCompactionController

- 统一压缩生命周期：`pre_compact -> summarizing/checkpoint -> post_compact -> window_switch`。
- 压缩失败回退保守快照：保留当前目标、关键事实、待决问题、必要片段。
- checkpoint 支持 resume，避免长会话压缩中断丢失。
- 所有压缩事件进 runTrace，标注真实 usage 或估算来源。

### 3. AgentOrchestrator

- 唯一编排入口，负责 turn、工具循环、压缩、checkpoint、终态收敛。
- 状态机：`planning -> running -> waiting_tool -> waiting_agent -> waiting_user -> compacting -> completed/stalled/needs_user/failed/canceled`。
- 长任务先 `agent.plan`，再进入 EditTask 分批执行。
- 工具循环保留安全上限，但停止语义由任务状态决定：任务完成、停滞、需用户输入、失败、取消。
- 事件类型：`AgentTurnEvent`、`AgentToolEvent`、`AgentUsageEvent`、`AgentCompactionEvent`、`AgentChildEvent`。

### 4. Agent IPC 与主进程状态源

- Electron 主进程提供 `agent:execute/spawn/status/cancel/wait` 真实现，替换 `renderer_handled` 空壳。
- 状态源使用 `projectId/agentId/turnId/layer` 命名空间。
- 支持主进程重启后从 checkpoint 恢复。
- 子 Agent 首期只做顺序 spawn/wait，不做 fork。

### 5. 工具面适配

- Agent 复用 `dialogueToolSurface` 单源，禁止第二工具面。
- 新增只读工具：`context.remaining`、`agent.status`、`agent.plan`。
- 新增控制工具：`agent.spawn`、`agent.wait`、`agent.cancel`。
- 工具面构建期执行重名检查，冲突直接拒绝并写诊断事件。
- 外部 SKILL 注入工具时，built-in 名称保留，冲突工具加命名空间或拒绝。

### 6. 与 EditTask 的关系

- 简单写入继续走 `editor.write`。
- 长文档重排、全篇标点整理、跨段多批次修改自动进入 EditTask。
- Agent 不绕过 EditTask 的 `documentVersion + contentHash` 校验。

## 分阶段执行

### Phase 1 Tokens 无感化

- 新建 `ModelCapabilityService`。
- 移除用户侧普通 token 上限。
- 清理所有 `|| 8192` 假默认。
- 验收：能力已知/未知/显式覆盖三类请求体正确，回归测试全绿。

### Phase 2 Usage 校准与压缩生命周期

- 实现 usageReconciliation。
- 实现 ContextCompactionController 与 checkpoint。
- 验收：压缩触发、成功、失败回退、resume 四类事件全部进 runTrace。

### Phase 3 AgentOrchestrator

- 实现状态机、事件 schema、工具循环终态语义。
- 实现 context.remaining 与 agent.plan。
- 验收：direct 对话 50 万字文档可分批查询并完成一次写入。

### Phase 4 Agent IPC

- 替换主进程空壳 IPC。
- 实现 status/cancel/wait。
- 验收：Electron 真实 UI 可看到状态、取消、恢复，主进程重启后可恢复。

### Phase 5 工具面防冲突与子 Agent

- 工具重名检查。
- 顺序 spawn/wait。
- 验收：内置工具与外部 SKILL 工具冲突被拒绝并写入诊断。

### Phase 6 全量验证

- 单测、type-check、build。
- Electron 级真实 UI 实测矩阵。
- 多供应商实测：OpenAI-compatible、Anthropic、Gemini、Azure 至少各一轮。

## 验证方案

1. 单元测试：能力解析、usage 校准、压缩回退、Agent 状态机、工具冲突、checkpoint 恢复。
2. Electron 实测：真实 UI 中执行 50 万字文档查询、修改、删除、全文重排、标点整理，各至少 3 轮。
3. 恢复实测：主进程重启、压缩中断、子 Agent 超时三类场景。
4. 观测实测：runTrace 导出必须包含 turn、tool、usage、compaction、agent child 五层事件。
5. 回归门槛：既有测试全绿，新增测试不得迁就旧缺陷。

## 不采纳项

- 不做用户手填 token 预算。
- 不做无限工具循环，安全上限保留。
- 首期不做多 Agent fork 和并行竞态。
- 不引入外部 Agent 框架作为运行时依赖，避免与应用单源工具面冲突。

## 风险与放行条件

| 风险 | 等级 | 控制方式 |
|---|---|---|
| Agent 与现有 direct 对话新旧并存 | 高 | AgentOrchestrator 上线后旧入口必须收口，M17 扫描清零 |
| 压缩 checkpoint 损坏 | 高 | checkpoint 带 hash，恢复失败回退保守快照 |
| 工具面冲突破坏直写 | 高 | 构建期拒绝，测试覆盖内置与外部冲突 |
| 多供应商 usage 字段差异 | 中 | traceFieldNormalizer 统一归一化 |
| Electron 实测不充分 | 高 | M40：实测未过不得封装 |

放行条件：Phase 1-6 全部完成，Electron 实测矩阵全过，M17 回头看无新旧并存，方可以“成熟”结论进入实现收口。

