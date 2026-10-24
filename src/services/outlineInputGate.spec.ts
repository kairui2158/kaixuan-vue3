import { describe, expect, it } from 'vitest'

import { resolveOutlineInputGate } from './outlineInputGate'

describe('resolveOutlineInputGate', () => {
  it('creates a new run when the workspace is idle', () => {
    expect(resolveOutlineInputGate({ isGenerating: false, awaitingUser: false })).toMatchObject({
      mode: 'new_run',
      canSend: true,
      sendTarget: 'new_run',
      disabledReason: null,
    })
  })

  it('blocks input while a physical generation is running', () => {
    expect(resolveOutlineInputGate({ isGenerating: true, awaitingUser: false })).toMatchObject({
      canSend: false,
      disabledReason: 'generation_running',
    })
  })

  it('routes an awaiting run to resume mode when the lease is valid', () => {
    expect(resolveOutlineInputGate({
      isGenerating: false,
      awaitingUser: true,
      runId: 'run-1',
      runLease: 'same_run',
      resumeToken: 'token-1',
    })).toMatchObject({
      mode: 'resume_run',
      canSend: true,
      sendTarget: 'resume_run',
      runId: 'run-1',
      resumeToken: 'token-1',
    })
  })

  it('does not bind expired or missing leases to the old run', () => {
    for (const runLease of ['expired', 'none'] as const) {
      expect(resolveOutlineInputGate({
        isGenerating: false,
        awaitingUser: true,
        runId: 'run-1',
        runLease,
      })).toMatchObject({
        mode: 'free',
        sendTarget: 'new_run',
        runId: 'run-1',
      })
    }
  })

  it('keeps agent replies usable while the orchestrator waits for the user', () => {
    expect(resolveOutlineInputGate({
      isGenerating: true,
      awaitingUser: false,
      runId: 'run-1',
      interactiveResponseActive: true,
    })).toMatchObject({
      mode: 'agent_reply',
      canSend: true,
      sendTarget: 'agent_reply',
    })
  })

  it('suppresses duplicate submits', () => {
    expect(resolveOutlineInputGate({
      isGenerating: false,
      awaitingUser: false,
      sendStarting: true,
    })).toMatchObject({
      canSend: false,
      disabledReason: 'send_starting',
    })
  })
})
