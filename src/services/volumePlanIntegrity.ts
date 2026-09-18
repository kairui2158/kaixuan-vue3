import { hasVolumeContent, type ExistingVolumeRef } from './volumeGeneration'

export interface VolumePlanIntegrityInput {
  plannedVolumeCount: number
  totalWords: number
  existingVolumes: ExistingVolumeRef[]
}

export interface VolumePlanIntegrity {
  plannedVolumeCount: number
  generatedVolumeCount: number
  allocatedWords: number
  remainingWords: number
  remainingVolumes: number
  currentVolumeBudget: number
  conflicts: string[]
}

function normalizeWords(value: unknown): number {
  return Math.max(0, Math.round(Number(value) || 0))
}

export function buildVolumePlanIntegrity(input: VolumePlanIntegrityInput): VolumePlanIntegrity {
  const plannedVolumeCount = Math.max(1, Math.round(Number(input.plannedVolumeCount) || 0))
  const totalWords = normalizeWords(input.totalWords)
  const generatedVolumes = Array.isArray(input.existingVolumes)
    ? input.existingVolumes.filter(hasVolumeContent)
    : []
  const generatedVolumeCount = generatedVolumes.length
  const allocatedWords = generatedVolumes.reduce(
    (sum, volume) => sum + normalizeWords(volume.allocatedWords || volume.suggestedWords),
    0
  )
  const remainingWords = Math.max(0, totalWords - allocatedWords)
  const remainingVolumes = Math.max(0, plannedVolumeCount - generatedVolumeCount)
  const currentVolumeBudget = remainingVolumes > 0
    ? Math.floor(remainingWords / remainingVolumes)
    : 0
  const conflicts: string[] = []
  if (generatedVolumeCount > plannedVolumeCount) {
    conflicts.push(`已生成卷数(${generatedVolumeCount})超过计划卷数(${plannedVolumeCount})`)
  }
  if (allocatedWords > totalWords) {
    conflicts.push(`已分配字数(${allocatedWords})超过全书总字数(${totalWords})`)
  }
  if (remainingVolumes > 0 && remainingWords === 0) {
    conflicts.push(`还有${remainingVolumes}卷待生成，但剩余可分配字数为0`)
  }
  return {
    plannedVolumeCount,
    generatedVolumeCount,
    allocatedWords,
    remainingWords,
    remainingVolumes,
    currentVolumeBudget,
    conflicts
  }
}

export function clampVolumeWordsToPlan(
  words: unknown,
  plan: Pick<VolumePlanIntegrity, 'remainingWords' | 'remainingVolumes'>
): { words: number; clamped: boolean } {
  const requested = normalizeWords(words)
  if (requested <= plan.remainingWords) {
    return { words: requested, clamped: false }
  }
  const ceiling = Math.max(0, plan.remainingWords)
  return { words: ceiling, clamped: requested !== ceiling }
}
