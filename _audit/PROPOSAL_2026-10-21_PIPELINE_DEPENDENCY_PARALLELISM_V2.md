# 流水线依赖并行能力成熟方案（V2，待审核）

## 0. 结论

V1 判断“全局单运行模型是第一阻断点”仍然成立，但 V1 只覆盖了流水线面板内部的执行面。V2 复查后确认：并行化不是加一个 registry 就能安全开放，而是要把全应用的执行观测、取消信号、断点、配置、持久化和退出恢复从“当前唯一运行”迁移为“显式运行上下文”。

V2 的核心契约是：

1. **执行事实源**：`PipelineRunRegistry` 持有每个运行的 controller、trace runId、API call 上下文、断点 owner、目标锁、配置快照和终态。
2. **显式路由**：所有 trace、agent、风格卡片、API 包装、进度和取消操作必须携带 `RunContext`；`currentRunId`、`currentApiCallId`、全局 signal 只能作为 UI 展示指针，禁止作为执行路由 fallback。
3. **依赖并行**：并行单位不是按钮，而是“层 + 目标 + 依赖版本”。卷纲运行锁卷纲追加区，章节运行锁 confirmed 卷，正文运行锁已生成章节；同目标冲突排队，跨目标可并行。
4. **产物事务**：运行产物不直接整块替换共享数组；通过按目标的事务提交，串行化运行侧写入，并等待持久化结果。
5. **供应商调度**：同一供应商默认最多 2 个并发物理请求，超出排队；限流和额度软错误只终结当前 run，不允许污染其他 run。

本方案是 V1 的升级版，不是推翻。V1 的 Phase 0-H 保留，但 V2 扩展为覆盖 trace 启动语义、OutlineWorkspace 共享状态、配置快照、项目保存语义、崩溃恢复、退出收口和全应用观测契约。

## 1. 20 轮全应用渗透推论

| 轮 | 推论面 | 证据 | 反推与结论 |
|---|---|---|---|
| 1 | 用户目标反推 | 用户目标：卷纲生成第 4 卷时，章节层可先跑第 1-3 卷，正文层可跑已完成章节 | 可并行的是“依赖已稳定的下游目标”，不是任意并发；每层默认一个 active run，后续可配置，但 V2 不开放同层多 run |
| 2 | 全局取消器 | `src/stores/pipeline.ts:21-27` 新 run 先 abort 旧 controller | 取消必须 per-run；旧 `startGeneration()` 的“先取消上一个”是最高优先级阻断，迁移后无 runId 调用必须报迁移错误 |
| 3 | 全局状态模型 | `pipeline.ts:7-12` 单 `isGenerating/progress/status/breakpoint/chapterProgress` | 状态从全局字段迁到 RunRecord；全局字段只做兼容投影，禁止执行层继续写它 |
| 4 | trace 启动即废弃旧 run | `src/stores/runTrace.ts:1065-1067` 非 chat `startRun` 会 `abandonRunningRun(source)`；`956-986` 会把旧 run 和 API call 全部标 failed | 这是比 V1 更深的阻断：第二个流水线 run 一启动，第一个 run 的 trace 会被自动判失败。V2 改为启动期 stale reconciliation，运行期允许多 active run |
| 5 | trace 当前槽 | `runTrace.ts:899-919`、`:935-949` 有 `currentRunIdBySource/currentApiCallIdBySource` 单槽 | `current*` 只能作为展示指针；执行写入必须显式 runId 和 apiCallId；pipeline source 内多 active run 必须全部可用 |
| 6 | API 包装 fallback | `PipelinePanel.vue:2986` signal fallback 到全局 controller；大量事件写 `currentRunId` | `callApiWithAgentVariant` 必须强制接收 `RunContext`；无上下文调用在开发期抛错，生产返回迁移错误事件 |
| 7 | agent 观测 fallback | `src/services/agentTraceBridge.ts:28` `runId || currentRunIdBySource[source]` | bridge 必须绑定 runId；fallback 删除。否则第二个 run 的 agent 事件会写入第一个 run |
| 8 | 风格卡片观测 | `StyleProfileCard.vue:547-548` 按 host 读取 current run；`:562` isolated import run | 风格导入和运行内风格观测必须显式传 runId；风格内容在 run 启动时快照，执行中修改风格不得改变当前 run |
| 9 | 大纲工作台共享流水线状态 | `OutlineWorkspace.vue:3307` 附近直接读写 pipeline store 断点与 `pipeline_step_config` | OutlineWorkspace 不是流水线 UI 的旁观者，而是共享状态写入者；V2 必须先迁配置/断点服务，再开放并行 |
| 10 | 配置 read-modify-write | `pipeline.ts:120-206` 多个 set/update 都是 read、merge、write；PipelinePanel 和 OutlineWorkspace 也直接写同一 key | `pipeline_step_config` 有丢更新窗口。V2 引入配置事务服务：串行队列、revision、actor、reason；运行启动时冻结配置快照 |
| 11 | 断点槽位 | `pipeline.ts:67-118` chain owner key 与共享 `pipeline_breakpoint` 并存；章节断点仍共享 | 断点 owner 由 RunRecord 单源生成；旧共享槽一次性迁移；写入/读取/清理/终态四行对账，成功终态后拒绝消费 |
| 12 | 目标与配置漂移 | V1 已冻结 volume/chapter 目标，但没有冻结 SKILL/Agent/mode/style 配置 | RunRecord 增加 `configSnapshot` 与 `styleSnapshot`；执行中 UI 改配置只影响下一次 run |
| 13 | 依赖图与数据锁 | confirmed 卷是章节输入；章节是正文输入；卷纲运行会追加卷 | 章节只消费 confirmed 且未被卷纲 run 锁定的卷；正文只消费未被章节 run 修改的章节；同目标冲突排队 |
| 14 | 项目保存合并窗口 | `project.ts:766-847` `saveProject` 合并写盘；`:826-847` 只保留一个 queue promise | 运行侧不能依赖该语义。V2 把 `saveProject` 变为事务服务入口；运行产物走严格串行事务，并等待保存结果 |
| 15 | 数据整块替换 | `project.ts:1000-1007` `setVolumes/setChapters` 直接替换数组 | 并行 run 若各自替换会覆盖对方。V2 改为按目标的 commit 函数，内部带 revision 校验和冲突拒绝 |
| 16 | UI 锁面 | PipelinePanel 多处按钮用全局 `isGenerating` 禁用 | 按钮禁用改为依赖门 + 目标锁 + registry 状态；用户能看到“排队原因/被哪个 run 锁定”，而不是全局灰掉 |
| 17 | 供应商与额度 | `aiService.ts:1135-1185` 有额度软错误识别；`:4119` 有 429/502/503 重试，但无全局并发闸 | 新增 provider scheduler；软错误按 run 终态化，不允许另一个 run 吞掉或放大；重试消耗计入当前 run |
| 18 | 全应用执行任务模型 | `activeExecutionTaskStore` 已有 main/outline 活动任务，但不覆盖 pipeline | 不复用为 pipeline registry；复用其“显式 task、版本收口、stale 拒绝”思想，新增 pipeline 专用 registry，避免编辑域和生成域语义混写 |
| 19 | 生命周期与退出 | `ExitConfirmModal.vue:73/108` 只保存项目；`App.vue:326` 只报告 integrity；main 进程 quit 只处理窗口状态 | 退出前必须执行 run 收口：取消 active run、落终态、flush trace、保存项目、保留断点；崩溃后启动期 reconcile 为 interrupted，不自动伪装失败或成功 |
| 20 | 新旧并存与验证盲区 | G0.10/G0.11/G1.17：旧路径清零、真实 UI 禁冒充、验证默认证伪 | Phase 收尾必须负向断言：无 owner 调用、无 current fallback、无共享断点执行路径；Electron 可见窗口真实点击 + 内置 key + SKILL 界面选择，禁止注入冒充 |

## 2. V2 新增架构契约

### 2.1 RunContext

所有执行链路传递同一个不可变上下文对象：

```ts
type PipelineRunContext = {
  runId: string
  traceRunId: string
  apiCallId?: string
  signal: AbortSignal
  layer: 'settings' | 'volumes' | 'chapters' | 'body'
  ownerKey: string
  target: {
    projectId: string
    volumeId?: string
    chapterId?: string
    volumeName?: string
    chapterTitle?: string
    dependencyRevision?: string
  }
  configSnapshot: {
    agentId?: string
    skillIds: string[]
    mode: 'chain' | 'compose'
    skillAgents: Record<string, string>
  }
  styleSnapshot?: Record<string, unknown>
}
```

规则：

1. `RunContext` 由 registry 创建，执行函数不得自行重建。
2. API 包装、trace、agent bridge、progress、breakpoint、persistence 只能读取 context。
3. `apiCallId` 由 API wrapper 显式传入，禁止从 `currentApiCallIdBySource` 兜底。

### 2.2 PipelineRunRegistry

职责：

1. 创建 run：生成 runId、traceRunId、ownerKey、controller、config/style snapshot。
2. 目标锁：`project:<projectId>:volume:<volumeId>`、`project:<projectId>:chapter:<chapterId>`；同锁默认排队。
3. 生命周期：`queued / running / success / failed / canceled / interrupted`；终态写 `terminalAt` 与 reason。
4. 观测面：每层运行条读取 registry，而不是全局 `isGenerating`。
5. 防御：registry 启用后，无 RunContext 的执行调用直接返回迁移错误。

### 2.3 trace 与 API call

1. `startRun` 删除运行期 `abandonRunningRun` 行为。
2. 新增启动期 `reconcileStaleRuns()`：应用启动时把上次残留 running run 标为 `interrupted`，并写明原因。
3. `currentRunIdBySource` 只表示“最近启动/最近查看”的 UI 指针。
4. 所有事件写入、API call 更新、agent snapshot、风格观测显式携带 runId/apiCallId。
5. 并行时 trace 断言：两个 pipeline run 的 events/apiCalls 不串线，取消一个不影响另一个。

### 2.4 配置与断点

1. 新建 pipeline config service：
   - 串行队列处理所有 `pipeline_step_config` 写入。
   - 每次写入带 actor、reason、revision。
   - UI 读取得到稳定快照；run 启动时复制快照。
2. 断点：
   - chain owner 由 RunRecord 单源生成。
   - 章节断点迁为 `chapters:<projectId>:<volumeId>:<mode>` owner。
   - 写入、读取、清理、终态四行进入测试。
   - 成功终态后再次进入必须产生新请求；旧断点 hash 不得冒充新产物。

### 2.5 持久化事务

1. `saveProject` 变成项目事务服务的入口，而不是独立合并函数。
2. 运行产物通过 `commitPipelineArtifact()` 提交：
   - 校验目标仍存在、revision 未变；
   - 只更新目标命名空间；
   - 追加保存任务并等待结果；
   - 保存失败进入 run 的可恢复失败，不得显示成功。
3. UI 高频编辑可保留 coalescing，但必须走同一事务服务的 coalesce 模式，测试口径同步更新。

### 2.6 依赖与锁

| 层 | 输入依赖 | 目标锁 | 可并行条件 |
|---|---|---|---|
| settings | locked outline | 项目设定命名空间 | 大纲未变更或已快照 |
| volumes | locked outline | 卷纲追加区 | 不允许另一个卷纲 run 同时追加 |
| chapters | confirmed 卷 | 指定卷章节列表 | 该卷未被卷纲 run 占用 |
| body | 已存在章节 | 指定章节正文 | 该章未被章节 run 修改 |

同目标默认排队；同层默认最多一个 active run；全局 provider 并发默认 2。

### 2.7 退出与崩溃恢复

1. 退出前执行 `shutdownActiveRuns()`：
   - 逐 run cancel；
   - 写 run 终态和 trace 终态；
   - 保留可续跑断点；
   - flush trace；
   - 保存项目并检查保存失败。
2. 启动时 `reconcileStaleRuns()` 把残留 running 标为 `interrupted`，UI 显示可恢复卡片。
3. 终态必须接入 `stateTransitionGuard`，禁止 failed/canceled 互冒充。

## 3. 执行阶段

### Phase 0：基线与失败测试

先写红测试，不改行为：

1. 第二个 pipeline run 启动会废弃第一个 run trace。
2. `callApiWithAgentVariant` 在 runId/apiCallId 缺失时仍会 fallback。
3. OutlineWorkspace 与 PipelinePanel 并发写配置会丢更新。
4. 章节断点共享槽被两个目标覆盖。
5. 并发保存存在合并窗口。

### Phase A：RunContext 与 registry

交付 registry、RunContext、目标锁、生命周期、配置快照；现有用户行为不变。

### Phase B：trace 显式化

删除运行期 auto-abandon，迁移 API wrapper、agent bridge、风格观测和 trace 写入；并行冲突测试必须绿。

### Phase C：配置与断点事务

迁 `pipeline_step_config` 到配置服务；断点 owner 化；OutlineWorkspace 改用服务 API。

### Phase D：逐层迁移

顺序：body → chapters → volumes → settings。每层迁移后，其余层保持全局锁，单层行为必须与迁移前一致。

### Phase E：项目事务

运行产物按目标提交；保存串行化；失败可恢复；UI 编辑与运行写入走同一事务服务。

### Phase F：依赖并行 UI

多运行条、排队原因、目标锁提示、独立取消按钮；同目标重复点击明确排队，不允许静默 abort。

### Phase G：provider scheduler

按 provider 限并发；排队状态可观测；429/额度只影响当前 run。

### Phase H：退出与恢复

shutdown 收口、startup reconciliation、断点恢复、二次进入矩阵。

### Phase I：清零与收尾

删除旧执行路径、旧 fallback、旧共享槽；更新经验文件、DEV_LOG、版本、封装。

## 4. 验证矩阵

1. 单测：registry、RunContext、trace、断点、配置事务、项目事务、scheduler。
2. 集成：三个 mock run 并行、取消一个、失败一个、额度失败、保存失败、崩溃重启。
3. Electron 真实 UI 硬门禁：
   - 可见窗口、生产 renderer、隔离 profile；
   - SKILL/Agent 用真实下拉选择，禁止注入；
   - 使用应用内置供应商 key；
   - 真实点击启动卷纲、章节、正文三个 run；
   - 取消其中一个，另两个继续；
   - 重启后 run、断点、trace、项目数据一致。
4. live 供应商：至少一次三层同时活跃真实请求；额度耗尽时保留失败现场，不用 mock 冒充。
5. 负向断言：`currentRunId` fallback、无 owner 断点、共享章节断点、旧全局 abort 路径在执行层命中 0。

## 5. 回滚策略

1. Phase A-C 不改变用户可见行为，可独立回滚。
2. Phase D 按层回滚；每层迁移前保留可运行提交。
3. Phase F 开关只允许回退为“全局排队”，禁止回退到旧全局 abort 语义。
4. 任何阶段出现旧路径 fallback，立即停止并按 G0.10 处理。

## 6. G0.6 成熟度

- 执行器/工具层：半成熟。trace wrapper 具备多 run 基础，但 `startRun` auto-abandon、current 槽 fallback、断点共享、配置 RMW、保存合并仍是明确断点。
- 应用方案/交互闭环：成熟。目标锁、RunContext、依赖门、配置快照、项目事务、退出恢复、UI 多运行条已闭环。
- 实现接线：未开始。必须按 Phase 0-I 执行。
- 验证标准：成熟。单测、集成、Electron、live、负向断言、二次进入矩阵已定义。

## 7. 审核决策点

1. 是否批准 V2 替代 V1 作为执行方案，并按 Phase 0-I 顺序推进。
2. 是否接受约束：每层默认一个 active run、同目标排队、provider 并发默认 2。
3. 是否接受 `startRun` 运行期 auto-abandon 删除，改为启动期 stale reconciliation。
4. 是否接受 `pipeline_step_config` 与项目运行产物写入迁入事务服务。
5. 是否接受退出前逐 run 收口，并把崩溃残留定义为 `interrupted` 而不是 failed。
