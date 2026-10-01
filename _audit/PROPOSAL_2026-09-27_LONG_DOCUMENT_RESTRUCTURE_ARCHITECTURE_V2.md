# 长文档重排与整理架构方案 V2（10 万 / 20 万 / 100 万字级）

> 日期：2026-09-27  
> 状态：待用户审核；未修改任何生产代码  
> 成熟度结论：**成熟可执行**。边界、状态机、失败路径和验收证据已落位；外部不确定项只有供应商真实窗口，方案已设计为探测、分段与恢复，不依赖供应商承诺。

## 1. 问题定义

本轮 74,841 字复刻证明，入口路由已能把整篇整理任务送进 EditTask，但进入后系统仍按“普通多批写入”执行，缺少任务级重排协议。四类缺陷互相放大：

1. **协议矛盾**：EditTask 模式禁止 `replace_document`，工具循环 steering 仍要求“整篇重排用 replace_document 提交完整全文”。
2. **计划缺失**：EditTask 有 `planning / plan_ready` 状态，但长文档整理只把工具调用登记成批次，没有先生成“读哪些段、改哪些段、如何验收”的任务计划。
3. **上下文自伤**：供应商把 `contextWindowTokens=128000`、`maxTokens=128000` 配成同一值，应用得到 `availableContextTokens=0`；真实请求却成功跑完 65k 输入，说明模型不是瓶颈，应用把矛盾配置当成了有效计划值。
4. **删除授权过宽**：删除合同只绑定标题目标，`allowAuthorizedDeletion` 对 `content_loss` blanket 放行；模型被结构守卫拦下后改用“只删标题”，正文变成无标题孤儿正文。

这些问题在 10 万、20 万、100 万字下不会自然消失，只会线性放大工具轮次、注意力稀释和状态误报。因此方案目标不是修 74,841 字这一次，而是消除问题源。

## 2. 设计原则

1. **应用不设置 token / 次数预算上限**。唯一物理边界是供应商真实输入窗口；超过窗口由执行计划自动分段，不允许用应用层固定小数字拦任务。
2. **整篇操作必须有确定性计划**。模型负责理解与改写，不负责发明执行结构。分段、顺序、验收、回滚由应用计算。
3. **协议单源**。工具面、steering 文案、允许操作、trace 记录全部消费同一个执行计划对象，禁止一处禁止、另一处鼓励。
4. **授权绑定命令指纹与语义不变量**。用户确认的是原命令批次，不是“允许模型自行扩大删除范围”。
5. **1M 字能力不等于 1M 字单请求**。百万级能力来自“结构索引 + 分段读取 + 分段写入 + 全局一致性校验”，不是把全文塞进一次请求。
6. **观测不制造假象**。物理请求、流式 delta、工具结果都是活性证据，状态看门狗必须消费它们。

## 3. 新架构

### 3.1 LongDocumentExecutionPlanner

新增单源服务 `src/services/longDocumentExecutionPlanner.ts`，合并当前 10,000 / 80,000 两套路由口径。输入文档结构树、document map、用户请求、真实输入窗口和活跃 EditTask 状态；输出显式 `ExecutionPlan`：

```ts
interface LongDocumentExecutionPlan {
  planId: string
  operation: 'restructure' | 'normalize' | 'deduplicate' | 'targeted_edit' | 'rewrite_segments'
  mode: 'direct' | 'edit-task'
  segments: Array<{
    segmentId: string
    range: { startLine: number; endLine: number }
    readStrategy: 'full' | 'slice' | 'outline-plus-slice'
    writeStrategy: 'move' | 'replace_match' | 'rewrite_segment' | 'delete'
    expectedChange: 'none' | 'reorder' | 'normalize' | 'remove_duplicate' | 'rewrite'
  }>
  invariants: LongDocumentInvariant[]
  estimatedPhysicalRequests: number
  progressLabel: string
}
```

关键规则：

- `restructure`、`normalize`、`deduplicate`、大范围 rewrite 一律先计划再执行。
- `targeted_edit` 保留 direct 快路径，但仍写入同一计划对象，trace 统一可见。
- EditTask 必须先 `plan_ready`，再进入 `awaiting_batch`；每批绑定 `segmentId`、预期变更类型和完成判据。
- 段大小不设固定 token 预算，按模型窗口、结构边界、命令原子性动态计算；超过即自动继续分段。

### 3.2 操作专用协议

**全文重排 / 排序**

1. 构建结构快照：标题、层级、首行哈希、子节点区间，不携带全文。
2. 模型输出结构顺序计划，应用校验叶子正文集合不变。
3. 应用把顺序计划转换为 `move` 命令批次，按结构边界执行。
4. 全程不要求模型重写正文，防止内容漂移。

100 万字排序不应该生成 100 万字新文，它本质是结构级操作。这是本方案的核心去险点。

**全文标点 / 格式整理**

1. planner 按结构边界切段。
2. 每段读取原文，让模型输出该段整理版本。
3. 应用做段内 diff，只允许标点、空白、格式类变更；实体、句子集合、标题集合变化即阻断。
4. 每段独立 checkpoint；失败段可重试，未完成段不污染已完成段。

**重复项删除**

1. 本地结构指纹与相似度扫描生成候选，不直接删除。
2. 候选进入删除提案：位置、文本摘要、预期删除范围、孤儿正文处理方式。
3. 用户授权绑定提案命令 hash。
4. 执行时只允许原样重放；模型不得扩大范围，未授权候选不允许顺手删除。

**局部修改 / 删除**

- 局部编辑继续 direct 工具循环。
- 删除标题必须满足：整节删除，或明确重新归属正文，或显式删除标题及其正文。
- “标题减少”不再等于授权成功；孤儿正文不变量失败即阻断并回滚该批次。

### 3.3 上下文计划纠偏

1. `maxOutputTokens >= contextWindowTokens * 0.9` 判定 `provider_configuration_conflict`，不允许产出 `availableContextTokens=0` 参与路由。
2. 输出保留区不能吞掉全部输入窗口；有效输入窗口按降级策略计算：模型能力表真实窗口 → 供应商声明窗口 → `unknown`。
3. trace 区分 `fits / needs_segmentation / exceeds_provider / provider_configuration_conflict`。
4. 真实 API 成功但计划层判 0，必须作为 P0 观测缺陷报警，而不是继续执行自我矛盾计划。

### 3.4 删除授权合同升级

- 命令批次增加 `commandHash`。
- 授权对象保存：命令原文、目标范围、预期删除字符数、孤儿正文处理策略。
- 授权后只允许 hash 一致的原样重放。
- `allowAuthorizedDeletion` 不再 blanket 放行 `content_loss`，只允许“预期删除范围内”的损失。
- 新增 `orphan_body` 校验：用户确认“删除整节”时正文必须随标题删除；确认“仅删标题”时正文必须获得新归属或有明确重组命令。

### 3.5 状态看门狗升级

- run watchdog 增加活性来源：物理请求 running / heartbeat、流式 delta、工具 success / failed、批次状态变化。
- 任一活性证据出现即重置 active 超时计时。
- 全部活性来源静默超过时限才报 stuck。
- trace 区分 `long-request-in-progress`、`awaiting-terminal-merge`、`state-stuck-detected`。长请求在跑、批次在合并、真的卡死，三者不允许共用一个语义。

### 3.6 路由与会话状态

- 本轮“删除游离板块”差异样本进入固定回归语料，标注预期 `edit + edit-task`。
- 会话内长文档任务成立后，“继续 / 下一批 / 授权 / 停止”由活跃 `ExecutionPlan` 接管，不再重新按单句静态分类决定权限。
- 意图分类只决定“是否创建计划”，不覆盖已创建计划的控制语义。
- 新增负样本：讨论既有内容、询问设计目的、请求解释，不允许被计划任务锁死成写入。

## 4. 影响矩阵

| 模块 | 变更 | 风险 | 保护措施 |
|---|---|---|---|
| `longDocumentPolicy.ts` | 收口进 planner，保留兼容导出 | 中 | 先新增再迁移，回归既有阈值测试 |
| `longDocumentExecutionPlanner.ts` | 新服务 | 中 | 操作矩阵与窗口矛盾单测 |
| `editTaskService.ts` | `plan_ready` 真实接入 | 高 | 状态机专项测试 + 终态收敛断言 |
| `editorTools.ts` | `replace_document` 策略由计划对象决定 | 高 | 9,999 / 10,000 / 80,000 边界回归 |
| `aiService.ts` | steering 由计划对象生成 | 高 | 工具循环契约测试 |
| `contextBudget.ts` | 配置矛盾分类 | 中 | 0 窗口与 65k 实测样本回归 |
| `outlineDeletionContract.ts` | hash 授权 + 孤儿正文 | 高 | 授权 / 拒绝 / 二次改写三向测试 |
| `outlineIntegrity.ts` | 授权损失范围化 | 高 | 真实重排放行 + 真实删节阻断 |
| `runTrace.ts` / `stateWatchdog.ts` | 活性心跳接入 | 中 | 15 秒心跳、长请求、无心跳三分测试 |
| `OutlineWorkspace.vue` | 计划创建、UI 进度、授权接线 | 高 | Electron 真实 API 复刻 |

## 5. 实施顺序

**Phase 1：计划器与上下文纠偏**  
新增 planner 类型与纯函数；`contextBudget` 增加配置矛盾分支；单测覆盖操作分类、窗口矛盾、unknown 窗口、计划分段。

**Phase 2：EditTask 真计划接入**  
`plan_ready` 先于批次执行；每批记录 `segmentId / expectedChange / invariantResult`；`replace_document` 与 steering 从同一计划对象取允许操作。

**Phase 3：重排与整理协议**  
结构级 reorder 转 `move` 批次；标点整理分段 rewrite + 段内 diff 守卫；重复项删除提案协议。

**Phase 4：授权与完整性**  
删除合同增加命令 hash；授权范围化 content loss；孤儿正文不变量与回滚。

**Phase 5：观测与路由回归**  
watchdog 活性接入；trace 计划、批次、授权、心跳全量落盘；路由语料加入本轮差异样本。

**Phase 6：长文档压力与真实 UI 验证**  
生成 100k / 200k / 1M 字测试文档；可见 Electron + 真实 API 全操作矩阵；失败注入与恢复验证。

## 6. 验收标准

### 6.1 功能验收

- 10,000 字以下 direct 编辑不劣化。
- 74,841 字真实大纲：排序、标点整理、重复项删除全部收敛。
- 100k / 200k / 1M 字：任务可启动、可见进度、分段执行、最终完整性通过。
- 全文排序后叶子正文集合不变。
- 标点整理后标题集合、实体集合、句子集合不变。
- 授权删除只删用户确认范围；拒绝后全文 hash 不变。
- 删除标题后不存在未处理孤儿正文。
- `provider_configuration_conflict` 不再产生 0 可用上下文并继续路由。
- 长物理请求期间不出现虚假 `state-stuck-detected`。

### 6.2 测试矩阵

| 规模 | 操作 | 必测异常 |
|---|---|---|
| 9,999 / 10,000 | direct vs EditTask 边界 | 阈值漂移 |
| 74,841 | 本轮真实 trace 复刻 | 协议矛盾、授权残留 |
| 100,000 | 重排 + 标点 + 重复项 | 中断恢复 |
| 200,000 | 分段 checkpoint | 段失败、部分应用 |
| 1,000,000 | 结构索引 + 分段流 | 供应商断流、窗口未知 |

每个规模至少覆盖：全文重排、全文标点整理、重复项删除授权、拒绝授权与回滚、局部修改、中断后恢复。

### 6.3 验证方式

- 单元测试：planner、contextBudget、EditTask、deletion contract、integrity、watchdog。
- 集成测试：真实 trace 序列回放，断言工具面、计划、批次、终态。
- 可见 Electron 实测：真实窗口、真实 API、真实文件导入，全程可监督。
- 压力验证：100k / 200k / 1M 字合成大纲；允许长耗时，但每 15 秒必须有可见心跳与 trace 进度。
- 证据落盘：`result.json`、trace 导出、before/after hash、批次 diff、截图或窗口句柄记录。

## 7. 风险与处理

1. **供应商窗口谎报或限流**：planner 不信任单一声明；真实请求失败时降级段大小并保留 checkpoint，已执行段不重复执行。
2. **模型理解错操作范围**：计划与守卫由应用判定；模型输出越权即阻断，不允许模型自行补救改变删除范围。
3. **大文档 UI 卡顿**：执行过程只更新虚拟化视口、批次进度与变更摘要，不同时重绘百万级全文。
4. **修一处坏一处**：每个 Phase 结束执行 M17 回头看：目标对账、影响圈对账、新旧并存扫描、既有测试全量回归、Electron 关键路径复测。未通过不进入下一 Phase。

## 8. 明确不做

- 不新增任何用户可见 token / 次数预算设置。
- 不用固定 80,000 字阈值当能力边界；它只是历史路由口径，统一由 planner 收口。
- 不把 headless / mock 结果冒充真实用户验收。
- 不为通过测试放宽删除守卫或完整性守卫。
- 不允许 steering 与工具面继续分叉。

## 9. 审核点

1. 全文排序采用“结构计划 + move 命令”，不让模型重写全文：是否确认？
2. 标点与格式整理采用分段 rewrite + 段内守卫：是否确认？
3. 删除授权绑定命令 hash，用户确认后禁止模型二次改写范围：是否确认？
4. 1M 字验证采用真实 API + 可见 Electron，耗时可能较长，但全程心跳可见：是否确认？

确认后按 Phase 1 → Phase 6 顺序执行，不跳阶段，不提前封装。
