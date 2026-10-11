import type { ExistingVolumeRef } from './volumeGeneration'

export type VolumeContractMode = 'auto' | 'single' | 'continue'

export interface VolumeGenerationContract {
  mode: VolumeContractMode
  expectedCount: number
  existingCount: number
  totalPlannedVolumes: number
}

export interface VolumeHistoryFacts {
  totalGenerated: number
  volumes: Array<{ index: number; name: string; summary: string; allocatedWords: number }>
}

export interface VolumeBatchValidation {
  valid: boolean
  errors: string[]
  missingCount: number
}

export interface VolumeLedgerValidation {
  valid: boolean
  errors: string[]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value || '').trim()
}

function normalizeWords(value: unknown): number | null {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return null
  const rounded = Math.round(num)
  return Number.isInteger(rounded) && rounded === num ? rounded : null
}

export function buildVolumeHistoryFacts(volumes: unknown[]): VolumeHistoryFacts {
  const list = Array.isArray(volumes) ? volumes : []
  return {
    totalGenerated: list.length,
    volumes: list.map((volume, index) => {
      const item = volume as ExistingVolumeRef
      return {
        index: index + 1,
        name: text(item?.name) || '未命名卷',
        summary: text(item?.summary) || text(item?.outline),
        allocatedWords: normalizeWords(item?.allocatedWords ?? item?.suggestedWords) ?? 0
      }
    })
  }
}

export function renderVolumeHistoryContext(facts: VolumeHistoryFacts): string {
  if (facts.volumes.length === 0) return '[已生成卷事实清单]\n暂无已生成卷'
  const lines = facts.volumes.map(item =>
    `第${item.index}卷《${item.name}》\n分配字数：${item.allocatedWords}\n摘要：${item.summary || '无摘要'}`
  )
  return ['[已生成卷事实清单]', ...lines].join('\n')
}

export function validateVolumeBatch(
  volumes: unknown[],
  contract: VolumeGenerationContract,
  existingVolumes: ExistingVolumeRef[] = []
): VolumeBatchValidation {
  const list = Array.isArray(volumes) ? volumes : []
  const errors: string[] = []
  const expected = Math.max(0, Math.round(Number(contract.expectedCount) || 0))
  const existingNames = new Set(existingVolumes.map(item => text(item?.name)).filter(Boolean))
  const batchNames = new Set<string>()

  if (list.length !== expected) {
    errors.push(`卷数数量不一致：本批声明 ${expected} 卷，实际 ${list.length} 卷`)
  }

  list.forEach((volume, index) => {
    const name = text((volume as ExistingVolumeRef)?.name)
    const outline = text((volume as ExistingVolumeRef)?.outline) || text((volume as ExistingVolumeRef)?.summary)
    if (!name) errors.push(`第 ${index + 1} 卷缺少名称`)
    if (!outline) errors.push(`卷「${name || '?'}」缺少卷纲内容`)
    if (normalizeWords((volume as any)?.allocatedWords ?? (volume as any)?.suggestedWords) === null) {
      errors.push(`卷「${name || '?'}」分配字数必须是非负整数`)
    }
    if (name) {
      if (existingNames.has(name)) errors.push(`卷名与历史重复：「${name}」`)
      if (batchNames.has(name)) errors.push(`卷名重复：「${name}」`)
      batchNames.add(name)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    missingCount: Math.max(0, expected - list.length)
  }
}

export function validateVolumeGenerationLedger(
  actualCount: number,
  totalPlannedVolumes: number,
  mode: VolumeContractMode
): VolumeLedgerValidation {
  const actual = Math.max(0, Math.round(Number(actualCount) || 0))
  const target = Math.max(1, Math.round(Number(totalPlannedVolumes) || 1))
  const errors: string[] = []
  if (mode === 'auto' && actual !== target) {
    errors.push(actual < target
      ? `卷数台账缺口：当前 ${actual} 卷，目标 ${target} 卷`
      : `卷数台账超额：当前 ${actual} 卷，目标 ${target} 卷`)
  }
  if (mode !== 'auto' && actual > target) {
    errors.push(`卷数台账超额：当前 ${actual} 卷，目标 ${target} 卷`)
  }
  return { valid: errors.length === 0, errors }
}
