import type { RunTrace } from '../stores/runTrace'

export interface StateIntegrityFinding {
  runId: string
  source: string
  status: string
  startedAt: number
}

export interface StateIntegrityReport {
  stuckRuns: StateIntegrityFinding[]
  runningApiCalls: Array<StateIntegrityFinding & { callId: string; callSeq: number }>
  healthy: boolean
}

export function checkStateIntegrity(runs: readonly RunTrace[]): StateIntegrityReport {
  const stuckRuns: StateIntegrityFinding[] = []
  const runningApiCalls: StateIntegrityReport['runningApiCalls'] = []
  for (const run of runs) {
    if (run.status === 'running') {
      stuckRuns.push({
        runId: run.id,
        source: run.source,
        status: run.status,
        startedAt: run.startedAt,
      })
    }
    for (const call of run.apiCalls || []) {
      if (call.status !== 'running') continue
      runningApiCalls.push({
        runId: run.id,
        source: run.source,
        status: run.status,
        startedAt: call.startedAt,
        callId: call.id,
        callSeq: call.seq,
      })
    }
  }
  return {
    stuckRuns,
    runningApiCalls,
    healthy: stuckRuns.length === 0 && runningApiCalls.length === 0,
  }
}

