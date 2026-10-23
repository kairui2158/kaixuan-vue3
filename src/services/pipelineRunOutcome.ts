import type { RunTraceStatus } from '../stores/runTrace'

export interface PipelineApiCallLike {
  status?: string | null
}

export interface ResolvePipelineRunOutcomeInput {
  runStatus?: string | null
  apiCalls?: PipelineApiCallLike[] | null
  folderStatus?: RunTraceStatus | null
  finalArtifactAccepted?: boolean
  hardSignalUnresolved?: boolean
}

export interface PipelineRunOutcome {
  status: RunTraceStatus
  recoveredFromDegraded: boolean
  degradedApiCalls: number
}

export function resolvePipelineRunOutcome(
  input: ResolvePipelineRunOutcomeInput
): PipelineRunOutcome {
  const runStatus = input.runStatus || ''
  const apiCalls = Array.isArray(input.apiCalls) ? input.apiCalls : []
  const degradedApiCalls = apiCalls.filter(call => call?.status === 'degraded').length
  const hasCallStatus = (status: string) =>
    apiCalls.some(call => call?.status === status)

  if (runStatus === 'canceled' || hasCallStatus('canceled')) {
    return { status: 'canceled', recoveredFromDegraded: false, degradedApiCalls }
  }
  if (runStatus.startsWith('failed') || hasCallStatus('failed')) {
    return { status: 'failed', recoveredFromDegraded: false, degradedApiCalls }
  }
  if (runStatus.startsWith('blocked') || hasCallStatus('blocked')) {
    return { status: 'blocked', recoveredFromDegraded: false, degradedApiCalls }
  }
  if (input.hardSignalUnresolved) {
    return { status: 'degraded', recoveredFromDegraded: false, degradedApiCalls }
  }

  if (input.finalArtifactAccepted) {
    return {
      status: 'success',
      recoveredFromDegraded: degradedApiCalls > 0 || input.folderStatus === 'degraded',
      degradedApiCalls
    }
  }

  if (input.folderStatus === 'failed') {
    return { status: 'failed', recoveredFromDegraded: false, degradedApiCalls }
  }
  if (degradedApiCalls > 0 || input.folderStatus === 'degraded') {
    return { status: 'degraded', recoveredFromDegraded: false, degradedApiCalls }
  }
  return { status: 'success', recoveredFromDegraded: false, degradedApiCalls }
}
