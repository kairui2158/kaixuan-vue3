import type { RunTraceStatus } from '../stores/runTrace'

export interface PipelineApiCallLike {
  status?: string | null
}

export interface ResolvePipelineRunOutcomeInput {
  runStatus?: string | null
  runError?: string | null
  pipelineRunStatus?: string | null
  apiCalls?: PipelineApiCallLike[] | null
  folderStatus?: RunTraceStatus | null
  folderRecoveryKind?: 'none' | 'recovered_from_degraded' | 'recovered_from_failed'
  finalArtifactAccepted?: boolean
  hardSignalUnresolved?: boolean
}

export interface PipelineRunOutcome {
  status: RunTraceStatus
  recoveredFromDegraded: boolean
  recoveredFromFailed?: boolean
  degradedApiCalls: number
  error?: string
}

export function resolvePipelineRunOutcome(
  input: ResolvePipelineRunOutcomeInput
): PipelineRunOutcome {
  const runStatus = input.runStatus || ''
  const runError = input.runError || ''
  const apiCalls = Array.isArray(input.apiCalls) ? input.apiCalls : []
  const degradedApiCalls = apiCalls.filter(call => call?.status === 'degraded').length
  const hasCallStatus = (status: string) =>
    apiCalls.some(call => call?.status === status)

  const owningPipelineStatus = input.pipelineRunStatus || ''
  const recoveredFromFailed = input.folderRecoveryKind === 'recovered_from_failed'
  const recoveredFromDegraded =
    degradedApiCalls > 0 ||
    input.folderRecoveryKind === 'recovered_from_degraded'
  if (runStatus === 'canceled' || owningPipelineStatus === 'canceled' || hasCallStatus('canceled')) {
    return { status: 'canceled', recoveredFromDegraded, recoveredFromFailed, degradedApiCalls }
  }
  if (
    runStatus.startsWith('failed') ||
    owningPipelineStatus === 'failed' ||
    input.folderStatus === 'failed' ||
    (!input.finalArtifactAccepted && hasCallStatus('failed'))
  ) {
    return { status: 'failed', recoveredFromDegraded, recoveredFromFailed, degradedApiCalls, error: runError || undefined }
  }
  const hasBlockedCall = hasCallStatus('blocked')
  if (
    runStatus.startsWith('blocked') ||
    owningPipelineStatus === 'blocked' ||
    (!input.finalArtifactAccepted && hasBlockedCall)
  ) {
    return { status: 'blocked', recoveredFromDegraded, recoveredFromFailed, degradedApiCalls }
  }
  if (input.hardSignalUnresolved) {
    return { status: 'degraded', recoveredFromDegraded, recoveredFromFailed, degradedApiCalls }
  }

  if (input.finalArtifactAccepted && input.folderStatus !== 'blocked') {
    return {
      status: recoveredFromFailed ? 'success_with_warnings' : 'success',
      recoveredFromDegraded: degradedApiCalls > 0 ||
        input.folderRecoveryKind === 'recovered_from_degraded' ||
        input.folderStatus === 'degraded',
      recoveredFromFailed,
      degradedApiCalls
    }
  }

  if (degradedApiCalls > 0 || input.folderStatus === 'degraded') {
    return { status: 'degraded', recoveredFromDegraded: false, degradedApiCalls }
  }
  return { status: 'success', recoveredFromDegraded, recoveredFromFailed, degradedApiCalls }
}
