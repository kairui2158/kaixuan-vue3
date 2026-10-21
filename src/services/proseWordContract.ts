export const PROSE_MIN_WORD_RATIO = 0.8
export const PROSE_MAX_WORD_RATIO = 2

export interface ProseWordContractInput {
  targetWords: unknown
  minRatio?: unknown
  maxRatio?: unknown
}

export interface ProseWordContract {
  targetWords: number
  minWords: number
  maxWords: number
  minRatio: number
  maxRatio: number
}

function ratio(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** Single source for prose prompt wording and artifact validation. */
export function resolveProseWordContract(input: ProseWordContractInput): ProseWordContract {
  const target = Math.max(1, Math.round(Number(input.targetWords) || 1))
  const minRatio = ratio(input.minRatio, PROSE_MIN_WORD_RATIO)
  const maxRatio = ratio(input.maxRatio, PROSE_MAX_WORD_RATIO)
  return {
    targetWords: target,
    minRatio,
    maxRatio,
    minWords: Math.max(1, Math.round(target * minRatio)),
    maxWords: Math.round(target * maxRatio)
  }
}
