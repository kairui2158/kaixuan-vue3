import { describe, expect, it } from 'vitest'
import {
  acceptStepArtifact,
  resolveFinalStepMetadataFlow,
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

  it('rejects a degraded step without a contract even when output is non-empty', () => {
    const result = acceptStepArtifact({
      rawOutput: '降级候选输出',
      contract: null,
      callerStatus: 'degraded',
      degradedErrors: ['模型结构化输出失败']
    })

    expect(result.decision).toBe('reject')
    expect(result.reason).toBe('no_contract_degraded')
    expect(result.downstreamPayload).toBeNull()
    expect(result.errors).toEqual(['模型结构化输出失败', '降级输出未声明产物契约，无法验收'])
    expect(result.metadata).toEqual({})
  })

  it('accepts a contract step only on the extracted final body', () => {
    const body = '正文'.repeat(2800)
    const raw = JSON.stringify({
      body,
      metadata: { status: 'success' }
    })
    const result = acceptStepArtifact({
      rawOutput: raw,
      contract,
      callerStatus: 'success'
    })

    expect(result.decision).toBe('accept')
    expect(result.reason).toBe('contract_valid')
    expect(result.extractedBody).toBe(body)
    expect(result.metadata).toEqual({ status: 'success' })
    expect(result.downstreamPayload).toBe(result.extractedBody)
    expect(result.validation?.valid).toBe(true)
  })

  it('rejects the legacy 60% floor under the unified prose contract', () => {
    const result = acceptStepArtifact({
      rawOutput: JSON.stringify({ body: '正文'.repeat(1050), metadata: {} }),
      contract,
      callerStatus: 'success'
    })

    expect(result.decision).toBe('reject')
    expect(result.reason).toBe('contract_failed')
    expect(result.errors).toEqual(['正文过短：2100字，要求不低于2800字'])
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
      '正文过短：1654字，要求不低于2800字'
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
    expect(result.errors).toEqual(['正文过短：100字，要求不低于2800字'])
  })

  it('accepts degraded output only when the contract passes and sends the extracted body downstream', () => {
    const raw = metadataHeavyRaw(2800, 1300)
    const result = acceptStepArtifact({
      rawOutput: raw,
      contract,
      callerStatus: 'degraded',
      degradedErrors: ['降级原因']
    })

    expect(result.decision).toBe('accept')
    expect(result.reason).toBe('contract_valid')
    expect(result.extractedWordCount).toBe(2800)
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

  it('passes a complete final-step ledger without backfill', () => {
    const flow = resolveFinalStepMetadataFlow({
      finalMetadata: {
        status: 'success',
        extractedMeta: [
          'FACT_LOCK:人物状态=受伤\nFACT_LOCK:位置=仓库',
          '【来源覆盖】\nH1-01,H1-02'
        ]
      },
      authoritativeGeneratorMetadata: {
        status: 'success',
        extractedMeta: [
          'FACT_LOCK:人物状态=受伤\nFACT_LOCK:位置=仓库',
          '【来源覆盖】\nH1-01,H1-02'
        ]
      },
      finalBody: '正文包含人物状态受伤与仓库位置。'
    })

    expect(flow.decision).toBe('pass')
    expect(flow.comparison.matched).toContain('人物状态=受伤')
    expect(flow.comparison.missing_in_final).toEqual([])
    expect(flow.comparison.conflicting).toEqual([])
    expect(flow.metadata).toEqual({
      status: 'success',
      extractedMeta: [
        'FACT_LOCK:人物状态=受伤\nFACT_LOCK:位置=仓库',
        '【来源覆盖】\nH1-01,H1-02'
      ]
    })
    expect(flow.warnings).toEqual([])
  })

  it('backfills label drift but refuses body divergence', () => {
    const authoritativeGeneratorMetadata = {
      extractedMeta: [
        'FACT_LOCK:人物状态=受伤\nFACT_LOCK:位置=仓库'
      ]
    }
    const labelDrift = resolveFinalStepMetadataFlow({
      finalMetadata: { extractedMeta: ['FACT_LOCK:状态=完好'] },
      authoritativeGeneratorMetadata,
      finalBody: '他捂住伤口，靠在仓库墙上，左臂受伤。'
    })
    expect(labelDrift.comparison.missing_in_final).toHaveLength(2)
    expect(labelDrift.comparison.missing_in_final).toContain('人物状态=受伤')
    expect(labelDrift.comparison.missing_in_final).toContain('位置=仓库')
    expect(labelDrift.comparison.conflicting).toEqual([])
    expect(labelDrift.comparison.conflictTypes?.人物状态).toBe('label_drift')
    expect(labelDrift.comparison.conflictTypes?.位置).toBe('label_drift')
    expect(labelDrift.decision).toBe('backfilled')
    expect(labelDrift.metadata.extractedMeta?.[0]).toContain('人物状态=受伤')
    expect(labelDrift.warnings.map(w => w.code)).toContain('body-final-step-metadata-repaired')

    const bodyDivergence = resolveFinalStepMetadataFlow({
      finalMetadata: { extractedMeta: ['FACT_LOCK:人物状态=完好'] },
      authoritativeGeneratorMetadata,
      finalBody: '他伸了个懒腰，状态完全恢复。'
    })
    expect(bodyDivergence.comparison.conflictTypes?.人物状态).toBe('body_divergence')
    expect(bodyDivergence.decision).toBe('divergence')
    expect(bodyDivergence.metadata.extractedMeta?.[0]).toBe('FACT_LOCK:人物状态=完好')
    expect(bodyDivergence.warnings.map(w => w.code)).toContain('body-final-step-fact-divergence')
  })

  it('does not invent an authority when the generator ledger is missing', () => {
    const flow = resolveFinalStepMetadataFlow({
      finalMetadata: { extractedMeta: ['FACT_LOCK:人物状态=未知'] },
      authoritativeGeneratorMetadata: null,
      finalBody: '正文'
    })

    expect(flow.decision).toBe('generator_ledger_missing')
    expect(flow.metadata).toEqual({ extractedMeta: ['FACT_LOCK:人物状态=未知'] })
    expect(flow.warnings.map(w => w.code)).toContain('generator-ledger-missing')
  })
})
