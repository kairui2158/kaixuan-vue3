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
      .toEqual({ startIndex: 1, previousOutput: 'parse output', resumed: true })
  })

  it('retries the failed skill instead of skipping to the next skill', () => {
    const bp = createChainFailureBreakpoint({ ...base, skillIndex: 1, skillId: 'fill', lastSuccessChainIndex: 0, lastOutput: 'parse output', retryCount: 2, error: 'network' })
    expect(getChainResumePoint({ breakpoint: bp, step: 2, projectId: 'project-1', skillSequence: base.skillSequence }))
      .toEqual({ startIndex: 1, previousOutput: 'parse output', resumed: true })
  })

  it('starts fresh when the saved skill sequence changed', () => {
    const bp = createChainSuccessBreakpoint(base)
    expect(getChainResumePoint({ breakpoint: bp, step: 2, projectId: 'project-1', skillSequence: ['fill', 'parse', 'check'] }))
      .toEqual({ startIndex: 0, previousOutput: '', resumed: false })
  })
})
