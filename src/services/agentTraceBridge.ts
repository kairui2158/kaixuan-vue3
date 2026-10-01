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

  return {
    setRunId(nextRunId: string | null) {
      runId = nextRunId
    },
    attach(): (event: AgentOrchestratorEvent, snapshot: AgentOrchestratorSnapshot) => void {
      return (event, snapshot) => {
        const store = useRunTraceStore(input.pinia)
        const targetRunId = runId || store.currentRunIdBySource?.[input.source]
        if (!targetRunId) return
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
