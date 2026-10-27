import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url), 'utf8')
const pipelineStoreSource = readFileSync(new URL('../stores/pipeline.ts', import.meta.url), 'utf8')

describe('pipeline progress readers', () => {
  it('production progress bars read per-layer run slots, not the global progress scalar', () => {
    expect(pipelineSource).not.toContain(':progress="pipelineStore.generationProgress"')
    expect(pipelineSource).not.toContain(':progress="pipelineStore.activeSettingsRun?.progress ?? 0"')
    expect(pipelineSource).not.toContain(':progress="pipelineStore.activeVolumesRun?.progress ?? 0"')
    expect(pipelineSource).not.toContain(':progress="pipelineStore.activeChaptersRun?.progress ?? 0"')
    expect(pipelineSource).not.toContain(':progress="pipelineStore.activeBodyRun?.progress ?? 0"')
    expect(pipelineSource).toContain(':progress="displayedRunForStep(1)?.progress ?? 0"')
    expect(pipelineSource).toContain(':progress="displayedRunForStep(2)?.progress ?? 0"')
    expect(pipelineSource).toContain(':progress="displayedRunForStep(3)?.progress ?? 0"')
    expect(pipelineSource).toContain(':progress="displayedRunForStep(4)?.progress ?? 0"')
  })

  it('layer cancel actions target the displayed run id', () => {
    expect(pipelineSource).not.toContain('@cancel="pipelineStore.cancelGeneration()"')
    expect(pipelineSource).not.toContain('@cancel="pipelineStore.cancelGeneration(pipelineStore.activeSettingsRun?.runId)"')
    expect(pipelineSource).not.toContain('@cancel="pipelineStore.cancelGeneration(pipelineStore.activeVolumesRun?.runId)"')
    expect(pipelineSource).not.toContain('@cancel="pipelineStore.cancelGeneration(pipelineStore.activeChaptersRun?.runId)"')
    expect(pipelineSource).not.toContain('@cancel="pipelineStore.cancelGeneration(pipelineStore.activeBodyRun?.runId)"')
    expect(pipelineSource).toContain('@cancel="cancelDisplayedRun(1)"')
    expect(pipelineSource).toContain('@cancel="cancelDisplayedRun(2)"')
    expect(pipelineSource).toContain('@cancel="cancelDisplayedRun(3)"')
    expect(pipelineSource).toContain('@cancel="cancelDisplayedRun(4)"')
  })

  it('cross-layer selectors stay enabled while another layer is running', () => {
    expect(pipelineSource).toContain('<select id="pl-ch-volume-select"')
    expect(pipelineSource).not.toContain('id="pl-ch-volume-select" v-model.number="selectedVolumeIndex" class="pl-input-sm" :disabled="boundVolumes.length === 0 || pipelineStore.isGenerating"')
    expect(pipelineSource).toContain(':disabled="boundVolumes.length === 0"')
    expect(pipelineSource).not.toContain('v-model.number="bodyVolumeIndex" class="pl-input-sm" :disabled="pipelineStore.isGenerating"')
    expect(pipelineSource).not.toContain('v-model.number="bodyChapterIndex" class="pl-input-sm" :disabled="pipelineStore.isGenerating"')
  })

  it('progress feedback visibility is scoped to the owning layer run', () => {
    expect(pipelineSource).not.toContain(':isGenerating="pipelineStore.isGenerating"')
    expect(pipelineSource).toContain(':isGenerating="isDisplayedRunCancellable(1)"')
    expect(pipelineSource).toContain(':isGenerating="isDisplayedRunCancellable(2)"')
    expect(pipelineSource).toContain(':isGenerating="isDisplayedRunCancellable(3)"')
    expect(pipelineSource).toContain(':isGenerating="isDisplayedRunCancellable(4)"')
  })

  it('chapter continuation is blocked only by the active chapter run for that volume', () => {
    expect(pipelineSource).not.toContain('if (pipelineStore.isGenerating || !selectedVolumeChapterLocked.value) return false')
    expect(pipelineSource).toContain("if (pipelineStore.isTargetGenerating('chapters', selectedChapterTarget.value) || !selectedVolumeChapterLocked.value) return false")
  })

  it('pipeline status is derived from run registry instead of a mutable global scalar', () => {
    expect(pipelineStoreSource).not.toContain('const generationStatus = ref')
    expect(pipelineSource).not.toContain('pipelineStore.generationStatus')
    expect(pipelineStoreSource).toContain('const generationStatus = computed')
  })

  it('cancel-all requires an explicit confirmation before canceling every layer', () => {
    expect(pipelineSource).not.toContain('@click="pipelineStore.runs.filter')
    expect(pipelineSource).not.toContain('@click="pipelineStore.runs.forEach')
    expect(pipelineSource).toContain('id="pl-cancel-all-preview"')
    expect(pipelineSource).toContain('function confirmCancelAllRuns()')
    expect(pipelineSource).toContain('@click="cancelAllPreviewVisible = true"')
    expect(pipelineSource).toContain('@click="confirmCancelAllRuns"')
  })

  it('cancel-all confirmation delegates to the single-source store API', () => {
    expect(pipelineSource).not.toContain('pipelineStore.runs')
    expect(pipelineSource).toContain('pipelineStore.cancelAllActiveRuns')
  })

  it('provider queue events feed the owning run and are visible in the run center', () => {
    expect(pipelineStoreSource).toContain('function reportProviderQueue(')
    expect(pipelineStoreSource).toContain('reportProviderQueue,')
    expect(pipelineSource).toContain('pipelineStore.reportProviderQueue(pipelineRunId, event)')
    expect(pipelineSource).toContain('function activeRunLabel(')
    expect(pipelineSource).toContain('{{ activeRunLabel(activeRun) }}')
  })

  it('every pipeline generation path registers trace ownership after the trace run starts', () => {
    const matches = [...pipelineSource.matchAll(/rememberTraceRunOwnership\(trace\.runId,\s*([A-Za-z0-9_]+)RunId\)/g)]
      .map(match => match[1])
    expect(matches).toEqual(['settings', 'volumes', 'chapters', 'body'])

    const invalidOrder = pipelineSource.match(
      /rememberTraceRunOwnership\(trace\.runId,\s*[A-Za-z0-9_]+RunId\)\s*\n\s*trace\.begin\(\)/
    )
    expect(invalidOrder).toBeNull()

    const validOrder = pipelineSource.matchAll(
      /trace\.begin\(\)\s*\n\s*pipelineStore\.rememberTraceRunOwnership\(trace\.runId,\s*[A-Za-z0-9_]+RunId\)/g
    )
    expect([...validOrder]).toHaveLength(4)
  })

  it('progress bar templates stay inside their layer step panels', () => {
    const panelIds = ['pl-step-2-content', 'pl-step-3-content', 'pl-step-4-content', 'pl-step-5-content']
    const panels = new Map<string, string>()
    for (const panelId of panelIds) {
      const panelStart = pipelineSource.indexOf(`id="${panelId}"`)
      expect(panelStart).toBeGreaterThan(-1)
      const nextPanelStart = panelIds
        .slice(panelIds.indexOf(panelId) + 1)
        .map(id => pipelineSource.indexOf(`id="${id}"`, panelStart))
        .filter(index => index !== -1)
        .reduce((earliest, index) => Math.min(earliest, index), pipelineSource.length)
      panels.set(panelId, pipelineSource.slice(panelStart, nextPanelStart))
    }

    expect(panels.get('pl-step-2-content')).toContain('logContainerId="pl-settings-api-log"')
    expect(panels.get('pl-step-3-content')).toContain('logContainerId="pl-volume-api-log"')
    expect(panels.get('pl-step-4-content')).toContain('logContainerId="pl-ch-api-log"')
    expect(panels.get('pl-step-5-content')).toContain('logContainerId="pl-body-api-log"')
  })

  it('display runs derive from active run objects, not terminal registry lookups', () => {
    expect(pipelineSource).toContain('function displayRunForLayer(layer: PipelineLayer)')
    expect(pipelineSource).toContain('const candidates = pipelineStore.activeRuns')
    expect(pipelineSource).not.toContain('pipelineStore.getRunStatus(runId) === \x27running\x27')
    expect(pipelineSource).not.toContain('pipelineStore.getRun(displayed')
  })
})
