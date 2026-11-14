import { describe, expect, it } from 'vitest'
import { resolvePipelineRunOutcome } from './pipelineRunOutcome'

describe('resolvePipelineRunOutcome', () => {
  it('keeps a successful final artifact successful despite intermediate degraded calls', () => {
    const outcome = resolvePipelineRunOutcome({
      runStatus: '',
      apiCalls: [
        { status: 'success' },
        { status: 'degraded' },
        { status: 'degraded' },
        { status: 'success' }
      ],
      folderStatus: 'degraded',
      finalArtifactAccepted: true
    })

    expect(outcome.status).toBe('success')
    expect(outcome.recoveredFromDegraded).toBe(true)
    expect(outcome.degradedApiCalls).toBe(2)
  })

  it('does not let an accepted artifact override a failed folder verdict', () => {
    const outcome = resolvePipelineRunOutcome({
      runStatus: '',
      apiCalls: [{ status: 'success' }],
      folderStatus: 'failed',
      finalArtifactAccepted: true
    })

    expect(outcome.status).toBe('failed')
    expect(outcome.recoveredFromDegraded).toBe(false)
  })

  it('does not let intermediate degraded calls mask a failed final artifact', () => {
    const outcome = resolvePipelineRunOutcome({
      runStatus: '',
      apiCalls: [{ status: 'degraded' }],
      folderStatus: null,
      finalArtifactAccepted: false
    })

    expect(outcome.status).toBe('degraded')
    expect(outcome.recoveredFromDegraded).toBe(false)
  })

  it('does not let historical call failures poison an accepted final artifact', () => {
    const outcome = resolvePipelineRunOutcome({
      runStatus: '',
      apiCalls: [
        { status: 'failed' },
        { status: 'success' },
        { status: 'success' }
      ],
      folderStatus: null,
      finalArtifactAccepted: true
    })

    expect(outcome.status).toBe('success')
    expect(outcome.recoveredFromDegraded).toBe(false)
  })

  it('keeps failure priority above artifact acceptance', () => {
    const outcome = resolvePipelineRunOutcome({
      runStatus: 'failed: 写入失败',
      apiCalls: [{ status: 'success' }],
      folderStatus: null,
      finalArtifactAccepted: true
    })

    expect(outcome.status).toBe('failed')
    expect(outcome.recoveredFromDegraded).toBe(false)
  })

  it('lets the owning pipeline run failure override a locally successful trace', () => {
    const outcome = resolvePipelineRunOutcome({
      runStatus: '',
      pipelineRunStatus: 'failed',
      apiCalls: [{ status: 'success' }],
      folderStatus: null,
      finalArtifactAccepted: true
    })

    expect(outcome.status).toBe('failed')
  })

  it('keeps the owning pipeline run cancellation even when API calls report success', () => {
    const outcome = resolvePipelineRunOutcome({
      runStatus: '',
      pipelineRunStatus: 'canceled',
      apiCalls: [{ status: 'success' }],
      folderStatus: null,
      finalArtifactAccepted: true
    })

    expect(outcome.status).toBe('canceled')
  })

  it('keeps a hard_signal_unresolved body degraded even after artifact acceptance', () => {
    const outcome = resolvePipelineRunOutcome({
      runStatus: '',
      apiCalls: [{ status: 'success' }],
      folderStatus: null,
      finalArtifactAccepted: true,
      hardSignalUnresolved: true
    })

    expect(outcome.status).toBe('degraded')
    expect(outcome.recoveredFromDegraded).toBe(false)
  })

  it('does not let hard_signal_unresolved mask a real failure', () => {
    const outcome = resolvePipelineRunOutcome({
      runStatus: 'failed: 写入失败',
      apiCalls: [{ status: 'success' }],
      folderStatus: null,
      finalArtifactAccepted: true,
      hardSignalUnresolved: true
    })

    expect(outcome.status).toBe('failed')
  })

  it('preserves canceled and blocked semantics', () => {
    expect(resolvePipelineRunOutcome({
      runStatus: 'canceled',
      apiCalls: [{ status: 'success' }],
      finalArtifactAccepted: true
    }).status).toBe('canceled')

    expect(resolvePipelineRunOutcome({
      runStatus: '',
      apiCalls: [{ status: 'blocked' }],
      finalArtifactAccepted: true
    }).status).toBe('blocked')
  })

  it('returns success when no run evidence reports a problem', () => {
    const outcome = resolvePipelineRunOutcome({
      runStatus: '',
      apiCalls: [{ status: 'success' }],
      folderStatus: null,
      finalArtifactAccepted: true
    })

    expect(outcome.status).toBe('success')
    expect(outcome.recoveredFromDegraded).toBe(false)
  })
})
