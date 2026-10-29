export const DeAiProcessor: any
export interface DeAiDetectReportV2 {
  kernelVersion: 'v2'
  provisional: boolean
  effectiveChars: number
  dialogueChars: number
  score: number
  verdict: 'clean' | 'advisory' | 'suspicious' | 'likely_ai' | 'blocking'
  aiEditedFraction: 'none' | 'light' | 'mixed' | 'heavy' | 'unknown'
  findings: unknown[]
  styleDrift?: { windowCount: number; firstLastDelta: number; severity: 'advisory' | 'blocking' }
  thresholds: { name: string; value: number; scaledValue: number; source: 'default' | 'calibrated' }[]
}
export const DEAI_METHODOLOGY_PROMPT: string
export const DEAI_CREATIVE_PROMPT: string
export const DEAI_POLISH_PROMPT: string
export function resolveDeaiPromptForChainStep(step: number, skillIndex?: number, totalSkillCount?: number): string
export function collectDeaiFindingsWithObservability(
  candidate: string,
  onDegraded?: (message: string) => void,
  detect?: (candidate: string) => { findings: unknown[] }
): { findings: unknown[]; degraded: boolean; degradedReason?: string }
