import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(
  new URL('../PipelinePanel.vue', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n')

function sliceFrom(marker: string, endMarker: string): string {
  const start = pipelineSource.indexOf(marker)
  expect(start).toBeGreaterThan(0)
  return pipelineSource.slice(start, pipelineSource.indexOf(endMarker, start))
}

describe('body checkpoint resume artifact gate', () => {
  it('accepts the declared generator scaffold when resuming at the generator step', () => {
    const block = sliceFrom(
      'if (\n      startSi > 0 &&\n      step === 4 &&',
      'let pendingStageDiagnosisGuidance',
    )

    expect(block).toContain('resolveBodyGeneratorStepIndex(templates).index')
    expect(block).toContain('startSi === resolveBodyGeneratorStepIndex(templates).index')
    expect(block).toContain('current.trim().length > 0')
    expect(block).toContain('!isGeneratorEnvelopeArtifact(current)')
  })

  it('still requires a generator envelope when resuming after the generator step', () => {
    const block = sliceFrom(
      'if (\n      startSi > 0 &&\n      step === 4 &&',
      'let pendingStageDiagnosisGuidance',
    )

    expect(block).toContain("reason: 'generator_envelope_missing'")
  })
})
