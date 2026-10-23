import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url)),
  'utf8'
)

describe('V3.3 Phase C pipeline config migration', () => {
  it('routes every PipelinePanel config write through the transactional store API', () => {
    const directWrites = source.match(
      /storageWrite\(\s*storageKey\(\s*["']pipeline_step_config["']\s*\)/g
    ) || []

    expect(directWrites).toEqual([])
    expect(source).toContain('async function saveStepConfig()')
    expect(source).toContain('await pipelineStore.writeStepConfig(')
  })

  it('starts every generation with a frozen config snapshot', () => {
    const starts = source.match(/(?<!function )startTrackedGeneration\((?:[^()]|\([^()]*\))*?\)/g) || []
    // Four layer entry points (settings/volumes/chapters/body) must freeze config.
    const snapshots = starts.filter(start => start.includes('configSnapshot'))

    expect(starts.length).toBe(4)
    expect(snapshots.length).toBe(4)
  })

  it('gives body chain breakpoints a chapter-scoped owner key', () => {
    expect(source).toContain('const checkpointOwnerKey = buildCheckpointOwnerKey(')
    expect(source).toContain('chapterId: generationTargetSnapshot.chapterId')
    expect(source).toContain('checkpointOwnerKey')
  })
})
