import { describe, expect, it } from 'vitest'
import type { EditorTargetSnapshot } from './editorTarget'
import { executeEditTask } from './editTaskExecutor'

function snapshot(content: string, version = 1): EditorTargetSnapshot {
  return {
    workspace: 'outline',
    targetId: 'outline',
    label: '大纲',
    content,
    contentVersion: version,
    selectionStart: 0,
    selectionEnd: 0,
    selectedText: '',
    mode: 'outline',
  }
}

const hash = (content: string) => `hash:${content}`

describe('executeEditTask', () => {
  it('runs all batches and finishes with completed state', async () => {
    let current = snapshot('abc')
    const events: string[] = []
    const result = await executeEditTask({
      sessionId: 'session-1',
      source: 'outline',
      workspace: 'outline',
      targetId: 'outline',
      goal: '整理大纲',
      scenario: 'direct',
      getSnapshot: () => current,
      hashContent: hash,
      batches: [
        {
          batchId: 'batch-1',
          run: async () => {
            current = snapshot('abc2', 2)
            return { ok: true, documentVersion: 2, contentHash: 'hash:abc2' }
          },
        },
        {
          batchId: 'batch-2',
          run: async () => {
            current = snapshot('abc3', 3)
            return { ok: true, documentVersion: 3, contentHash: 'hash:abc3' }
          },
        },
      ],
      callbacks: { onStatus: status => events.push(status) },
    })

    expect(result?.task.status).toBe('completed')
    expect(result?.task.executedBatches).toEqual(['batch-1', 'batch-2'])
    expect(events).toContain('任务完成')
  })

  it('pauses after the tool-loop limit instead of replaying the whole task', async () => {
    let current = snapshot('abc')
    const runs: string[] = []
    const result = await executeEditTask({
      sessionId: 'session-1',
      source: 'outline',
      workspace: 'outline',
      targetId: 'outline',
      goal: '整理大纲',
      scenario: 'direct',
      getSnapshot: () => current,
      hashContent: hash,
      batches: [
        { batchId: 'batch-1', run: async () => { runs.push('batch-1'); current = snapshot('abc2', 2); return { ok: true, documentVersion: 2, contentHash: 'hash:abc2' } } },
        { batchId: 'batch-2', run: async () => { runs.push('batch-2'); return { ok: false, documentVersion: 2, contentHash: 'hash:abc2', error: 'target_not_found', failedIndexes: [4] } } },
        { batchId: 'batch-3', run: async () => { runs.push('batch-3'); return { ok: true, documentVersion: 4, contentHash: 'hash:abc4' } } },
      ],
    })

    expect(runs).toEqual(['batch-1', ...Array.from({ length: 6 }, () => 'batch-2')])
    expect(result?.task.status).toBe('waiting_user')
    expect(result?.task.executedBatches).toEqual(['batch-1'])
    expect(result?.task.failedBatchIds).toEqual(['batch-2'])
  })

  it('retries only the failed batch up to the scenario tool-loop limit', async () => {
    let current = snapshot('abc')
    const runs: string[] = []
    const result = await executeEditTask({
      sessionId: 'session-1',
      source: 'outline',
      workspace: 'outline',
      targetId: 'outline',
      goal: '整理大纲',
      scenario: 'direct',
      getSnapshot: () => current,
      hashContent: hash,
      batches: [
        { batchId: 'batch-1', run: async () => { runs.push('batch-1'); current = snapshot('abc2', 2); return { ok: true, documentVersion: 2, contentHash: 'hash:abc2' } } },
        {
          batchId: 'batch-2',
          run: async () => {
            runs.push('batch-2')
            return { ok: false, documentVersion: 2, contentHash: 'hash:abc2', error: 'target_not_found', failedIndexes: [4] }
          },
        },
        { batchId: 'batch-3', run: async () => { runs.push('batch-3'); return { ok: true, documentVersion: 4, contentHash: 'hash:abc4' } } },
      ],
    })

    expect(runs).toEqual([
      'batch-1',
      'batch-2',
      'batch-2',
      'batch-2',
      'batch-2',
      'batch-2',
      'batch-2',
    ])
    expect(result?.task.status).toBe('waiting_user')
    expect(result?.task.executedBatches).toEqual(['batch-1'])
    expect(result?.task.failedBatchIds).toEqual(['batch-2'])
  })

  it('pauses before writing when the checkpoint no longer matches the document', async () => {
    let version = 1
    const current = snapshot('abc', version)
    const result = await executeEditTask({
      sessionId: 'session-1',
      source: 'outline',
      workspace: 'outline',
      targetId: 'outline',
      goal: '整理大纲',
      scenario: 'direct',
      getSnapshot: () => snapshot('changed', ++version),
      hashContent: hash,
      batches: [
        { batchId: 'batch-1', run: async () => ({ ok: true, documentVersion: 2, contentHash: 'hash:changed' }) },
      ],
    })

    expect(result?.task.status).toBe('waiting_user')
    expect(result?.lastResult?.error?.code).toBe('document_version_mismatch')
    expect(result?.task.executedBatches).toEqual([])
  })

  it('returns failed_after_write if no batch can run and writes already happened', async () => {
    const current = snapshot('abc')
    const result = await executeEditTask({
      sessionId: 'session-1',
      source: 'outline',
      workspace: 'outline',
      targetId: 'outline',
      goal: '整理大纲',
      scenario: 'direct',
      getSnapshot: () => current,
      hashContent: hash,
      batches: [
        { batchId: 'batch-1', run: async () => ({ ok: true, documentVersion: 2, contentHash: 'hash:abc2' }) },
      ],
      signal: AbortSignal.abort(),
    })

    expect(result?.task.status).toBe('canceled')
  })
})
