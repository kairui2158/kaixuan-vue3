import { describe, expect, it } from 'vitest'
import {
  acceptStepArtifact,
  type StepArtifactAcceptanceInput
} from './stepArtifactAcceptance'

const contract = { chapterId: 'ch-1', targetWords: 3500 }

function metadataHeavyRaw(bodyWords: number, metadataWords: number): string {
  return [
    '正文'.repeat(Math.ceil(bodyWords / 2)),
    '',
    '【正文交接】',
    '元数据'.repeat(Math.ceil(metadataWords / 2)),
    '【正文交接结束】'
  ].join('\n')
}

describe('acceptStepArtifact', () => {
  it('rejects failed and blocked callers even when their output is non-empty', () => {
    for (const callerStatus of ['failed', 'blocked'] as const) {
      const result = acceptStepArtifact({
        rawOutput: '不应流转的旧输出',
        contract,
        callerStatus
      })

      expect(result.decision).toBe('reject')
      expect(result.reason).toBe('caller_failed')
      expect(result.downstreamPayload).toBeNull()
      expect(result.metadata).toEqual({})
    }
  })

  it('keeps legacy raw-output flow for steps without a contract', () => {
    const result = acceptStepArtifact({
      rawOutput: '普通步骤产物',
      contract: null,
      callerStatus: 'success'
    })

    expect(result).toMatchObject({
      decision: 'accept',
      reason: 'no_contract',
      downstreamPayload: '普通步骤产物'
    })
    expect(result.metadata).toEqual({})
  })

  it('accepts a contract step only on the extracted final body', () => {
    const raw = JSON.stringify({
      body: '正文'.repeat(1200),
      metadata: { status: 'success' }
    })
    const result = acceptStepArtifact({
      rawOutput: raw,
      contract,
      callerStatus: 'success'
    })

    expect(result.decision).toBe('accept')
    expect(result.reason).toBe('contract_valid')
    expect(result.extractedBody).toBe('正文'.repeat(1200))
    expect(result.metadata).toEqual({ status: 'success' })
    expect(result.downstreamPayload).toBe(result.extractedBody)
    expect(result.validation?.valid).toBe(true)
  })

  it('rejects a degraded step whose extracted body fails the contract', () => {
    const raw = metadataHeavyRaw(1654, 1300)
    const result = acceptStepArtifact({
      rawOutput: raw,
      contract,
      callerStatus: 'degraded',
      degradedErrors: ['正文交接缺少NEW_FACT']
    })

    expect(result.decision).toBe('reject')
    expect(result.reason).toBe('contract_failed')
    expect(result.extractedWordCount).toBe(1654)
    expect(result.rawWordCount - result.extractedWordCount).toBeGreaterThanOrEqual(1300)
    expect(result.metadataDelta).toBe(result.rawWordCount - result.extractedWordCount)
    expect(result.downstreamPayload).toBeNull()
    expect(result.metadata.extractedMeta?.length).toBeGreaterThan(0)
    expect(result.errors).toEqual([
      '正文交接缺少NEW_FACT',
      '正文过短：1654字，要求不低于2100字'
    ])
  })

  it('rejects a successful caller when the extracted body fails the contract', () => {
    const result = acceptStepArtifact({
      rawOutput: metadataHeavyRaw(100, 1300),
      contract,
      callerStatus: 'success'
    })

    expect(result.decision).toBe('reject')
    expect(result.reason).toBe('contract_failed')
    expect(result.errors).toEqual(['正文过短：100字，要求不低于2100字'])
  })

  it('accepts degraded output only when the contract passes and sends the extracted body downstream', () => {
    const raw = metadataHeavyRaw(2200, 1300)
    const result = acceptStepArtifact({
      rawOutput: raw,
      contract,
      callerStatus: 'degraded',
      degradedErrors: ['降级原因']
    })

    expect(result.decision).toBe('accept')
    expect(result.reason).toBe('contract_valid')
    expect(result.extractedWordCount).toBe(2200)
    expect(result.downstreamPayload).toBe(result.extractedBody)
    expect(result.downstreamPayload).not.toContain('【正文交接】')
    expect(result.errors).toEqual(['降级原因'])
  })

  it('never invents a passing contract for malformed raw output', () => {
    const malformed: StepArtifactAcceptanceInput = {
      rawOutput: '【正文交接】\n只有元数据\n【正文交接结束】',
      contract,
      callerStatus: 'success'
    }
    const result = acceptStepArtifact(malformed)

    expect(result.decision).toBe('reject')
    expect(result.reason).toBe('contract_failed')
    expect(result.extractedBody).toBe('')
    expect(result.validation?.status).toBe('empty')
  })
})
