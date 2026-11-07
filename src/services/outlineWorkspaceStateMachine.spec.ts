import { describe, expect, it } from 'vitest'

import { createEditorTargetSnapshot } from './editorTarget'
import {
  createOutlineInputGateFlags,
  resolveOutlineEntryDecision,
  resolveOutlineInputGate,
} from './outlineInputGate'

describe('outline workspace state machine', () => {
  it('unlocks only after the orchestrator reaches a terminal user-facing state', () => {
    const running = resolveOutlineInputGate({ isGenerating: true, awaitingUser: false })
    const awaiting = resolveOutlineInputGate({
      isGenerating: false,
      awaitingUser: true,
      runId: 'run-1',
      runLease: 'same_run',
      resumeToken: 'token-1',
    })

    expect(running).toMatchObject({ canSend: false, disabledReason: 'generation_running' })
    expect(awaiting).toMatchObject({ mode: 'resume_run', canSend: true, sendTarget: 'resume_run' })
  })

  it('retires agent-reply early unlocking as a separate execution mode', () => {
    expect(resolveOutlineInputGate({ isGenerating: true, awaitingUser: false })).not.toHaveProperty('agent_reply')
    expect('agent_reply' in resolveOutlineInputGate({ isGenerating: true, awaitingUser: false })).toBe(false)
    expect(createOutlineInputGateFlags()).toEqual({ sendStarting: false, runLease: 'none' })
  })

  it('refreshes the run lease when a resumed final-draft turn starts', () => {
    const flags = createOutlineInputGateFlags()
    flags.runLease = 'expired'

    const resumedGate = resolveOutlineInputGate({
      isGenerating: true,
      awaitingUser: false,
      runId: 'run-resume',
      ...flags,
    })
    flags.runLease = 'same_run'
    const resumedGateAfterStart = resolveOutlineInputGate({
      isGenerating: false,
      awaitingUser: true,
      runId: 'run-resume',
      resumeToken: 'token-resume',
      ...flags,
    })

    expect(resumedGate).toMatchObject({ canSend: false, disabledReason: 'generation_running' })
    expect(resumedGateAfterStart).toMatchObject({ mode: 'resume_run', canSend: true })
  })

  it('gates every secondary entry while a physical request is running', () => {
    const gate = resolveOutlineInputGate({ isGenerating: true, awaitingUser: false })

    for (const entry of ['routing_continue', 'routing_bypass', 'budget_resume', 'regenerate'] as const) {
      expect(resolveOutlineEntryDecision(entry, gate)).toMatchObject({
        allowed: false,
        deferReason: 'generation_running',
      })
    }
  })

  it('derives the final-draft document version from stable outline content', () => {
    const before = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲',
      content: '旧大纲',
    })
    const same = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲',
      content: '旧大纲',
    })
    const after = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲',
      content: '新大纲',
    })

    expect(same.contentVersion).toBe(before.contentVersion)
    expect(after.contentVersion).not.toBe(before.contentVersion)
  })
})
