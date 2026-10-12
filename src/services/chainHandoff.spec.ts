import { describe, expect, it } from 'vitest'
import {
  computeChainOutputHash,
  isFinalDraftStep,
  makeChainHandoffArtifact,
  resolveChainPreviousOutput,
} from './chainHandoff'

describe('chainHandoff', () => {
  it('hashes whitespace-equivalent outputs identically', () => {
    expect(computeChainOutputHash('第一章  出场\n人物 A')).toBe(
      computeChainOutputHash('第一章 出场 人物 a'),
    )
    expect(computeChainOutputHash('第一章')).not.toBe(computeChainOutputHash('第二章'))
  })

  it('marks final step only with valid total', () => {
    expect(isFinalDraftStep({ sourceStep: 2, totalSteps: 3 })).toBe(true)
    expect(isFinalDraftStep({ sourceStep: 1, totalSteps: 3 })).toBe(false)
    expect(isFinalDraftStep({ sourceStep: 1 })).toBe(false)
  })

  it('builds artifact with declared fields and excerpt', () => {
    const artifact = makeChainHandoffArtifact({
      sourceStep: 0,
      sourceSkillId: 'skeleton',
      output: '定稿内容'.repeat(1000),
      templateMeta: {
        chainHandoff: {
          requiresFullPreviousOutput: false,
          requires: ['volumeOutline', 'wordBudget'],
        },
      },
      structuredSummary: { facts: ['第一卷 9 章'] },
      excerptLimit: 100,
    })
    expect(artifact.outputHash).toBeTruthy()
    expect(artifact.fullTextLength).toBe(4000)
    expect(artifact.canonicalExcerpt?.length).toBe(100)
    expect(artifact.declaredFields).toEqual({
      volumeOutline: 'declared',
      wordBudget: 'declared',
    })
    expect(artifact.requiresFullPreviousOutput).toBe(false)
    expect(artifact.repeatedHashCount).toBe(0)
  })

  it('respects explicit full-text permission and duplicate hash count', () => {
    const seen = new Set<string>()
    const output = 'same canonical output'
    const first = makeChainHandoffArtifact({
      sourceStep: 1,
      sourceSkillId: 'a',
      output,
      templateMeta: { chainHandoff: { requiresFullPreviousOutput: true } },
      previousSeenHashes: seen,
    })
    seen.add(first.outputHash)
    const second = makeChainHandoffArtifact({
      sourceStep: 2,
      sourceSkillId: 'b',
      output,
      previousSeenHashes: seen,
    })
    expect(first.requiresFullPreviousOutput).toBe(true)
    expect(second.repeatedHashCount).toBe(1)
  })
})

describe('resolveChainPreviousOutput', () => {
  it('keeps full text execution and exposes declared reason observability', () => {
    const output = 'S1'.repeat(4000)
    const withReason = resolveChainPreviousOutput({
      previousOutput: output,
      templateMeta: {
        chainHandoff: {
          previousOutput: 'full',
          reason: '本步骤必须对上一卷完整骨架逐段重构'
        }
      }
    })
    const withoutReason = resolveChainPreviousOutput({
      previousOutput: output,
      templateMeta: { chainHandoff: { previousOutput: 'full' } }
    })

    expect(withReason).toEqual({ delivery: 'full_text', output })
    expect(withoutReason).toEqual({ delivery: 'full_text', output })
  })

  it('defaults to full text and respects explicit full declarations', () => {
    const output = 'S1'.repeat(4000)
    expect(resolveChainPreviousOutput({ previousOutput: output }))
      .toEqual({ delivery: 'full_text', output })

    expect(resolveChainPreviousOutput({
      previousOutput: output,
      templateMeta: { chainHandoff: { requiresFullPreviousOutput: true } },
    })).toEqual({ delivery: 'full_text', output })

    expect(resolveChainPreviousOutput({
      previousOutput: output,
      templateMeta: { chainHandoff: { previousOutput: 'full' } },
    })).toEqual({ delivery: 'full_text', output })
  })

  it('keeps text skills that explicitly reference previous output on full text by default', () => {
    const output = 'S1'.repeat(4000)
    expect(resolveChainPreviousOutput({
      previousOutput: output,
      textSkillTemplateReferencesPreviousOutput: true,
    })).toEqual({ delivery: 'full_text', output })
  })

  it('uses canonical excerpt only when explicitly declared', () => {
    const output = 'x'.repeat(3000)
    expect(resolveChainPreviousOutput({
      previousOutput: output,
      templateMeta: { chainHandoff: { previousOutput: 'excerpt' } },
      excerptLimit: 100,
    })).toEqual({ delivery: 'canonical_excerpt', output: 'x'.repeat(100) })
  })

  it('extracts structured JSON fields only when all declared fields are present', () => {
    const output = JSON.stringify({
      facts: '第一卷共 9 章',
      constraints: ['不得新增主角'],
      unused: '不应进入下游',
    })
    const result = resolveChainPreviousOutput({
      previousOutput: output,
      templateMeta: {
        chainHandoff: { previousOutput: 'structured', requires: ['facts', 'constraints'] },
      },
    })
    expect(result.delivery).toBe('structured_summary')
    expect(result.output).toContain('## facts\n第一卷共 9 章')
    expect(result.output).toContain('## constraints\n[\n  "不得新增主角"\n]')
    expect(result.output).not.toContain('unused')
    expect(result.contractMiss).toBeUndefined()
  })

  it('falls back to full text when structured JSON fields are missing or empty', () => {
    const output = JSON.stringify({ facts: '第一卷共 9 章' })
    const missing = resolveChainPreviousOutput({
      previousOutput: output,
      templateMeta: {
        chainHandoff: { previousOutput: 'structured', requires: ['facts', 'constraints'] },
      },
    })
    expect(missing.delivery).toBe('full_text')
    expect(missing.output).toBe(output)
    expect(missing.contractMiss?.reason).toBe('structured_fields_missing')
    expect(missing.contractMiss?.missingFields).toEqual(['constraints'])

    const empty = resolveChainPreviousOutput({
      previousOutput: JSON.stringify({ facts: '' }),
      templateMeta: {
        chainHandoff: { previousOutput: 'structured', requires: ['facts'] },
      },
    })
    expect(empty.delivery).toBe('full_text')
    expect(empty.contractMiss?.reason).toBe('structured_fields_empty')
  })

  it('falls back to full text when requires is invalid', () => {
    const output = JSON.stringify({ facts: '有值' })
    const result = resolveChainPreviousOutput({
      previousOutput: output,
      templateMeta: { chainHandoff: { previousOutput: 'structured', requires: [] } },
    })
    expect(result.delivery).toBe('full_text')
    expect(result.output).toBe(output)
    expect(result.contractMiss?.reason).toBe('structured_requires_invalid')
  })

  it('extracts markdown sections and falls back on partial matches', () => {
    const output = '# facts\n第一卷共 9 章\n\n# constraints\n不得新增主角\n\n# unused\n不传'
    const result = resolveChainPreviousOutput({
      previousOutput: output,
      templateMeta: {
        chainHandoff: { previousOutput: 'structured', requires: ['facts', 'constraints'] },
      },
    })
    expect(result.delivery).toBe('structured_summary')
    expect(result.output).toBe('## facts\n第一卷共 9 章\n\n## constraints\n不得新增主角')

    const partial = resolveChainPreviousOutput({
      previousOutput: '# facts\n第一卷共 9 章',
      templateMeta: {
        chainHandoff: { previousOutput: 'structured', requires: ['facts', 'constraints'] },
      },
    })
    expect(partial.delivery).toBe('full_text')
    expect(partial.contractMiss?.reason).toBe('structured_fields_missing')
    expect(partial.contractMiss?.missingFields).toEqual(['constraints'])
  })

  it('treats invalid requires declarations as undeclared', () => {
    const output = JSON.stringify({ facts: '有值' })
    const invalidCases = [
      'facts',
      ['facts', 2],
      [''],
      ['x'.repeat(65)],
      Array.from({ length: 17 }, () => 'field'),
    ]
    for (const requires of invalidCases) {
      const result = resolveChainPreviousOutput({
        previousOutput: output,
        templateMeta: {
          chainHandoff: { previousOutput: 'structured', requires: requires as string[] },
        },
      })
      expect(result.delivery).toBe('full_text')
      expect(result.contractMiss?.reason).toBe('structured_requires_invalid')
    }
  })
})
