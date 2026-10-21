import type { DialogueWriteAuthorization } from './dialogueToolSurface'
import type { EditorEditCommand } from './editorEditProtocol'
import type { OutlineDeletionConfirmation } from './outlineDeletionContract'
import {
  buildOutlineDeletionCommandHash,
  buildOutlineDeletionTargetSignature,
} from './outlineDeletionContract'

export interface OutlineDeletionAuthorizationBatchDetail {
  segmentId?: string
  expectedChange?: string
  invariantResult?: string
}

export type OutlineDeletionAuthorizationResult =
  | { authorized: true; channel: 'user-confirmation'; turnId: string; authorizedDeletedLength: number }
  | { authorized: true; channel: 'workflow-contract'; authorizedDeletedLength: number }
  | { authorized: false; channel: 'denied' }

function isWorkflowDeletionAuthorization(
  writeAuthorization: unknown,
): writeAuthorization is DialogueWriteAuthorization {
  if (!writeAuthorization || typeof writeAuthorization !== 'object') return false
  const authorization = writeAuthorization as Partial<DialogueWriteAuthorization>
  return authorization.source === 'long-document-workflow'
    && (authorization.intent === 'edit' || authorization.intent === 'generate')
    && authorization.operation !== undefined
    && authorization.operation !== 'discussion'
    && authorization.mode !== undefined
    && authorization.mode !== 'final-draft'
}

export function resolveOutlineDeletionAuthorization(input: {
  commands: EditorEditCommand[]
  authorizationTurnId?: string | null
  getPendingConfirmation?: (turnId: string) => OutlineDeletionConfirmation | null
  writeAuthorization?: unknown
  batchDetail?: OutlineDeletionAuthorizationBatchDetail | null
  original?: string
  next?: string
}): OutlineDeletionAuthorizationResult {
  if (input.authorizationTurnId && input.getPendingConfirmation) {
    const confirmation = input.getPendingConfirmation(input.authorizationTurnId)
    const matches = confirmation?.status === 'granted'
      && confirmation.targetSignature === buildOutlineDeletionTargetSignature(input.commands)
      && confirmation.commandHash === buildOutlineDeletionCommandHash(input.commands)
    if (matches && confirmation) {
      return {
        authorized: true,
        channel: 'user-confirmation',
        turnId: confirmation.turnId,
        authorizedDeletedLength: confirmation.expectedDeletedLength,
      }
    }
  }

  if (
    isWorkflowDeletionAuthorization(input.writeAuthorization)
    && input.batchDetail?.invariantResult === 'planned-deletion-only'
    && input.batchDetail.expectedChange === 'remove_duplicate'
  ) {
    const original = input.original
    const next = input.next
    return {
      authorized: true,
      channel: 'workflow-contract',
      authorizedDeletedLength: typeof original === 'string' && typeof next === 'string'
        ? Math.max(0, original.length - next.length)
        : 0,
    }
  }

  return { authorized: false, channel: 'denied' }
}
