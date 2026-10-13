import type { RunTraceStatus } from '../stores/runTrace'

export interface PipelineApiCallLike {
  status?: string | null
}

export interface ResolvePipelineRunOutcomeInput {
  generationStatus?: string | null
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
  const generationStatus = input.generationStatus || ''
  const apiCalls = Array.isArray(input.apiCalls) ? input.apiCalls : []
  const degradedApiCalls = apiCalls.filter(call => call?.status === 'degraded').length
  const hasCallStatus = (status: string) =>
    apiCalls.some(call => call?.status === status)

  if (generationStatus === 'canceled' || hasCallStatus('canceled')) {
    return { status: 'canceled', recoveredFromDegraded: false, degradedApiCalls }
  }
  if (generationStatus.startsWith('failed') || hasCallStatus('failed')) {
    return { status: 'failed', recoveredFromDegraded: false, degradedApiCalls }
  }
  if (generationStatus.startsWith('blocked') || hasCallStatus('blocked')) {
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
