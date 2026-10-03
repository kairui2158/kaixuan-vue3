import { describe, expect, it } from 'vitest'
import {
  applyFinalDraftEvent,
  createFinalDraftTask,
} from './finalDraftService'
import {
  canResumeFinalDraftTask,
  createInMemoryFinalDraftCheckpointStore,
  loadFinalDraftCheckpoint,
  restoreFinalDraftTaskFromCheckpoint,
  saveFinalDraftCheckpoint,
} from './finalDraftCheckpoint'

function createSegmentedTask() {
  const sourceContent = '第一段源文。\n\n第二段源文。'
  const task = createFinalDraftTask({
    destination: 'home-editor',
    targetId: 'home-tab-1',
    sourceContent,
    instruction: '全文整理',
    sourceSegments: [
      { segmentId: 'segment-1', start: 0, end: 8 },
      { segmentId: 'segment-2', start: 8, end: sourceContent.length },
    ],
    now: 1000,
  })
  const generating = applyFinalDraftEvent(task, { type: 'generation_started', now: 1001 })
  return { sourceContent, task: generating }
}

function createAuthorizedRewriteTask() {
  const sourceContent = '## 第一节\n\n1-1：第一段源文。\n\n## 第二节\n\n2-1：第二段源文。'
  const task = createFinalDraftTask({
    destination: 'home-editor',
    targetId: 'home-tab-1',
    sourceContent,
    instruction: '整篇重写',
    operation: 'rewrite_segments',
    sourceSegments: [{ segmentId: 'segment-1', start: 0, end: sourceContent.length }],
    now: 1000,
  })
  return {
    sourceContent,
    task: applyFinalDraftEvent(task, { type: 'generation_started', now: 1001 }),
  }
}

describe('finalDraftCheckpoint', () => {
  it('marks interrupted generating tasks and awaiting continuation as resumable', () => {
    const { task } = createSegmentedTask()
    expect(canResumeFinalDraftTask({ ...task, status: 'awaiting_continuation' })).toBe(true)
    expect(canResumeFinalDraftTask({ ...task, status: 'generating', activeSegmentIndex: 0 })).toBe(false)
    expect(canResumeFinalDraftTask({ ...task, status: 'generating', activeSegmentIndex: 2 })).toBe(true)
    expect(canResumeFinalDraftTask({ ...task, status: 'completed' })).toBe(false)
    expect(canResumeFinalDraftTask({ ...task, status: 'failed' })).toBe(false)
    expect(canResumeFinalDraftTask({ ...task, status: 'canceled' })).toBe(false)
  })

  it('saves a completed segment and loads the same task state', async () => {
    const { sourceContent, task } = createSegmentedTask()
    const store = createInMemoryFinalDraftCheckpointStore()
    const afterSegment = applyFinalDraftEvent(task, {
      type: 'segment_started',
      segmentId: 'segment-1',
      now: 1002,
    })
    const completed = applyFinalDraftEvent(afterSegment, {
      type: 'segment_completed',
      segmentId: 'segment-1',
      now: 1003,
    })
    const saved = await saveFinalDraftCheckpoint(completed, store, 1004)
    expect(saved).toEqual({ ok: true, checkpointId: `final-draft-${completed.taskId}`, savedAt: 1004 })

    const loaded = await loadFinalDraftCheckpoint(`final-draft-${completed.taskId}`, store)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error('checkpoint missing')
    expect(loaded.checkpoint?.payload.completedText).toBe('')
    expect(loaded.checkpoint?.payload.activeSegmentIndex).toBe(1)
    expect(loaded.checkpoint?.payload.sourceContent).toBe(sourceContent)
  })

  it('preserves the authorized rewrite operation across checkpoint restore', async () => {
    const { sourceContent, task } = createAuthorizedRewriteTask()
    const store = createInMemoryFinalDraftCheckpointStore()
    await saveFinalDraftCheckpoint(task, store, 1004)
    const loaded = await loadFinalDraftCheckpoint(`final-draft-${task.taskId}`, store)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error('checkpoint missing')

    const restored = restoreFinalDraftTaskFromCheckpoint(loaded.checkpoint, sourceContent)
    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error('restore rejected')
    expect(restored.task.operation).toBe('rewrite_segments')
  })

  it('restores a non-terminal checkpoint and validates the source hash', async () => {
    const { sourceContent, task } = createSegmentedTask()
    const store = createInMemoryFinalDraftCheckpointStore()
    await saveFinalDraftCheckpoint(task, store, 1004)
    const loaded = await loadFinalDraftCheckpoint(`final-draft-${task.taskId}`, store)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error('checkpoint missing')

    const restored = restoreFinalDraftTaskFromCheckpoint(loaded.checkpoint, sourceContent)
    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error('restore rejected')
    expect(restored.task?.taskId).toBe(task.taskId)
    expect(restored.task?.activeSegmentIndex).toBe(0)
    expect(restored.task?.status).toBe('generating')
  })

  it('refuses to restore when the source document changed', async () => {
    const { task } = createSegmentedTask()
    const store = createInMemoryFinalDraftCheckpointStore()
    await saveFinalDraftCheckpoint(task, store, 1004)
    const loaded = await loadFinalDraftCheckpoint(`final-draft-${task.taskId}`, store)
    if (!loaded.ok) throw new Error('checkpoint missing')
    const restored = restoreFinalDraftTaskFromCheckpoint(loaded.checkpoint, '用户已经改过的源文。')
    expect(restored.ok).toBe(false)
    if (!restored.ok) {
      expect(restored.reason).toBe('source_content_mismatch')
    }
  })

  it('refuses to restore terminal tasks as resumable state', async () => {
    const { sourceContent, task } = createSegmentedTask()
    const store = createInMemoryFinalDraftCheckpointStore()
    const completed = applyFinalDraftEvent(task, {
      type: 'segment_order_planned',
      segmentOrder: task.segmentOrder,
      fallback: true,
      now: 1002,
    })
    await saveFinalDraftCheckpoint({ ...completed, status: 'completed' }, store, 1004)
    const loaded = await loadFinalDraftCheckpoint(`final-draft-${task.taskId}`, store)
    if (!loaded.ok) throw new Error('checkpoint missing')
    const restored = restoreFinalDraftTaskFromCheckpoint(loaded.checkpoint, sourceContent)
    expect(restored.ok).toBe(false)
    if (!restored.ok) {
      expect(restored.reason).toBe('task_not_resumable')
    }
  })

  it('degrades gracefully when the checkpoint store is unavailable', async () => {
    const { task } = createSegmentedTask()
    const store = {
      saveCheckpoint: async () => ({ ok: false as const, reason: 'browser' }),
      loadCheckpoint: async () => ({ ok: false as const, reason: 'browser' }),
      listCheckpoints: async () => [] as Array<{ checkpointId: string; taskId: string; savedAt: number }>,
    }
    const saved = await saveFinalDraftCheckpoint(task, store, 1004)
    expect(saved).toEqual({ ok: false, reason: 'browser' })
    const loaded = await loadFinalDraftCheckpoint(`final-draft-${task.taskId}`, store)
    expect(loaded).toEqual({ ok: false, reason: 'browser' })
  })
})
