export interface BodyArtifactContract {
  chapterId: string
  targetWords: number
  minRatio?: number
  maxRatio?: number
}

export type BodyArtifactStatus =
  | 'valid'
  | 'empty'
  | 'too_short'
  | 'too_long'

export interface BodyArtifactValidation {
  valid: boolean
  status: BodyArtifactStatus
  wordCount: number
  ratio: number
  minWords: number
  maxWords: number
  errors: string[]
}

const CJK_OR_ASCII_WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[A-Za-z0-9]+/gu

export function countBodyWords(value: unknown): number {
  const text = typeof value === 'string' ? value : String(value || '')
  const matches = text.match(CJK_OR_ASCII_WORD)
  return matches ? matches.length : 0
}

export function isBodyArtifactContractInput(value: unknown): value is BodyArtifactContract {
  if (!value || typeof value !== 'object') return false
  const input = value as BodyArtifactContract
  return (
    typeof input.chapterId === 'string' &&
    input.chapterId.trim().length > 0 &&
    Number.isFinite(Number(input.targetWords)) &&
    Number(input.targetWords) > 0 &&
    Math.round(Number(input.targetWords)) === Number(input.targetWords)
  )
}

export function validateBodyArtifact(
  body: unknown,
  contract: BodyArtifactContract
): BodyArtifactValidation {
  const { targetWords: target, minWords, maxWords } = resolveProseWordContract(contract)
  const wordCount = countBodyWords(body)

  if (wordCount === 0) {
    return {
      valid: false,
      status: 'empty',
      wordCount,
      ratio: 0,
      minWords,
      maxWords,
      errors: ['正文为空']
    }
  }
  if (wordCount < minWords) {
    return {
      valid: false,
      status: 'too_short',
      wordCount,
      ratio: wordCount / target,
      minWords,
      maxWords,
      errors: [`正文过短：${wordCount}字，要求不低于${minWords}字`]
    }
  }
  if (wordCount > maxWords) {
    return {
      valid: false,
      status: 'too_long',
      wordCount,
      ratio: wordCount / target,
      minWords,
      maxWords,
      errors: [`正文过长：${wordCount}字，要求不超过${maxWords}字`]
    }
  }
  return {
    valid: true,
    status: 'valid',
    wordCount,
    ratio: wordCount / target,
    minWords,
    maxWords,
    errors: []
  }
}

export { resolveProseWordContract }
import { resolveProseWordContract } from './proseWordContract'
