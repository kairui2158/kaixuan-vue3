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

  it('observes final-body card mentions and SKILL verdict without blocking persistence', () => {
    const reviewCall = pipelineSource.indexOf('observeVolumeContractMentions(')
    const persistenceCall = pipelineSource.indexOf("await trace.measurePhase('persistence', () => projectStore.saveProject())", pipelineSource.indexOf('async function genBody('))

    expect(pipelineSource).toContain("type: 'contract_review'")
    expect(pipelineSource).toContain('卷契约协议观测')
    expect(pipelineSource).toContain('contractReview.skillVerdict.status')
    expect(reviewCall).toBeGreaterThan(-1)
    expect(reviewCall).toBeLessThan(persistenceCall)
  })

  it('retires the application-side reveal-word inference', () => {
    const serviceSource = readFileSync(new URL('../services/contractReview.ts', import.meta.url), 'utf8')

    expect(serviceSource).not.toContain('REVEAL_RE')
    expect(serviceSource).not.toContain('contract_broken')
    expect(serviceSource).not.toContain('contract_needs_reinforcement')
    expect(serviceSource).not.toContain('contract_safe')
  })

  it('reads the SKILL verdict from final-step metadata, not from body prose', () => {
    expect(pipelineSource).toContain('skillVerdictText: bodySkillMetadataText()')
    expect(pipelineSource).not.toContain('skillVerdictText: finalBody')
  })
})
