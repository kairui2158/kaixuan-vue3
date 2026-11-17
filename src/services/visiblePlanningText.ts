export const VISIBLE_PLANNING_RATIO_THRESHOLD = 0.6

const PLANNING_PHRASES = [
  'let me',
  "i'll",
  'i will',
  'final text',
  'final output',
  'plan:',
  'step 1:',
  'step 2:',
  'wait,',
  'wait —',
  'hmm,',
]

export function detectVisiblePlanningRatio(text: string): number {
  const normalized = String(text ?? '')
  if (!normalized.trim()) return 0

  let planningChars = 0
  let totalChars = 0
  for (const character of normalized) {
    if (/\s/.test(character)) continue
    totalChars += 1
    if (/[A-Za-z{}()[\]:;,"'-]/.test(character)) planningChars += 1
  }
  if (totalChars === 0) return 0

  const structuralRatio = planningChars / totalChars
  if (structuralRatio >= VISIBLE_PLANNING_RATIO_THRESHOLD) return structuralRatio

  const compact = normalized.toLowerCase()
  const phraseHits = PLANNING_PHRASES.filter(phrase => compact.includes(phrase)).length
  if (phraseHits >= 2) return Math.min(1, structuralRatio + 0.3)
  if (phraseHits >= 1 && structuralRatio >= 0.3) return structuralRatio + 0.2
  return structuralRatio
}
