import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(
  new URL('../PipelinePanel.vue', import.meta.url),
  'utf8',
)

function sliceFrom(marker: string, endMarker: string): string {
  const start = pipelineSource.indexOf(marker)
  expect(start).toBeGreaterThan(0)
  return pipelineSource.slice(start, pipelineSource.indexOf(endMarker, start))
}

describe('body generator failure wiring W1', () => {
  it('records failed step acceptance before preserving the structured failure', () => {
    const block = sliceFrom(
      "if (bodyStepContext && stepResult.callerStatus && stepResult.callerStatus !== 'success') {",
      "if (si > 0 && handoffDelivery !== 'full_text') {",
    )

    expect(block).toContain('resolveStepArtifactFlow({')
    expect(block).toContain('caller_failed')
    expect(block).toContain("type: 'body-step-acceptance'")
    expect(block).toContain('rememberBodyStepAcceptance(pipelineRunId, si, acceptance)')
    expect(block).toContain("callerStatus: stepResult.callerStatus,")
    expect(block).toContain('completedStepOutputs')
    expect(block).toContain('executionPlan?.onStepOutputs?.(completedStepOutputs)')
    expect(block).toContain('return stepResult')
    expect(block.indexOf("callerStatus: stepResult.callerStatus,"))
      .toBeLessThan(block.indexOf('return stepResult'))
  })

  it('does not save a success checkpoint or enter echo repair for a failed step', () => {
    const failedBlock = sliceFrom(
      "if (bodyStepContext && stepResult.callerStatus && stepResult.callerStatus !== 'success') {",
      'return stepResult',
    )
    expect(failedBlock).not.toContain('buildFinalStepEchoRetryFeedback')
    expect(failedBlock).not.toContain('saveBreakpoint(createChainSuccessBreakpoint')
  })
})

describe('body generator failure wiring W2', () => {
  it('accepts an S1 scaffold for targeted repair that starts at the generator step', () => {
    const block = sliceFrom(
      'if (executionPlan.reuseArtifacts && startSi > 0) {',
      'const seenHandoffHashes',
    )

    expect(block).toContain('const targetedGeneratorIndex = resolveBodyGeneratorStepIndex(templates).index')
    expect(block).toContain('const startsAtGeneratorStep = startSi === targetedGeneratorIndex')
    expect(block).toContain('startsAtGeneratorStep')
    expect(block).toContain('parseGenerationResult(upstream.output)')
    expect(block).toContain('upstreamScaffoldBody.trim().length > 0')
    expect(block).toContain('upstream.output.trim().length > 0')
    expect(block).toContain('isGeneratorEnvelopeArtifact(upstream.output)')
    expect(block).toContain('current = upstream.output')
  })

  it('requires the generator envelope when reusing a generator-step artifact', () => {
    const block = sliceFrom(
      'if (executionPlan.reuseArtifacts && startSi > 0) {',
      'const seenHandoffHashes',
    )

    expect(block).toContain('const upstreamSkillIndex = startSi - 1')
    expect(block).toContain('const upstream = upstreamSource.find(output => output.skillIndex === upstreamSkillIndex)')
    expect(block).toContain('startSi === targetedGeneratorIndex')
  })
})
