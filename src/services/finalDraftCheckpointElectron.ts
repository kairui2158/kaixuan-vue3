import type { FinalDraftCheckpointPayload, FinalDraftCheckpointStore } from './finalDraftCheckpoint'

interface ElectronCheckpointBridge {
  agentCheckpointSave?: (payload: {
    checkpointId: string
    taskId: string
    payload: FinalDraftCheckpointPayload
    savedAt?: number
  }) => Promise<{ ok: true; checkpointId: string; taskId: string; savedAt: number } | { ok: false; reason: string }>
  agentCheckpointLoad?: (checkpointId: string) => Promise<{
    ok: true
    checkpoint: {
      checkpointId: string
      taskId: string
      payload: FinalDraftCheckpointPayload
      savedAt: number
    }
  } | { ok: false; reason: string }>
  agentCheckpointList?: () => Promise<Array<{ checkpointId: string; taskId: string; savedAt: number }>>
}

function getBridge(): ElectronCheckpointBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = window.electronAPI as ElectronCheckpointBridge | undefined
  if (!bridge?.agentCheckpointSave || !bridge?.agentCheckpointLoad || !bridge?.agentCheckpointList) return undefined
  return bridge
}

export function createElectronFinalDraftCheckpointStore(): FinalDraftCheckpointStore {
  const bridge = getBridge()
  const save = bridge?.agentCheckpointSave?.bind(bridge)
  const load = bridge?.agentCheckpointLoad?.bind(bridge)
  const list = bridge?.agentCheckpointList?.bind(bridge)
  return {
    async saveCheckpoint(request) {
      if (!save) return { ok: false, reason: 'browser' }
      const result = await save({
        checkpointId: request.checkpointId,
        taskId: request.taskId,
        payload: request.payload,
        savedAt: request.savedAt,
      })
      return result.ok
        ? { ok: true, checkpointId: result.checkpointId, taskId: result.taskId, savedAt: result.savedAt }
        : { ok: false, reason: result.reason || 'save_failed' }
    },
    async loadCheckpoint(checkpointId) {
      if (!load) return { ok: false, reason: 'browser' }
      return load(checkpointId)
    },
    async listCheckpoints() {
      if (!list) return []
      const records = await list()
      return (records || [])
        .map(record => ({
          checkpointId: String(record.checkpointId || ''),
          taskId: String(record.taskId || ''),
          savedAt: Number(record.savedAt || 0),
        }))
        .filter(record => record.checkpointId && record.taskId)
    },
  }
}
