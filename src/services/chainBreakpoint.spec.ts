import { describe, expect, it } from 'vitest'
import { createChainFailureBreakpoint, createChainSuccessBreakpoint, getChainResumePoint } from './chainBreakpoint'

describe('chain breakpoint state machine', () => {
  const base = {
    step: 2,
    projectId: 'project-1',
    skillIndex: 0,
    skillId: 'parse',
    skillSequence: ['parse', 'fill', 'check'],
    lastSuccessChainIndex: 0,
    lastOutput: 'parse output',
    inputPrompt: 'prompt',
    agentId: 'agent-parse',
    retryCount: 0
  }

  it('resumes after the last successful skill', () => {
    const bp = createChainSuccessBreakpoint(base)
    expect(getChainResumePoint({ breakpoint: bp, step: 2, projectId: 'project-1', skillSequence: base.skillSequence }))
      .toEqual({ startIndex: 1, previousOutput: 'parse output', handoffHashes: [], resumed: true })
  })

  it('retries the failed skill instead of skipping to the next skill', () => {
    const bp = createChainFailureBreakpoint({ ...base, skillIndex: 1, skillId: 'fill', lastSuccessChainIndex: 0, lastOutput: 'parse output', retryCount: 2, error: 'network' })
    expect(getChainResumePoint({ breakpoint: bp, step: 2, projectId: 'project-1', skillSequence: base.skillSequence }))
      .toEqual({ startIndex: 1, previousOutput: 'parse output', handoffHashes: [], resumed: true })
  })

  it('restores a saved handoff artifact for resume compatibility', () => {
    const lastHandoff = {
      artifactId: 'handoff-0-abc12345',
      sourceStep: 0,
      sourceSkillId: 'parse',
      outputHash: 'abc12345',
      fullTextLength: 12,
      delivery: 'canonical_excerpt',
      canonicalExcerpt: 'parse output'
    }
    const bp = createChainSuccessBreakpoint({ ...base, lastHandoff })
    expect(getChainResumePoint({ breakpoint: bp, step: 2, projectId: 'project-1', skillSequence: base.skillSequence }))
      .toEqual({ startIndex: 1, previousOutput: 'parse output', lastHandoff, handoffHashes: [], resumed: true })
  })

  it('starts fresh when the saved skill sequence changed', () => {
    const bp = createChainSuccessBreakpoint(base)
    expect(getChainResumePoint({ breakpoint: bp, step: 2, projectId: 'project-1', skillSequence: ['fill', 'parse', 'check'] }))
      .toEqual({ startIndex: 0, previousOutput: '', handoffHashes: [], resumed: false })
  })

  it('persists and restores seen handoff hashes across process restarts', () => {
    const bp = createChainSuccessBreakpoint({ ...base, handoffHashes: ['aaaa1111', 'bbbb2222'] })
    const resume = getChainResumePoint({ breakpoint: bp, step: 2, projectId: 'project-1', skillSequence: base.skillSequence })
    expect(resume.handoffHashes).toEqual(['aaaa1111', 'bbbb2222'])

    const legacy = createChainSuccessBreakpoint(base)
    const legacyResume = getChainResumePoint({ breakpoint: legacy, step: 2, projectId: 'project-1', skillSequence: base.skillSequence })
    expect(legacyResume.handoffHashes).toEqual([])
  })
})
