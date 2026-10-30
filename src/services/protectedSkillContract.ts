import { bodyGeneratorContractSentence } from './chainExecution'
import { countBodyWords } from './bodyArtifactContract'
import { resolveProseWordContract } from './proseWordContract'

export interface ProtectedBodyContract {
  kind: 'body'
  targetWords: number
  minRatio?: unknown
  maxRatio?: unknown
}

export type ProtectedSkillContract = ProtectedBodyContract

export interface ProtectedBodyCandidateMeasurement {
  rawChars: number
  netWords: number
  handoffCount: number
  contractDistance: number
  missingHandoff: boolean
}

export interface ProtectedBodyCandidateLedgerEntry {
  attempt: number
  rawChars: number
  netWords: number
  handoffCount: number
  contractDistance: number
  missingHandoff: boolean
  valid: boolean
  errorCount: number
}

export interface ProtectedBodyCandidateRetention {
  retainedCandidateIndex: number
  retainedAttempt: number
  retainedReason: string
}

const BODY_HANDOFF_MARKER = '【正文交接】'

export function isProtectedSkillContract(value: unknown): value is ProtectedSkillContract {
  if (!value || typeof value !== 'object') return false
  const contract = value as ProtectedSkillContract
  return contract.kind === 'body' && Number(contract.targetWords) > 0
}

/** Canonical wording injected by the executor after folder preProcess. */
export function protectedContractText(contract: ProtectedSkillContract): string {
  if (contract.kind === 'body') {
    return bodyGeneratorContractSentence(contract.targetWords)
  }
  return ''
}

export function measureProtectedBodyCandidate(
  output: string,
  contract: ProtectedBodyContract
): ProtectedBodyCandidateMeasurement {
  const { minWords, maxWords } = resolveProseWordContract(contract)
  const netWords = countBodyWords(output)
  const handoffCount = countMarker(output, BODY_HANDOFF_MARKER)
  return {
    rawChars: output.length,
    netWords,
    handoffCount,
    contractDistance: Math.max(0, minWords - netWords) + Math.max(0, netWords - maxWords),
    missingHandoff: handoffCount === 0
  }
}

function countMarker(value: string, marker: string): number {
  let count = 0
  let index = value.indexOf(marker)
  while (index !== -1) {
    count += 1
    index = value.indexOf(marker, index + marker.length)
  }
  return count
}
