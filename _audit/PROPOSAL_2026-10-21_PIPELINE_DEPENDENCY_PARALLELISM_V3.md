# 流水线依赖并行能力成熟方案（V3.3，已批准待实施）

> 解封状态：用户已于 2026-10-22 解封 V3，并根据经验文件 v9 完成全方位复审升级为 V3.1；第 12.8 节 4 个决策点已全部批准。同日完成执行器/工具层 20 轮深度推演与链路支持性补充审计，升级为 V3.2；随后按 v9 门禁逐条对账，8 个半接入缺口已一次性并入正文，升级为 V3.3。用户已批准第 13.4 节 D5-D7 全部决策点，本方案现在是唯一执行版本，下一步从 Phase 0 开始。第 0 节仍是唯一方向锚点，第 13.7 节是补充审计并入正文的对账清单；任何阶段不得宣称未经验证的功能完成。

## 0. 核心需求契约（不可协商）

### 0.1 用户原话

> 我们应用现在生成是每次只能做一项操作就是我再生成卷纲的时候，无法同时生成章节，和正文。只能一项一项逐步进行这样就会非常消耗用户大量时间，也无法同时进行其他页面的操作，这对用户来说就是巨大的时间成本浪费，举例卷纲层一次性生成到了第三卷，章节层一二三卷纲都章节都没有生成，正文层更是一篇正文都没有，那么卷纲层在生成第四卷，我是否可以先让章节层先生成前三卷的章节，正文层开始生成已经生成好的章节？

### 0.2 目标契约

V3 的方向由以下 5 条契约单源决定，任何阶段、组件、验证器与本节冲突时，以本节为准：

1. **依赖并行**：卷纲层生成第 4 卷时，章节层可以生成已确认的第 1-3 卷章节；正文层可以生成已经完成的章节正文。
2. **消除串行等待**：用户不得因为卷纲层还在运行，就被迫等待章节层或正文层；页面切换和其他非冲突操作不得被全局生成锁锁死。
3. **进度独立**：并行时每层都有自己的进度条、状态、阶段文字、重试轮次和取消按钮，用户一眼能分清“哪一层在跑、跑到哪里、卡在哪个阶段”。
4. **应用保持可响应**：并行运行不得造成严重延迟、明显卡顿、页面冻结或应用崩溃；响应性、流畅性、稳定性是交付门禁，不是事后优化项。
5. **链路与工具层真实支持**：供应商支持并发只是外层条件；应用链路、工具层、预算账本、trace、断点必须同样支持多 run 并行，且互不串账、互不串线、互不误杀。
6. **防偏移**：所有 Phase、验收矩阵、回滚策略、成熟度结论必须逐项对应本节契约；方案作者与执行者不得把目标改写成“技术上实现了并发”而弱化用户体验契约。

### 0.3 用户疑问逐项回答

| 用户疑问 | V3 答案 | 关键机制 |
|---|---|---|
| 其他层运行时是否同步显示进度条？ | 是。四层各自保留进度条，并行时同时可见 | `RunProgressChannel` + 每 run 进度槽 |
| 进度条会不会乱？ | 按现状直接并行一定会乱；V3 禁止全局进度读写，进度必须绑定 runId | 无 runId 进度事件报错；UI 按 runId 取数 |
| 同步运行会不会严重延迟？ | 有硬预算约束：进度合并刷新 250ms/run，流式日志 500ms/run，点击反馈 <=100ms | 批量合并、按 run 分槽、节流 |
| 会不会卡顿？ | 主线程单任务预算 <=200ms；超过 2s 记为冻结事件；超过预算即验证失败 | rAF 批处理 + freeze watchdog |
| 会不会卡死？ | 每 run 独立 controller、trace、保存事务和错误隔离；一个 run 卡死不得拖死其他 run | per-run cancellation + 超时与卡点观测 |
| 会不会崩溃？ | 崩溃风险来自共享状态覆盖、无界内存、异常冒泡、退出半写。V3 分别设锁、上限、隔离、shutdown 收口 | 目标锁 + 内存上限 + 事务收口 |
| 供应商支持并发，应用链路和工具层支持吗？ | 现状不支持：API 请求函数形态可重入，但全局状态、trace 当前槽、断点共享 key、单例工具预算都会串账串线；V3.2 将其列为主契约第 5 条并在 Phase 0/A/G/J 验收 | RunRegistry + per-run 预算 + trace 显式化 + provider scheduler |

## 1. 用户可见运行机制

### 1.1 三层同时运行的场景

以用户举例的场景为准：

1. 卷纲层正在生成第 4 卷。
2. 章节层选择已确认的第 1 卷或第 2 卷，点击“生成本批章节”或“全量生成章节”。
3. 正文层选择一个已经完成的章节，点击“AI生成正文”。
4. 三个运行同时进入执行状态：
   - 卷纲进度条显示第 4 卷的链式步骤和当前百分比；
   - 章节进度条显示目标卷、当前批次、完成章节数；
   - 正文进度条显示目标章节、链式步骤和流式接收状态；
   - 顶部运行中心显示 3 个运行的总览、耗时、排队原因和各自取消按钮。
5. 取消章节运行后，卷纲和正文继续执行，不受影响。
6. 章节运行成功后，正文层可以继续选择新完成的章节；不会自动抢跑，用户始终是操作主体。

### 1.2 并行单位

并行单位不是按钮，而是：

```text
run = layer + target + dependencyRevision + configSnapshot
```

| 层 | 输入依赖 | 目标锁 | 并行规则 |
|---|---|---|---|
| settings | locked outline | 项目设定命名空间 | 与卷纲/章节/正文可并行 |
| volumes | locked outline + 追加区 | 卷纲追加区 | 同层同目标默认排队；本方案默认每层 1 个 active run |
| chapters | confirmed 卷 | 指定卷章节列表 | 该卷未被卷纲 run 锁定时可运行 |
| body | 已完成章节 | 指定章节正文 | 该章未被章节 run 修改时可运行 |

### 1.3 排队与拒绝

1. 同目标重复启动进入 `queued`，显示排队原因，不静默取消旧运行。
2. 依赖不满足时按钮保持可解释禁用，例如“该卷尚未确认”或“该章节尚未生成”。
3. 同供应商物理请求超过并发上限时进入 provider 队列，显示“等待供应商槽位”。
4. 额度、限流、供应商失败只终结当前 run，不得污染其他 run。
5. 两个 run 同时外呼时，各自携带独立的物理请求安全网与工具轮次预算；任一 run 的预算耗尽只拒绝该 run，不得影响另一个 run 的剩余额度。

## 2. 现状会乱的原因

V2 已经解决了“执行能不能并行”，V3 解决“用户看到的世界会不会乱、会不会卡”。

| 现状 | 证据 | 并行后果 |
|---|---|---|
| 四层进度条都读全局值 | `src/components/pipeline/PipelinePanel.vue:217`、`:352`、`:502`、`:574` 均传入 `pipelineStore.generationProgress` | 第一个 run 改百分比，四层进度条同步乱跳 |
| 全局生成状态 | `src/stores/pipeline.ts:7-12` 只有单个 `isGenerating/generationProgress` | 一个 run 结束会把其他层的“生成中”显示错误清掉 |
| 新 run 先 abort 旧 run | `src/stores/pipeline.ts:21-27` | 第二个运行会直接杀掉第一个运行 |
| trace 启动即废弃旧 run | `src/stores/runTrace.ts:1065-1067` 非 chat `startRun` 会 `abandonRunningRun(source)` | 第二个 pipeline run 启动后，第一个 run 的 trace 被判失败 |
| source 只有单当前槽 | `src/stores/runTrace.ts:899-949` `currentRunIdBySource/currentApiCallIdBySource` | 事件容易写入“最近 run”，不是真实来源 run |
| agent bridge fallback | `src/services/agentTraceBridge.ts:28` `runId || currentRunIdBySource[source]` | 第二个 run 的 agent 事件可能写进第一个 run |
| 风格卡片读当前 run | `src/components/common/StyleProfileCard.vue`（路径已从 pipeline 迁移到 common） | 观测对象随 current 指针漂移 |
| 配置 read-modify-write | `src/stores/pipeline.ts:120-206` 多处读改写共享配置 | 并行启动时配置快照可能互相覆盖 |
| 项目数组整块替换 | `src/stores/project.ts:1000-1007` `setVolumes/setChapters` | 并行提交产物会互相覆盖 |
| 工具运行预算挂在单例“当前值”上 | `src/services/aiService.ts:2278` 单例 `activeToolRunBudget`；`:2459-2465` 保存-替换-恢复 | 两个 run 交错时物理请求安全网串账，后来者改写账本归属 |
| 日志与流式文本直接入响应式数组 | `PipelinePanel.vue:1186` 已有 rAF 使用；`:1346-1349` 日志触发自动滚动 | 三个 run 高频流式同时写一个数组会拖慢主线程 |

结论：V3 不能只在执行层加 registry，必须同时交付进度通道、性能预算和稳定性隔离，否则用户会立刻看到“进度乱跳、页面变卡、状态错乱”。

现状证据的精确锚点（2026-10-22 复核）：四层进度条读全局值的位置为 `PipelinePanel.vue:217/352/502/562`；按钮全局锁为 `:208/:362/:467/:562-563`；目标锁定安全语义为 `:318/:460`。

## 3. RunProgressChannel

### 3.1 数据结构

```ts
type PipelineProgressEvent = {
  runId: string
  percent: number
  phase: 'queued' | 'requesting' | 'streaming' | 'validating' | 'repairing' | 'saving' | 'terminal'
  detail: string
  attempt?: number
  queuedReason?: string
  updatedAt: number
}
```

### 3.2 规则

1. 进度事件必须携带 `runId`；无 `runId` 事件在开发期抛错，生产期写 `progress-migration-error` 事件并丢弃。
2. 只有 `queued/running` 状态的 run 接受进度；终态 run 收到进度事件必须记为异常，不得复活进度条。
3. `percent` 只做 UI 表达，不做执行决策；执行决策仍然由 trace、断点、契约和产物事务决定。
4. 重试时百分比允许回退，但必须显示 `attempt`，例如“修复中（第 2 次）”。
5. UI 禁止读取全局 `generationProgress`；进度条只读取自己 runId 的槽位。
6. 进度通道按 run 合并刷新：250ms 内同一 run 的事件合并为最后一次，不逐帧写响应式状态。

## 4. UI 契约

### 4.1 每层进度条

1. 保留现有 `GenerationProgressBar`，但入参从全局数值改为 `run` 或 `runProgress`。
2. 每层最多绑定 1 个 active run；同层第二个同目标 run 显示为排队卡，不抢占当前进度条。
3. 进度条显示：目标名、阶段、百分比、attempt、耗时、排队原因、独立取消按钮。
4. 生成中不再用全局 `isGenerating` 锁死所有编辑；只锁定被目标锁覆盖的数据。

### 4.2 PipelineRunCenter

新增运行中心，聚合所有 active/queued run：

1. 显示层数、目标、状态、阶段、进度、耗时、供应商队列原因。
2. 每个 run 提供独立取消；提供“取消全部”但要二次确认，避免误触。
3. 点击 run 可跳转到对应层。
4. 运行中心数据来自 registry，不重复维护第二套状态源。

### 4.3 页面切换

1. 用户在流水线运行时可以切换到大纲工作台、主页编辑器等非冲突页面。
2. 运行状态由 registry 持有，不因组件卸载丢失。
3. 回到流水线页时进度、日志、run 列表完整恢复。
4. 与运行目标冲突的编辑操作仍被目标锁拦截，并给出原因。

## 5. 性能与稳定预算（硬门禁）

### 5.1 响应预算

| 指标 | 预算 | 超预算处理 |
|---|---|---|
| run 进度刷新 | 每 run 250ms 合并一次 | 增加合并窗口，禁止逐帧更新 |
| 流式文本/日志 UI 写入 | 每 run 500ms 合并一次 | 通道化批处理，禁止直接推响应式数组 |
| 主线程单任务 | <=200ms | 拆分任务或移到 worker |
| 点击到 UI 反馈 | <=100ms | 按钮先入 queued/running 态，不等模型响应 |
| freeze watchdog | 主线程阻塞 >2s 记录 freeze 事件 | 验证失败，必须定位 |
| provider 并发 | 同供应商默认 2 个物理请求 | 超出排队并显示原因 |
| 层级并发 | 每层默认 1 个 active run，全局最多 3 个运行中 run | 超出排队 |
| run trace 内存 | 单 run 设置流式窗口与累计文本上限 | 超限压缩预览，不丢关键 trace 事件 |
| trace 磁盘 flush | 5s 周期 + 终态立即 flush | 崩溃前现场不得只存在内存 |

### 5.2 卡顿防护

1. 流式接收、日志追加、自动滚动、进度更新全部进入按 run 分槽的合并器。
2. 长文本渲染使用分片与虚拟化，不在单次 tick 渲染三个 run 的全部输出。
3. 自动滚动只在用户位于底部时启用，且按合并窗口节流。
4. 构建性能计数器：long task、合并前后事件量、刷新次数、每帧耗时。

### 5.3 卡死与崩溃防护

1. 每 run 独立 `AbortController`，取消只作用于目标 run。
2. 每 run 独立 trace run、API call、断点 owner、保存事务和错误终态。
3. 单 run 异常不允许冒泡成全局异常；进入 `recoverable_failed` 或 `failed`。
4. 保存失败、trace 写盘失败、观测通道故障都不得伪装成功。
5. 启动期把残留 running run 标为 `interrupted`，不自动判成功或失败。
6. 退出前执行 shutdown 收口：逐 run cancel、写终态、flush trace、保存项目、保留可续跑断点。
7. 内存增长必须有上限和回收策略；连续运行多批次后内存不得无界增长。

## 6. V3 新增 20 轮推论

| 轮 | 推论面 | 结论 |
|---|---|---|
| 1 | 用户目标反推 | 目标不是“并发技术”，而是消除等待并保持应用可操作；响应性是交付门禁 |
| 2 | 进度共享面 | 四层进度条全部读全局值，直接并行必然串线；必须先建 run 进度槽 |
| 3 | 进度事件来源 | 链式、批次、修复、保存都会改进度；必须统一 phase 词表，禁止各层私造语义 |
| 4 | 进度生命周期 | 终态后进度不得复活；retry 允许回退但必须显示 attempt |
| 5 | UI 读数面 | 进度条、运行中心、日志、按钮态都不得读全局 `generationProgress` |
| 6 | 页面切换 | 组件卸载不能丢 run；registry 必须在 store 层持有 run 状态 |
| 7 | 日志爆炸面 | 三个 run 同时流式输出会把主线程打满；必须按 run 合并 500ms |
| 8 | 自动滚动 | 并行时自动滚动互相抢占；只在用户位于底部且当前查看的 run 生效 |
| 9 | 长任务 | Vue 响应式大数组更新会产生 long task；性能计数器必须进验证 |
| 10 | 供应商并发 | 同供应商 2 并发是保守起点；排队原因必须可见，避免用户以为卡死 |
| 11 | 额度与限流 | 供应商软错误只终结当前 run；另一个 run 不得吞错或被连带取消 |
| 12 | 断点并行 | 断点 owner 必须含层和目标；同层不同目标的断点不得覆盖 |
| 13 | 保存事务 | 并行产物提交必须按目标串行；保存失败进入当前 run 的可恢复失败 |
| 14 | 配置漂移 | run 启动冻结配置和风格快照；执行中改配置只影响下一次 |
| 15 | 观测串线 | trace、agent、风格、进度、API call 全部显式 runId，删除 current fallback |
| 16 | 组件卸载与重建 | 用户切页再回来，进度、状态、取消按钮必须一致恢复 |
| 17 | 卡死观测 | 用户此前多次指出“停滞监控不严谨”；freeze watchdog 与卡点事件是硬门禁 |
| 18 | 崩溃恢复 | 残留 run 标 interrupted；断点、项目数据、trace 三面一致才算恢复 |
| 19 | 新旧并存 | 旧全局进度写入、旧全局 abort、current fallback 执行层必须清零 |
| 20 | 验证盲区 | 不能只测 mock 并发；必须测 UI 串线、性能预算、真实 Electron、真实供应商 |

## 7. 执行阶段

V3 保留 V2 的 Phase 0-I，并加入进度、性能、稳定性扩展：

1. **Phase 0 基线与失败测试**：先写红测试，证明全局进度串线、`startRun` auto-abandon、current fallback、配置 RMW、保存合并窗口真实存在；同时钉住四格再入、`quota_exhausted` 无二次物理请求、写队列旧快照覆盖三个 P0 历史事故形态。
2. **Phase A RunContext 与 registry**：交付 run 生命周期、目标锁、配置快照、per-run controller；同时把 `activeToolRunBudget` 从 AiService 单例可变字段改为 per-request/per-run 显式传递，`_rawCall` 只消费自己的预算。
3. **Phase B trace 显式化**：删除运行期 auto-abandon；API wrapper、agent bridge、风格观测、trace 写入显式 runId；trace 新事件同批升级 `schemaVersion`、导出通道、旧数据兼容与验证器白名单。
4. **Phase C 配置与断点事务**：`pipeline_step_config` 串行事务；断点 owner 化；OutlineWorkspace 改用服务 API；每个 owner 写入点补齐同 owner 成功清理路径，成功清理失败进入可恢复失败，不得宣称完成。
5. **Phase D 进度通道与逐层迁移**：新增 `RunProgressChannel`；按 body -> chapters -> volumes -> settings 迁移执行与进度条，每层迁移后旧行为零残留。
6. **Phase E 项目事务**：运行产物按目标提交；保存串行化且队列临界区内读取最新 state 后修改落盘；失败可恢复；targeted 修复优先读取 attempt 生命周期产物。
7. **Phase F 依赖并行 UI**：每层独立进度条、排队原因、目标锁提示、独立取消；运行中心交付。
8. **Phase G provider scheduler**：同供应商并发上限、排队观测、软错误隔离。
9. **Phase H 性能与稳定门禁**：合并器、性能计数器、freeze watchdog、内存上限、退出收口、崩溃恢复。
10. **Phase I 清零与收尾**：删除旧全局进度、旧 abort、current fallback、共享断点、单例工具预算字段；更新经验、DEV_LOG、版本并封装；封装按 G1.12 核验版本、NSIS、asar、真实启动、electronAPI、安装路径与 SHA256，并复核旧产物清理。
11. **Phase J 真实验收**：Electron 可见窗口真实操作 + 内置 key live 验证 + 性能预算报告 + 链路/工具层并发审计报告；发布声明前完成四格再入矩阵与副作用断言面闭环。

## 8. 验证矩阵

### 8.1 正确性

1. 三个 mock run 并行：卷纲第 4 卷、章节第 1-3 卷、正文已完成章节。
2. 各层进度条显示各自百分比，不互相覆盖。
3. 取消章节 run：卷纲和正文继续并完成。
4. 一个 run 额度失败：其他 run 不受影响。
5. 一个 run 保存失败：进入可恢复失败，不污染项目数组。
6. 错误 runId 进度、终态后进度、重复终态、取消后进度全部被拒绝并记录。
7. retry 时百分比回退且 attempt 可见。
8. 两个 run 同时携带各自物理请求安全网：A 的预算耗尽只拒绝 A；B 的剩余额度、已消耗次数、拒绝结果不受影响。
9. 两个 run 同时携带各自工具轮次预算：A 的轮次耗尽不得清空或改写 B 的轮次账本。
10. 每个交付层必须覆盖 `{执行模式} × {新鲜启动 / 断点恢复 / 成功终态后再次进入 / 失败终态后再次进入}` 四格再入矩阵；成功终态后再次进入必须断言发生新的物理请求、输出状态真实变化、旧状态 hash 不再冒充新产物。

### 8.2 性能

1. 合成流式压力测试：3 run 同时输出，验证 250/500ms 合并窗口生效。
2. long task 监控：无任务超过 200ms；超过即失败。
3. freeze watchdog：无超过 2s 的主线程阻塞；发生即失败并定位。
4. 点击反馈：启动三个 run 的点击均在 100ms 内出现状态反馈。
5. 内存：多批次连续运行后内存不无界增长；trace 上限与回收策略生效。

### 8.3 Electron 真实 UI 硬门禁

1. 可见窗口、生产 renderer、隔离 profile，用户可旁观。
2. SKILL/Agent 必须通过真实下拉选择，禁止脚本注入冒充。
3. 使用应用内置供应商 key，不新建 key。
4. 真实点击启动三个 run；切换页面再回来；取消一个 run；确认另两个继续。
5. 验证进度条不串线、按钮不误禁、页面不冻结、取消立即生效。
6. 重启应用后 run 状态、断点、trace、项目数据一致。
7. 至少一条“成功终态后再次进入”的真实用户路径：新 run 发起新物理请求，上一有效产物保持不变，runId 更新，旧产物未被覆盖或冒充。

### 8.4 live 供应商

1. 至少一次三层同时活跃的真实供应商请求。
2. 至少一次供应商队列观测：同 provider 超并发时显示排队且其他 run 正常。
3. 至少一次额度/限流隔离：当前 run 进入 `quota_exhausted` 终态，其他 run 不被污染、不被连带取消。
   - 覆盖纯文本响应、SSE data、正文自然出现额度词三种软错误形态；
   - 断言命中后该 run 无第二次物理请求，错误事件挂在该 run 的 trace；
   - 供应商软错误使用 `failed/quota_exhausted` 语义，禁止伪装成 `canceled`。
4. 真实耗时记录：并行总耗时必须显著低于串行完成同类目标的耗时。
5. 至少一次真实并发下的预算隔离观测：两个 run 的物理请求数、工具轮次数、trace API call 记录各自闭环。

### 8.5 负向断言

1. 执行层无全局 `generationProgress` 写入。
2. UI 层四层进度条无全局进度读数。
3. 执行层无 `currentRunId/currentApiCallId` fallback。
4. `startRun` 无运行期 auto-abandon。
5. 无共享章节断点、无无 owner 断点、无旧全局 abort 路径。
6. AiService 实例无 `activeToolRunBudget` 单例可变字段；预算只能通过调用参数显式传递。
7. 配置与项目保存队列外不存在“先读快照、临界区内合并旧快照”的写入；断点无 owner 清理路径与无 attempt 产物来源的定点修复均为 0。

## 9. 回滚与降级

1. Phase A-C 不改变用户行为，可独立回滚。
2. Phase D 按层回滚；每层迁移前保留可运行提交。
3. Phase F 开关只允许降级为“全局排队”，禁止回退到旧全局 abort。
4. Phase H 性能门禁不通过时，不开放并行；只能先修性能或降低并发上限。
5. 任何阶段出现旧路径 fallback，立即停止并按 G0.10 处理。

## 10. G0.6 成熟度结论

- **应用方案/交互闭环**：成熟。目标契约、运行机制、进度独立、性能预算、稳定隔离、崩溃恢复、验证矩阵、防偏移规则已闭环。
- **执行器/工具层**：半成熟。trace 已具备 run 结构，但全局进度、current fallback、auto-abandon、共享状态仍是实现断点；放行条件是 Phase 0-A 完成。
- **实现接线**：未开始。本轮只新增 V3 方案与台账，无生产代码改动。
- **验证标准**：成熟。正确性、性能、Electron 真实 UI、live、负向断言、重启一致性均已定义；V3.3 并入四格再入矩阵、`quota_exhausted` 软错误语义、写队列临界区、trace schema 同步、预算执行计划派生、断点/attempt 生命周期、副作用断言面与发布级封装核验。

## 11. 审核决策点

1. **方案替代**：批准 V3 替代 V2 作为唯一执行方案；V2 的 registry/RunContext 内容并入 V3，不再双轨。
2. **进度形态**：每层保留独立进度条，并新增运行中心聚合所有 active/queued run。
3. **性能预算**：进度 250ms/run、日志 500ms/run、主任务 200ms、点击反馈 100ms、freeze 2s 作为硬门禁。
4. **并发上限**：每层 1 个 active run、全局 3 个、同供应商 2 个物理请求；超限排队并显示原因。
5. **观测降级**：如果性能预算在真实机器上仍不达标，优先降并发和刷新频率，不降低“应用可响应”的用户契约。

## 12. 2026-10-22 解封复审（V3.1）

### 12.1 复审方法

本节按 v9 经验文件执行：G0.1 对齐第 0 节原始契约；G0.3 区分方案与实现；G0.7 做正反推；G1.15 按症状层、链路层、组件组合层、机制层递进；G1.17 做作者反证；G1.19 要求性能决策先建观测；G1.20 要求预算与回放锚点单源；G0.10/G0.11/G0.12 约束后续实施与验证。本轮复审只读源码与最新 DEV_LOG，未修改生产代码。

### 12.2 证据对账

| V3 原判断 | 当前状态 | 当前证据 |
|---|---|---|
| 四层进度条读全局进度 | 仍然成立 | `src/components/pipeline/PipelinePanel.vue:217/352/502/574` 仍读 `pipelineStore.generationProgress` |
| 全局生成状态与单 controller | 仍然成立 | `src/stores/pipeline.ts:7-10` 仍是单个 `isGenerating/generationProgress/generationAbortController`；`:21-27` 新 run 仍先 abort 旧 controller |
| trace 启动废弃旧 run | 仍然成立 | `src/stores/runTrace.ts:1134-1136` 非 chat `startRun` 仍调用 `abandonRunningRun(source)` |
| source 单当前槽与 current fallback | 仍然成立 | `src/stores/runTrace.ts:914-965`、`src/services/agentTraceBridge.ts:28` |
| 配置 read-modify-write | 仍然成立 | `src/stores/pipeline.ts:120-206` 多个入口仍是 storageRead、修改、storageWrite 的非事务写 |
| 项目数组整块替换 | 仍然成立 | `src/stores/project.ts:1000-1007` `setVolumes/setChapters` 仍是整块替换 |
| 风格卡片路径 | 证据漂移 | 当前为 `src/components/common/StyleProfileCard.vue:547-548`；V3 中的 `src/components/pipeline/StyleProfileCard.vue` 已不存在 |
| 断点 owner 隔离 | 已补强 | `src/services/chainBreakpoint.ts:82-99` owner 不匹配按 fresh run；已完成链返回 `completedChain`，不再静默回放旧产物 |
| 章节断点共享槽 | 仍是显式例外 | `src/stores/pipeline.ts:69-71` `kind === 'chapters'` 仍走共享槽；这是设计内例外，不是待删除旧语义 |
| 正文候选与反馈审计 | 已补强但不解决并行 | `src/services/realSkillExecutor.ts:826/1246-1299` 有 per-attempt 候选账本；`src/stores/runTrace.ts:1017-1023` 反馈审计按 runId 存取 |
| provider 调度 | 仍未实现 | `src/services` 未命中 provider 并发队列、槽位或调度器实现 |
| 进度通道与冻结观测 | 仍未实现 | 全仓无 `RunProgressChannel`、run 级进度槽、PerformanceObserver long task 或 freeze watchdog |

### 12.3 G1.15 四层递进推理

1. **症状层**：用户看到的不是“缺少并发技术”，而是三层被同一个 `isGenerating` 锁死。卷纲运行时章节与正文按钮全部禁用；即使绕过 UI 启动第二个 run，也会触发旧 controller abort 与 trace abandon。
2. **链路层**：启动入口 -> `pipelineStore.startGeneration()` -> 全局 controller/progress -> `runTrace.startRun()` 单 source 当前槽 -> API call/current run 指针 -> `GenerationProgressBar` 全局读数。任何一环都还没有 runId 归属。
3. **组件组合层**：断点 owner、候选账本、反馈审计这些单点修复都成立，但它们组合后仍共享全局进度、全局生成锁、单当前 run 指针与整块项目写入。局部 runId 收口不能抵消全局槽串线，这是“单看正常、组合打架”的典型形态。
4. **机制层**：旧架构把“应用同一时刻只能有一个生成”内化成状态模型，而不是依赖规则。V3 的 RunContext、registry、目标锁不是附加功能，而是把执行权从全局布尔值改成“层 + 目标 + 依赖版本”的机制替换。

### 12.4 解封后新增缺口

1. **验证器也消费全局进度**：13 个 `scripts/verify-*-electron.mjs` 仍读取 `pipeline?.generationProgress`。按 G0.10/G1.5，进度通道迁移必须同批迁移验证器断言与采集器，否则会出现产品已切新语义、验证器仍守护旧全局态的假绿或假红。
2. **性能预算仍是假设**：250ms/500ms/200ms/100ms/2s 未在真实机器并行场景采样。按 G1.19，Phase 0 必须先采集只读耗时账本与 UI 响应基线，再确认或收紧预算，禁止先写性能代码。
3. **章节共享断点需要目标锁解释**：并行时章节批次的共享槽必须显式绑定当前目标锁，否则用户切换目标后可能消费错误批次进度。它不是要删除的旧状态，而是要被 RunContext 解释的显式例外。
4. **设置层并行写面未对账**：V3 允许 settings 与其他层并行，但项目保存仍是共享 `saveProject()` 与整块替换。实施前必须补 settings/volumes/chapters/body 的写键矩阵，确认不会在并行提交时互相覆盖。
5. **运行中心不能复制第二套状态源**：运行中心只消费 registry；任何在 UI 内维护 run 清单副本的方案都会复发状态分叉。

### 12.5 V3.1 修正后的执行顺序

1. **Phase 0**：先写红测试钉住全局进度串线、auto-abandon、current fallback、配置 RMW、整块替换；同时采集当前真实机器的单 run 只读性能基线。
2. **Phase A**：交付 RunContext、registry、目标锁、配置快照与 per-run controller。
3. **Phase B**：trace 显式化，运行期删除 auto-abandon 与 current fallback；正文反馈审计作为 runId 单源样例，不作为完成证明。
4. **Phase C**：收窄为目标锁接入断点、章节共享槽显式例外、配置串行事务；owner 隔离与 completedChain 防御已存在，不重复实现。
5. **Phase D**：进度通道迁移覆盖 UI、验证器、trace 事件三层，13 个验证脚本的进度断言同批迁移。
6. **Phase E**：项目写入按目标事务提交，先补写键矩阵与并行提交回归。
7. **Phase F-G**：交付运行中心与 provider scheduler；并发上限先保守，live 后按观测调整。
8. **Phase H**：真实 Electron 并行压测验证预算；预算不达标时降并发或刷新频率，不降低用户契约。
9. **Phase I-J**：清零旧全局态、真实 UI 与内置 key live 验收、重启一致性、性能报告。

### 12.6 作者反证

1. **假设：每层 1 个 active run 已满足用户目标。** 证伪：用户若需要同层不同卷/不同章节并行，按第 0.2 节“消除串行等待”扩展目标锁，而不是用架构理由拒绝。
2. **假设：合并刷新足以保证流畅。** 证伪：3 run 合成流式压测中仍出现超过 200ms long task 或超过 2s freeze 时，继续拆分渲染与更新，不能只加大节流。
3. **假设：provider 2 并发安全。** 证伪：live 出现限流放大、额度误伤或队列饿死时，按观测调整，不得拍脑袋加并发。
4. **假设：registry 能消除串线。** 证伪：错误 runId、终态后事件、取消后事件、页面切换恢复、二次进入、成功终态后再进入必须全部红绿双向验证。

### 12.7 成熟度复审

| 层面 | V3 结论 | V3.1 复审 |
|---|---|---|
| 应用方案/交互闭环 | 成熟 | 保留成熟，补入验证器迁移、写键矩阵、共享断点例外、性能观测前置 |
| 执行器/工具层 | 半成熟 | 仍为半成熟：断点与正文审计已补强，registry、进度通道、provider scheduler、项目事务仍缺；成熟化路径已收敛为第 12.9 节可验收交付清单，禁止用文档措辞直接升级 |
| 实现接线 | 未开始 | 未开始；本轮只做解封复审，无生产代码改动 |
| 验证标准 | 成熟 | 结构成熟；性能预算数值仍是待采样假设，Electron 并行与 live 未执行 |

### 12.8 新增审核决策点

1. **已批准（2026-10-22）**：批准 V3.1 修正版作为唯一执行方案，并在批准后先执行 Phase 0 红测试与性能基线。
2. **已批准（2026-10-22）**：接受章节批次共享槽作为“目标锁内显式例外”，而不是删除后重做章节断点。
3. **已批准（2026-10-22）**：接受 Phase 0 先做只读性能采样，再确认或收紧 250ms/500ms/200ms/100ms/2s 预算。
4. **已批准（2026-10-22）**：接受设置层并行先做写键矩阵审计；矩阵不清晰前，settings 只与无写冲突的目标并行。

### 12.9 执行器/工具层成熟化包

本节回应“执行器/工具层仍为半成熟，能否推进至成熟”。结论：**可以推进，但不能通过改写成熟度结论推进；必须通过下列交付物与验收门关闭。** 在 Phase 0-A 完成前，该层只能保持“半成熟”；Phase 0-A 完成并通过红绿测试后，才允许升级为“成熟”。

#### 12.9.1 RunContext

**交付物**

1. `RunContext` 类型：`runId + layer + target + dependencyRevision + configSnapshot`。
2. 每层生成入口创建独立 `RunContext`，禁止复用全局 `isGenerating/generationProgress`。
3. 每个 `RunContext` 独立持有 `AbortController`、trace run、断点 owner、进度槽和错误终态。

**验收门**

1. 同时创建卷纲、章节、正文三个 mock run，三者互不覆盖、互不取消、互不污染 trace。
2. 取消其中一个 run，其余两个继续执行。
3. 重复终态、错误 runId、终态后事件、取消后事件全部被拒绝并记录。
4. `RunContext` 写入/读取/清理/终态语义四行生命周期对账表齐全。
5. 两个 run 同时调用 `aiService.callAi`，各自传入独立 `toolRunBudget`；两个 run 的预算读数、扣减、拒绝互不可见。

#### 12.9.2 RunRegistry

**交付物**

1. `RunRegistry` 管理所有 active/queued/terminal run。
2. 每层最多 1 个 active run，全局最多 3 个，超限进入排队并显示原因。
3. 页面切换不丢失 run 状态；组件卸载不销毁 registry。

**验收门**

1. 三个 run 同时运行，切换页面再回来，进度、状态、取消按钮一致恢复。
2. 同层第二个同目标 run 进入 queued，不抢占、不静默取消旧 run。
3. 运行中心只消费 registry，不维护第二套状态源。

#### 12.9.3 目标锁

**交付物**

1. `RunTargetLock` 按层和目标加锁。
2. settings/volumes/chapters/body 四层的锁粒度和依赖版本明确。
3. settings 写键矩阵通过审计后，才允许 settings 与其他层并行。

**验收门**

1. 卷纲 run 锁定第 4 卷时，章节层无法修改第 4 卷，但可以生成已确认的第 1-3 卷章节。
2. 章节层生成第 1 卷章节时，正文层可以生成已完成的其他章节。
3. 目标锁冲突的编辑操作给出可解释禁用原因。

#### 12.9.4 Trace 显式化

**交付物**

1. `runTrace.startRun()` 不再在非 chat 场景 auto-abandon 旧 run。
2. `agentTraceBridge` 删除 `currentRunIdBySource` fallback，事件归属必须显式 `runId`。
3. API call、进度、日志、风格观测、断点、候选账本全部绑定 `runId`。

**验收门**

1. 两个 pipeline run 同时活跃，trace 事件不串线。
2. `startRun` 不再自动废弃旧 run。
3. `currentRunIdBySource` fallback 命中为 0。
4. 13 个 Electron 验证脚本的进度断言同批迁移。
5. runId/进度/终态新事件的 `schemaVersion`、导出通道、旧数据兼容测试与验证器白名单同批升级，且验证器完整重跑通过。

#### 12.9.5 配置事务

**交付物**

1. `pipeline_step_config` 写入串行化。
2. 每个 run 启动时冻结配置快照，执行中改配置只影响下一次。
3. 不再存在多个入口各自 read-modify-write。
4. 写队列临界区内读取最新 state 后修改并落盘，禁止队列外快照回灌。

**验收门**

1. 并行启动多个 run 时，配置写入不互相覆盖。
2. 同一 run 执行期间配置变更不影响该 run 的行为。
3. 配置写入队列有失败终态，不吞错。
4. 并发追加回归证明：两个写操作交错后，两处新增均保留，无旧快照覆盖。

#### 12.9.6 进度通道

**交付物**

1. `RunProgressChannel` 只接受携带 `runId` 的进度事件。
2. 每个 run 独立进度槽，按 250ms/run 合并刷新。
3. UI 不再读取全局 `generationProgress`。

**验收门**

1. 四层进度条不串线，各自显示各自 run 的百分比。
2. 终态 run 收到进度事件报错，不复活进度条。
3. retry 时进度可回退，但 attempt 可见。
4. 全局进度读数在生产 UI 中命中为 0。

#### 12.9.7 性能与稳定性观测

**交付物**

1. long task 计数器、freeze watchdog、点击反馈计时器。
2. 流式日志与流式文本按 run 合并写入。
3. 单 run trace 内存上限与磁盘 flush 策略。

**验收门**

1. 3 run 合成流式压测无超过 200ms long task、无超过 2s freeze。
2. 点击启动三个 run，均在 100ms 内出现 UI 反馈。
3. 多批次连续运行后内存不无界增长。
4. 崩溃前 trace 不只存在内存。

#### 12.9.8 Provider 调度与预算隔离

**交付物**

1. provider scheduler 按供应商槽位排队物理请求，排队原因进入运行中心。
2. 物理请求安全网与工具轮次预算由 run 显式持有，随请求传递，禁止单例“当前预算”。
3. 额度、限流、预算耗尽只终结当前 run；供应商额度类软错误统一转 `quota_exhausted` 终态。
4. run 的工具预算、物理请求预算与验证器预算从同一份真实执行计划派生；运行中只允许一个 live 预算实例，禁止 snapshot/live 双实例。
5. 断点写入点必须存在同 owner 成功清理路径；成功清理失败不得宣称完成；targeted 修复优先读取 attempt 生命周期产物，缺失时显式降级并写 trace。

**验收门**

1. 同供应商并发上限生效，超出请求排队且可见。
2. 并发预算隔离红绿测试通过：A 耗尽不影响 B。
3. 纯文本、SSE、正文自然出现额度词三种软错误形态均只终结当前 run；该 run 无第二次物理请求；事件挂在该 runId 的 trace；其他 run 不被污染、不被连带取消。
4. 保存/写入失败副作用断言面显式化：新 run 不得覆盖上一有效产物，编辑器/项目中的上一有效产物保持不变，且 runId 已更新。
5. 断点清理与 attempt 产物对账通过：写入列、读取列、清理列同键闭环，成功终态后再次进入不降级、不缺产物、不整链重跑。

#### 12.9.9 成熟度推进规则

| 阶段 | 完成前状态 | 允许升级为成熟的条件 |
|---|---|---|
| RunContext + RunRegistry | 半成熟 | 12.9.1/12.9.2 全部交付并通过验收门 |
| 目标锁 + 配置事务 | 半成熟 | 12.9.3/12.9.5 全部交付并通过验收门 |
| Trace + 进度通道 | 半成熟 | 12.9.4/12.9.6 全部交付并通过验收门 |
| 性能与稳定性观测 | 半成熟 | 12.9.7 全部交付并通过验收门 |
| Provider 调度与预算隔离 | 半成熟 | 12.9.8 全部交付并通过验收门 |

因此，执行器/工具层在本节补齐后状态仍为“半成熟”，但其半成熟性已经从“概念不完整”升级为“待实现的可验收交付清单”。Phase 0-A 完成后，允许将本层升级为“成熟”；在此之前，任何文档层面的“成熟”声明均视为假闭环。

## 13. 2026-10-22 执行器/工具层 20 轮深度推演（V3.2，待审核）

### 13.1 推演依据

用户原话：

> 你的执行器，工具层推进过程有没有吸取经验教训和开发日志？ 以前我们做的组件经常有纠缠打架现象，你必须诚实吸取教训来推进，你进行20轮次的深度推进，然后把方案升级后给我审核

本轮只读源码与审计文档，不修改生产代码。教训来源为经验文件 `_audit/神意开发经验总结_v9.md` 的 G0.3（方案与实现分离）、G0.10（新旧方案不共存）、G1.9（状态机终态收敛）、G1.15（组件组合层互相干扰）、G1.17（作者自盲区与副作用断言面）、G1.19（性能决策先建观测）、G1.20（预算与回放锚点单源）、G2.9（断点与 attempt 生命周期），以及 DEV_LOG 中的历史事故链：预览状态机纠缠、断点生命周期错位、降级越权、双预算实例、runId 单源盲区、验证器旧锚点。

### 13.2 20 轮推演表

| 轮 | 主题 | 吸取的教训 | 源码证据 | 收口方案 |
|---|---|---|---|---|
| 1 | 全局生成锁 | G1.15：组件组合层互相干扰，单个组件看似正常，组合后互相覆盖 | `src/stores/pipeline.ts:7-27` 全局 `isGenerating/generationProgress/generationAbortController` | RunContext + RunRegistry 取代全局三元组 |
| 2 | 字符串状态冒充状态机 | G1.9：状态必须有终态收敛与事件落账 | `src/stores/pipeline.ts:30-57` 以字符串判断状态，`canceled` 时静默 return | run 状态显式枚举，终态事件必须写入 trace |
| 3 | 新 run 静默杀旧 run | G1.17：副作用必须有断言面，不能只看主流程 | `src/stores/pipeline.ts:21-27` `startGeneration` 先 abort 旧 controller | 禁止隐式 abort；新 run 只能创建，不能终止旧 run |
| 4 | trace auto-abandon | runId 单源事故：旧 run 被后来者判失败 | `src/stores/runTrace.ts:1134-1136` 非 chat `startRun` 调 `abandonRunningRun(source)` | `startRun` 不再废弃旧 run；abandon 只能由显式 owner 动作触发 |
| 5 | bridge current fallback | 事件归属隐式回落等于串线入口 | `src/services/agentTraceBridge.ts:28` `runId || currentRunIdBySource` | 事件必须显式携带 runId；fallback 命中为 0 |
| 6 | trace current/last 双回落 | G1.20：单源被两个读取路径绕开 | `src/stores/runTrace.ts:2397-2405` current 与 last 双回落 | trace 消费 registry 单源，不再自维护当前槽 |
| 7 | 断点 owner 隔离 | G2.9：断点生命周期已有事故，不推倒已修复资产 | `src/services/chainBreakpoint.ts:82-99` owner 隔离与 `completedChain` 防御已补强 | 保留现有补强，纳入 registry 统一注册，不重做 |
| 8 | 章节共享断点槽 | 显式例外不登记会变成下一个隐式约定 | `src/stores/pipeline.ts:69-72` chapters 共享槽 | 作为目标锁内显式例外写入方案与验收门 |
| 9 | 无 owner 断点隐式回落 | 隐式回落会掩盖配置错误 | `src/stores/pipeline.ts:69-72` 无 owner 时回落共享 key | 无 owner 断点读取直接失败并告警，不做回落 |
| 10 | 配置 read-modify-write | 并发写同 key 是典型组合干扰 | `src/stores/pipeline.ts:120-206` 四个配置入口 RMW 同一 key，catch 后只 `console.warn` | 配置事务队列串行写入，失败必须进入终态并落账 |
| 11 | 项目整块替换 | 半写与覆盖窗口是崩溃源 | `src/stores/project.ts:1000-1008` `setVolumes/setChapters` 整块替换后异步保存 | 项目事务与依赖版本化写入，run 期间项目写入按目标锁隔离 |
| 12 | 进度事件无 runId | 进度串线是用户最直接可见的乱象 | `src/stores/pipeline.ts:30-57` `updateProgress/finishGeneration/failGeneration` 均无 runId | RunProgressChannel 只接受带 runId 事件 |
| 13 | canceled 吞终态 | G1.9：终态被吞等于状态机黑洞 | `src/stores/pipeline.ts:30-57` canceled 分支静默 return | 终态事件无论成败都必须落 trace，UI 按 runId 收敛 |
| 14 | 取消无目标归属 | 全局取消会误杀其他 run | 全局单 `generationAbortController` | 运行中心提供 run 级取消按钮，controller 归 RunContext |
| 15 | UI 全局锁 | 全局锁让“并行”退化为排队界面 | `src/components/pipeline/PipelinePanel.vue:208/362-363/467-468/562-563` 四层入口读全局 `isGenerating` | 按目标锁与依赖状态禁用，同层非冲突目标可启动 |
| 16 | 目标锁定安全语义 | 删除锁会造成写入漂移，预览状态机教训的镜像 | `src/components/pipeline/PipelinePanel.vue:318/460` 已有生成中锁定目标 | 保留锁定语义，只把锁从全局改为目标级 |
| 17 | 验证器旧进度断言 | 旧断言会在新语义下反向拦住正确实现 | 13 个 `scripts/verify-*-electron.mjs` 仍读 `pipeline?.generationProgress` | Phase D 硬门禁：验证器同批迁移，禁止新旧断言共存 |
| 18 | provider 无并发调度 | 物理请求不受控会放大限流与额度事故 | `src/components/pipeline/PipelinePanel.vue:2941-3049` 直接 `aiService.callAi` | provider scheduler 按供应商槽位排队，失败只终结当前 run |
| 19 | 单 run 测试冒充并行验证 | G1.17：验证器盲区会制造假闭环 | 现有验证多为单 run 顺序执行 | 并行验收必须同时活跃 run >= 2，并断言互不污染 |
| 20 | registry 单源 | G1.20：运行视图多源必然漂移 | 现状进度、trace、断点、运行中心各读各的 | RunRegistry 成为唯一运行事实源，所有视图只消费 registry |

### 13.3 V3.2 对第 12.9 节成熟化包的强化

1. Phase 0-A 红测试清单固定覆盖第 13.2 节 R3、R5、R6、R10、R11、R17 六个历史事故形态。
   - V3.3 追加 P0 形态：R13 终态后再次进入（四格再入矩阵）、R11 额度软错误（`quota_exhausted` 无二次请求）、R18 保存失败（断言面：上一有效产物保持不变 + runId 更新）。
2. run 状态显式枚举纳入 RunContext 首批交付，不再允许生产代码新增字符串状态判断。
3. 取消能力 run 级化，全局取消入口在并行语义上线后删除。
4. 无 owner 断点从隐式回落共享 key 改为显式失败；章节共享槽是唯一登记过的例外。
5. 13 个 Electron 验证脚本迁移为 Phase D 完成门禁，未迁移则 Phase D 不得判通过。
6. 并行验收标准固定为“至少 2 个 run 同时活跃且互不污染”，单 run 顺序测试不得冒充并行验证。
7. 运行中心、trace、进度、断点、配置事务全部改为 RunRegistry 消费者，禁止旁路读取。
8. `activeToolRunBudget` 单例字段删除是 Phase I 清零项；调用方必须显式传预算，未传预算的调用在开发期报错。

### 13.4 新增审核决策点（已批准）

| 编号 | 决策点 | 建议 |
|---|---|---|
| D5 | 是否批准运行中心提供 run 级取消按钮，并在并行语义上线后移除全局取消入口 | **已批准（2026-10-22，用户批示：全部采纳是）**。取消必须只影响用户可见的那个 run，否则并行信任会被一次误杀摧毁 |
| D6 | 是否批准以显式 run 状态枚举替换字符串状态判断，并作为 Phase A 首批交付 | **已批准（2026-10-22，用户批示：全部采纳是）**。这是终态收敛、canceled 吞事件、trace 落账的共同根修 |
| D7 | 是否批准保留“生成中锁定目标”的安全语义，仅把锁粒度从全局改为目标级 | **已批准（2026-10-22，用户批示：全部采纳是）**。目标锁防的是同目标写入漂移，不是防并行；不能因为追求并行删掉安全语义 |

### 13.5 V3.2 成熟度复审

1. 执行器/工具层在 V3.2 后仍为“半成熟”；本轮没有生产代码改动，成熟度结论不变。
2. V3.2 的价值是把 20 个历史干扰形态映射到第 12.9 节交付物与验收门，防止实施时重演旧事故。
3. 成熟度升级唯一路径仍是 Phase 0-A 红绿测试；文档层面的成熟声明一律视为假闭环。
4. V3.1 已批准方向不变；V3.2 待用户审核。批准后按 G0.10 以 V3.2 为唯一执行版本，V3.1 章节作为历史复审记录保留，不再单独执行。

### 13.5.1 V3.3 门禁对账并入（2026-10-22）

用户批准后，V3.2 门禁逐条对账发现的 8 个半接入缺口已一次性并入正文，本节为唯一并入对账表：

| 门禁缺口 | 级别 | 并入位置 | 验收形态 |
|---|---|---|---|
| G1.17 四格再入矩阵 | P0 | 8.1 第 10 条、8.3 第 7 条、13.3 第 1 条、Phase 0 | 四格全覆盖；成功终态后再次进入断言新物理请求、新产物、旧 hash 不冒充 |
| G2.11 `quota_exhausted` 软错误语义 | P0 | 8.4 第 3 条、12.9.8、Phase G | 三种返回形态、无第二次物理请求、runId trace 归属、其他 run 不污染 |
| G2.8 写队列临界区读新值 | P0 | 7 Phase C/E、12.9.5、8.5 第 7 条 | 临界区内读最新 state；并发追加回归两处新增均保留 |
| G1.8 trace schema 同步 | P1 | 7 Phase B、12.9.4 第 5 条 | schemaVersion、导出通道、旧数据兼容、验证器白名单同批升级并完整重跑 |
| G1.20 预算执行计划派生 | P1 | 12.9.8 交付物第 4 条 | 工具/物理请求/验证器预算同源派生；禁止 snapshot/live 双实例 |
| G2.9 断点与 attempt 生命周期 | P1 | 7 Phase C/E、12.9.8 交付物第 5 条、8.5 第 7 条 | 同 owner 清理路径；清理失败不得宣称完成；targeted 优先 attempt 产物 |
| G1.17 保存失败副作用断言面 | P1 | 8.3 第 7 条、12.9.8 验收门第 4 条 | 断言“新 run 未覆盖上一有效产物 + runId 更新”，而不是只断言非空 |
| G1.12/G1.13 发布级封装核验 | P2 | 7 Phase I/J、10 验证标准 | NSIS/asar/真实启动/electronAPI/SHA256、旧产物清理复核、可见窗口真实 UI |

### 13.5.2 V3.3 成熟度复审

1. 执行器/工具层仍为“半成熟”；本轮只做方案并入，无生产代码改动，成熟度结论不变。
2. V3.3 的增量是把 8 个半接入缺口从“口头吸收”推进为“可验收门禁”，避免实施时只在触发链路修表面。
3. 成熟度升级唯一路径仍是 Phase 0-A 红绿测试；文档层面的成熟声明一律视为假闭环。
4. V3.1 已批准方向不变；V3.3 的 D5-D7 已全部批准。按 G0.10，V3.3 是唯一执行版本，V3.1/V3.2 章节作为历史复审记录保留，不再单独执行。

### 13.6 链路支持性补充审计（2026-10-22）

本节回答“供应商支持并发时，应用链路和工具层是否支持”。结论：**链路的函数调用形态具备并发潜力，但当前共享状态实现不支持安全并行。**

| 层 | 结论 | 证据 | 说明 |
|---|---|---|---|
| API 请求层 | 有潜力，未达安全并行 | `src/services/aiService.ts:2489-2513` 每次 `callAi` 的消息、工具循环、预算引用均为调用局部变量 | 物理请求本身可重入，`fetch`/AbortController 按请求创建 |
| 工具运行预算 | 不支持并行 | `src/services/aiService.ts:2278` 单例 `activeToolRunBudget`；`:2459-2465` 以保存-替换-恢复管理 | 两个 run 交错时，预算账本归属被后来者改写，物理请求安全网串账 |
| 链式执行器 | 有潜力，被入口锁死 | `src/components/pipeline/PipelinePanel.vue:2941-3049` 调用局部变量为主 | 函数可重入，但四层入口被全局 `isGenerating` 阻止第二个 run |
| trace 工具桥 | 不支持并行 | `src/services/agentTraceBridge.ts:28` current fallback；`src/stores/runTrace.ts:1136` auto-abandon | 事件归属隐式回落，新 run 会废弃旧 run |
| 断点层 | 部分支持 | `src/services/chainBreakpoint.ts:84-99` owner 校验已补强；`src/stores/pipeline.ts:69-72` 无 owner 回落共享 key | owner 断点安全；无 owner 与 chapters 共享槽仍会串 |
| 全局运行状态 | 不支持并行 | `src/stores/pipeline.ts:7-57` 单 `isGenerating`、单 controller、canceled 吞终态 | 第二个 run 会杀第一个 run，终态互相覆盖 |

**新增实施要求**：

1. Phase A 必须把 `activeToolRunBudget` 从 AiService 单例可变字段改为 per-request/per-run 显式传递；`_rawCall` 只消费自己的预算，不读取单例“当前值”。
2. Phase 0-A 红测试追加并发预算场景：两个 run 同时携带各自预算，互相不得看到对方的剩余额度、已消耗次数或拒绝结果。
3. provider scheduler 落地前，并行验收不得声明通过，因为当前应用对同供应商物理请求无排队与隔离。

### 13.7 补充审计并入正文对账清单（2026-10-22）

本节回应“重新更新方案文件，诚实保证不偏移主需求，并且把补充的和追加的都补充完善，坚决不遗漏”。第 13.6 节的链路结论不是附录结论，已按主需求并入正文；本表是唯一对账清单：

| 补充审计结论 | 并入位置 | 主需求对应 |
|---|---|---|
| 供应商支持不等于应用支持 | 0.2 目标契约第 5 条、0.3 疑问表 | 防止把“供应商并发”误当“用户可并行” |
| `activeToolRunBudget` 串账 | 2 现状风险、7 Phase A、8.1 正确性、8.4 live、8.5 负向断言、12.9.1、12.9.8、13.3 第 8 条 | 保证两个 run 的安全网互不污染 |
| trace current fallback / auto-abandon | 0.3、2、7 Phase B、8.5、12.9.4 | 进度独立与观测不串线 |
| 全局 isGenerating / 单 controller | 0.3、2、7 Phase A/F/I、8.5、12.9.1 | 消除串行等待与误杀 |
| 无 owner 断点回落共享 key | 2、7 Phase C、8.5、13.2 R9 | 防断点串目标 |
| provider 无并发调度 | 0.3、1.3、5.1、7 Phase G、8.4、12.9.8 | 供应商队列可见、软错误隔离 |
| 链式执行器函数可重入但入口锁死 | 13.6 保留审计记录 | 不推倒重写执行器，只拆共享状态 |
| 20 轮历史干扰形态 | 13.2、13.3、Phase 0-A 红测试清单 | 防止实施时重演组件打架 |
| 四格再入矩阵 / 软错误语义 / 临界区 / schema / 预算派生 / attempt 生命周期 / 副作用断言面 / 发布核验 | 13.5.1 并入对账表 | 防止写入面补齐但同步面、再入面、收尾面继续留旧语义 |

**防偏移规则**：

1. 本文件所有 Phase、验收门、成熟度结论，必须能回指第 0.2 节 6 条契约；无法回指的内容不得进入执行清单。
2. “链式执行器函数可重入”只说明不需要推倒重写执行器；不构成并行能力证明，证明只能来自 Phase J。
3. 第 13.6/13.7 节是审计与对账记录；如与正文冲突，以正文和第 0 节为准，并立即修订对账表。
