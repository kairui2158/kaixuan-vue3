import { describe, expect, it } from 'vitest'

import {
  resolveOutlineEntryDecision,
  resolveOutlineInputGate,
} from './outlineInputGate'

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

  it('retires agent-reply early unlocking while a physical request is running', () => {
    expect(resolveOutlineInputGate({
      isGenerating: true,
      awaitingUser: false,
      runId: 'run-1',
    })).toMatchObject({
      mode: 'free',
      canSend: false,
      disabledReason: 'generation_running',
    })
  })

  it('does not treat a running-request free gate as a resumable send target', () => {
    const gate = resolveOutlineInputGate({
      isGenerating: true,
      awaitingUser: false,
      runId: 'run-1',
    })

    expect(gate).toMatchObject({ mode: 'free', canSend: false, sendTarget: 'new_run' })
    expect(resolveOutlineEntryDecision('send', gate)).toMatchObject({
      allowed: false,
      expectedSendTarget: 'new_run',
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

  it('routes all secondary outline entries through the same gate decision', () => {
    const gate = resolveOutlineInputGate({
      isGenerating: true,
      awaitingUser: false,
      runId: 'run-1',
    })

    for (const entry of ['routing_continue', 'routing_bypass', 'budget_resume', 'regenerate'] as const) {
      expect(resolveOutlineEntryDecision(entry, gate)).toEqual({
        allowed: false,
        deferReason: 'generation_running',
        expectedSendTarget: 'new_run',
      })
    }
  })

  it('keeps routing continue bound to an awaiting run lease', () => {
    const gate = resolveOutlineInputGate({
      isGenerating: false,
      awaitingUser: true,
      runId: 'run-1',
      runLease: 'same_run',
      resumeToken: 'token-1',
    })

    expect(resolveOutlineEntryDecision('routing_continue', gate)).toEqual({
      allowed: true,
      deferReason: null,
      expectedSendTarget: 'resume_run',
    })
  })

  it('forces secondary entries to a new run when the awaiting lease expired', () => {
    const gate = resolveOutlineInputGate({
      isGenerating: false,
      awaitingUser: true,
      runId: 'run-1',
      runLease: 'expired',
    })

    expect(resolveOutlineEntryDecision('routing_continue', gate)).toEqual({
      allowed: true,
      deferReason: null,
      expectedSendTarget: 'new_run',
    })
  })
})
