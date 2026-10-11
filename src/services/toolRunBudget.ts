import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'

export type ToolRunBudgetClass = 'read' | 'write' | 'control'

export interface ToolRunBudgetSnapshot {
  maxPhysicalRequests: number
  physicalRequests: number
  maxReadToolCalls: number
  readToolCalls: number
  reservedWriteToolCalls: number
  writeToolCalls: number
  plannedWriteCount: number
  controlToolCalls: number
  exhaustedClasses: ToolRunBudgetClass[]
  operation: string
}

export type ToolRunBudget = ReturnType<typeof createToolRunBudget>

export { shouldRetryStalledDirectWrite } from './editorTools'
export type {
  DirectWriteStallRetryDecision,
  DirectWriteStallRetryInput,
} from './editorTools'

export interface ToolRunBudgetInput {
  plan?: Pick<LongDocumentExecutionPlan, 'mode' | 'operation' | 'segments'> | null
  operation?: string
  maxPhysicalRequests?: number
  maxReadToolCalls?: number
  reservedWriteToolCalls?: number
  plannedWriteCount?: number
}

const PHYSICAL_REQUESTS_PER_WRITE = 3
const CONTROL_CALL_CEILING = 16
const DIRECT_READ_CEILING = 12
const DIRECT_WRITE_CEILING = 12

const CONTROL_TOOL_NAMES = new Set([
  'agent.plan',
  'context.remaining',
])

export function classifyToolBudgetClass(tool: {
  name: string
  policy?: 'read' | 'write' | string
}): ToolRunBudgetClass {
  if (tool.policy === 'write' || tool.name === 'editor.write') return 'write'
  if (CONTROL_TOOL_NAMES.has(tool.name)) return 'control'
  return 'read'
}

export function createToolRunBudget(input: ToolRunBudgetInput) {
  const plan = input.plan ?? null
  const operation = input.operation ?? plan?.operation ?? 'direct'
  const readOnlyOperation = operation === 'discussion' || operation === 'analyze'
  const proseOutputPlan = plan?.mode === 'single-pass'
    || plan?.mode === 'final-draft'
  const plannedWriteCount = input.plannedWriteCount
    ?? (plan && !readOnlyOperation
      ? (proseOutputPlan
        ? 0
        : plan.mode === 'edit-task'
          ? Math.max(1, plan.segments.length)
          : 0)
      : 0)
  const readBudgetRequired = plannedWriteCount > 0
  const maxReadToolCalls = input.maxReadToolCalls
    ?? (proseOutputPlan
      ? 0
      : readBudgetRequired
        ? 24
        : DIRECT_READ_CEILING)
  const reservedWriteToolCalls = input.reservedWriteToolCalls
    ?? (readOnlyOperation || proseOutputPlan
      ? 0
      : (readBudgetRequired ? plannedWriteCount : DIRECT_WRITE_CEILING))
  const maxPhysicalRequests = input.maxPhysicalRequests
    ?? (proseOutputPlan
      ? 4
      : readBudgetRequired
        ? Math.min(128, Math.max(24, plannedWriteCount * PHYSICAL_REQUESTS_PER_WRITE))
        : 12)

  let physicalRequests = 0
  let readToolCalls = 0
  let writeToolCalls = 0
  let controlToolCalls = 0

  const remainingPhysical = () => maxPhysicalRequests - physicalRequests
  const exhaustedClasses = (): ToolRunBudgetClass[] => {
    const classes: ToolRunBudgetClass[] = []
    if (maxReadToolCalls > 0 && readToolCalls >= maxReadToolCalls) classes.push('read')
    if (reservedWriteToolCalls > 0 && writeToolCalls >= reservedWriteToolCalls) classes.push('write')
    if (physicalRequests >= maxPhysicalRequests) classes.push('control')
    return classes
  }

  return {
    canStartToolCall(toolClass: ToolRunBudgetClass): boolean {
      if (toolClass === 'read') {
        return readToolCalls < maxReadToolCalls
      }
      if (toolClass === 'write') return writeToolCalls < reservedWriteToolCalls
      return controlToolCalls < CONTROL_CALL_CEILING
    },
    canStartPhysicalRequest(toolClass: ToolRunBudgetClass = 'read'): boolean {
      void toolClass
      // Physical requests are a transport-level safety net. Write capacity is
      // enforced separately by canStartToolCall('write').
      return remainingPhysical() > 0
    },
    recordToolCall(toolClass: ToolRunBudgetClass): boolean {
      if (!this.canStartToolCall(toolClass)) return false
      if (toolClass === 'read') readToolCalls += 1
      else if (toolClass === 'write') writeToolCalls += 1
      else controlToolCalls += 1
      return true
    },
    recordPhysicalRequest(): void {
      if (physicalRequests < maxPhysicalRequests) physicalRequests += 1
    },
    snapshot(): ToolRunBudgetSnapshot {
      return {
        maxPhysicalRequests,
        physicalRequests,
        maxReadToolCalls,
        readToolCalls,
        reservedWriteToolCalls,
        writeToolCalls,
        plannedWriteCount,
        controlToolCalls,
        exhaustedClasses: exhaustedClasses(),
        operation,
      }
    },
  }
}
