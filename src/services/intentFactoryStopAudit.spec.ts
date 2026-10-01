import { describe, expect, it } from 'vitest'
import {
  auditIntentFactoryStop,
  type IntentFactoryReportInput,
  type IntentFactoryStopInput,
} from './intentFactoryStopAudit'

function makeMetrics(overrides = {}) {
  return {
    total: 336,
    writeFalseTriggers: 0,
    falseRejections: 0,
    missedRejections: 0,
    discussBlocked: 0,
    intentMismatches: 0,
    ...overrides,
  }
}

function makeReport(overrides: Partial<IntentFactoryReportInput> = {}): IntentFactoryReportInput {
  return {
    round: 5,
    metrics: { silver: makeMetrics() },
    manuscript: { consistency: 0.975 },
    rows: [],
    ...overrides,
  }
}

function makeLedger(overrides: Partial<IntentFactoryStopInput['ledger']> = {}) {
  return {
    rounds: [
      { round: 1, effective: true, inputHash: 'a', metricsDelta: {}, actions: ['expand corpus'], evidence: ['round-1.json'] },
      { round: 2, effective: true, inputHash: 'b', metricsDelta: {}, actions: ['narrow rule'], evidence: ['round-2.json'] },
      { round: 3, effective: true, inputHash: 'c', metricsDelta: {}, actions: ['fix mutation'], evidence: ['round-3.json'] },
    ],
    qualifications: [],
    docs: {
      roadmapMilestoneNote: true,
      devLogUpdated: true,
      corpusSpecUpdated: true,
      experienceUpdated: true,
    },
    verification: {
      servicesTestsPassed: true,
      typeCheckPassed: true,
      buildVuePassed: true,
      calibrationFresh: true,
      electronScenariosPassed: true,
      electronScenarioCount: 8,
      electronEvidenceFresh: true,
    },
    ...overrides,
  }
}

describe('intentFactoryStopAudit', () => {
  it('passes only when every convergence gate passes', () => {
    const result = auditIntentFactoryStop({ report: makeReport(), ledger: makeLedger() })
    expect(result.verdict).toBe('PASS')
    expect(result.packagingAllowed).toBe(true)
    expect(result.gates.every(gate => gate.passed)).toBe(true)
  })

  it('rejects write-safety violations regardless of other metrics', () => {
    const result = auditIntentFactoryStop({
      report: makeReport({
        metrics: { silver: makeMetrics({ writeFalseTriggers: 1 }) },
      }),
      ledger: makeLedger(),
    })
    expect(result.verdict).toBe('FAIL')
    expect(result.gates.find(gate => gate.id === 'S1')?.passed).toBe(false)
    expect(result.packagingAllowed).toBe(false)
  })

  it('requires every remaining failure to have a valid qualification and basis', () => {
    const report = makeReport({
      metrics: { silver: makeMetrics({ falseRejections: 2 }) },
      rows: [
        { id: 'fail-1', trust: 'silver', failureType: 'falseRejection' },
        { id: 'fail-2', trust: 'silver', failureType: 'falseRejection' },
        { id: 'bronze-1', trust: 'bronze', failureType: 'writeFalseTrigger' },
      ],
    })
    const base = auditIntentFactoryStop({ report, ledger: makeLedger() })
    expect(base.remainingFailureCount).toBe(2)
    expect(base.unqualifiedFailureIds).toEqual(['fail-1', 'fail-2'])
    expect(base.gates.find(gate => gate.id === 'S2')?.passed).toBe(false)

    const qualified = auditIntentFactoryStop({
      report,
      ledger: makeLedger({
        qualifications: [
          { sampleId: 'fail-1', label: 'real-user-distribution', basis: 'synthetic mutations cannot reproduce the user phrasing' },
          { sampleId: 'fail-2', label: 'legitimate-ambiguous', basis: 'product semantics keep this continuation ambiguous' },
        ],
      }),
    })
    expect(qualified.gates.find(gate => gate.id === 'S2')?.passed).toBe(true)
  })

  it('rejects invalid qualification labels and empty bases', () => {
    const report = makeReport({
      metrics: { silver: makeMetrics({ discussBlocked: 1 }) },
      rows: [{ id: 'fail-1', trust: 'silver', failureType: 'discussBlocked' }],
    })
    const result = auditIntentFactoryStop({
      report,
      ledger: makeLedger({
        qualifications: [
          { sampleId: 'fail-1', label: 'hand-wave' as never, basis: 'not a real label' },
        ],
      }),
    })
    expect(result.gates.find(gate => gate.id === 'S2')?.passed).toBe(false)
    expect(result.unqualifiedFailureIds).toEqual(['fail-1'])
  })

  it('does not count malformed or non-effective rounds as convergence rounds', () => {
    const result = auditIntentFactoryStop({
      report: makeReport(),
      ledger: makeLedger({
        rounds: [
          { round: 1, effective: true, inputHash: 'a', metricsDelta: {}, actions: ['fix'], evidence: ['r1'] },
          { round: 2, effective: false },
          { round: 3, effective: true, metricsDelta: {}, actions: [], evidence: [] },
        ],
      }),
    })
    expect(result.gates.find(gate => gate.id === 'S3')?.passed).toBe(false)
  })

  it('fails stale or incomplete regression evidence', () => {
    const result = auditIntentFactoryStop({
      report: makeReport({ manuscript: { consistency: 0.9 } }),
      ledger: makeLedger({
        verification: {
          servicesTestsPassed: false,
          typeCheckPassed: true,
          buildVuePassed: true,
          calibrationFresh: false,
          electronScenariosPassed: false,
          electronScenarioCount: 7,
          electronEvidenceFresh: false,
        },
      }),
    })
    const gate = result.gates.find(item => item.id === 'S4')
    expect(gate?.passed).toBe(false)
    expect(gate?.details).toContain('services tests not passed')
    expect(gate?.details).toContain('requires 8 Electron scenarios, got 7')
  })

  it('blocks convergence packaging when any upstream gate fails', () => {
    const result = auditIntentFactoryStop({
      report: makeReport(),
      ledger: makeLedger({ docs: { roadmapMilestoneNote: true, devLogUpdated: false, corpusSpecUpdated: true, experienceUpdated: true } }),
    })
    expect(result.gates.find(gate => gate.id === 'S5')?.passed).toBe(false)
    expect(result.verdict).toBe('FAIL')
    expect(result.gates.find(gate => gate.id === 'S6')?.passed).toBe(false)
  })
})
