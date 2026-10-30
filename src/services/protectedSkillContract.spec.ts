import { describe, expect, it } from 'vitest'
import {
  countProtectedBodyWords,
  measureProtectedBodyCandidate,
  validateProtectedBodyCandidate,
} from './protectedSkillContract'

const HANDOFF = [
  '【正文交接】',
  '章节：第12章 王芳入局',
  'POV：林越',
  '已完成场景：1. 王芳在酒馆讲出线索',
  'FACT_LOCK：王芳=话痨',
  '【正文交接结束】'
].join('\n')

const LONG_HANDOFF = [
  '【正文交接】',
  '章节：第12章 王芳入局',
  'POV：林越',
  '已完成场景：1. 王芳在酒馆讲出线索',
  'FACT_LOCK：王芳=话痨',
  'NEXT_HOOK：酒馆线索指向账册',
  '新增伏笔：王芳对账册感兴趣',
  '状态变化：王芳与林越结盟',
  '【正文交接结束】'
].join('\n')

describe('protectedSkillContract body measurement', () => {
  it('excludes the handoff ledger from net words', () => {
    const output = `${'正'.repeat(2000)}\n\n${HANDOFF}`

    expect(countProtectedBodyWords(output)).toBe(2000)
    expect(measureProtectedBodyCandidate(output, { kind: 'body', targetWords: 3500 })).toMatchObject({
      netWords: 2000,
      handoffCount: 1,
      contractDistance: 800,
      missingHandoff: false
    })
  })

  it('keeps the JSON envelope body as the measurement domain', () => {
    const output = JSON.stringify({
      body: `${'文'.repeat(3000)}\n\n${HANDOFF}`
    })

    expect(countProtectedBodyWords(output)).toBe(3000)
  })

  it('does not let handoff ledger length change candidate ranking measurements', () => {
    const shortLedger = `${'正'.repeat(3000)}\n\n${HANDOFF}`
    const longLedger = `${'正'.repeat(3000)}\n\n${LONG_HANDOFF}`
    const contract = { kind: 'body' as const, targetWords: 3500 }

    const shortMeasurement = measureProtectedBodyCandidate(shortLedger, contract)
    const longMeasurement = measureProtectedBodyCandidate(longLedger, contract)

    expect(shortMeasurement.netWords).toBe(longMeasurement.netWords)
    expect(shortMeasurement.contractDistance).toBe(longMeasurement.contractDistance)
    expect(shortMeasurement.rawChars).toBeLessThan(longMeasurement.rawChars)
  })

  it('enforces the protected word contract on the extracted body', () => {
    const shortOutput = `${'正'.repeat(2000)}\n\n${HANDOFF}`
    const validOutput = `${'正'.repeat(3000)}\n\n${HANDOFF}`

    expect(validateProtectedBodyCandidate(shortOutput, { kind: 'body', targetWords: 3500 })).toEqual({
      message: '正文过短：2000字，要求不低于2800字'
    })
    expect(validateProtectedBodyCandidate(validOutput, { kind: 'body', targetWords: 3500 })).toBeNull()
  })
})
