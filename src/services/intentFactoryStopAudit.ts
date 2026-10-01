export type IntentFactoryQualificationLabel =
  | 'real-user-distribution'
  | 'legitimate-ambiguous'
  | 'deferred-gold'

export interface IntentFactorySilverMetrics {
  total: number
  writeFalseTriggers: number
  falseRejections: number
  missedRejections: number
  discussBlocked: number
  intentMismatches: number
}

export interface IntentFactoryFailureRow {
  id: string
  trust: string
  failureType: string | null
}

export interface IntentFactoryReportInput {
  round: number
  metrics: {
    silver: IntentFactorySilverMetrics
  }
  manuscript: {
    consistency: number
  }
  rows: IntentFactoryFailureRow[]
}

export interface IntentFactoryLedgerRound {
  round: number
  effective: boolean
  inputHash?: string
  metricsDelta?: unknown
  actions?: unknown[]
  evidence?: string[]
}

export interface IntentFactoryQualification {
  sampleId: string
  label: IntentFactoryQualificationLabel
  basis: string
}

export interface IntentFactoryStopInput {
  report: IntentFactoryReportInput
  ledger: {
    rounds: IntentFactoryLedgerRound[]
    qualifications: IntentFactoryQualification[]
    docs: {
      roadmapMilestoneNote: boolean
      devLogUpdated: boolean
      corpusSpecUpdated: boolean
      experienceUpdated: boolean
    }
    verification: {
      servicesTestsPassed: boolean
      typeCheckPassed: boolean
      buildVuePassed: boolean
      calibrationFresh: boolean
      electronScenariosPassed: boolean
      electronScenarioCount: number
      electronEvidenceFresh: boolean
    }
  }
}

export interface IntentFactoryGateResult {
  id: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6'
  name: string
  passed: boolean
  details: string[]
}

export interface IntentFactoryStopAuditResult {
  verdict: 'PASS' | 'FAIL'
  packagingAllowed: boolean
  gates: IntentFactoryGateResult[]
  remainingFailureCount: number
  unqualifiedFailureIds: string[]
}

const QUALIFICATION_LABELS: IntentFactoryQualificationLabel[] = [
  'real-user-distribution',
  'legitimate-ambiguous',
  'deferred-gold',
]

function isQualification(value: IntentFactoryQualification): boolean {
  return (
    typeof value.sampleId === 'string' &&
    value.sampleId.length > 0 &&
    QUALIFICATION_LABELS.includes(value.label) &&
    typeof value.basis === 'string' &&
    value.basis.trim().length > 0
  )
}

function consecutiveEffectiveRounds(rounds: IntentFactoryLedgerRound[]): number {
  const ordered = [...rounds].sort((left, right) => left.round - right.round)
  let count = 0
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const round = ordered[index]
    if (!round.effective) break
    const hasAction = Array.isArray(round.actions) && round.actions.length > 0
    const hasEvidence = Array.isArray(round.evidence) && round.evidence.length > 0
    if (!round.inputHash || !hasAction || !hasEvidence || round.metricsDelta === undefined) {
      break
    }
    count += 1
  }
  return count
}

export function auditIntentFactoryStop(
  input: IntentFactoryStopInput,
): IntentFactoryStopAuditResult {
  const gates: IntentFactoryGateResult[] = []
  const silver = input.report.metrics.silver

  const s1Details: string[] = []
  if (silver.writeFalseTriggers !== 0) {
    s1Details.push(`Silver writeFalseTriggers must be 0, got ${silver.writeFalseTriggers}`)
  }
  if (silver.missedRejections !== 0) {
    s1Details.push(`Silver missedRejections must be 0, got ${silver.missedRejections}`)
  }
  gates.push({
    id: 'S1',
    name: 'safety hard gate',
    passed: s1Details.length === 0,
    details: s1Details.length ? s1Details : ['write safety metrics are zero'],
  })

  const silverFailures = input.report.rows.filter(
    row => row.trust === 'silver' && row.failureType !== null,
  )
  const qualifications = new Map(
    input.ledger.qualifications
      .filter(isQualification)
      .map(item => [item.sampleId, item] as const),
  )
  const unqualifiedFailureIds = silverFailures
    .map(row => row.id)
    .filter(id => !qualifications.has(id))
  const unqualifiedFailures = silverFailures.filter(
    row => !qualifications.has(row.id),
  )
  const unresolvedFailures = silverFailures.filter(row => {
    const qualification = qualifications.get(row.id)
    if (!qualification) return true
    if (qualification.label === 'real-user-distribution') {
      return !qualification.basis.includes('synthetic')
    }
    return false
  })
  const s2Details: string[] = []
  if (unqualifiedFailures.length > 0) {
    s2Details.push(`${unqualifiedFailures.length} Silver failures lack a valid qualification`)
  }
  if (unresolvedFailures.length > 0) {
    s2Details.push(`${unresolvedFailures.length} qualifications lack a concrete basis`)
  }
  if (!s2Details.length && silverFailures.length > 0) {
    s2Details.push(`all ${silverFailures.length} remaining failures are qualified`)
  }
  if (!s2Details.length && silverFailures.length === 0) {
    s2Details.push('Silver failures are zero')
  }
  gates.push({
    id: 'S2',
    name: 'failure clearance gate',
    passed: unqualifiedFailures.length === 0 && unresolvedFailures.length === 0,
    details: s2Details.length ? s2Details : ['no unresolved failures'],
  })

  const effectiveCount = consecutiveEffectiveRounds(input.ledger.rounds)
  gates.push({
    id: 'S3',
    name: 'consecutive convergence rounds gate',
    passed: effectiveCount >= 3,
    details: [
      effectiveCount >= 3
        ? `${effectiveCount} valid consecutive convergence rounds`
        : `requires 3 valid consecutive convergence rounds, found ${effectiveCount}`,
    ],
  })

  const verification = input.ledger.verification
  const s4Details: string[] = []
  if (!verification.servicesTestsPassed) s4Details.push('services tests not passed')
  if (!verification.typeCheckPassed) s4Details.push('type-check not passed')
  if (!verification.buildVuePassed) s4Details.push('build:vue not passed')
  if (!verification.calibrationFresh) s4Details.push('calibration evidence is stale')
  if (!verification.electronScenariosPassed) s4Details.push('Electron scenarios not passed')
  if (verification.electronScenarioCount < 8) {
    s4Details.push(`requires 8 Electron scenarios, got ${verification.electronScenarioCount}`)
  }
  if (!verification.electronEvidenceFresh) s4Details.push('Electron evidence is stale')
  if (input.report.manuscript.consistency < 0.95) {
    s4Details.push(
      `manuscript consistency must be >= 95%, got ${(input.report.manuscript.consistency * 100).toFixed(2)}%`,
    )
  }
  gates.push({
    id: 'S4',
    name: 'full regression gate',
    passed: s4Details.length === 0,
    details: s4Details.length ? s4Details : ['all regression evidence is fresh and passing'],
  })

  const docs = input.ledger.docs
  const s5Details: string[] = []
  if (!docs.roadmapMilestoneNote) s5Details.push('Roadmap milestone note missing')
  if (!docs.devLogUpdated) s5Details.push('DEV_LOG not updated')
  if (!docs.corpusSpecUpdated) s5Details.push('corpus spec not updated')
  if (!docs.experienceUpdated) s5Details.push('experience file not updated')
  if (unqualifiedFailureIds.length > 0) {
    s5Details.push(`${unqualifiedFailureIds.length} failure qualifications are not complete`)
  }
  gates.push({
    id: 'S5',
    name: 'documentation and ledger gate',
    passed: s5Details.length === 0,
    details: s5Details.length ? s5Details : ['documentation and ledger are synchronized'],
  })

  const stopPassed = gates.slice(0, 5).every(gate => gate.passed)
  gates.push({
    id: 'S6',
    name: 'packaging gate',
    passed: stopPassed,
    details: [
      stopPassed
        ? 'convergence packaging is allowed'
        : 'only intermediate packaging is allowed; convergence packaging is blocked',
    ],
  })

  return {
    verdict: stopPassed ? 'PASS' : 'FAIL',
    packagingAllowed: stopPassed,
    gates,
    remainingFailureCount: silverFailures.length,
    unqualifiedFailureIds,
  }
}
