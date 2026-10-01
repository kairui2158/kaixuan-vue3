# EditTask 系统性成熟化方案 V1

日期：2026-09-22  
前置调研：`_audit/RESEARCH_2026-09-22_EDIT_TASK_MATURITY.md`  
事故样本：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20260922-180424-deep/run-trace.json`

## 方案成熟度

**方案成熟度：成熟。**

分层结论：

| 层级 | 成熟度 | 说明 |
|---|---|---|
| 执行器/工具层 | 成熟 | EditTask 状态机、分批执行器、锚点协议、checkpoint、终态均有明确数据结构和失败路径 |
| 应用方案/交互闭环 | 成熟 | 跨轮恢复、部分失败呈现、继续/回滚/放弃、权限边界均已闭环 |
| 实现接线 | 成熟 | 逐阶段列出生产入口、迁移点、旧逻辑清理点，不允许新旧并存 |
| 验证标准 | 成熟 | 覆盖单测、状态机测试、trace 对账、DiagLogger 对账、Electron 真实 UI 多轮高强度实测 |

证据来源：60 个真实仓库源码调研、应用源码行级反查、09-22 事故 trace 原始数据。当前代码尚未实现本方案，实施前不得声称功能已成熟。

## 目标

把 API 直写从“单轮工具调用”升级为“跨轮、可恢复、可审计的编辑任务系统”，解决四类事故：

1. 用户追问活动任务时被路由为 discuss，工具面剥掉写入能力，模型声明无权限。
2. 长文重排一次性提交巨大批次，锚点失败后反复重试，最终部分写入但无正文。
3. 部分写入成功被折叠成 `edit_retry_empty_response`，用户与 SKILL 都无法判断真实状态。
4. runTrace 用最后一轮快照合成运行终态，掩盖任务真实生命周期。

## 非目标

1. 不放宽 M9 权限门：discuss 仍只读，不因活动任务存在而自动获得写入权。
2. 不引入模型凭记忆直写：所有写入仍必须通过 `editor.write` 的锚点、版本、锁定、结构校验。
3. 不用提示词补丁替代状态机：提示词只解释工具面，不承担任务状态判断。

## 核心架构

### 1. EditTask 一等公民

新增 `src/services/editTaskService.ts`：

```ts
export type EditTaskStatus =
  | 'planning'
  | 'awaiting_batch'
  | 'running_batch'
  | 'partially_applied'
  | 'waiting_user'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed_before_write'
  | 'failed_after_write'
  | 'canceled'

export interface EditTaskCheckpoint {
  id: string
  documentVersion: number
  contentHash: string
  createdAt: number
  reason: 'task_start' | 'before_batch' | 'after_batch'
}

export interface EditTask {
  id: string
  sessionId: string
  source: 'outline' | 'editor' | 'pipeline'
  target: { workspace: string; targetId: string }
  goal: string
  plan: EditTaskPlan
  activeBatchId?: string
  executedBatches: string[]
  pendingBatches: string[]
  failedBatchIds: string[]
  checkpoints: EditTaskCheckpoint[]
  status: EditTaskStatus
  createdAt: number
  updatedAt: number
}
```

任务状态迁移必须走单一 reducer，禁止组件私自改状态。

### 2. 路由输入升级

`authorizeDialogueTools()` 增加活动任务上下文：

1. 无活动任务：维持现有 intent 权限门。
2. 有活动任务且用户句义为追问、解释、补充约束、继续、修复：路由到 `task_continue`，暴露只读工具加 `task.resume`、`task.cancel`，不直接暴露 `editor.write`。
3. `task.resume` 通过后，任务进入批次执行器，执行器内部调用 `editor.write`，模型不能绕过执行器直接提交整批。
4. discuss 仍只读；若用户要求“只讨论不改”，即使存在活动任务也不自动写入。

### 3. 长文任务执行器

新增 `src/services/editTaskExecutor.ts`，流程固定为：

1. `editor.get_state` / `outline.get_structure` 建立结构地图。
2. 生成任务计划：目标、范围、批次切分、每批预期锚点。
3. 逐批执行 `read_range -> build commands -> editor.write -> verify -> checkpoint`。
4. 单批失败时只重试当前批，不重放历史批次。
5. 锚点失败时按 `locate -> read_range -> 重新生成当前批命令` 恢复，恢复次数由 `toolLoopPolicy` 场景单源控制。
6. 执行中用户可见当前批次、完成批次、失败批次、恢复策略。

批次大小不做固定应用预算，按供应商上下文与目标文档结构动态计算；模型自身输出上限由 `max_tokens` 与供应商能力矩阵处理，不由应用私设一刀切预算。

### 4. 锚点与版本协议

1. 每条命令必须携带 `target`、`anchor`、`documentVersion`。
2. 批前读取当前范围，批后校验 hash 与结构。
3. `target_not_found` 返回可执行恢复指令：结构路径、建议读取范围、失败锚点原文。
4. 跨批恢复时必须先校验 checkpoint 的 documentVersion 与 contentHash，不匹配则进入 `waiting_user`，禁止盲写。

### 5. 终态与 runTrace

1. `RunTraceStatus` 增加 `partially_applied`、`failed_after_write`、`success_with_warnings`。
2. 新增 `EditTaskLifecycleEvent`：task_created、plan_ready、batch_started、batch_failed、batch_recovered、checkpoint_saved、task_resumed、task_canceled、task_finished。
3. 删除 `export_snapshot_synthesized_from_last_turn` 对运行终态的覆盖能力；导出必须引用真实任务终态。
4. API 对话框显示任务终态与下一步动作，禁止长期停留在“正在等待 API 返回”。

### 6. UI 交互

API 对话框新增任务条：

1. 目标、状态、当前批次、进度。
2. 部分失败时显示“已写入批次 / 未写入批次 / 可恢复批次”。
3. 用户动作：继续执行、回滚到 checkpoint、放弃任务、只讨论不执行。
4. 编辑器写入时显示定位与批次级 diff，不把长文一次性倾倒为不可读大块。

## 实施阶段

### Phase 0：基线与防回归

1. 固化 09-22 事故 trace 为回归 fixture。
2. 增加当前缺陷断言：discuss 剥写工具、部分写入折叠、snapshot 合成。
3. 跑全量现有测试，记录基线。

### Phase 1：EditTask 状态机

新增 editTaskService、状态 reducer、checkpoint 结构与单测。验收：所有状态迁移、非法迁移拒绝、checkpoint hash 校验有测试证据。

### Phase 2：路由与活动任务接入

接入 `authorizeDialogueTools()`、`chainIntentRouter` 输出与 `crossTurnToolAudit`。验收：无任务、活动任务、discuss、继续任务、取消任务五类工具面均有断言。

### Phase 3：长文执行器

实现计划生成、分批执行、单批恢复、checkpoint、版本校验。验收：9 条命令第 4 条失败时，只重建当前批，历史批次不重放。

### Phase 4：终态与日志

扩展 RunTraceStatus、EditTaskLifecycleEvent、DiagLogger 事件。验收：runTrace 与 DiagLogger 双侧对账，导出不再合成终态。

### Phase 5：UI 与跨入口统一

大纲工作台与主页编辑器共用任务条、恢复操作、diff 呈现。验收：两个入口行为一致，禁止出现第三套状态展示。

### Phase 6：Electron 级真实 UI 高强度实测

必须覆盖：

1. 1000 字以上测试稿的写入、修改、删除、改个别字、删个别字。
2. 长文重排：批次失败、恢复、部分完成、继续执行、回滚。
3. 跨轮权限翻转：edit 后 discuss，discuss 后继续活动任务。
4. 停滞响应、自动隔离重试、无正文输出的真实 UI 呈现。
5. runTrace 导出逐项对账 API 轮次、工具轮次、任务终态、checkpoint。
6. DiagLogger renderer 与主进程双侧类别和数量对账。

## 门禁执行

1. M8：每个新事件、降级、终态同步进入 runTrace 与 DiagLogger。
2. M9：discuss 保持只读，任务恢复不等于绕过权限门。
3. M17：每阶段收尾做生产入口 `rg` 全量盘点，确认无旧链路并存。
4. M18：实现完成后按四层成熟度重新评估，未过验收不得宣称成熟。
5. M39：工具循环上限仍由 `toolLoopPolicy` 单源控制。
6. M40：Electron 级真实 UI 实测为放行硬条件。

## 清理要求

1. 删除 `task.update_plan` 的旧只读 UI 语义，替换为 EditTask 状态，不允许两个“计划”并存。
2. 删除 runTrace 的合成终态路径。
3. 旧 failed batch 逻辑只保留为 EditTask 批次状态的一部分，禁止双入口同时处理。
4. 文档更新后同步 DEV_LOG 与经验文件。

## 风险与对策

| 风险 | 对策 |
|---|---|
| 状态机引入新的死锁 | 所有 waiting 状态必须带超时、取消、降级路径，并有状态机测试 |
| 分批执行造成半成品文档 | 每批 checkpoint + 显式 partially_applied + 用户可回滚 |
| 活动任务被误认为自动授权 | task.resume 是任务恢复，不是写权限授权；写入仍走执行器校验 |
| 新旧链路并存 | M17 全量盘点，Phase 5 前完成旧语义清理 |

## 审核确认点

1. 部分失败后的默认动作建议为“暂停并显示继续/回滚/放弃”，不自动继续写入。
2. 活动任务存在时，用户普通追问进入 `task_continue`，但不自动恢复写入，需用户选择继续。
3. checkpoint 保存在应用私有目录，不写入用户项目文件。

以上三项如无异议，按 Phase 0 开始执行。
