import { describe, expect, it } from 'vitest'
import {
  buildOutlineDeletionCommandHash,
  buildOutlineDeletionTargetSignature,
  createOutlineDeletionContract,
} from './outlineDeletionContract'
import {
  resolveOutlineDeletionAuthorization,
} from './outlineDeletionAuthorization'
import type { EditorEditCommand } from './editorEditProtocol'

const deleteCommand: EditorEditCommand = {
  type: 'editor_edit',
  version: 1,
  operation: 'delete',
  target: '第一章 重复章节',
}

function turnLevelGrant() {
  const contract = createOutlineDeletionContract()
  const confirmation = contract.request({
    turnId: 'turn-confirm',
    commands: [deleteCommand],
    original: '第一章 重复章节\n\n正文',
    next: '正文',
    reason: '测试授权',
  })
  contract.grant(confirmation.turnId)
  return contract.getPending(confirmation.turnId)
}

describe('resolveOutlineDeletionAuthorization', () => {
  it('authorizes an exact user-approved deletion batch', () => {
    const authorization = resolveOutlineDeletionAuthorization({
      commands: [deleteCommand],
      authorizationTurnId: 'turn-confirm',
      getPendingConfirmation: turnId => (turnId === 'turn-confirm' ? turnLevelGrant() : null),
    })

    expect(authorization).toEqual({
      authorized: true,
      channel: 'user-confirmation',
      turnId: 'turn-confirm',
      authorizedDeletedLength: 10,
    })
  })

  it('rejects turn-level authorization when the command batch differs', () => {
    const changedCommand = { ...deleteCommand, target: '第二章 另一个章节' }
    const authorization = resolveOutlineDeletionAuthorization({
      commands: [changedCommand],
      authorizationTurnId: 'turn-confirm',
      getPendingConfirmation: turnId => (turnId === 'turn-confirm' ? turnLevelGrant() : null),
    })

    expect(authorization).toEqual({ authorized: false, channel: 'denied' })
  })

  it('authorizes only workflow batches whose invariant is planned deletion only', () => {
    const authorization = resolveOutlineDeletionAuthorization({
      commands: [deleteCommand],
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: 'deduplicate',
        mode: 'edit-task',
      },
      batchDetail: {
        segmentId: 'segment-1',
        expectedChange: 'remove_duplicate',
        invariantResult: 'planned-deletion-only',
      },
      original: '第一章 重复章节\n\n正文',
      next: '正文',
    })

    expect(authorization).toEqual({
      authorized: true,
      channel: 'workflow-contract',
      authorizedDeletedLength: 10,
    })
  })

  it('rejects mixed deletion and rewrite batches using workflow authorization', () => {
    const authorization = resolveOutlineDeletionAuthorization({
      commands: [deleteCommand],
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: 'deduplicate_and_normalize',
        mode: 'edit-task',
      },
      batchDetail: {
        segmentId: 'segment-1',
        expectedChange: 'remove_duplicate_and_rewrite',
        invariantResult: 'planned-deletion-only',
      },
      original: '第一章 重复章节\n\n正文',
      next: '正文',
    })

    expect(authorization).toEqual({ authorized: false, channel: 'denied' })
  })

  it('rejects malformed or discussion-scoped write authorization', () => {
    expect(resolveOutlineDeletionAuthorization({
      commands: [deleteCommand],
      writeAuthorization: null,
      batchDetail: {
        expectedChange: 'remove_duplicate',
        invariantResult: 'planned-deletion-only',
      },
    })).toEqual({ authorized: false, channel: 'denied' })

    expect(resolveOutlineDeletionAuthorization({
      commands: [deleteCommand],
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: 'discussion',
        mode: 'edit-task',
      } as never,
      batchDetail: {
        expectedChange: 'remove_duplicate',
        invariantResult: 'planned-deletion-only',
      },
    })).toEqual({ authorized: false, channel: 'denied' })
  })

  it('does not let workflow authorization override an unmatched turn-level contract', () => {
    const authorization = resolveOutlineDeletionAuthorization({
      commands: [deleteCommand],
      authorizationTurnId: 'turn-confirm',
      getPendingConfirmation: turnId => (turnId === 'turn-confirm' ? turnLevelGrant() : null),
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: 'deduplicate',
        mode: 'edit-task',
      },
      batchDetail: {
        expectedChange: 'remove_duplicate',
        invariantResult: 'planned-deletion-only',
      },
    })

    expect(authorization.channel).toBe('user-confirmation')
    expect(authorization.authorized).toBe(true)
  })
})
