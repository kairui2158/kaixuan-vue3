import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContinuationSnapshot } from './continuation'

const storage = new Map<string, unknown>()
const storageRead = vi.fn(async (key: string) => storage.get(key) ?? null)
const storageWrite = vi.fn(async (key: string, value: unknown) => { storage.set(key, value); return true })
const storageRemove = vi.fn(async (key: string) => { storage.delete(key); return true })

const snapshot: ContinuationSnapshot = {
  requestId: 'chat_m1', projectId: 'project-a', workspace: 'main', purpose: 'generate',
  providerId: 'provider-a', model: 'model-a', skillIds: [], agentIds: [], mode: 'single',
  originalMessages: [{ role: 'user', content: '任务' }], accumulatedText: '已输出',
  continuationCount: 0, status: 'possibly_truncated', finishReason: 'length', createdAt: 1, updatedAt: 1
}

async function loadModule() {
  return import('./continuationStorage')
}

afterEach(() => {
  storage.clear()
  storageRead.mockClear()
  storageWrite.mockClear()
  storageRemove.mockClear()
  vi.stubGlobal('window', { electronAPI: { storageRead, storageWrite, storageRemove } })
})

describe('continuation storage bridge', () => {
  it('round-trips snapshots using project/workspace/session scope', async () => {
    vi.stubGlobal('window', { electronAPI: { storageRead, storageWrite, storageRemove } })
    const { saveContinuation, loadContinuation } = await loadModule()
    await saveContinuation(snapshot, 'session-a')
    expect(await loadContinuation('project-a', 'main', 'session-a')).toEqual(snapshot)
    expect(await loadContinuation('project-a', 'main', 'session-b')).toBeNull()
    expect(storageWrite).toHaveBeenCalledTimes(1)
  })

  it('removes completed snapshots through the actual Electron storageRemove bridge', async () => {
    vi.stubGlobal('window', { electronAPI: { storageRead, storageWrite, storageRemove } })
    const { saveContinuation, loadContinuation, removeContinuation } = await loadModule()
    await saveContinuation(snapshot, 'session-a')
    await removeContinuation('project-a', 'main', 'session-a')
    expect(await loadContinuation('project-a', 'main', 'session-a')).toBeNull()
    expect(storageRemove).toHaveBeenCalledTimes(1)
  })
})
