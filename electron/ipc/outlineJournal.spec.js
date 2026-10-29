import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const outlineJournal = await import('./outlineJournal')

describe('electron ipc outlineJournal', () => {
  let dataDir
  let handlers

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'shenyi-outline-journal-'))
    handlers = new Map()
    outlineJournal.setDataDir(dataDir)
    outlineJournal.registerOutlineJournalHandlers({ handle: (channel, handler) => handlers.set(channel, handler) })
  })

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true })
  })

  it('applies incremental commands, persists a snapshot, and recovers after reload', async () => {
    const apply = await handlers.get('outlineJournal:apply')(null, 'p1', [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '第一条' } },
      { op: 'append', messageId: 'm2', message: { role: 'assistant', content: '第二条' } },
      { op: 'patch', messageId: 'm2', patch: { content: '第二条已更新' } },
    ], { immediate: true })

    expect(apply.ok).toBe(true)
    expect(apply.applied).toEqual(['m1', 'm2', 'm2'])

    outlineJournal.setDataDir(dataDir)
    const reloaded = await handlers.get('outlineJournal:snapshot')(null, 'p1')
    expect(reloaded.ok).toBe(true)
    expect(reloaded.snapshot.messages).toEqual([
      { messageId: 'm1', role: 'user', content: '第一条' },
      { messageId: 'm2', role: 'assistant', content: '第二条已更新' },
    ])
    expect(reloaded.snapshot.pendingSegments).toBe(0)
  })

  it('replays valid segment lines and skips malformed tails after a crash', async () => {
    await handlers.get('outlineJournal:apply')(null, 'p2', [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '消息' } },
    ], {})
    const segmentPath = path.join(dataDir, 'outline-journal_p2.json.segments')
    await fs.appendFile(segmentPath, '{"broken":', 'utf8')

    const snapshot = await handlers.get('outlineJournal:snapshot')(null, 'p2')
    expect(snapshot.ok).toBe(true)
    expect(snapshot.snapshot.messages).toHaveLength(1)
    expect(snapshot.snapshot.pendingSegments).toBe(0)
  })

  it('rejects invalid commands and preserves the last valid journal state', async () => {
    const first = await handlers.get('outlineJournal:apply')(null, 'p3', [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '有效消息' } },
    ], { immediate: true })
    expect(first.ok).toBe(true)

    const invalid = await handlers.get('outlineJournal:apply')(null, 'p3', [{ op: 'append' }], {})
    expect(invalid.ok).toBe(false)
    expect(invalid.error).toBe('invalid_outline_journal_command')

    const snapshot = await handlers.get('outlineJournal:snapshot')(null, 'p3')
    expect(snapshot.snapshot.messages).toEqual([
      { messageId: 'm1', role: 'user', content: '有效消息' },
    ])
  })

  it('migrates legacy messages once, keeps a deterministic checksum, and skips non-empty journals', async () => {
    const migration = await handlers.get('outlineJournal:migrate')(null, 'p4', [
      { role: 'user', content: '旧消息' },
      { id: 'legacy-id', role: 'assistant', content: '旧回复' },
    ])
    expect(migration.ok).toBe(true)
    expect(migration.migrated).toBe(2)
    expect(migration.snapshot.messages[1].messageId).toBe('legacy-id')

    const again = await handlers.get('outlineJournal:migrate')(null, 'p4', [
      { role: 'user', content: '再次迁移' },
    ])
    expect(again.skipped).toBe('journal_not_empty')
    expect(again.snapshot.messages).toEqual(migration.snapshot.messages)
  })

  it('flushes pending segments into an atomic snapshot without losing messages', async () => {
    await handlers.get('outlineJournal:apply')(null, 'p5', [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '第一条' } },
      { op: 'append', messageId: 'm2', message: { role: 'user', content: '第二条' } },
    ], {})

    const flushed = await handlers.get('outlineJournal:flush')(null, 'p5')
    expect(flushed.ok).toBe(true)
    expect(flushed.segmentCount).toBe(0)

    const snapshot = await handlers.get('outlineJournal:snapshot')(null, 'p5')
    expect(snapshot.snapshot.messages).toHaveLength(2)
    await expect(fs.access(path.join(dataDir, 'outline-journal_p5.json.segments'))).rejects.toThrow()
  })

  it('restores an imported snapshot through the journal channel and rolls back atomically', async () => {
    await handlers.get('outlineJournal:apply')(null, 'p6', [
      { op: 'append', messageId: 'old-1', message: { role: 'user', content: '导入前消息' } },
    ], { immediate: true })
    const previous = await handlers.get('outlineJournal:snapshot')(null, 'p6')

    const imported = await handlers.get('outlineJournal:restore')(null, 'p6', {
      schema: 'shenyi.outline-journal',
      version: 1,
      projectId: 'p6',
      messages: [{ messageId: 'new-1', role: 'user', content: '备份消息' }],
      checksum: outlineJournal.__internals.computeChecksum('p6', [
        { messageId: 'new-1', role: 'user', content: '备份消息' },
      ]),
    })
    expect(imported.ok).toBe(true)
    expect(imported.snapshot.messages).toEqual([
      { messageId: 'new-1', role: 'user', content: '备份消息' },
    ])

    // The in-memory cache must follow the restored file; a stale cache would
    // let the next append resurrect the pre-import conversation.
    const cached = await handlers.get('outlineJournal:snapshot')(null, 'p6')
    expect(cached.snapshot.messages).toEqual([
      { messageId: 'new-1', role: 'user', content: '备份消息' },
    ])

    const rollback = await handlers.get('outlineJournal:restore')(null, 'p6', previous.snapshot)
    expect(rollback.ok).toBe(true)
    expect(rollback.snapshot.messages).toEqual([
      { messageId: 'old-1', role: 'user', content: '导入前消息' },
    ])
    await expect(fs.access(path.join(dataDir, 'outline-journal_p6.json.segments'))).rejects.toThrow()

    const invalid = await handlers.get('outlineJournal:restore')(null, 'p6', {
      schema: 'shenyi.outline-journal',
      version: 1,
      projectId: 'p6',
      messages: [],
      checksum: 'broken',
    })
    expect(invalid.ok).toBe(false)
    expect(invalid.error).toBe('checksum_mismatch')
    expect((await handlers.get('outlineJournal:snapshot')(null, 'p6')).snapshot.messages).toEqual([
      { messageId: 'old-1', role: 'user', content: '导入前消息' },
    ])
  })

  it('keeps a migration bak file that later journal compaction cannot overwrite', async () => {
    const legacyMessages = [
      { role: 'user', content: '旧消息一' },
      { role: 'assistant', content: '旧消息二' },
    ]
    await handlers.get('outlineJournal:migrate')(null, 'p7', legacyMessages)
    const bakPath = path.join(dataDir, 'outline-journal_p7.json.legacy-bak')
    expect(JSON.parse(await fs.readFile(bakPath, 'utf8'))).toEqual(legacyMessages)

    await handlers.get('outlineJournal:apply')(null, 'p7', [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '迁移后新消息' } },
    ], { immediate: true })
    await handlers.get('outlineJournal:flush')(null, 'p7')
    expect(JSON.parse(await fs.readFile(bakPath, 'utf8'))).toEqual(legacyMessages)
  })

  it('reports a migration backup as a restorable candidate without replacing the current journal', async () => {
    const legacyMessages = [
      { role: 'user', content: '清空前的历史消息' },
    ]
    const bakPath = path.join(dataDir, 'outline-journal_p12.json.legacy-bak')
    await fs.writeFile(bakPath, JSON.stringify(legacyMessages), 'utf8')

    const current = await handlers.get('outlineJournal:apply')(null, 'p12', [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '清空后的新消息' } },
    ], { immediate: true })
    expect(current.ok).toBe(true)

    const candidate = await handlers.get('outlineJournal:legacyCandidates')(null, 'p12')
    expect(candidate.ok).toBe(true)
    expect(candidate.candidates).toEqual([
      { source: 'legacy-bak', projectId: 'p12', messageCount: 1 },
    ])
    expect(await handlers.get('outlineJournal:snapshot')(null, 'p12')).toMatchObject({
      snapshot: { messages: [{ messageId: 'm1', content: '清空后的新消息' }] },
    })
  })

  it('never overwrites an existing migration backup with a smaller project-embedded conversation', async () => {
    const preservedMessages = [
      { role: 'user', content: '迁移备份中的 76 条历史消息代表' },
      { role: 'assistant', content: '备份回复' },
    ]
    const bakPath = path.join(dataDir, 'outline-journal_p14.json.legacy-bak')
    await fs.writeFile(bakPath, JSON.stringify(preservedMessages), 'utf8')

    const migration = await handlers.get('outlineJournal:migrate')(null, 'p14', [
      { role: 'user', content: '项目内残留的一条当前对话' },
    ])
    expect(migration.ok).toBe(true)
    expect(migration.migrated).toBe(1)
    expect(JSON.parse(await fs.readFile(bakPath, 'utf8'))).toEqual(preservedMessages)

    const candidate = await handlers.get('outlineJournal:legacyCandidates')(null, 'p14')
    expect(candidate.candidates).toEqual([
      { source: 'legacy-bak', projectId: 'p14', messageCount: 2 },
    ])
  })

  it('restores a migration backup only through an explicit restore command', async () => {
    const legacyMessages = [
      { role: 'user', content: '清空前的历史消息' },
      { role: 'assistant', content: '历史回复' },
    ]
    const bakPath = path.join(dataDir, 'outline-journal_p13.json.legacy-bak')
    await fs.writeFile(bakPath, JSON.stringify(legacyMessages), 'utf8')
    await handlers.get('outlineJournal:apply')(null, 'p13', [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '清空后的新消息' } },
    ], { immediate: true })

    const restored = await handlers.get('outlineJournal:restoreLegacy')(null, 'p13')
    expect(restored.ok).toBe(true)
    expect(restored.snapshot.messages.map(message => message.content)).toEqual([
      '清空前的历史消息',
      '历史回复',
    ])
    await expect(fs.access(bakPath)).resolves.toBeUndefined()

    const snapshot = await handlers.get('outlineJournal:snapshot')(null, 'p13')
    expect(snapshot.snapshot.messages.map(message => message.content)).toEqual([
      '清空前的历史消息',
      '历史回复',
    ])
  })

  it('flushes every project with pending segments for a complete backup export', async () => {
    await handlers.get('outlineJournal:apply')(null, 'p8', [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '当前项目' } },
    ], { immediate: true })
    await handlers.get('outlineJournal:apply')(null, 'p9', [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '其他项目增量' } },
    ], {})
    await fs.writeFile(path.join(dataDir, 'outline-journal_p10.json.segments'), '{"broken":', 'utf8')

    const flushedAll = await handlers.get('outlineJournal:flushAll')()
    expect(flushedAll.ok).toBe(true)
    expect(flushedAll.projects.map(project => project.projectId)).toEqual(['p10', 'p9'])
    expect(flushedAll.projects.every(project => project.result.ok)).toBe(true)

    await expect(fs.access(path.join(dataDir, 'outline-journal_p9.json.segments'))).rejects.toThrow()
    const p9 = await handlers.get('outlineJournal:snapshot')(null, 'p9')
    expect(p9.snapshot.messages).toHaveLength(1)
    await expect(fs.access(path.join(dataDir, 'outline-journal_p10.json.segments'))).resolves.toBeUndefined()
    const p10 = await handlers.get('outlineJournal:snapshot')(null, 'p10')
    expect(p10.snapshot.messages).toEqual([])
  })

  it('registers journal test failure control only when test isolation is explicitly enabled', async () => {
    const productionHandlers = new Map()
    outlineJournal.registerOutlineJournalHandlers({
      handle: (channel, handler) => productionHandlers.set(channel, handler),
    })
    expect(productionHandlers.has('outlineJournal:testFailureControl')).toBe(false)

    const testHandlers = new Map()
    outlineJournal.registerOutlineJournalHandlers(
      { handle: (channel, handler) => testHandlers.set(channel, handler) },
      { testIsolationEnabled: true },
    )
    expect(testHandlers.has('outlineJournal:testFailureControl')).toBe(true)

    const control = testHandlers.get('outlineJournal:testFailureControl')
    const activated = await control(null, { op: 'fail', operation: 'apply', error: 'checksum_mismatch_for_e2e' })
    expect(activated).toEqual({ ok: true, operation: 'apply', error: 'checksum_mismatch_for_e2e' })

    const failed = await testHandlers.get('outlineJournal:apply')(null, 'p11', [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '待重试消息' } },
    ], { immediate: true })
    expect(failed).toEqual({ ok: false, error: 'checksum_mismatch_for_e2e' })

    const restored = await control(null, { op: 'clear' })
    expect(restored).toEqual({ ok: true, cleared: true })
    const recovered = await testHandlers.get('outlineJournal:apply')(null, 'p11', [
      { op: 'append', messageId: 'm1', message: { role: 'user', content: '待重试消息' } },
    ], { immediate: true })
    expect(recovered.ok).toBe(true)
  })
})
