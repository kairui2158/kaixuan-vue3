import { describe, expect, it } from 'vitest'
import { createChainFailureBreakpoint, createChainSuccessBreakpoint, getChainResumePoint } from './chainBreakpoint'

describe('chain breakpoint state machine', () => {
  const base = {
    step: 2,
    projectId: 'project-1',
    ownerKey: 'volume:vol-1',
    skillIndex: 0,
    skillId: 'parse',
    skillSequence: ['parse', 'fill', 'check'],
    lastSuccessChainIndex: 0,
    lastOutput: 'parse output',
    inputPrompt: 'prompt',
    agentId: 'agent-parse',
    retryCount: 0
  }

  const resume = (breakpoint: ReturnType<typeof createChainSuccessBreakpoint>, skillSequence = base.skillSequence) =>
    getChainResumePoint({
      breakpoint,
      step: 2,
      projectId: 'project-1',
      skillSequence,
      ownerKey: base.ownerKey
    })

  it('resumes after the last successful skill', () => {
    const bp = createChainSuccessBreakpoint(base)
    expect(resume(bp))
      .toEqual({ startIndex: 1, previousOutput: 'parse output', handoffHashes: [], resumed: true, completedChain: false, stepOutputs: [] })
  })

  it('rejects a completed chain checkpoint but exposes prior step artifacts for explicit planning', () => {
    const bp = createChainSuccessBreakpoint({
      ...base,
      skillIndex: 2,
      skillId: 'check',
      lastSuccessChainIndex: 2,
      lastOutput: 'check output'
    })
    expect(resume(bp)).toEqual({
      startIndex: 0,
      previousOutput: '',
      handoffHashes: [],
      resumed: false,
      completedChain: true,
      stepOutputs: []
    })
  })

  it('retries the failed skill instead of skipping to the next skill', () => {
    const bp = createChainFailureBreakpoint({ ...base, skillIndex: 1, skillId: 'fill', lastSuccessChainIndex: 0, lastOutput: 'parse output', retryCount: 2, error: 'network' })
    expect(resume(bp))
      .toEqual({ startIndex: 1, previousOutput: 'parse output', handoffHashes: [], resumed: true, completedChain: false, stepOutputs: [] })
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
    expect(resume(bp))
      .toEqual({ startIndex: 1, previousOutput: 'parse output', lastHandoff, handoffHashes: [], resumed: true, completedChain: false, stepOutputs: [] })
  })

  it('starts fresh when the saved skill sequence changed', () => {
    const bp = createChainSuccessBreakpoint(base)
    expect(resume(bp, ['fill', 'parse', 'check']))
      .toEqual({ startIndex: 0, previousOutput: '', handoffHashes: [], resumed: false, completedChain: false, stepOutputs: [] })
  })

  it('rejects a resume when the breakpoint owner key differs', () => {
    const bp = createChainSuccessBreakpoint({ ...base, ownerKey: 'chapter:ch-1' })
    expect(getChainResumePoint({
      breakpoint: bp,
      step: 2,
      projectId: 'project-1',
      skillSequence: base.skillSequence,
      ownerKey: 'chapter:ch-2'
    })).toEqual({ startIndex: 0, previousOutput: '', handoffHashes: [], resumed: false, completedChain: false, stepOutputs: [] })
  })

  it('allows a legacy breakpoint without an owner only as a non-resumed fresh run', () => {
    const bp = createChainSuccessBreakpoint({ ...base, ownerKey: undefined })
    expect(resume(bp)).toEqual({ startIndex: 0, previousOutput: '', handoffHashes: [], resumed: false, completedChain: false, stepOutputs: [] })
  })

  it('persists and restores seen handoff hashes across process restarts', () => {
    const bp = createChainSuccessBreakpoint({ ...base, handoffHashes: ['aaaa1111', 'bbbb2222'] })
    const resume = getChainResumePoint({ breakpoint: bp, step: 2, projectId: 'project-1', skillSequence: base.skillSequence, ownerKey: base.ownerKey })
    expect(resume.handoffHashes).toEqual(['aaaa1111', 'bbbb2222'])

    const legacy = createChainSuccessBreakpoint(base)
    const legacyResume = getChainResumePoint({ breakpoint: legacy, step: 2, projectId: 'project-1', skillSequence: base.skillSequence, ownerKey: base.ownerKey })
    expect(legacyResume.handoffHashes).toEqual([])
  })

  it('returns persisted per-step artifacts for explicit targeted repair planning', () => {
    const stepOutputs = [
      { skillIndex: 0, skillId: 'parse', output: 'parse output' },
      { skillIndex: 1, skillId: 'fill', output: 'fill output' }
    ]
    const bp = createChainSuccessBreakpoint({
      ...base,
      skillIndex: 1,
      skillId: 'fill',
      lastSuccessChainIndex: 1,
      lastOutput: 'fill output',
      stepOutputs
    })
    const result = resume(bp)
    expect(result.stepOutputs).toEqual(stepOutputs)
  })
})
