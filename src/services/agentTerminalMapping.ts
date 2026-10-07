import type { RunTraceStatus } from '../stores/runTrace'
import type { AgentOrchestratorTaskResult } from './agentOrchestrator'
import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import type { EditTask } from './editTaskService'
import type { EditTaskCompletionReport } from './editTaskCompletion'

export interface AgentRunTraceTerminal {
  status: RunTraceStatus
  reason: string
}

export interface AgentRunTraceTerminalInput {
  agentResult: Pick<AgentOrchestratorTaskResult, 'status' | 'reason' | 'snapshot'>
  executionPlan?: LongDocumentExecutionPlan
}

export interface EditTaskTerminalEvidenceInput {
  agentTerminal: AgentRunTraceTerminal
  editTask: Pick<EditTask,
    'status'
    | 'executedBatches'
    | 'pendingBatches'
    | 'failedBatchIds'
  > | null
  completionReport?: EditTaskCompletionReport | null
}

export interface EditTaskTerminalEvidence {
  terminal: AgentRunTraceTerminal
  override: boolean
  evidenceReason: string
}

/**
 * Single source for mapping Agent verdicts to the outer run trace terminal.
 * Authorized write tasks may never fall back to plain-dialogue success.
 */
export function mapAgentResultToRunTrace(input: AgentRunTraceTerminalInput): AgentRunTraceTerminal {
  const { agentResult } = input
  const isWritePlan = Boolean(input.executionPlan && input.executionPlan.operation !== 'discussion')

  if (agentResult.status === 'completed') {
    return {
      status: 'success',
      reason: isWritePlan ? 'write_task_complete' : 'plain_dialogue_complete',
    }
  }
  if (agentResult.status === 'canceled') {
    return { status: 'canceled', reason: 'agent_canceled' }
  }
  if (agentResult.status === 'needs_user' || agentResult.status === 'waiting_user') {
    return { status: 'blocked', reason: 'agent_needs_user' }
  }
  if (agentResult.status === 'failed') {
    return { status: 'failed', reason: agentResult.reason || 'agent_failed' }
  }
  if (agentResult.status === 'stalled') {
    const reason = agentResult.reason || 'agent_stalled'
    if (reason === 'partially_applied') {
      return { status: 'partially_applied', reason }
    }
    if (reason === 'physical_request_limit') {
      return { status: 'degraded', reason: 'stalled/physical_request_limit' }
    }
    if (reason === 'legacy_preview_response' || reason === 'write_not_executed') {
      return { status: 'failed', reason: 'write_not_executed' }
    }
    return { status: 'failed', reason }
  }

  return {
    status: 'degraded',
    reason: agentResult.reason || `agent_non_terminal:${agentResult.status}`,
  }
}

/**
 * EditTask is the single source of truth once a write task reaches its terminal
 * state. The original plan's segment coverage stays strict for steering, but a
 * content-verified completed task must not be downgraded by stale coverage
 * derived from the initial execution plan.
 */
export function mergeEditTaskTerminal(input: EditTaskTerminalEvidenceInput): EditTaskTerminalEvidence {
  const { agentTerminal, editTask } = input
  if (!editTask) return { terminal: agentTerminal, override: false, evidenceReason: 'edit_task_missing' }

  const allBatchesWritten = editTask.executedBatches.length > 0
    && editTask.pendingBatches.length === 0
    && editTask.failedBatchIds.length === 0
  const verified = input.completionReport?.verified === true
  const editTaskVerifiedComplete = editTask.status === 'completed' && allBatchesWritten && verified

  if (!editTaskVerifiedComplete) {
    return {
      terminal: agentTerminal,
      override: false,
      evidenceReason: `edit_task_not_authoritative:${editTask.status}`,
    }
  }

  return {
    terminal: {
      status: 'success',
      reason: agentTerminal.status === 'partially_applied'
        ? 'edit_task_completed_verified'
        : 'edit_task_completed',
    },
    override: true,
    evidenceReason: `dynamic_batches_completed:${editTask.executedBatches.length}`,
  }
}
