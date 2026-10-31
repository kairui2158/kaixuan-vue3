export type VolumeContractReviewStatus =
  | 'no_declared_cards'
  | 'no_card_mentions'
  | 'card_mention_observed'

export interface VolumeContractReviewFinding {
  card: string
  excerpt: string
  start: number
  end: number
}

export interface VolumeContractReviewInput {
  prose: string
  forbiddenFinalCards: unknown
  skillVerdictText?: string
}

export interface VolumeContractSkillVerdict {
  status: 'safe' | 'broken' | 'undeclared'
  reason: string | null
}

export interface VolumeContractReview {
  status: VolumeContractReviewStatus
  detected: boolean
  findings: VolumeContractReviewFinding[]
  skillVerdict: VolumeContractSkillVerdict
  ownership: 'app_protocol_observation'
}

const PENDING = '[待补充]'
const SKILL_VERDICT_STATUS_PATTERN = /(?:^|\n)\s*(?:【)?\s*contractStatus\s*(?:】)?\s*[：:]\s*(safe|broken)\s*/i
const SKILL_VERDICT_REASON_PATTERN = /(?:^|\n)\s*(?:【)?\s*contractReason\s*(?:】)?\s*[：:]\s*(.+)/i

export function detectVolumeContractSkillVerdict(text: string): VolumeContractSkillVerdict {
  const raw = String(text || '')
  const statusMatch = SKILL_VERDICT_STATUS_PATTERN.exec(raw)
  const reasonMatch = SKILL_VERDICT_REASON_PATTERN.exec(raw)
  const reason = reasonMatch?.[1]?.split(/\r?\n/)[0]?.trim() || null
  if (!statusMatch) {
    return { status: 'undeclared', reason }
  }
  return {
    status: statusMatch[1].toLowerCase() === 'broken' ? 'broken' : 'safe',
    reason
  }
}

export function observeVolumeContractMentions(input: VolumeContractReviewInput): VolumeContractReview {
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
  const skillVerdict = detectVolumeContractSkillVerdict(input.skillVerdictText || '')

  return {
    status: activeCards.length === 0
      ? 'no_declared_cards'
      : findings.length > 0
        ? 'card_mention_observed'
        : 'no_card_mentions',
    detected: findings.length > 0,
    findings,
    skillVerdict,
    ownership: 'app_protocol_observation'
  }
}
