import { describe, expect, it, vi } from 'vitest'
import { createElectronFinalDraftCheckpointStore } from './finalDraftCheckpointElectron'
import type { FinalDraftCheckpointPayload } from './finalDraftCheckpoint'
import type { FinalDraftTask } from './finalDraftService'

function createPayload(overrides: Partial<FinalDraftCheckpointPayload> = {}): FinalDraftCheckpointPayload {
  const task: Pick<
    FinalDraftTask,
    'taskId' | 'destination' | 'targetId' | 'sourceContent' | 'instruction' | 'constraints' | 'protectedRanges'
    | 'sourceSegments' | 'segmentOrder' | 'activeSegmentIndex' | 'completedText' | 'accumulatedText'
    | 'continuationCount' | 'status' | 'sourceContentHash'
  > = {
    taskId: 'task-1',
    destination: 'home-editor',
    targetId: 'home-tab-1',
    sourceContent: '源文',
    instruction: '整理',
    constraints: [],
    protectedRanges: [],
    sourceSegments: [],
    segmentOrder: [],
    activeSegmentIndex: 0,
    completedText: '',
    accumulatedText: '',
    continuationCount: 0,
    status: 'generating',
    sourceContentHash: 'hash',
  }
  return {
    schemaVersion: 1,
    ...task,
    savedAt: 1,
    ...overrides,
  }
}

function stubElectron(bridge: Record<string, unknown>) {
  const electronAPI = {
    agentCheckpointSave: vi.fn(),
    agentCheckpointLoad: vi.fn(),
    agentCheckpointList: vi.fn(),
    ...bridge,
  }
  vi.stubGlobal('window', { electronAPI })
  return electronAPI
}

describe('createElectronFinalDraftCheckpointStore', () => {
  it('saves and loads through the Electron checkpoint bridge', async () => {
    const payload = createPayload()
    const electronAPI = stubElectron({
      agentCheckpointSave: vi.fn(async () => ({ ok: true, checkpointId: 'cp-1', taskId: 'task-1', savedAt: 123 })),
      agentCheckpointLoad: vi.fn(async () => ({
        ok: true,
        checkpoint: { checkpointId: 'cp-1', taskId: 'task-1', payload, savedAt: 123 },
      })),
      agentCheckpointList: vi.fn(async () => [{ checkpointId: 'cp-1', taskId: 'task-1', savedAt: 123 }]),
    })
    const store = createElectronFinalDraftCheckpointStore()

    const saved = await store.saveCheckpoint({
      checkpointId: 'cp-1',
      taskId: 'task-1',
      payload,
      savedAt: 123,
    })
    expect(saved).toEqual({ ok: true, checkpointId: 'cp-1', taskId: 'task-1', savedAt: 123 })
    expect(electronAPI.agentCheckpointSave).toHaveBeenCalledWith({
      checkpointId: 'cp-1',
      taskId: 'task-1',
      payload,
      savedAt: 123,
    })

    const loaded = await store.loadCheckpoint('cp-1')
    expect(loaded).toEqual({
      ok: true,
      checkpoint: { checkpointId: 'cp-1', taskId: 'task-1', payload, savedAt: 123 },
    })

    await expect(store.listCheckpoints()).resolves.toEqual([
      { checkpointId: 'cp-1', taskId: 'task-1', savedAt: 123 },
    ])
  })

  it('keeps generation running when the Electron save fails', async () => {
    stubElectron({
      agentCheckpointSave: vi.fn(async () => ({ ok: false, reason: 'write_failed' })),
    })
    const store = createElectronFinalDraftCheckpointStore()
    await expect(store.saveCheckpoint({
      checkpointId: 'cp-1',
      taskId: 'task-1',
      payload: createPayload(),
    })).resolves.toEqual({ ok: false, reason: 'write_failed' })
  })

  it('returns load failures without throwing', async () => {
    stubElectron({
      agentCheckpointLoad: vi.fn(async () => ({ ok: false, reason: 'hash_mismatch' })),
    })
    const store = createElectronFinalDraftCheckpointStore()
    await expect(store.loadCheckpoint('cp-1')).resolves.toEqual({ ok: false, reason: 'hash_mismatch' })
  })

  it('degrades to a no-op store in browser mode', async () => {
    vi.stubGlobal('window', { electronAPI: {} })
    const store = createElectronFinalDraftCheckpointStore()
    await expect(store.saveCheckpoint({
      checkpointId: 'cp-1',
      taskId: 'task-1',
      payload: createPayload(),
    })).resolves.toEqual({ ok: false, reason: 'browser' })
    await expect(store.loadCheckpoint('cp-1')).resolves.toEqual({ ok: false, reason: 'browser' })
    await expect(store.listCheckpoints()).resolves.toEqual([])
  })
})
