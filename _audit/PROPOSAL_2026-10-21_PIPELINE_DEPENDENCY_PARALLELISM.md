# 流水线依赖并行能力成熟方案（V1，待审核）

## 0. 结论

方向成立：应用不是数据依赖上不能并行，而是执行状态、trace、断点、持久化、UI 反馈五条线都被“全局单运行模型”绑死了。直接放开按钮会把三层互相取消、互相写错 trace、互相覆盖章节与卷纲数据。

正确路线是三步走：先落“运行注册表”底座，再逐层迁移，最后才开放依赖并行。每阶段都有失败测试、回滚点和 Electron 真实 UI 门禁；不允许旧全局路径与新并行路径并存。

## 1. 20 轮研磨总表

| 轮 | 风险面 | 证据 | 研磨结论 |
|---|---|---|---|
| 1 | 用户目标反推 | 用户场景：卷纲到第三卷，章节可先跑前三卷，正文可跑已生成章节 | 并行单元是“层 + 目标”，不是“任意点击”；同一目标默认唯一运行 |
| 2 | 全局取消器 | `pipeline.ts:21-27` 新运行先 abort 旧控制器 | 必须改为 per-run controller；旧接口禁止再触发跨运行 abort |
| 3 | 全局状态 | `pipeline.ts:7-13` 单 `isGenerating/progress/status/breakpoint` | 新增 RunRecord，字段含 runId、layer、target、controller、progress、status、traceRunId、ownerKey、feedback |
| 4 | UI 反馈槽 | `PipelinePanel.vue:921`、`:1016` | `activeGenerationFeedbackStep` 与 `skillStepStates` 改为 runId map；旧字段只做兼容展示或删除 |
| 5 | 终态收敛 | `pipeline.ts:37-58` 全局终态 | 每运行 success/failed/canceled 三态；registry、UI、trace 三方必须同终态；失败不得伪装 canceled |
| 6 | trace 单槽 | `runTrace.ts:899-1104` | pipeline source 内新增按 runId 的显式路由；`currentRunId` 在并行路径禁止作为 fallback |
| 7 | API 包装 | `PipelinePanel.vue:2986` | `callApiWithAgentVariant` 必须接收 `runContext`，内部不允许 `currentRunId` / 全局 signal 回退 |
| 8 | SKILL 中立 | G2.13 | SKILL 只影响 guidance；调度、权限、执行协议由 registry 与应用层单源决定 |
| 9 | chain 断点 | `chainBreakpoint.ts:79-104` | owner 隔离保留，但 ownerKey 必须由 RunRecord 单源生成并记录 |
| 10 | 章节断点 | `PipelinePanel.vue:4391/4420/4576` | 共享 `pipeline_breakpoint` 迁移为显式 owner；旧共享槽一次性迁移，迁移后旧 key 读取必须失败或清空 |
| 11 | 断点生命周期 | G2.9 | 每个断点输出写入/读取/清理/终态四行对账；成功清理失败进入可恢复失败 |
| 12 | 目标快照 | `PipelinePanel.vue:1622-1625`、`:4619-4625` | 启动即冻结 projectId/volumeId/chapterId/目标字数；执行中 UI 选择变化不影响运行 |
| 13 | 依赖与目标锁 | confirmed 卷、已生成章节 | 章节运行锁卷；正文运行锁章；卷纲运行锁卷数据追加区；同目标冲突排队或拒绝，跨目标可并行 |
| 14 | 持久化 | `project.ts:766-847` | 保存改严格串行链；每次运行侧数据变更后追加保存任务，不允许合并窗口丢 dirty |
| 15 | 数据提交 | `project.ts:1000-1007` | 运行产物通过按目标的事务函数提交；禁止直接整块覆盖共享数组 |
| 16 | 供应商 | `aiService.ts` 现无全局并发闸 | 新增 provider scheduler，默认并发 2；限流/额度软错误按运行终态处理，不污染其他运行 |
| 17 | 运行观测 | run trace / 流式状态 / 日志数组 | 全部按 runId 分流；导出时每条事件可回溯 runId 与目标 |
| 18 | 新旧并存 | G0.10 | registry 生效后，旧全局 start/cancel/signal 调用必须显式报错或迁移完成；禁止静默兼容 |
| 19 | 验证矩阵 | G1.5/G1.13/G1.17 | 单测 + 集成 + Electron 真实 UI + live key；必须包含证伪用例，不以“事件存在”当通过 |
| 20 | 回滚 | 分阶段交付 | 每个 Phase 独立可回滚；任何 Phase 失败停在可运行状态，不允许半迁移状态宣称完成 |

## 2. 架构设计

### 2.1 运行注册表

新建 `src/services/pipelineRunRegistry.ts`（名字可在实现时按仓库惯例调整）：

```ts
type PipelineLayer = 'settings' | 'volumes' | 'chapters' | 'body'
type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'canceled'

type PipelineRunRecord = {
  runId: string
  layer: PipelineLayer
  mode: string
  projectId: string
  target: {
    volumeId?: string
    chapterId?: string
    volumeName?: string
    chapterTitle?: string
    targetWords?: number
  }
  controller: AbortController
  status: RunStatus
  progress: number
  statusText: string
  traceRunId: string
  breakpointOwnerKey: string
  createdAt: string
  terminalAt?: string
  error?: string
}
```

职责：

1. 创建运行：生成 runId、traceRunId、断点 owner、controller。
2. 目标锁：`volume:<projectId>:<volumeId>`、`chapter:<projectId>:<chapterId>`；同锁冲突默认排队。
3. 生命周期：queued/running/success/failed/canceled，终态记录 terminalAt 与原因。
4. 查询面：UI 从 registry 取每层运行状态、进度、取消按钮可用性。
5. 防御：registry 开启后，无 runId 的执行调用直接抛迁移错误。

### 2.2 依赖门

- 卷纲：可运行条件为 outline locked；运行目标锁为卷数据追加区；运行中禁止删除/重排已有 confirmed 卷。
- 章节：只允许选择 `confirmed === true` 且未被卷纲运行占用的卷；运行锁该卷。
- 正文：只允许选择已存在章节，且该章未被章节批次或另一个正文运行占用；运行锁该章。
- 每层默认最多一个 active run；后续可配置，但 V1 不开放同层多运行。
- 供应商并发默认 2：超出时不启动模型请求，运行保持 queued，并在 UI 显示排队原因。

### 2.3 状态迁移

当前 `pipeline.ts` 全局状态不再作为执行事实源，迁移为 registry 的兼容视图：

- Phase A：registry 并存但 UI 仍显示全局行为；全局 `isGenerating = registry.activeCount > 0`。
- Phase B-D：逐层改为 per-run 状态；已迁移层禁止读取全局 progress/status。
- Phase E：删除旧执行语义，全局字段仅保留兼容展示或彻底移除。

## 3. 分阶段执行步骤

### Phase 0：基线与失败测试（不改用户行为）

1. 建立当前行为的失败测试：
   - 两个入口同时启动时，第二个会 abort 第一个。
   - `currentRunId` 被新运行替换。
   - 章节断点使用共享 key。
   - 保存队列并发窗口。
2. 录制基线 trace 与耗时，不作为性能优化依据，只作为行为对账。
3. 验收：新增测试全部先红；现有全量测试仍绿。

### Phase A：运行注册表底座

1. 新建 registry 服务与类型。
2. 单测覆盖：创建、目标锁冲突、排队、取消、失败、成功、终态收敛、清理。
3. 接入全局 store 作为只读投影，不改变按钮行为。
4. 验收：现有用户路径行为不变；registry 单测通过；旧全局状态不再直接承载新语义。

### Phase B：trace 与信号显式化

1. `useAiCallTrace` 保持本地 runId，不读取全局 current。
2. `callApiWithAgentVariant` 增加 runContext 参数；删除 `currentRunId` 和全局 signal fallback。
3. `runStepSkills` 全链路传递 runContext。
4. trace 事件全部显式 runId；新增并行冲突测试。
5. 验收：单运行行为与 Phase A 完全一致；两个 trace wrapper 并行时事件互不串线。

### Phase C：断点 owner 化

1. chain 断点 ownerKey 由 RunRecord 单源生成。
2. 章节断点迁移为 `chapters:<projectId>:<volumeId>:<mode>` owner。
3. 写入/读取/清理/终态四行对账表进入测试。
4. 旧共享 `pipeline_breakpoint` 一次性迁移；迁移后无 owner 读取路径必须报错。
5. 验收：断点恢复、成功清理、失败恢复、成功后二次进入四矩阵通过。

### Phase D：逐层迁移执行入口

建议顺序：正文 → 章节 → 卷纲。正文已有目标快照，风险最小；卷纲会改卷列表，放最后。

正文：
1. `genBody` 启动时冻结目标快照并注册 run。
2. 取消、进度、trace、断点、流式状态全部走 run。
3. 章节数据写入走按章提交函数。

章节：
1. `genChapters` 冻结卷快照与批次计划。
2. 断点按 owner 保存/恢复。
3. `setChapters` 改为按卷串行提交。
4. 批次中间取消/失败保留断点并可续跑。

卷纲：
1. `genVolumes` 冻结大纲版本与既有卷快照。
2. 新卷追加走事务提交，禁止整块覆盖他运行可能消费的卷数据。
3. 卷确认与章节依赖门联动。

每层验收：该层 per-run 生效，其余层仍全局锁；单层行为与迁移前一致；取消一个运行不影响另一个 mock 运行。

### Phase E：持久化串行化

1. `saveProject` 改为严格串行保存链：新任务永远排在当前保存后。
2. 运行侧数据变更必须 await 保存结果或登记保存失败终态。
3. 失败保存不得静默；运行成功但保存失败必须进入可恢复失败。
4. 验收：并发变更压力测试下最终磁盘内容等于最后一次变更；无丢失 dirty。

### Phase F：依赖并行开放与 UI

1. 按钮禁用逻辑从全局 `isGenerating` 改为目标锁 + 依赖门。
2. 每层显示独立运行条：目标、进度、排队原因、取消按钮。
3. 同目标重复点击进入排队或明确提示，不允许静默 abort。
4. 运行记录按 runId 分流展示。
5. 验收：卷纲第 4 卷运行时，可对第 1-3 卷已确认卷启动章节；章节已有输出时，可对已完成章节启动正文。

### Phase G：供应商并发调度

1. 全局 provider scheduler，默认 maxConcurrent=2。
2. 超出并发的请求排队，运行状态显示 queued/provider_wait。
3. 限流与额度软错误只终结当前 run。
4. 验收：并发请求计数不超上限；一个 run 额度失败不取消另一个 run。

### Phase H：收尾

1. 删除旧全局执行路径残留。
2. 更新经验文件与 DEV_LOG。
3. 版本升级、封装、工作区清理。

## 4. 验证方案

### 4.1 单元测试

- registry：创建、锁、排队、取消、成功、失败、终态、清理。
- trace：两个 pipeline run 并行，事件与 apiCall 不串线。
- breakpoint：chain owner、章节 owner、恢复、清理、二次进入。
- persistence：并发保存链、失败保存、最终一致性。
- scheduler：并发上限、限流、额度软错误隔离。

### 4.2 集成测试（mock provider）

1. 卷纲运行 + 章节 mock 运行并行：互不 abort，trace 分离。
2. 取消正文：章节运行继续。
3. 章节失败：卷纲与正文继续，失败 run 终态正确。
4. 同目标二次启动：排队或拒绝，不静默取消原运行。
5. 保存失败：运行进入可恢复失败，不显示成功。

### 4.3 Electron 真实 UI（硬门禁）

使用生产 renderer、隔离 profile、可见窗口、应用内置供应商 key：

1. 真实点击启动卷纲。
2. 卷纲运行中，真实点击已确认卷的章节生成。
3. 章节产出后，真实点击该章正文生成。
4. 三个运行同时活跃：断言互不取消、进度独立、运行记录独立。
5. 取消其中一个：另两个继续并完成。
6. 重启应用：卷、章、正文、断点、trace 状态一致。
7. 证据：截图、trace JSON、请求账本、registry snapshot、PID 与 runtime fingerprint。

### 4.4 live 供应商验证

- 使用应用内已配置供应商 key。
- 至少一次三层同时活跃的真实请求验证。
- 供应商限流或额度错误按当前 run 终态处理，不影响其他 run。
- 若 key 额度耗尽，保留失败现场并登记未验证面，不得用 mock 冒充 live。

## 5. 回滚策略

- Phase A-C 均为底座，不改用户可见行为，可直接保留或回滚。
- Phase D 按层独立回滚；每层迁移前保留该层上一个可运行提交。
- Phase F 开关在 registry 中保留 `parallelPipelineEnabled`，但关闭时不得恢复旧全局 abort 语义，只能回退到“全局排队”模式。
- 任何阶段发现旧路径 fallback，立即停止并按 G0.10 处理。

## 6. 成熟度结论（G0.6）

- 执行器/工具层：半成熟。trace wrapper 具备多实例能力，但 API 包装、signal、trace fallback 未迁移，断点与持久化存在明确缺口。
- 应用方案/交互闭环：成熟。目标锁、依赖门、per-run 状态、UI 多运行条的职责已闭环。
- 实现接线：未开始。必须按 Phase 0-H 顺序执行，禁止跳到直接放开按钮。
- 验证标准：成熟。单测、集成、Electron、live、终态与证据要求已定义；尚未执行。

## 7. 审核请求

请审核三个决策点：

1. 是否批准按 Phase 0-H 顺序执行。
2. 是否接受 V1 约束：每层最多一个 active run、供应商并发默认 2。
3. 是否接受章节断点共享槽一次性迁移为 owner 槽。
