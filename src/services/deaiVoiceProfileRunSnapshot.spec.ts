import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { createDeaiVoiceProfileRunSnapshotStore } from './deaiVoiceProfileRunSnapshot'

const styleA = {
  profileVersion: 2 as const,
  locked: true,
  injected: true,
  voice: { protagonistSpeech: 'A声口', dialogueTags: 'A标签', subtextDensity: '高' },
}
const styleB = {
  profileVersion: 2 as const,
  locked: true,
  injected: true,
  voice: { protagonistSpeech: 'B声口', dialogueTags: 'B标签', subtextDensity: '低' },
}

describe('DEAI voice profile run snapshots', () => {
  it('does not expose per-run terminal reset because the active-run watch owns release', async () => {
    const style = ref(styleA)
    const activeIds = computed(() => new Set(['run-1']))
    const store = createDeaiVoiceProfileRunSnapshotStore({ activeRunIds: activeIds, styleProfile: style })

    expect(store).not.toHaveProperty('resetTerminalRun')
  })

  it('keeps the profile frozen for a run after the project style changes', async () => {
    const style = ref(styleA)
    const runIds = ref(['run-1'])
    const activeIds = computed(() => new Set(runIds.value))
    const store = createDeaiVoiceProfileRunSnapshotStore({ activeRunIds: activeIds, styleProfile: style })

    expect(store.resolveForRun('run-1')?.text).toContain('A声口')

    style.value = styleB
    await Promise.resolve()
    await Promise.resolve()

    expect(store.resolveForRun('run-1')?.text).toContain('A声口')
    expect(store.resolveForRun('run-1')?.text).not.toContain('B声口')
  })

  it('gives different runs independent frozen profiles', async () => {
    const style = ref(styleA)
    const runIds = ref(['run-1'])
    const activeIds = computed(() => new Set(runIds.value))
    const store = createDeaiVoiceProfileRunSnapshotStore({ activeRunIds: activeIds, styleProfile: style })

    store.resolveForRun('run-1')
    runIds.value = ['run-1', 'run-2']
    style.value = styleB
    await Promise.resolve()

    expect(store.resolveForRun('run-1')?.text).toContain('A声口')
    expect(store.resolveForRun('run-2')?.text).toContain('B声口')
  })

  it('returns the live profile outside a run and releases terminal run snapshots', async () => {
    const style = ref(styleA)
    const runIds = ref(['run-1'])
    const activeIds = computed(() => new Set(runIds.value))
    const store = createDeaiVoiceProfileRunSnapshotStore({ activeRunIds: activeIds, styleProfile: style })

    store.resolveForRun('run-1')
    runIds.value = []
    style.value = styleB
    await Promise.resolve()

    expect(store.profiles.value.size).toBe(0)
    expect(store.resolveForRun(null)?.text).toContain('B声口')
    expect(store.resolveForRun('terminal-run')?.text).toContain('B声口')
  })
})
