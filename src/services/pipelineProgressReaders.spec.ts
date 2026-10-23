import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url), 'utf8')
const pipelineStoreSource = readFileSync(new URL('../stores/pipeline.ts', import.meta.url), 'utf8')

describe('pipeline progress readers', () => {
  it('production progress bars read per-layer run slots, not the global progress scalar', () => {
    expect(pipelineSource).not.toContain(':progress="pipelineStore.generationProgress"')
    expect(pipelineSource).toContain(':progress="pipelineStore.activeSettingsRun?.progress ?? 0"')
    expect(pipelineSource).toContain(':progress="pipelineStore.activeVolumesRun?.progress ?? 0"')
    expect(pipelineSource).toContain(':progress="pipelineStore.activeChaptersRun?.progress ?? 0"')
    expect(pipelineSource).toContain(':progress="pipelineStore.activeBodyRun?.progress ?? 0"')
  })

  it('layer cancel actions target the layer run id', () => {
    expect(pipelineSource).not.toContain('@cancel="pipelineStore.cancelGeneration()"')
    expect(pipelineSource).toContain('@cancel="pipelineStore.cancelGeneration(pipelineStore.activeSettingsRun?.runId)"')
    expect(pipelineSource).toContain('@cancel="pipelineStore.cancelGeneration(pipelineStore.activeVolumesRun?.runId)"')
    expect(pipelineSource).toContain('@cancel="pipelineStore.cancelGeneration(pipelineStore.activeChaptersRun?.runId)"')
    expect(pipelineSource).toContain('@cancel="pipelineStore.cancelGeneration(pipelineStore.activeBodyRun?.runId)"')
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
    expect(pipelineSource).toContain(':isGenerating="Boolean(pipelineStore.activeSettingsRun)"')
    expect(pipelineSource).toContain(':isGenerating="Boolean(pipelineStore.activeVolumesRun)"')
    expect(pipelineSource).toContain(':isGenerating="Boolean(pipelineStore.activeChaptersRun)"')
    expect(pipelineSource).toContain(':isGenerating="Boolean(pipelineStore.activeBodyRun)"')
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
})
