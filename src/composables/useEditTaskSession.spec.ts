import { describe, expect, it } from 'vitest'
import { useEditTaskSession } from './useEditTaskSession'
import { hashEditorContent } from '../services/editorTarget'

function session(events: string[] = []) {
  return useEditTaskSession({
    sessionId: 'session-1',
    source: 'outline',
    hashContent: hashEditorContent,
    onLifecycle: event => events.push(event.type),
  })
}

const batchInput = {
  target: { workspace: 'outline' as const, targetId: 'outline' },
  goal: '整理大纲',
  batchId: 'batch-1',
  snapshot: {
    contentVersion: 1,
    contentHash: hashEditorContent('大纲'),
  },
}

describe('useEditTaskSession', () => {
  it('wraps a successful write as one task lifecycle', async () => {
    const events: string[] = []
    const result = await session(events).startOrContinueBatch(batchInput, async () => ({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('新大纲'),
    }))

    expect(result.ok).toBe(true)
    expect(events).toContain('task_started')
    expect(events).toContain('batch_succeeded')
    expect(events).toContain('task_finished')
  })

  it('records a failed batch without inventing a success state', async () => {
    const events: string[] = []
    const testSession = session(events)
    const result = await testSession.startOrContinueBatch(batchInput, async () => ({
      ok: false,
      code: 'version_changed',
      message: '文档已变化',
    }))

    expect(result.ok).toBe(false)
    expect(events).toContain('batch_failed')
    expect(events).not.toContain('task_finished')
    expect(testSession.activeTask()?.status).not.toBe('completed')
  })

  it('ends an integrity failure before any write as a terminal task', async () => {
    const events: string[] = []
    const testSession = session(events)
    const result = await testSession.startOrContinueBatch(batchInput, async () => ({
      ok: false,
      code: 'integrity_failed',
    }))

    expect(result.ok).toBe(false)
    expect(events).toContain('batch_failed')
    expect(events).not.toContain('task_finished')
    expect(testSession.activeTask()).toBeNull()
  })

  it('marks a no-write direct-write failure as failed_before_write', async () => {
    const events: string[] = []
    const testSession = session(events)
    const result = await testSession.startOrContinueBatch(batchInput, async () => ({
      ok: false,
      code: 'integrity_failed',
      applied: false,
    }))

    expect(result.ok).toBe(false)
    expect(events).toContain('batch_failed')
    expect(events).not.toContain('task_finished')
    expect(testSession.activeTask()).toBeNull()
    expect(testSession.activeTaskRef().value).toBeNull()
  })

  it('finishes a successful task and clears it from the active banner', async () => {
    const events: string[] = []
    const testSession = session(events)
    await testSession.startOrContinueBatch(batchInput, async () => ({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('新大纲'),
    }))

    expect(testSession.activeTask()).toBeNull()
    expect(events).toEqual([
      'task_started',
      'batch_started',
      'batch_succeeded',
      'task_finished',
    ])
  })

  it('cancel clears the active task and emits cancellation', async () => {
    const events: string[] = []
    const testSession = session(events)
    let resolveRun: ((value: {
      ok: true
      documentVersion: number
      contentHash: string
    }) => void) = () => {}
    const running = testSession.startOrContinueBatch(batchInput, () => new Promise<{
      ok: true
      documentVersion: number
      contentHash: string
    }>(resolve => {
      resolveRun = () => resolve({
        ok: true,
        documentVersion: 2,
        contentHash: hashEditorContent('取消后结果'),
      })
    }))

    expect(testSession.activeTask()?.status).toBe('running_batch')
    const activeTaskId = testSession.activeTask()!.id
    const cancelResult = await testSession.onCancelEditTask(activeTaskId)
    expect(cancelResult.ok).toBe(true)
    resolveRun({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('取消后结果'),
    })
    await running
    expect(events).not.toContain('task_finished')

    expect(events).toContain('task_canceled')
    expect(testSession.activeTask()).toBeNull()
  })

  it('does not resume a no-write failed task and requires a new full batch', async () => {
    const events: string[] = []
    const testSession = session(events)
    await testSession.startOrContinueBatch(batchInput, async () => ({
      ok: false,
      code: 'integrity_failed',
      applied: false,
    }))

    expect(testSession.activeTask()).toBeNull()
    expect(events).toEqual([
      'task_started',
      'batch_started',
      'batch_failed',
    ])

    const result = await testSession.startOrContinueBatch(batchInput, async () => ({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('修复后大纲'),
    }))

    expect(result.ok).toBe(true)
    expect(testSession.activeTask()).toBeNull()
    expect(events).toEqual([
      'task_started',
      'batch_started',
      'batch_failed',
      'task_started',
      'batch_started',
      'batch_succeeded',
      'task_finished',
    ])
  })

  it('keeps a multi-batch task open until the request is explicitly finished', async () => {
    const events: string[] = []
    const testSession = session(events)
    const result1 = await testSession.startOrContinueBatch(batchInput, async () => ({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('第一批完成'),
    }), { multiBatch: true })
    const result2 = await testSession.startOrContinueBatch(
      { ...batchInput, batchId: 'batch-2' },
      async () => ({
        ok: true,
        documentVersion: 3,
        contentHash: hashEditorContent('第二批完成'),
      }),
      { multiBatch: true },
    )
    const active = testSession.activeTask()
    expect(result1.ok).toBe(true)
    expect(result2.ok).toBe(true)
    expect(active?.executedBatches).toEqual(['batch-1', 'batch-2'])
    expect(active?.pendingBatches).toEqual([])
    expect(active?.status).toBe('awaiting_batch')
    expect(events).not.toContain('task_finished')

    const finished = testSession.finishActiveTask()
    expect(finished?.status).toBe('completed')
    expect(testSession.activeTask()).toBeNull()
    expect(events).toContain('task_finished')
  })

  it('keeps planner segment metadata for every multi-batch checkpoint', async () => {
    const testSession = session([])
    await testSession.startOrContinueBatch({
      ...batchInput,
      batchDetail: {
        segmentId: 'segment-0001',
        expectedChange: 'reorder-only',
        invariantResult: 'structure-preserved',
      },
    }, async () => ({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('第一批完成'),
    }), { multiBatch: true })
    await testSession.startOrContinueBatch({
      ...batchInput,
      batchId: 'batch-2',
      batchDetail: {
        segmentId: 'segment-0002',
        expectedChange: 'punctuation-only',
        invariantResult: 'content-unchanged',
      },
    }, async () => ({
      ok: true,
      documentVersion: 3,
      contentHash: hashEditorContent('第二批完成'),
    }), { multiBatch: true })

    const active = testSession.activeTask()
    expect(active?.plan.batchDetails).toEqual({
      'batch-1': {
        segmentId: 'segment-0001',
        expectedChange: 'reorder-only',
        invariantResult: 'structure-preserved',
      },
      'batch-2': {
        segmentId: 'segment-0002',
        expectedChange: 'punctuation-only',
        invariantResult: 'content-unchanged',
      },
    })
    testSession.finishActiveTask()
  })

  it('resumes a partially applied task by retrying only the failed batch', async () => {
    const testSession = session([])
    const first = await testSession.startOrContinueBatch(batchInput, async () => ({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('第一批完成'),
    }), { multiBatch: true })
    await testSession.startOrContinueBatch(
      { ...batchInput, batchId: 'batch-2' },
      async () => ({
        ok: false,
        code: 'version_changed',
        message: '文档已变化',
        applied: true,
        documentVersion: 3,
        contentHash: hashEditorContent('第二批前'),
      }),
      { multiBatch: true },
    )

    const resumed = await testSession.resumeEditTask(testSession.activeTask()!.id)
    const active = testSession.activeTask()

    expect(first.ok).toBe(true)
    expect(resumed).toMatchObject({
      ok: true,
      data: {
        batchId: 'batch-2',
        retryProtocol: 'batch_atomic_full_retry',
      },
    })
    expect(active?.status).toBe('awaiting_batch')
    expect(active?.executedBatches).toEqual(['batch-1'])
    expect(active?.failedBatchIds).toEqual([])
    expect(active?.pendingBatches).toContain('batch-2')
  })

  it('keeps every multi-batch checkpoint with its own document version', async () => {
    const testSession = session([])
    await testSession.startOrContinueBatch(batchInput, async () => ({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('第一批完成'),
    }), { multiBatch: true })
    await testSession.startOrContinueBatch(
      { ...batchInput, batchId: 'batch-2' },
      async () => ({
        ok: true,
        documentVersion: 3,
        contentHash: hashEditorContent('第二批完成'),
      }),
      { multiBatch: true },
    )
    const active = testSession.activeTask()
    expect(active?.checkpoints.map(item => item.documentVersion)).toEqual([1, 2, 3])
    expect(active?.checkpoints.map(item => item.reason)).toEqual([
      'task_start',
      'after_batch',
      'after_batch',
    ])
  })

  it('marks an unfinished multi-batch task failed when the request fails', async () => {
    const events: string[] = []
    const testSession = session(events)
    await testSession.startOrContinueBatch(batchInput, async () => ({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('第一批完成'),
    }), { multiBatch: true })

    const finished = testSession.finishActiveTask({ succeeded: false })
    expect(finished?.status).toBe('failed_after_write')
    expect(finished?.executedBatches).toEqual(['batch-1'])
    expect(events).toContain('task_failed')
    expect(events).not.toContain('task_finished')
    expect(testSession.activeTask()).toBeNull()
  })

  it('marks a fully written task completed with warnings when only the summary fails', async () => {
    const events: string[] = []
    const testSession = session(events)
    await testSession.startOrContinueBatch(batchInput, async () => ({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('第一批完成'),
    }), { multiBatch: true })
    await testSession.startOrContinueBatch(
      { ...batchInput, batchId: 'batch-2' },
      async () => ({
        ok: true,
        documentVersion: 3,
        contentHash: hashEditorContent('第二批完成'),
      }),
      { multiBatch: true },
    )

    const finished = testSession.finishActiveTask({ succeeded: false, summaryFailed: true })
    expect(finished?.status).toBe('completed_with_warnings')
    expect(finished?.executedBatches).toEqual(['batch-1', 'batch-2'])
    expect(events).toContain('task_succeeded_with_warnings')
    expect(events).not.toContain('task_failed')
    expect(events).not.toContain('task_finished')
    expect(testSession.activeTask()).toBeNull()
  })

  it('blocks completed status when a planned deletion target remains', async () => {
    const events: string[] = []
    const testSession = session(events)
    await testSession.startOrContinueBatch({
      ...batchInput,
      commands: [{
        type: 'editor_edit',
        version: 1,
        operation: 'delete',
        target: '重复段落',
      }],
      batchDetail: {
        segmentId: 'segment-0001',
        expectedChange: 'remove_duplicate',
        invariantResult: 'planned-deletion-only',
      },
    }, async () => ({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('重复段落\n重复段落'),
    }), { multiBatch: true })

    const finished = testSession.finishActiveTask({
      completion: {
        target: batchInput.target,
        before: '重复段落\n重复段落',
        after: '重复段落\n重复段落',
      },
    })

    expect(finished?.status).toBe('completed_with_warnings')
    expect(testSession.completionReport()).toMatchObject({
      verified: false,
      violations: [expect.objectContaining({
        code: 'planned_deletion_not_removed',
        batchId: 'batch-1',
      })],
    })
    expect(events).toContain('task_succeeded_with_warnings')
    expect(events).not.toContain('task_finished')
  })

  it('allows completed status when the structured goal was achieved', async () => {
    const events: string[] = []
    const testSession = session(events)
    await testSession.startOrContinueBatch({
      ...batchInput,
      commands: [{
        type: 'editor_edit',
        version: 1,
        operation: 'delete',
        target: '重复段落',
      }],
      batchDetail: {
        segmentId: 'segment-0001',
        expectedChange: 'remove_duplicate',
        invariantResult: 'planned-deletion-only',
      },
    }, async () => ({
      ok: true,
      documentVersion: 2,
      contentHash: hashEditorContent('重复段落'),
    }), { multiBatch: true })

    const finished = testSession.finishActiveTask({
      completion: {
        target: batchInput.target,
        before: '重复段落\n重复段落',
        after: '重复段落',
      },
    })

    expect(finished?.status).toBe('completed')
    expect(testSession.completionReport()?.verified).toBe(true)
    expect(events).toContain('task_finished')
  })
})
