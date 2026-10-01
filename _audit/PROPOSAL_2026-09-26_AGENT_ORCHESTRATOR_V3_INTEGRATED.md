# 内置 Agent 编排器与 Tokens 无感化 V3 综合方案

## 0. 方案性质

本方案是 V2 研究方案的执行收敛版，合并本轮讨论的防空转门禁、失败修正流程和应用贴合原则。**当前仍是待审核方案，未获批准不改生产代码。**

成熟度必须诚实分级：

| 维度 | 当前等级 | 放行到下一级的条件 |
|---|---|---|
| 项目方向与架构 | 成熟 | 已有 11 个真实开源项目源码证据 |
| 应用贴合设计 | 成熟 | 本方案已修正 V2 的两处贴合风险，见第 2 节 |
| 实现接线 | 半成熟 | 尚未实现，禁止提前宣称可交付 |
| 验证 | 半成熟 | 矩阵已定义，尚未执行；按 M40 未实测不得封装 |

## 1. 要解决的问题

1. 用户侧 token 上限和假默认截断模型能力：`providerAdapter.resolveMaxTokens` 默认 `8192`，未知窗口合成保守值。
2. Agent 只有 UI 外壳：`electron/main.js:269-294` 的 agent IPC 返回 `renderer_handled`，没有真实状态与恢复。
3. 长文档任务缺少计划、分批、等待、恢复、取消的任务级状态机，direct 工具循环只能被动收口。
4. 空转可发生但不可尽早停止：重复调用、只读不写、无正文、无进展缺乏硬性判定。
5. 观测断层：用户和 SKILL 层看不到任务为什么停、上下文水位、压缩过程和子 Agent 状态。

## 2. 应用贴合原则（重点中的重点）

### 2.1 只做任务层编排，不做第二物理循环

现有 `aiService` 已经有成熟的原生 tool loop：只读收敛 steering、写入收口、重复写拦截、工具结果审计、上限后无工具收敛。V3 不重写这套循环。

接线关系：

| 层 | 唯一职责 | 禁止事项 |
|---|---|---|
| `AgentOrchestrator` | 任务状态机、计划合同、防空转判定、压缩调度、checkpoint、终态 | 禁止直接拼第二次请求循环、禁止复制 aiService 工具执行逻辑 |
| `aiService` | 单次请求、原生/JSON 工具协议、物理工具执行、重试与降级 | 禁止另建 Agent 专用请求路径 |
| `dialogueToolSurface` | 工具面单源与权限授权 | 禁止 Agent 私有工具面 |
| `editTaskService` | 长文档批次写入状态机、`documentVersion + contentHash` | 禁止 Agent 绕过校验直写 |
| runTrace | turn/tool/usage/compaction/agent 事件观测 | 禁止旁路日志 |

### 2.2 编排器运行在渲染进程

V2 原设计让主进程提供 `agent:execute` 真实现，这有一个贴合风险：编辑器工具和 `dialogueToolSurface` 都在渲染进程，主进程无法直接执行 `editor.write`。

V3 修正为：

1. `AgentOrchestrator` 运行在渲染进程，贴近编辑器、工具面和 EditTask。
2. 主进程只承担持久职责：状态存储、checkpoint、取消令牌、重启恢复、跨窗口 status 查询。
3. `agent:*` IPC 从“假装执行”改为“持久化与恢复服务”，不再冒充执行器。

这样 Agent 与现有 direct 对话共享同一执行环境，避免跨进程工具语义漂移，这是本轮最大的贴合修正。

### 2.3 不引入外部 Agent 框架

不把 LangGraph、Vercel Agent 等作为运行时依赖。调研项目只提供机制证据，机制在本应用单源体系内实现，避免安装包膨胀和第二套冲突体系。

## 3. 核心设计

### 3.1 Tokens 无感化

1. 新建 `ModelCapabilityService`：模型能力目录、远端刷新、本地缓存、未知态显式表达。
2. 删除普通设置里的用户 token 上限；高级模式只保留协议必需的显式覆盖。
3. `resolveMaxTokens` 不再默认 8192；能力未知时按供应商协议省略输出上限，或记录 `unknown` 后探测。
4. 真实 usage 永远优先，估算值不得覆盖真实值。
5. 清理所有分散的 `|| 8192` 假默认。

不设用户侧预算，不做预算中断，这条是铁律。

### 3.2 ContextCompactionController

生命周期：`pre_compact -> summarizing -> checkpoint -> post_compact -> window_switch`。

1. 压缩前写 checkpoint：当前目标、关键事实、硬约束、待决问题、必要片段、工具状态。
2. 压缩失败回退保守快照，不允许丢任务目标。
3. checkpoint 带 hash，恢复失败进入 `needs_user`，不静默重跑。
4. 所有压缩事件进 runTrace，标注真实 usage 或估算来源。

### 3.3 AgentOrchestrator 状态机

```text
planning
  -> running
  -> waiting_tool / waiting_agent / waiting_user / compacting
  -> completed / stalled / needs_user / failed / canceled
```

1. 长任务先 `agent.plan`：目标、必需工具、批次、完成判据、失败判据。
2. 简单写入仍走 `editor.write`；长文档重排、标点整理、跨段多批修改自动进 EditTask。
3. 每轮物理请求由 `aiService` 执行，编排器消费其 trace 回调做进度判定。
4. 终态必须收敛，不允许停在 `running` 空等。

### 3.4 防空转硬门禁

这是本轮新增的强约束，缺一不可：

| 门禁 | 触发条件 | 动作 |
|---|---|---|
| executed call ledger | 连续 2 轮相同工具 + 相同参数 | 进入 `stalled`，输出原因，不再消耗轮次 |
| no-progress | 连续 3 轮无正文、无写入、无状态变化、无新批次完成 | 强制写入收口或无工具收敛 |
| plan contract | 工具结果未推进 plan 中任何一项 | 记录 `no_progress`，下一轮必须修正或停止 |
| visible stop | 进入 `stalled/needs_user/failed` | UI 与 runTrace 同步展示原因，禁止静默等待 |
| idle supervisor | 工具或请求空闲超过阈值 | 停止并给出可重试状态；长文档显式模式可声明无硬超时 |
| pseudo-tool guard | 收口轮仍输出伪 tool call | 本地总结工具结果，明确“本轮未写入” |

商业成熟标准不是“永不空转”，而是：可检测、可收敛、可停止、可解释。上述门禁就是这套标准。

### 3.5 Agent IPC 与恢复

主进程提供：

1. `agent:checkpoint:save/load/list`
2. `agent:status`：跨窗口可查询
3. `agent:cancel-token`：取消令牌持久化
4. `agent:recover`：主进程重启后按 checkpoint 恢复

子 Agent 首期只做顺序 `spawn/wait`，不做 fork、不做并行竞态。

### 3.6 工具面扩展

新增只读：`context.remaining`、`agent.status`、`agent.plan`。

新增控制：`agent.spawn`、`agent.wait`、`agent.cancel`。

规则：

1. built-in 名称保留，外部 SKILL 重名工具加命名空间或拒绝。
2. 工具面构建期冲突直接拒绝并写诊断事件。
3. Agent 与 direct 对话共用同一工具面和权限语义。

## 4. 分阶段执行

### Phase 1 Tokens 无感化

交付：`ModelCapabilityService`、设置页移除普通上限、清理 `|| 8192`。

验收：能力已知/未知/显式覆盖三类请求体正确；旧假默认在代码和 trace 中清零。

### Phase 2 Usage 校准与压缩

交付：usageReconciliation、ContextCompactionController、checkpoint。

验收：触发、成功、失败回退、恢复四类事件全部进 runTrace。

### Phase 3 AgentOrchestrator

交付：状态机、事件 schema、plan contract、防空转门禁、`context.remaining`、`agent.plan`。

验收：50 万字文档可分批查询并完成一次写入；重复调用 fixture 必须进入 `stalled`。

### Phase 4 IPC 持久化与恢复

交付：主进程 checkpoint/status/cancel/recover；替换 `renderer_handled` 空壳。

验收：Electron 真实 UI 可见状态、可取消、主进程重启后恢复。

### Phase 5 工具面防冲突与子 Agent

交付：重名检查、顺序 spawn/wait。

验收：内置与外部工具冲突被拒绝且写诊断；子 Agent 超时进入终态。

### Phase 6 全量验证

交付：单测、type-check、build、Electron 实测矩阵、多供应商实测、M17 回头看。

验收见第 5 节，任何一项不过不得封装。

## 5. 验证标准（诚实版）

### 5.1 单元与契约测试

| 验证项 | 通过标准 | 证据 |
|---|---|---|
| 模型能力解析 | 已知/未知/覆盖三类不合成假值 | 测试输出 |
| usage 校准 | 真实 usage 覆盖估算，缺 usage 标记 unavailable | 测试输出 |
| 压缩回退 | 失败后保守快照保留目标与关键事实 | 测试输出 |
| 状态机 | 所有终态可达，无非法回退 | 测试输出 |
| 防空转 | 重复调用、只读不写、无进展三类 fixture 全部停机 | 测试输出 |
| 工具冲突 | 重名拒绝 + 诊断事件 | 测试输出 |
| checkpoint | hash 不匹配时拒绝恢复写入 | 测试输出 |

### 5.2 Electron 级真实 UI 实测

1. 50 万字文档：查询、修改、删除、全文重排、标点整理，各 3 轮。
2. 至少 1 轮使用 1M 窗口模型。
3. 四供应商各 1 轮：OpenAI-compatible、Anthropic、Gemini、Azure。
4. 恢复实测：主进程重启、压缩中断、子 Agent 超时。
5. 每轮必须导出 runTrace，包含 turn、tool、usage、compaction、agent 五层事件。

### 5.3 四条硬验收

1. 权限误报清零：实测中不允许“模型说没权限但工具面实际有权限”。
2. 长文档不空转：50 万字任务必须完成或进入明确终态，不允许只有工具循环无正文。
3. 压缩可恢复：中断和重启后从 checkpoint 恢复，不丢当前目标。
4. 旧路径清零：旧 token 假默认、agent 空壳、旧编排入口在代码和 trace 中不得存在。

## 6. 验证不过怎么办

这一节是本方案的核心承诺：失败不是继续补丁，而是按分类修正。

### 6.1 失败分类

| 类型 | 判断 | 修正方式 |
|---|---|---|
| 接线失败 | 工具面有权限但 Agent 没拿到 | 修接线，不碰模型提示词 |
| 协议失败 | 供应商字段或工具协议解析错误 | 修协议归一化，加供应商 fixture |
| 语义失败 | 模型理解错任务或空转 | 收紧 plan contract 与防空转门禁，不改安全模型 |
| 数据失败 | 文档/上下文注入缺失或损坏 | 修数据链路，禁止用提示词掩盖 |
| 产品失败 | 设计与用户实际工作流不符 | 回到方案层重新审核，不硬改代码 |

### 6.2 修正铁律

1. 禁止放宽阈值让测试变绿。
2. 禁止修改既有测试迁就新缺陷；必须新增回归测试锁定根因。
3. 每次修正必须先读开发日志和经验文件，确认不破坏既有链路。
4. 修完后重跑该 Phase 全部验证，再跑受影响的上游 Phase。
5. 同一 Phase 修正超过 2 轮仍不过：停止实现，向用户报告卡点、证据和建议，不继续烧时间。
6. 若缺陷属于模型能力边界：应用层必须给出可见降级或停止状态，不得假装成功。

### 6.3 回头看门禁

每个 Phase 完成后执行 M17：

1. 新旧并存扫描：旧路径、旧默认、旧空壳必须清零。
2. 旁路扫描：Agent 不得绕过工具面、EditTask、runTrace。
3. 回归扫描：direct 对话、生成流水线、大纲工作台、主页编辑器均不可退化。
4. 观测扫描：所有新状态必须进 UI 与 runTrace。

## 7. 放行条件

1. Phase 1-6 全部完成。
2. Electron 实测矩阵全部通过，runTrace 证据完整。
3. 四条硬验收全部满足。
4. M17 回头看无新旧并存、无旁路、无观测缺口。
5. 更新经验文件与开发日志后，才可升版本和封装。

在这五条之前，任何“成熟、闭环、可交付”的说法都是不合格的假完成。
