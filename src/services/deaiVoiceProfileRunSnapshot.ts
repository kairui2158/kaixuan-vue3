import type { Ref, ShallowRef } from 'vue'
import { computed, shallowRef, watch } from 'vue'
import type { StyleProfileEffectiveLike } from './styleContextCompiler'
import { buildDeaiVoiceProfile, type DeAiVoiceProfile } from './deaiVoiceProfile'

export interface DeaiVoiceProfileRunSnapshotSource {
  activeRunIds: Ref<ReadonlySet<string>>
  styleProfile: Ref<StyleProfileEffectiveLike | null | undefined>
}

export interface DeaiVoiceProfileRunSnapshotStore {
  resolveForRun: (runId: string | null | undefined) => DeAiVoiceProfile | null
  profiles: ShallowRef<ReadonlyMap<string, DeAiVoiceProfile | null>>
}

/**
 * A pipeline run must keep the author voice it started with, even if the user
 * edits the project style while requests are still in flight. The project
 * style stays reactive for the settings page; this store freezes a projection
 * per active run and releases it when that run becomes terminal.
 */
export function createDeaiVoiceProfileRunSnapshotStore({
  activeRunIds,
  styleProfile,
}: DeaiVoiceProfileRunSnapshotSource): DeaiVoiceProfileRunSnapshotStore {
  const profiles = shallowRef(new Map<string, DeAiVoiceProfile | null>())
  const activeRunIdList = computed(() => Array.from(activeRunIds.value))

  function resolveForRun(runId: string | null | undefined): DeAiVoiceProfile | null {
    if (!runId) return buildDeaiVoiceProfile(styleProfile.value)
    if (profiles.value.has(runId)) return profiles.value.get(runId) ?? null
    if (!activeRunIds.value.has(runId)) return buildDeaiVoiceProfile(styleProfile.value)

    const snapshot = buildDeaiVoiceProfile(styleProfile.value)
    profiles.value = new Map(profiles.value).set(runId, snapshot)
    return snapshot
  }

  watch([activeRunIdList, styleProfile], ([runIds, style]) => {
    if (!runIds.length) {
      if (profiles.value.size !== 0) profiles.value = new Map()
      return
    }

    const next = new Map<string, DeAiVoiceProfile | null>()
    for (const runId of runIds) {
      next.set(runId, profiles.value.get(runId) ?? buildDeaiVoiceProfile(style))
    }
    profiles.value = next
  }, { immediate: true })

  return { resolveForRun, profiles }
}
