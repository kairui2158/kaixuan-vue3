import type { ContinuationSnapshot } from './continuation'
import { storageKey } from '../utils/storage-key'

function key(projectId: string, workspace: string, sessionId: string) {
  return storageKey(`continuation_${projectId || 'default'}_${workspace}_${sessionId}`)
}

export async function saveContinuation(snapshot: ContinuationSnapshot, sessionId: string) {
  await window.electronAPI.storageWrite(key(snapshot.projectId, snapshot.workspace, sessionId), JSON.parse(JSON.stringify(snapshot)))
}

export async function loadContinuation(projectId: string, workspace: string, sessionId: string): Promise<ContinuationSnapshot | null> {
  const data = await window.electronAPI.storageRead(key(projectId, workspace, sessionId))
  return data && typeof data === 'object' ? data as ContinuationSnapshot : null
}

export async function removeContinuation(projectId: string, workspace: string, sessionId: string) {
  const api = window.electronAPI as typeof window.electronAPI & {
    storageDelete?: (storageKey: string) => Promise<void>
    storageRemove?: (storageKey: string) => Promise<void>
  }
  const storageKeyValue = key(projectId, workspace, sessionId)
  if (api.storageDelete) await api.storageDelete(storageKeyValue)
  else if (api.storageRemove) await api.storageRemove(storageKeyValue)
  else await api.storageWrite(storageKeyValue, null)
}