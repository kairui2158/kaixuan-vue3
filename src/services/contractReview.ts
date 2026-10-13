export type VolumeContractReviewStatus =
  | 'contract_safe'
  | 'contract_needs_reinforcement'
  | 'contract_broken'

export interface VolumeContractReviewFinding {
  card: string
  excerpt: string
  start: number
  end: number
}

export interface VolumeContractReviewInput {
  prose: string
  forbiddenFinalCards: unknown
}

export interface VolumeContractReview {
  status: VolumeContractReviewStatus
  detected: boolean
  findings: VolumeContractReviewFinding[]
}

const PENDING = '[待补充]'
const REVEAL_RE = /(揭晓|揭示|公开|就是|真相是)/

export function reviewVolumeContractSemantics(input: VolumeContractReviewInput): VolumeContractReview {
  const prose = String(input.prose || '')
  const cards = Array.isArray(input.forbiddenFinalCards)
    ? input.forbiddenFinalCards.map(card => String(card ?? '').trim())
    : []
  const activeCards = cards.filter(card => card && card !== PENDING)
  const findings: VolumeContractReviewFinding[] = []

  for (const card of activeCards) {
    let cursor = 0
    while (cursor <= prose.length) {
      const start = prose.indexOf(card, cursor)
      if (start < 0) break
      const end = start + card.length
      const windowEnd = Math.min(prose.length, end + 80)
      const window = prose.slice(start, windowEnd)
      if (!findings.some(item => item.card === card && start < item.end && end > item.start)) {
        findings.push({
          card,
          excerpt: prose.slice(start, Math.min(prose.length, start + 120)),
          start,
          end,
        })
      }
      cursor = end
    }
  }

  findings.sort((left, right) => left.start - right.start)
  const broken = findings.length > 0 && findings.some(finding =>
    REVEAL_RE.test(prose.slice(finding.start, Math.min(prose.length, finding.end + 80)))
  )

  return {
    status: broken
      ? 'contract_broken'
      : findings.length > 0
        ? 'contract_needs_reinforcement'
        : 'contract_safe',
    detected: findings.length > 0,
    findings
  }
}
