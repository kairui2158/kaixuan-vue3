import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url), 'utf8')

describe('volume contract semantics wiring', () => {
  it('persists extracted volume semantics on every volume write path', () => {
    const persistCalls = pipelineSource.match(/\.\.\.extractVolumeContractSemantics\(v\)/g) || []
    expect(persistCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('passes forbidden final cards through the body closure and execution package', () => {
    expect(pipelineSource).toContain('contractForbiddenFinalCards: outlineClosure.contractForbiddenFinalCards')
    expect(pipelineSource).toContain('contractForbiddenFinalCards')
  })

  it('reviews the final body contract and writes a trace event without blocking persistence', () => {
    const reviewCall = pipelineSource.indexOf('reviewVolumeContractSemantics(')
    const persistenceCall = pipelineSource.indexOf("await trace.measurePhase('persistence', () => projectStore.saveProject())", pipelineSource.indexOf('async function genBody('))

    expect(pipelineSource).toContain("type: 'contract_review'")
    expect(reviewCall).toBeGreaterThan(-1)
    expect(reviewCall).toBeLessThan(persistenceCall)
  })
})
