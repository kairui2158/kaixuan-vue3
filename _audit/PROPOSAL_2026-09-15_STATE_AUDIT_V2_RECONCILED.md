# 状态审计 V2：全应用状态流统一审计与门禁方案（对账修订版）

> 日期：2026-09-15
> 版本基线：3.47.0
> 修订原因：V1 存在 6 处设计-需求不一致（见 §0），以及代码扫描发现的 3 个真实 BUG 级缺口（见 §1.3）
> 核心原则：每个修复点必须回溯到一个已扫描的具体问题，每个问题必须有对应的验证场景

---

## 0. V1 自查废弃记录

| V1 矛盾 | 问题描述 | V2 修正 |
|---------|---------|---------|
| 1 | 声称"不改现有代码"但又要求"每次状态变化写入事件" | V2 诚实声明：**必须改现有赋值点**，按风险排序逐模块改造 |
| 2 | 把生命周期状态和资源修订状态混进一张转换矩阵 | V2 拆成两个独立状态机：`LifecycleStatus` + `ResourceStatus` |
| 3 | 遗漏 `TaskStep['status']`、`FinishReason`、`FolderSkillStatus` 三个类型 | V2 补齐为 17+ 状态类型完整清单 |
| 4 | 映射函数（纯函数）和转换函数（需要 runId + 写事件）混淆 | V2 分为 `mapToLifecycle()`（纯映射）和 `recordTransition()`（事件写入），两个独立 API |
| 5 | 看门狗超时写死，但声称"可配置" | V2 从 `DEFAULT_TIMEOUTS` 和 SKILL `meta.json.timeoutHint` 双源读取 |
| 6 | UI 状态时间线未排进任何阶段 | V2 阶段 5 明确改造 RunTracePanel |

---

## 1. 现状扫描：证据驱动的问题清单

### 1.1 状态类型完整清单（17 个定义 + 大量直接赋值点）

| # | 类型名 | 文件:行 | 取值 | 状态机类别 |
|---|--------|---------|------|-----------|
| 1 | `RunTraceStatus` | `src/stores/runTrace.ts:5` | running, success, degraded, failed, canceled | 生命周期 |
| 2 | `AiTraceStatus` | `src/composables/useAiCallTrace.ts:10` | = #1 alias | 生命周期 |
| 3 | `RunOutcomeStatus` | `src/services/generationValidity.ts:115` | success, degraded, failed, canceled | 生命周期 |
| 4 | `ChainRunState` | `src/services/workspaceSkillEngine.ts:164` | idle, routing, awaiting_confirmation, running, completed, failed, cancelled, budget_exhausted | 生命周期 |
| 5 | `ChainBreakpointStatus` | `src/services/chainBreakpoint.ts:1` | completed, failed | 生命周期 |
| 6 | `ChatGenerationStatus` | `src/stores/chat.ts:68` | idle, preparing, streaming, retrying, canceled, error | 生命周期 |
| 7 | `GenerationStatus` | `src/services/generationResult.ts:3` | success, failed, fallback | 生命周期 |
| 8 | `ContinuationStatus` | `src/services/continuation.ts:3` | none, generating, completed, possibly_truncated, interrupted, failed, user_stopped, continuing | 生命周期 |
| 9 | `EditorBatchStatus` | `src/services/editorBatchRecord.ts:5` | pending, applied, expired, rejected, version_changed, locked, rolled_back | 资源修订 |
| 10 | `RealSkillExecutionStatus` | `src/services/realSkillTypes.ts:94` | success, failed, degraded, blocked | 生命周期 |
| 11 | `CompositeStatus` | `src/services/skillOrchestrator.ts:12` | DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED | 生命周期 |
| 12 | `TaskState` | `src/stores/aiTaskStore.ts:5` | planning, acting, reviewing, completed, failed, paused | 生命周期 |
| 13 | `TaskStep['status']` | `src/stores/aiTaskStore.ts:11` | pending, running, done, failed, skipped | 生命周期 |
| 14 | `NamingStatus` | `src/types/aiNaming.ts:92` | idle, loading, success, partial, error, canceled | 生命周期 |
| 15 | `FactStatus` | `src/types/memory.ts:36` | confirmed, pending, stale, conflicted, rejected | 资源修订 |
| 16 | `FinishReason` | `src/services/continuation.ts:13` | stop, length | 属性（非状态机） |
| 17 | `FolderSkillStatus` | `src/services/realSkillLoader.ts:9` | 结构体（含 status 字段） | 资源修订 |

### 1.2 直接赋值点清单（`.status = 'xxx'` 代码实证）

这些是状态被直接赋值而不经过任何守卫或事件的代码位置：

| 文件 | 行号 | 赋值 | 状态机 |
|------|------|------|--------|
| `src/stores/runTrace.ts` | 517 | `run.status = 'failed'` | #1 |
| `src/stores/runTrace.ts` | 531 | `call.status = 'failed'` | #1 |
| `src/stores/runTrace.ts` | 544 | `call.status = 'canceled'` | #1 |
| `src/stores/runTrace.ts` | 614 | `run.status = 'running'` | #1 |
| `src/stores/runTrace.ts` | 642 | `turn.status = status`（参数传入） | #1 |
| `src/stores/runTrace.ts` | 967 | `call.status = patch.status`（参数传入） | #1 |
| `src/stores/runTrace.ts` | 1016 | `call.status = status`（参数传入） | #1 |
| `src/stores/runTrace.ts` | 1030 | `run.status = status`（参数传入） | #1 |
| `src/services/skillOrchestrator.ts` | 269,283,294,315,330,342,353 | `stepState.status = 'failed'/'done'/'skipped'` | #11 |
| `src/stores/aiTaskStore.ts` | 80 | `step.status = status`（参数传入） | #13 |
| `src/services/memoryMerger.ts` | 150,268 | `target.status = incoming.status` | #15 |
| `src/components/pipeline/PipelinePanel.vue` | 965 | `existing.status = detail.status` | 事件状态 |

### 1.3 代码扫描发现的 BUG 级缺口（P0）

以下不是"缺映射"或"词汇不统一"这种架构问题，而是**现在就产生的错误状态输出**：

| BUG | 文件:行 | 现象 | 影响 |
|-----|---------|------|------|
| **BUG-1: budget_exhausted 被标为 success** | `src/components/common/OutlineWorkspace.vue:2464` | `finishOutlineRun('success', 'API 调用预算已用尽...')` — 链路因预算耗尽停止，但 trace 终态是 `success` | SKILL 调试方看 trace 以为成功；状态归并函数 `classifyRunOutcome()` 没覆盖这个分支 |
| **BUG-2: awaiting_confirmation 被标为 success** | `src/components/common/OutlineWorkspace.vue:2444` | `finishOutlineRun('success', undefined, '')` — 等待用户确认意图路由时 trace 写 success | 用户还没确认，trace 已经终态 success；如果用户取消则再触发 `status-conflict-ignored` |
| **BUG-3: CompositeStatus blocked → stepState failed（非降级）** | `src/services/skillOrchestrator.ts:269` | `result.status === 'blocked'` 被写成 `stepState.status = 'failed'`，没有区分"阻断"和"失败" | blocked 应该可以重试（权限/预算恢复后），failed 语义上是终结性的；混在一起会让重试逻辑失效 |

### 1.4 状态一致性缺陷（P1，代码实证）

| 问题 | 位置 | 影响 | M 门禁关联 |
|------|------|------|-----------|
| `RunOutcomeStatus` 缺 `blocked`，但 `RealSkillExecutionStatus` 有 | `generationValidity.ts:115` vs `realSkillTypes.ts:94` | `classifyRunOutcome()` 无法处理 blocked 结果；PipelinePanel.vue:1853 把 blocked 强制映射为 failed | M13 归并函数覆盖不全 |
| `ChainBreakpointStatus` 只有 completed/failed | `chainBreakpoint.ts:1` | 断点恢复后无法判断是部分完成还是全完成；degraded 产物保存后恢复时状态丢失 | M13 chain 归并不完整 |
| `budget_exhausted` 在 `ChainRunState` 中有，但 `RunTraceStatus` 中无对应值 | `workspaceSkillEngine.ts:164` vs `runTrace.ts:5` | 8 态 → 5 态映射丢信息；BUG-1 就是这个丢失的直接后果 | M13 归并丢状态 |
| `canceled` / `cancelled` / `user_stopped` 三种写法并存 | #1 vs #4 vs #8 | 序列化比较时 `status === 'canceled'` 和 `status === 'cancelled'` 是不同的字符串 | 状态比较不一致 |
| `GenerationStatus.fallback` vs `RunOutcomeStatus.degraded` | #7 vs #3 | 同一"降级完成"语义在两个系统叫法不同；PipelinePanel.vue:1855 手动翻译 | 客户看到的 UI 不一致 |

### 1.5 状态事件覆盖缺口

| 缺口 | 当前状态 | 影响 |
|------|---------|------|
| 状态从 A 转到 B 的原因 | 未记录 | 无法诊断为什么 running → degraded |
| 状态回退（completed → running） | 仅 trace 内部 `status-conflict-ignored` | 其他模块的回退无记录 |
| 状态死锁（running 超时） | 无检测 | 用户空等不知道卡在哪 |
| 组件销毁时 running 未收尾 | 无检测 | 窗口关闭后 trace 永远 running |
| blocked 状态的重试事件 | 无 | blocked → active 重试后无证据链 |

### 1.6 已有基础设施盘点（不重复建设）

| 已有 | 位置 | 功能 | V2 复用方式 |
|------|------|------|-----------|
| `classifyRunOutcome()` | `generationValidity.ts:122` | 空产物/截断/取消/失败归一 | **扩展**：加 blocked 分支，作为 lifecycle 终态归并的唯一入口 |
| `finishRun()` 终态保护 | `runTrace.ts:997` | 非 running 时不覆盖，记录 conflict | **保留**：作为 lifecycle 状态机的终态守卫 |
| `status-conflict-ignored` 事件 | `runTrace.ts:1004` | 迟到收尾证据 | **保留**：作为 lifecycle 转换违规事件的原型 |
| `cancelRunningApiCalls()` | `runTrace.ts` | 取消时清扫 running API | **保留**：作为 lifecycle 状态机异常路径清扫 |
| M13 调用路径门禁 | `经验文件 v5 §1` | 新增外呼必须声明 trace 归属 | **扩展**：新增状态类型也必须声明归属 |
| M14 schema 门禁 | `经验文件 v5 §1` | trace 结构变更升级 schemaVersion | **遵循**：新增 state-transition 事件后升级到 6 |

---

## 2. 架构设计

### 2.1 双状态机模型

#### LifecycleStatus（生命周期状态机）

用于"跑一次就结束"的操作：生成、调用、执行、路由。有明确的起点和终点。

```typescript
// src/types/lifecycleStatus.ts

export type LifecycleStatus =
  // 活跃态
  | 'idle'
  | 'routing'
  | 'awaiting_user'
  | 'active'
  | 'paused'
  | 'retrying'

  // 终态
  | 'completed'
  | 'completed_partial'
  | 'degraded'
  | 'failed'
  | 'blocked'
  | 'canceled'
  | 'expired'
```

**转换矩阵**：

```typescript
export const LIFECYCLE_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  idle:              ['routing', 'active', 'awaiting_user'],
  routing:           ['active', 'awaiting_user', 'failed', 'blocked', 'canceled'],
  awaiting_user:     ['active', 'canceled', 'expired'],
  active:            ['completed', 'completed_partial', 'degraded', 'failed', 'blocked', 'canceled', 'paused', 'retrying', 'expired'],
  paused:            ['active', 'canceled'],
  retrying:          ['active', 'failed', 'blocked', 'canceled', 'expired'],
  // 终态：failed 和 blocked 可重试回到 active，其余不可转出
  completed:         [],
  completed_partial: [],
  degraded:          [],
  failed:            ['active'],  // 仅通过重试入口
  blocked:           ['active'],  // 仅通过预算追加/权限解除
  canceled:          [],
  expired:           [],
}
```

#### ResourceStatus（资源修订状态机）

用于"可以反复变更"的资源：编辑器批次、记忆事实、技能状态。没有"终态"概念。

```typescript
// src/types/resourceStatus.ts

export type ResourceStatus =
  | 'pending'       // 等待确认
  | 'applied'       // 已应用
  | 'rejected'      // 已拒绝
  | 'expired'       // 已过期
  | 'locked'        // 已锁定
  | 'rolled_back'   // 已回滚（可重新 applied）
  | 'confirmed'     // 已确认（记忆）
  | 'stale'         // 已过期（记忆，可重新 confirmed）
  | 'conflicted'    // 有冲突（记忆）

export const RESOURCE_TRANSITIONS: Record<ResourceStatus, ResourceStatus[]> = {
  pending:     ['applied', 'rejected', 'expired', 'locked'],
  applied:     ['rolled_back'],            // 只可回滚
  rejected:    [],                          // 终态
  expired:     [],                          // 终态
  locked:      [],                          // 终态（需外部解锁）
  rolled_back: ['applied', 'pending'],      // 可重新应用或重新提案
  confirmed:   ['stale', 'conflicted', 'rejected'],
  stale:       ['confirmed'],               // 可重新确认
  conflicted:  ['confirmed', 'rejected', 'stale'],
}
```

### 2.2 映射表（模块状态 → 统一状态）

```typescript
// src/types/lifecycleStatus.ts

export const LIFECYCLE_MAPPINGS: Record<string, Record<string, LifecycleStatus>> = {
  RunTraceStatus: {
    running: 'active', success: 'completed', degraded: 'degraded',
    failed: 'failed', canceled: 'canceled',
  },
  RunOutcomeStatus: {
    success: 'completed', degraded: 'degraded',
    failed: 'failed', canceled: 'canceled',
    // V2 新增 blocked 后：
    // blocked: 'blocked',
  },
  ChainRunState: {
    idle: 'idle', routing: 'routing',
    awaiting_confirmation: 'awaiting_user',
    running: 'active',
    completed: 'completed', failed: 'failed',
    cancelled: 'canceled',
    budget_exhausted: 'blocked',  // 修复 BUG-1
  },
  ChatGenerationStatus: {
    idle: 'idle', preparing: 'active', streaming: 'active',
    retrying: 'retrying', canceled: 'canceled', error: 'failed',
  },
  ContinuationStatus: {
    none: 'idle', generating: 'active', continuing: 'active',
    completed: 'completed', possibly_truncated: 'degraded',
    interrupted: 'expired', failed: 'failed', user_stopped: 'canceled',
  },
  GenerationStatus: {
    success: 'completed', failed: 'failed', fallback: 'degraded',
  },
  RealSkillExecutionStatus: {
    success: 'completed', failed: 'failed',
    degraded: 'degraded', blocked: 'blocked',  // 修复 BUG-3
  },
  CompositeStatus: {
    DONE: 'completed', DONE_WITH_CONCERNS: 'degraded',
    NEEDS_CONTEXT: 'awaiting_user', BLOCKED: 'blocked',
  },
  TaskState: {
    planning: 'routing', acting: 'active', reviewing: 'awaiting_user',
    completed: 'completed', failed: 'failed', paused: 'paused',
  },
  TaskStepStatus: {
    pending: 'idle', running: 'active', done: 'completed',
    failed: 'failed', skipped: 'canceled',
  },
  NamingStatus: {
    idle: 'idle', loading: 'active', success: 'completed',
    partial: 'completed_partial', error: 'failed', canceled: 'canceled',
  },
  ChainBreakpointStatus: {
    completed: 'completed', failed: 'failed',
    // V2 建议扩展：degraded: 'degraded'
  },
  FinishReason: {
    stop: 'completed', length: 'degraded',
  },
}

export const RESOURCE_MAPPINGS: Record<string, Record<string, ResourceStatus>> = {
  EditorBatchStatus: {
    pending: 'pending', applied: 'applied', rejected: 'rejected',
    expired: 'expired', version_changed: 'expired',
    locked: 'locked', rolled_back: 'rolled_back',
  },
  FactStatus: {
    confirmed: 'confirmed', pending: 'pending',
    stale: 'stale', conflicted: 'conflicted', rejected: 'rejected',
  },
}
```

### 2.3 映射函数（纯函数，不写事件）

```typescript
// src/types/lifecycleStatus.ts

export function mapToLifecycle(module: string, status: string): LifecycleStatus {
  const mapping = LIFECYCLE_MAPPINGS[module]
  if (!mapping || !(status in mapping)) {
    // 未知状态返回 blocked 而不是 silently 失败
    return 'blocked'
  }
  return mapping[status]
}

export function mapToResource(module: string, status: string): ResourceStatus {
  const mapping = RESOURCE_MAPPINGS[module]
  if (!mapping || !(status in mapping)) {
    return 'pending'  // 未知资源状态视为待确认
  }
  return mapping[status]
}
```

### 2.4 转换守卫 + 事件记录（有状态，需要 runId）

```typescript
// src/services/stateTransitionGuard.ts

import type { LifecycleStatus } from '../types/lifecycleStatus'
import { LIFECYCLE_TRANSITIONS } from '../types/lifecycleStatus'

export function assertLifecycleTransition(from: LifecycleStatus, to: LifecycleStatus): boolean {
  const allowed = LIFECYCLE_TRANSITIONS[from]
  return allowed?.includes(to) ?? false
}

// 在 runTrace.ts 的 finishRun / finishTurn / finishApiCall / startRun 中调用
// 不在模块代码里直接调用，而是嵌入到 runTrace 的状态变更函数内
export function recordLifecycleTransition(
  runId: string,
  from: string,
  to: string,
  reason: string,
  source: string,
): void {
  const fromMapped = mapToLifecycle(source, from)
  const toMapped = mapToLifecycle(source, to)
  const isLegal = assertLifecycleTransition(fromMapped, toMapped)

  runTraceStore.addRunEvent(runId, {
    type: isLegal ? 'state-transition' : 'state-transition-violation',
    level: isLegal ? 'info' : 'warn',
    label: isLegal
      ? `${source}: ${from} → ${to}`
      : `${source}: 非法转换 ${from} → ${to}`,
    detail: reason,
  })

  if (!isLegal && import.meta.env.DEV) {
    console.warn(`[StateAudit] Illegal transition in ${source}: ${from} -> ${to} (${reason})`)
  }
  // 生产环境 fail-open：记录事件但不阻断
}
```

### 2.5 看门狗（参数化）

```typescript
// src/services/stateWatchdog.ts

const DEFAULT_TIMEOUTS: Partial<Record<LifecycleStatus, number>> = {
  routing: 30_000,
  active: 300_000,
  retrying: 60_000,
  awaiting_user: 600_000,
}

// SKILL 可通过 meta.json 声明更长超时
interface SkillTimeoutHint {
  timeoutHint?: { active?: number; routing?: number }
}

export function getTimeout(status: LifecycleStatus, skillMeta?: SkillTimeoutHint): number {
  if (skillMeta?.timeoutHint && status in skillMeta.timeoutHint) {
    return skillMeta.timeoutHint[status as keyof NonNullable<SkillTimeoutHint['timeoutHint']>]!
  }
  return DEFAULT_TIMEOUTS[status] ?? 300_000
}

export function startWatchdog(runId: string, status: LifecycleStatus, skillMeta?: SkillTimeoutHint): NodeJS.Timeout | null {
  const timeout = getTimeout(status, skillMeta)
  if (!timeout) return null
  return setTimeout(() => {
    if (getCurrentLifecycleStatus(runId) === status) {
      runTraceStore.addRunEvent(runId, {
        type: 'state-stuck-detected',
        level: 'warn',
        label: `状态 ${status} 超过 ${Math.round(timeout / 1000)}s 未变化`,
        detail: `startedAt: ${Date.now() - timeout}, timeoutMs: ${timeout}`
      })
    }
  }, timeout)
}
```

### 2.6 应用关闭前完整性检查

```typescript
// src/services/stateIntegrityCheck.ts

export interface StateIntegrityReport {
  stuckRuns: { runId: string; status: string; startedAt: number }[]
  runningApiCalls: { runId: string; callId: string; startedAt: number }[]
}

export function checkIntegrityBeforeClose(): StateIntegrityReport {
  const report: StateIntegrityReport = { stuckRuns: [], runningApiCalls: [] }
  for (const run of runTraceStore.runs) {
    if (run.status === 'running') {
      report.stuckRuns.push({ runId: run.id, status: run.status, startedAt: run.startedAt })
    }
    for (const call of run.apiCalls) {
      if (call.status === 'running') {
        report.runningApiCalls.push({ runId: run.id, callId: call.id, startedAt: call.startedAt })
      }
    }
  }
  return report
}

// electron/main.js before-quit 中调用
// stuck 状态自动写入 diag-log 后再退出
```

### 2.7 Trace schema 升级

新增事件类型后 `RUN_TRACE_SCHEMA_VERSION` 从 5 升到 6：

| 新事件类型 | level | 说明 |
|-----------|-------|------|
| `state-transition` | info | 合法的状态变化 |
| `state-transition-violation` | warn | 非法的状态变化 |
| `state-stuck-detected` | warn | 状态超时 |
| `state-integrity-report` | warn | 应用关闭前的 stuck 报告 |

旧 schemaVersion 5 的 trace 数据仍可读（新事件类型是可选字段，旧数据中不存在）。

---

## 3. P0 BUG 修复计划（与状态审计同步执行）

以下 3 个 BUG 是扫描发现的**现在就在产生错误状态**的问题，必须在统一状态层上线前先修，否则状态审计上线后这些 BUG 的错误输出会被"合法化"。

| BUG | 修复方式 | 验证 |
|-----|---------|------|
| BUG-1: budget_exhausted → success | `OutlineWorkspace.vue:2464` 改为 `finishOutlineRun('failed', '...')` 或引入 `RunTraceStatus.blocked` | 单测 + E2E：budget_exhausted 后 trace 终态不是 success |
| BUG-2: awaiting_confirmation → success | `OutlineWorkspace.vue:2444` 改为不 finishRun，保持 running 直到用户确认后继续或取消 | 单测 + E2E：等待确认时 trace 仍 running；取消后终态 canceled |
| BUG-3: blocked → failed | `skillOrchestrator.ts:269` 区分 blocked 和 failed；stepState.status 增加 'blocked' 值 | 单测：blocked 不触发 failed 分支的重试清理 |

**P0 BUG 修复不需要等统一状态层就绪**，可以立即执行，与阶段 1 并行。

---

## 4. 分阶段执行计划

### 阶段 0：P0 BUG 修复（与阶段 1 并行，最高优先级）

| 步骤 | 内容 | 验证 |
|------|------|------|
| 0.1 | 修复 BUG-1, BUG-2, BUG-3 | 每个BUG写一个单测复现 → 修复 → 通过 |
| 0.2 | `classifyRunOutcome()` 扩展 blocked 分支 | 单测：blocked 输入 → blocked 输出 |
| 0.3 | OutlineWorkspace / PipelinePanel 的 finishRun 调用点检查 | rg 扫描所有 finishRun 确保无 BUG-1/2 复发 |

### 阶段 1：基础设施

| 步骤 | 内容 | 验证 |
|------|------|------|
| 1.1 | 新建 `src/types/lifecycleStatus.ts`（枚举 + 映射 + 转换矩阵） | type-check |
| 1.2 | 新建 `src/types/resourceStatus.ts` | type-check |
| 1.3 | 新建 `src/services/stateTransitionGuard.ts` | 单测：全量转换用例（合法通过 / 非法记录） |
| 1.4 | 新建 `src/services/stateWatchdog.ts` | 单测：超时触发 + SKILL timeoutHint 覆盖 |
| 1.5 | 新建 `src/services/stateIntegrityCheck.ts` | 单测：stuck / clean / mixed |

### 阶段 2：核心模块接入（必须改现有赋值点）

按风险从低到高排序：

| 优先级 | 模块 | 改造点 | 风险 |
|--------|------|--------|------|
| 2.1 | `runTrace.ts` | 在 `startRun`, `finishRun`, `finishTurn`, `finishApiCall` 内嵌入 `recordLifecycleTransition()`；这是所有模块的下游 | 低：不改签名，只加事件 |
| 2.2 | `ChatPanel.vue` | `finishHomeApiCall()` 调用点加 from/to/reason | 低 |
| 2.3 | `OutlineWorkspace.vue` | `finishOutlineRun()` 调用点加 from/to/reason；BUG-1/2 已在阶段 0 修复 | 低 |
| 2.4 | `PipelinePanel.vue` | `finishPipelineRun()` 调用点 | 中：文件大，改动需精确 |
| 2.5 | `workspaceSkillEngine.ts` | chain 状态变化点 | 中 |
| 2.6 | `skillOrchestrator.ts` | 7 个 `stepState.status =` 赋值点 | 中 |

### 阶段 3：外围模块接入

| 模块 | 改造方式 |
|------|---------|
| `aiTaskStore.ts` | `updateStepStatus()` 加事件 |
| `useAiNaming.ts` | `status.value` 变化点 |
| `editorEditSession.ts` | batch 状态变化 |
| `memoryMerger.ts` | `target.status` 变化 |
| `continuation.ts` | snapshot status 变化 |
| `chainBreakpoint.ts` | breakpoint status 变化 |

### 阶段 4：看门狗集成

| 步骤 | 内容 |
|------|------|
| 4.1 | `startRun` 内自动启动看门狗 |
| 4.2 | `finishRun` / `finishApiCall` 内自动清除看门狗 timer |
| 4.3 | electron `before-quit` 调用 `checkIntegrityBeforeClose()` |
| 4.4 | stuck 结果写入 diag-log |

### 阶段 5：Trace 集成 + UI

| 步骤 | 内容 |
|------|------|
| 5.1 | `runTrace.ts` 新增 4 种事件类型的处理 |
| 5.2 | `RUN_TRACE_SCHEMA_VERSION` 5 → 6 |
| 5.3 | `RunTracePanel.vue` 增加状态时间线视图（在事件列表中按时间排序显示 state-transition 事件） |
| 5.4 | 导出 JSON 包含完整状态转换历史 |
| 5.5 | 旧 schemaVersion 5 数据兼容测试 |

### 阶段 6：经验门禁 + 封装

| 步骤 | 内容 |
|------|------|
| 6.1 | 经验文件新增 **M15：状态转换门禁**——所有模块状态变化必须经过 `recordLifecycleTransition()` 或 `recordResourceTransition()`；禁止绕过守卫直接赋值；新增状态类型必须在映射表注册 |
| 6.2 | 开发日志完整记录实施过程和验证证据 |
| 6.3 | `DEV_LOG_MASTER_INDEX.md` 登记 |
| 6.4 | 版本升级 3.48.0 |
| 6.5 | 封装 + SHA256 |

## 5. 验证矩阵

### 5.1 单元测试

| 测试文件 | 覆盖 | 最少用例数 |
|---------|------|-----------|
| `lifecycleStatus.spec.ts` | 映射表正确性（17 个模块 × 每个取值） | 60+ |
| `lifecycleStatus.spec.ts` | 转换矩阵全量（合法/非法） | 80+ |
| `resourceStatus.spec.ts` | 映射表 + 转换矩阵 | 30+ |
| `stateTransitionGuard.spec.ts` | 守卫行为（合法/非法/生产 fail-open） | 15+ |
| `stateWatchdog.spec.ts` | 超时触发 / SKILL hint 覆盖 / 不误报 | 10+ |
| `stateIntegrityCheck.spec.ts` | stuck / clean / mixed | 5+ |

### 5.2 集成测试

| 场景 | 验证 |
|------|------|
| 大纲共创完整链路 | trace 有 routing → active → completed 状态时间线 |
| 大纲共创 budget_exhausted | trace 终态是 blocked（非 success）— BUG-1 回归 |
| 大纲共创 awaiting_confirmation | trace 保持 running 直到确认或取消 — BUG-2 回归 |
| 聊天对话正常完成 | trace 有 active → completed |
| 聊天对话取消 | trace 有 active → canceled |
| 编辑器直写 applied → rolled_back | ResourceStatus 转换有记录 |
| Skill blocked（预算耗尽） | stepState 有 blocked（非 failed）— BUG-3 回归 |
| 正文续写 possibly_truncated | trace 有 active → degraded |

### 5.3 E2E 真实 Electron

| 场景 | 验证 |
|------|------|
| 启动 → 生成 → 关闭 | 无 stuck |
| 生成中途强制关闭 | diag-log 记录 state-integrity-report |
| 导出 trace | JSON 包含 state-transition 事件；schemaVersion = 6 |
| 旧数据兼容 | 3.47.0 的 schemaVersion 5 trace 可读 |

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 改现有赋值点引入回归 | 阶段 0 先修 P0 BUG；阶段 2 每改一个模块先跑该模块的现有测试 |
| 看门狗误报长任务 | 超时可被 SKILL meta.json 覆盖；默认 5 分钟；只记录 warn 不阻断 |
| 转换矩阵过严阻断正常流程 | 生产环境 fail-open（记录不阻断）；开发环境 throw（提前暴露） |
| 状态事件撑爆 trace | 只记录状态级别变化；rolling cleanup 已有；每 run 状态事件预估 < 50 条 |
| 17 个模块逐个接入周期长 | 阶段 2 只做 6 个核心模块；阶段 3 是 6 个外围；每模块独立验证 |
| schema 升级导致旧数据不可读 | 新事件类型是可选字段；旧 trace 无这些字段仍可解析；写入兼容测试 |

## 7. 成功标准（可量化）

1. `rg "\.status\s*=\s*'" src/` 返回 0 个未被 `recordLifecycleTransition()` 或 `recordResourceTransition()` 覆盖的直接赋值点（`runTrace.ts` 内部的初始 `'running'` 赋值除外）。
2. `classifyRunOutcome()` 输入覆盖 `blocked`。
3. 全量测试 ≥ 562 passed（现有） + 新增 ≥ 200 = ≥ 762 passed。
4. type-check 0 error。
5. E2E 全部 PASS（含 BUG-1/2/3 回归 + schemaVersion 6 兼容）。
6. 客户在 RunTracePanel 展开后能看到每步状态变化时间线。
7. 应用关闭后 diag-log 中无"running 状态遗留"。

## 8. 不改动范围

- 不替换现有 17 个状态类型的 TypeScript 定义
- 不改现有模块间调用的接口签名
- 不改意图路由、folder 协议、直写权限、Handoff 结构
- 不改硬规则处理逻辑
- 不改 UI 布局（只在 RunTracePanel 增加状态时间线视图）

## 9. 对账表：扫描问题 → 方案解法 → 验证场景

| 问题编号 | 扫描发现 | 方案解法（阶段） | 验证场景 |
|---------|---------|-----------------|---------|
| BUG-1 | budget_exhausted → success | 阶段 0.1 | E2E：budget_exhausted 终态非 success |
| BUG-2 | awaiting_confirmation → success | 阶段 0.1 | E2E：等待确认时 trace 仍 running |
| BUG-3 | blocked → failed 混淆 | 阶段 0.1 | 单测：blocked 不触发 failed 重试清理 |
| P1-1 | RunOutcomeStatus 缺 blocked | 阶段 0.2 | 单测：blocked 输入 → blocked 输出 |
| P1-2 | ChainBreakpointStatus 只有 2 态 | 阶段 3 扩展 | 集成：断点 degraded 恢复 |
| P1-3 | canceled/cancelled/user_stopped 不统一 | 阶段 1 映射表归一 | 单测：3 种输入都映射到 Lifecycle.canceled |
| P1-4 | fallback vs degraded 语义碎片化 | 阶段 1 映射表归一 | 单测：GenerationStatus.fallback → Lifecycle.degraded |
| P1-5 | 17 个状态类型无统一映射 | 阶段 1.1-1.2 | 单测：17 个模块映射全量通过 |
| P1-6 | 状态赋值点无守卫 | 阶段 2 逐模块嵌入 | rg 扫描 0 个未覆盖赋值点 |
| P2-1 | 状态变化原因未记录 | 阶段 2 recordLifecycleTransition | 集成：trace 有 state-transition 事件 |
| P2-2 | 状态死锁无检测 | 阶段 4 看门狗 | 集成：超时后 state-stuck-detected |
| P2-3 | 组件销毁 running 遗留 | 阶段 4 完整性检查 | E2E：关闭后 diag-log 无遗留 |
| P3-1 | CompositeStatus 大写不统一 | 阶段 1 映射表归一 | 单测：BLOCKED → Lifecycle.blocked |
| P3-2 | NamingStatus.partial 无全局对应 | 阶段 1 新增 completed_partial | 单测：partial → completed_partial |

> 本方案每一行代码变更都能追溯到 §1 的一个具体问题编号。如果执行时发现某个改动无法归入问题编号，说明是范围蔓延，应停下来讨论。
