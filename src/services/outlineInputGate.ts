export type OutlineInputGateMode = 'new_run' | 'resume_run' | 'free'

export type OutlineInputGateState = {
  mode: OutlineInputGateMode
  canSend: boolean
  sendTarget: 'new_run' | 'resume_run'
  disabledReason: string | null
  runId: string | null
  resumeToken: string | null
}

export type OutlineInputGateInput = {
  isGenerating: boolean
  awaitingUser: boolean
  runId?: string | null
  resumeToken?: string | null
  sendStarting?: boolean
  runLease?: 'same_run' | 'new_run' | 'expired' | 'none'
}

export type OutlineInputGateFlags = {
  sendStarting: boolean
  runLease: 'same_run' | 'new_run' | 'expired' | 'none'
}

export type OutlineInputEntryKind =
  | 'send'
  | 'routing_continue'
  | 'routing_bypass'
  | 'budget_resume'
  | 'regenerate'

export type OutlineEntryDecision = {
  allowed: boolean
  deferReason: string | null
  expectedSendTarget: OutlineInputGateState['sendTarget']
}

export function createOutlineInputGateFlags(): OutlineInputGateFlags {
  return {
    sendStarting: false,
    runLease: 'none',
  }
}

export function resolveOutlineInputGate(input: OutlineInputGateInput): OutlineInputGateState {
  if (input.sendStarting) {
    return {
      mode: 'free',
      canSend: false,
      sendTarget: 'new_run',
      disabledReason: 'send_starting',
      runId: input.runId || null,
      resumeToken: input.resumeToken || null,
    }
  }

  if (input.awaitingUser) {
    const hasRunLease = Boolean(input.runId) && input.runLease !== 'none' && input.runLease !== 'expired'
    if (!hasRunLease) {
      return {
        mode: 'free',
        canSend: true,
        sendTarget: 'new_run',
        disabledReason: null,
        runId: input.runId || null,
        resumeToken: input.resumeToken || null,
      }
    }
    return {
      mode: 'resume_run',
      canSend: true,
      sendTarget: 'resume_run',
      disabledReason: null,
      runId: input.runId || null,
      resumeToken: input.resumeToken || null,
    }
  }

  if (input.isGenerating) {
    return {
      mode: 'free',
      canSend: false,
      sendTarget: 'new_run',
      disabledReason: 'generation_running',
      runId: input.runId || null,
      resumeToken: input.resumeToken || null,
    }
  }

  return {
    mode: 'new_run',
    canSend: true,
    sendTarget: 'new_run',
    disabledReason: null,
    runId: input.runId || null,
    resumeToken: input.resumeToken || null,
  }
}

export function resolveOutlineEntryDecision(
  entry: OutlineInputEntryKind,
  gate: OutlineInputGateState,
): OutlineEntryDecision {
  // 'free' only marks a physical request already in flight; it can never be
  // its own send target, so it resolves to the run lease instead.
  if (!gate.canSend) {
    return {
      allowed: false,
      deferReason: gate.disabledReason || 'input_blocked',
      expectedSendTarget: gate.sendTarget,
    }
  }

  // A routing confirmation is part of the waiting turn: it must follow the
  // run lease instead of silently creating a second physical run.
  if (entry === 'routing_continue' && gate.mode === 'resume_run') {
    return {
      allowed: true,
      deferReason: null,
      expectedSendTarget: 'resume_run',
    }
  }

  return {
    allowed: true,
    deferReason: null,
    expectedSendTarget: 'new_run',
  }
}
