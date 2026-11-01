import { describe, expect, it } from 'vitest'
import {
  makeStepArtifactEnvelope,
  parseStepArtifactEnvelope,
  resolveStepArtifactFlow
} from './stepArtifactAcceptance'

const contract = { chapterId: 'ch-1', targetWords: 3500 }

function rawOutput(bodyWords: number, metadataWords = 1300): string {
  return [
    '正文'.repeat(Math.ceil(bodyWords / 2)),
    '',
    '【正文交接】',
    '元数据'.repeat(Math.ceil(metadataWords / 2)),
    '【正文交接结束】'
  ].join('\n')
}

function envelope(status: 'success' | 'degraded' | 'failed', bodyWords: number, errors: string[] = []): string {
  return makeStepArtifactEnvelope({
    status,
    output: rawOutput(bodyWords),
    errors
  })
}

describe('step artifact envelope', () => {
  it('round-trips the diagnostic status and output', () => {
    const output = rawOutput(2200)
    const encoded = makeStepArtifactEnvelope({ status: 'degraded', output, errors: ['缺 NEW_FACT'] })
    expect(parseStepArtifactEnvelope(encoded)).toEqual({
      rawOutput: output,
      callerStatus: 'degraded',
      traceAuditFields: null,
      degradedErrors: ['缺 NEW_FACT']
    })
  })

  it('carries retained-candidate provenance through the envelope', () => {
    const encoded = makeStepArtifactEnvelope({
      status: 'degraded',
      output: rawOutput(2800),
      errors: ['缺 NEW_FACT'],
      traceAuditFields: {
        sourceCandidateIndex: 2,
        sourceResponseHash: 'fnv1a32_1a2b3c4d'
      }
    })
    const parsed = parseStepArtifactEnvelope(encoded)
    expect(parsed?.traceAuditFields).toEqual({
      sourceCandidateIndex: 2,
      sourceResponseHash: 'fnv1a32_1a2b3c4d'
    })

    const result = resolveStepArtifactFlow({ stepOutput: encoded, stepIndex: 1, contract })
    expect(result.traceAuditFields.sourceCandidateIndex).toBe(2)
    expect(result.traceAuditFields.sourceResponseHash).toBe('fnv1a32_1a2b3c4d')
  })

  it('does not treat a malformed envelope as an authorization to flow', () => {
    expect(parseStepArtifactEnvelope('{"__shenyiStepArtifact":broken')).toBeNull()
    expect(parseStepArtifactEnvelope('plain prose')).toBeNull()
  })

  it('preserves degraded diagnostics even when the retained output is empty', () => {
    const encoded = makeStepArtifactEnvelope({ status: 'degraded', output: '', errors: ['降级且无输出'] })
    const result = resolveStepArtifactFlow({ stepOutput: encoded, stepIndex: 1, contract })

    expect(result.acceptance.decision).toBe('reject')
    expect(result.acceptance.callerStatus).toBe('degraded')
    expect(result.traceDetail.extractedWordCount).toBe(0)
    expect(result.failure).toEqual({
      reason: 'degraded_plus_contract_failure',
      message: '正文生成步骤验收失败（degraded_plus_contract_failure）：降级且无输出；正文为空'
    })
  })
})

describe('step artifact flow matrix', () => {
  type MatrixCase = {
    status: 'success' | 'degraded' | 'failed'
    bodyWords: number
    expected: 'accept' | 'reject'
    downstream: boolean
    failureReason?: 'caller_failed' | 'degraded_plus_contract_failure' | 'contract_failure'
  }
  const matrix: MatrixCase[] = [
    { status: 'success', bodyWords: 2800, expected: 'accept', downstream: true },
    { status: 'success', bodyWords: 1654, expected: 'reject', downstream: false },
    { status: 'degraded', bodyWords: 2800, expected: 'accept', downstream: true },
    { status: 'degraded', bodyWords: 1654, expected: 'reject', downstream: false },
    { status: 'failed', bodyWords: 2800, expected: 'reject', downstream: false, failureReason: 'caller_failed' }
  ]

  for (const item of matrix) {
    it(`${item.status} + ${item.bodyWords} words must ${item.expected} and downstream=${item.downstream}`, () => {
      const result = resolveStepArtifactFlow({
        stepOutput: envelope(item.status, item.bodyWords, item.status === 'degraded' ? ['降级原因'] : []),
        stepIndex: 1,
        contract
      })

      expect(result.acceptance.decision).toBe(item.expected)
      expect(result.continueChain).toBe(item.expected === 'accept')
      expect(Boolean(result.downstreamPayload)).toBe(item.downstream)
      expect(result.traceDetail.callerStatus).toBe(item.status)
      if (item.status !== 'failed') {
        expect(result.traceDetail.extractedWordCount).toBe(item.bodyWords)
      } else {
        expect(result.traceDetail.extractedWordCount).toBe(0)
      }
      expect(result.traceDetail.rawWordCount - result.traceDetail.extractedWordCount)
        .toBeGreaterThanOrEqual(1300)

      if (item.status === 'degraded') {
        expect(result.traceDetail.degradedErrors).toEqual(['降级原因'])
      } else {
        expect(result.traceDetail.degradedErrors).toEqual([])
      }

      if (item.expected === 'accept') {
        expect(result.failure).toBeNull()
        expect(result.downstreamPayload).not.toContain('【正文交接】')
      } else {
        expect(result.failure?.reason).toBe(
          item.failureReason || (item.status === 'degraded' ? 'degraded_plus_contract_failure' : 'contract_failure')
        )
        expect(result.failure?.message).toContain('正文生成步骤验收失败')
      }
    })
  }

  it('keeps the degraded + contract-failure accident reason explicit', () => {
    const result = resolveStepArtifactFlow({
      stepOutput: envelope('degraded', 1654, ['正文交接缺少NEW_FACT']),
      stepIndex: 1,
      contract
    })

    expect(result.failure).toEqual({
      reason: 'degraded_plus_contract_failure',
      message: '正文生成步骤验收失败（degraded_plus_contract_failure）：正文交接缺少NEW_FACT；正文过短：1654字，要求不低于2800字'
    })
  })

  it('keeps no-contract steps on the legacy raw-output path', () => {
    const stepOutput = '非正文步骤产物'
    const result = resolveStepArtifactFlow({
      stepOutput,
      stepIndex: 0,
      contract: null
    })

    expect(result.continueChain).toBe(true)
    expect(result.downstreamPayload).toBe(stepOutput)
    expect(result.traceDetail.reason).toBe('no_contract')
    expect(result.failure).toBeNull()
  })
})
