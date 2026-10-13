import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const componentFiles = [
  'src/components/pipeline/PipelinePanel.vue',
  'src/components/editor/EditorPanel.vue',
  'src/components/common/MemoryPanel.vue'
]
const directCallMarkers = ['recordMemoryChange(', 'mergeMemory(', 'mergeMemoryChanges(']
const storeFiles = ['src/stores/project.ts']

describe('tracking state wiring', () => {
  it('keeps component memory writes on the transaction path', () => {
    for (const file of componentFiles) {
      const source = readFileSync(new URL(`../${file.split('src/')[1]}`, import.meta.url), 'utf8')
      for (const marker of directCallMarkers) {
        expect(source.includes(marker), `${file} contains ${marker}`).toBe(false)
      }
    }
  })

  it('keeps the direct merge contract documented in dependency rules', () => {
    const rules = readFileSync(new URL('../../.dependency-cruiser.cjs', import.meta.url), 'utf8')
    expect(rules).toContain("name: 'ui-no-direct-memory-merger'")
  })

  it('keeps rollback and import writes inside the transaction queue', () => {
    for (const file of storeFiles) {
      const source = readFileSync(new URL('../stores/project.ts', import.meta.url), 'utf8')
      expect(source, `${file} must not import withTrackingState directly`).not.toContain('withTrackingState')
    }
  })

  it('audits memory import and rollback commits in a dedicated infra run', () => {
    const source = readFileSync(new URL('../components/common/MemoryPanel.vue', import.meta.url), 'utf8')
    expect(source, 'MemoryPanel must not silently drop infra events when no infra run is active').not.toContain("runTraceStore.addSourceEvent('infra'")
    expect(source, 'memory imports must emit tracking_commit').toContain("recordMemoryImportTrace(trace, 'replace'")
    expect(source, 'memory imports must emit tracking_commit').toContain("recordMemoryImportTrace(trace, 'merge'")
    expect(source, 'memory rollback must emit tracking_commit').toContain("recordMemoryRollbackTrace(trace, 'version'")
    expect(source, 'chapter rollback must emit tracking_commit').toContain("recordMemoryRollbackTrace(trace, 'chapter'")
    expect(source, 'memory infra traces must use the infra run source').toContain("source: 'infra'")
  })
})
