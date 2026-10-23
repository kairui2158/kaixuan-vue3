import type { AgentOrchestratorEvent, AgentOrchestratorSnapshot } from './agentOrchestrator'
import { useRunTraceStore, type RunTraceSource } from '../stores/runTrace'


export interface AgentTraceBridgeInput {
  pinia?: Parameters<typeof useRunTraceStore>[0]
  source: RunTraceSource
  runId?: string | null
}

const AGENT_TRACE_LEVELS: Record<AgentOrchestratorEvent['level'], 'info' | 'warn' | 'error'> = {
  info: 'info',
  warning: 'warn',
  error: 'error',
}

export function createAgentTraceBridge(input: AgentTraceBridgeInput) {
  let runId = input.runId ?? null
  let lastExecutionKey = ''

  return {
    setRunId(nextRunId: string | null) {
      runId = nextRunId
    },
    attach(): (event: AgentOrchestratorEvent, snapshot: AgentOrchestratorSnapshot) => void {
      return (event, snapshot) => {
        const store = useRunTraceStore(input.pinia)
        const targetRunId = runId
        if (!targetRunId) {
          console.warn(`[agent-trace-bridge] dropped event without explicit runId: source=${input.source}`)
          return
        }
        if (!store.getRun(targetRunId)) {
          console.warn(`[agent-trace-bridge] dropped event for unknown runId: source=${input.source} runId=${targetRunId}`)
          return
        }
        const callId = store.getApiCallId(input.source)
        const budget = snapshot.toolRunBudget
        const executionKey = budget
          ? [
              snapshot.executionPhase,
              budget.readToolCalls,
              budget.writeToolCalls,
              budget.controlToolCalls,
              budget.physicalRequests,
              snapshot.successfulWriteCount,
              snapshot.trustedCoverageCount,
              snapshot.planComplete,
            ].join(':')
          : ''
        if (callId && budget && executionKey && executionKey !== lastExecutionKey) {
          store.updateApiCallExecutionSettlement(targetRunId, callId, {
            executionSettlement: {
              phase: snapshot.executionPhase,
              readToolCalls: budget.readToolCalls,
              maxReadToolCalls: budget.maxReadToolCalls,
              writeToolCalls: budget.writeToolCalls,
              reservedWriteToolCalls: budget.reservedWriteToolCalls,
              controlToolCalls: budget.controlToolCalls,
              physicalRequests: budget.physicalRequests,
              maxPhysicalRequests: budget.maxPhysicalRequests,
              exhaustedClasses: budget.exhaustedClasses,
              successfulWriteCount: snapshot.successfulWriteCount,
              trustedCoverageCount: snapshot.trustedCoverageCount,
              planComplete: snapshot.planComplete,
            },
          })
          lastExecutionKey = executionKey
        }
        store.addEvent(targetRunId, {
          type: `agent-${event.type}`,
          level: AGENT_TRACE_LEVELS[event.level],
          label: event.label,
          detail: event.detail,
          payload: event.payload,
        })
        store.addEvent(targetRunId, {
          type: 'agent-snapshot',
          level: 'info',
          label: `任务快照：${snapshot.status}`,
          detail: snapshot.reason,
          payload: { snapshot },
        })
      }
    },
  }
}
