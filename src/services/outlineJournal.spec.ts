import { describe, expect, it } from 'vitest'
import {
  applyOutlineJournalCommands,
  buildOutlineBackupImportPlan,
  computeOutlineJournalChecksum,
  createOutlineJournalSnapshot,
  createOutlineMessageId,
  ensureOutlineMessageIds,
  validateOutlineJournalSnapshot,
} from './outlineJournal'

describe('outlineJournal', () => {
  it('assigns stable message ids without reusing legacy ids as message ids', () => {
    const legacy = { role: 'user', content: '旧消息', id: 'legacy-id' }
    const first = ensureOutlineMessageIds([legacy])
    expect(first[0].messageId).toBe('legacy-id')
    const generated = createOutlineMessageId({ role: 'user', content: '新消息' }, 3)
    expect(generated).toMatch(/^outline-msg-/)
  })

  it('applies append, patch, replace, remove, and clear commands', () => {
    const snapshot = createOutlineJournalSnapshot('p1', [])
    const append = applyOutlineJournalCommands(snapshot, [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '第一条' } },
      { op: 'append', messageId: 'm2', message: { role: 'assistant', content: '第二条' } },
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '重复追加' } },
      {
        op: 'patch',
        messageId: 'm2',
        patch: { content: '第二条已更新', routingFallback: undefined, outlineDeletionConfirmation: undefined },
      },
      { op: 'replace', messageId: 'm3', message: { role: 'assistant', content: '替换/追加' } },
      { op: 'remove', messageId: 'm1' },
    ])
    expect(append.messages.map(message => message.messageId)).toEqual(['m2', 'm3'])
    expect(append.messages[0]).toEqual({
      messageId: 'm2',
      role: 'assistant',
      content: '第二条已更新',
    })

    const cleared = applyOutlineJournalCommands(append, [{ op: 'clear' }])
    expect(cleared.messages).toEqual([])
    expect(cleared.checksum).toBe(computeOutlineJournalChecksum('p1', []))
  })

  it('validates snapshot checksum and project identity before recovery', () => {
    const snapshot = createOutlineJournalSnapshot('p1', [{ role: 'user', content: '消息' }])
    expect(validateOutlineJournalSnapshot(snapshot, { projectId: 'p1' }).valid).toBe(true)
    expect(validateOutlineJournalSnapshot(snapshot, { projectId: 'p2' }).reason).toBe('project_mismatch')
    expect(validateOutlineJournalSnapshot({ ...snapshot, checksum: 'broken' }).reason).toBe('checksum_mismatch')
    expect(validateOutlineJournalSnapshot(null).reason).toBe('invalid_snapshot')
  })

  it('keeps checksum deterministic across key order changes', () => {
    const left = createOutlineJournalSnapshot('p1', [{ role: 'user', content: 'x', extra: { b: 2, a: 1 }, list: [2, 1] }])
    const right = createOutlineJournalSnapshot('p1', [{ extra: { a: 1, b: 2 }, list: [2, 1], content: 'x', role: 'user' }])
    expect(left.checksum).toBe(right.checksum)
  })

  it('builds an atomic backup import plan and rejects invalid journal snapshots', async () => {
    const validJournal = createOutlineJournalSnapshot('p1', [{ role: 'user', content: '消息' }])
    const backup = {
      'github_token': 'token',
      'outline-journal_p1': validJournal,
      'outline-journal_p2': { ...validJournal, checksum: 'broken' },
    }
    const rejected = await buildOutlineBackupImportPlan(backup)
    expect(rejected.valid).toBe(false)
    expect(rejected.reason).toBe('invalid_outline_journal_snapshot')
    expect(rejected.invalidJournalKeys).toEqual(['outline-journal_p2'])
    expect(rejected.steps).toEqual([])

    const stored = new Map([['github_token', 'old-token'], ['outline-journal_p1', null]])
    const accepted = await buildOutlineBackupImportPlan({
      'github_token': 'token',
      'outline-journal_p1': validJournal,
    }, { storageRead: async key => stored.get(key) })
    expect(accepted.valid).toBe(true)
    expect(accepted.steps).toEqual([
      { key: 'github_token', value: 'token', previous: 'old-token', committed: false },
      { key: 'outline-journal_p1', value: validJournal, previous: null, committed: false },
    ])
  })

  it('rejects non-object backups before creating any import step', async () => {
    expect((await buildOutlineBackupImportPlan([])).reason).toBe('invalid_backup_object')
    expect((await buildOutlineBackupImportPlan('backup')).reason).toBe('invalid_backup_object')
  })
})
