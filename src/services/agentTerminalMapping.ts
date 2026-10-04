import type { RunTraceStatus } from '../stores/runTrace'
import type { AgentOrchestratorTaskResult } from './agentOrchestrator'
import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'

export interface AgentRunTraceTerminal {
  status: RunTraceStatus
  reason: string
}

export interface AgentRunTraceTerminalInput {
  agentResult: Pick<AgentOrchestratorTaskResult, 'status' | 'reason' | 'snapshot'>
  executionPlan?: LongDocumentExecutionPlan
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
