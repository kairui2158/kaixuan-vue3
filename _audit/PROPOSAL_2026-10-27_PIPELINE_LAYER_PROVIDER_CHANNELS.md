# 生成流水线分层供应商通道 V1.0

## 0. 目标契约

用户原需求：生成流水线各层可分别绑定供应商/API Key，实现设定、卷纲、章节、正文并行生成时使用不同供应商，既获得供应商级并发隔离，又允许每层利用不同供应商的模型能力。

主契约：

1. 新增层通道配置：设定层、卷纲层、章节层、正文层各可绑定一个供应商。
2. 优先级单源：Agent 显式绑定 > 层绑定 > 全局生成供应商。
3. 禁止静默漂移：层绑定已配置但供应商不存在或不可用时，该层请求显式失败，不得回退到其他供应商。
4. 失败隔离：供应商失败只终结当前 run，不污染其他层 run。
5. 老配置兼容：未配置层绑定时保持现有全局生成供应商行为。
6. 观测同批：run configSnapshot、runTrace、DiagLogger 同批记录最终 providerId、providerName、选择来源。
7. 并行骨架不变：不改变 V3.3 的 RunRegistry、目标锁、取消隔离和 provider 调度语义。

## 1. 现状与缺口

| 面 | 现状 | 缺口 |
| --- | --- | --- |
| 配置模型 | 只有 generate/verify/detect 三个全局用途供应商 | 无层绑定字段，无删除清理 |
| 路由 | `aiService.callAi` 已支持请求级 providerId | `providerRouter` 显式 ID 失效会静默回退用途路由 |
| 执行器 | Agent.provider 存在且 UI 可绑定 | `realSkillExecutor.callAiOnce` 未传 providerId，Agent 绑定不真实生效 |
| 调度 | providerScheduler 按 providerId 分槽 | 已满足分层通道的隔离基础 |
| 快照 | `readStepConfigSnapshot` 只含 step 配置 | 不含供应商解析结果 |
| 观测 | trace/DiagLogger 记录 providerId | 不记录选择来源，无法判断 agent/layer/global |
| UI | Agent 设置有绑定供应商下拉 | 无层通道配置区 |

## 2. 任务台账

### 2.1 目标与范围

- 目标：交付可用的四层供应商通道，并修复 Agent 绑定不生效与显式 ID 静默回退两个旧伤。
- 范围：provider store、providerRouter、realSkill 执行链、PipelinePanel 调用链、run 快照、trace/DiagLogger、设置页 UI、测试与验证。
- 非目标：不改变 V3.3 并行调度、不引入供应商自动重选、不做供应商健康检查自动切换。

### 2.2 决策记录

- 层配置存储在 provider store 持久化对象中，键名 `pipelineLayerProviders`。
- 层枚举：`settings | volumes | chapters | body`。
- 配置值：`providerId | null`；`null` 表示跟随全局。
- Agent 显式绑定必须真实传入 callAi，且优先于层绑定。
- 显式 providerId 失效必须抛错，不回退。
- 运行开始时冻结层供应商解析，后续运行中使用冻结值。

### 2.3 执行切片

1. 纯函数与存储：优先级解析器、层配置持久化、删除清理。
2. 执行链：executor/skillRouter 类型与透传、PipelinePanel 单源解析、Agent 绑定真实生效。
3. 观测：configSnapshot、trace 事件、DiagLogger 来源字段。
4. UI：设置页四行层通道选择与缺失警告。
5. 验证：单测、集成、Electron 可见窗口、live 多供应商。

## 3. 技术方案

### 3.1 优先级解析纯函数

新增 `src/services/pipelineProviderChannels.ts`：

- `resolvePipelineProviderChannel(input)` 返回 `{ providerId, source }`。
- source：`agent | layer | global`。
- Agent 配置存在且 provider 存在：返回 agent。
- Agent provider 存在但供应商不存在：返回 agent 并标记 `providerMissing: true`。
- Agent provider 为空且层配置存在：返回 layer；供应商不存在同样标记 missing。
- 层配置为空：返回 global。
- global 不存在：返回 global 且 providerId 为空，由调用侧显式失败。

### 3.2 providerRouter 语义修正

`resolveProvider(store, purpose, providerId)`：

- providerId 非空但找不到供应商：抛错“未找到指定供应商...”。
- providerId 为空：维持现有 purpose/global 路由。
- 不改变 tryResolveProvider 的 UI 非抛错行为，但内部应能携带错误信息。

### 3.3 执行链透传

- `RealSkillAgentContext` 增加 `providerId?: string`。
- `RealSkillExecuteOptions`、`SkillRouteOptions`、`skillRouter` 透传该字段。
- `realSkillExecutor.callAiOnce` 在 `aiService.callAi` 参数中加入 `providerId: agent?.providerId ?? options.providerId`。
- PipelinePanel 在 run 开始时解析层供应商并冻结，随 execution context 传给 `runStepSkills`。

### 3.4 观测

- `configSnapshot.pipelineProviderChannels` 记录四层最终解析。
- trace 新增事件 `pipeline-provider-channel-resolved`。
- DiagLogger 在 ai-service log 中记录 `providerSource`。
- providerQueue 事件照旧，不改变运行中心语义。

## 4. 验证矩阵

1. 优先级单测：agent/layer/global、Agent 失效、层失效、全空回退。
2. 路由单测：显式 ID 不存在抛错；无显式 ID 回退 purpose/global。
3. 存储单测：层配置写入/读取/删除供应商清理。
4. 执行链集成：mock callAi 断言 requestMessages 不变且 providerId 正确。
5. 并行 mock：两 run 不同 providerId，各自 trace 正确，不互相取消。
6. Electron 可见窗口：设置页选择层供应商，UI 显示与配置持久化一致。
7. live 多供应商：至少一次不同 providerId 的真实并发请求，trace 与 DiagLogger 一致。
8. 全量回归：vue-tsc、vitest、并行验收脚本。

## 4.1 作者反证

最可能错的假设：

1. 假设 executor 是唯一漏传点。证伪：`rg "callAi("` 全量对账；对 agentOrchestrator、finalDraftRunner、continuationService 等非流水线主链入口列白名单，不属于本任务范围的明确登记。
2. 假设层绑定不会影响目标锁。证伪：并行 mock + Electron + live 三层验证。
3. 假设供应商并发语义一致。证伪：live 阶段观测每家供应商限流/额度行为，不预设并发上限结论。

## 5. 交付边界

- 本批不实现供应商自动切换、自动重试、跨层任务编排。
- 本批不改变大纲编辑器和主页对话的 provider 选择。
- 发现超出范围的问题登记到 dev log，不顺手修改。

