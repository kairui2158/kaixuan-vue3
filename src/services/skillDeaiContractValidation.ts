export const SKILL_DEAI_CONTRACT_VERSION = 1

export type DeaiGenerationMode = 'on' | 'off' | 'suffix-only'
export type DeaiFinalStepDetectionMode = 'on' | 'off'
export type DeaiConflictPolicy = 'skill-wins' | 'app-wins' | 'report'

export interface SkillDeaiMeta {
  contractVersion?: number
  generation?: DeaiGenerationMode
  finalStepDetection?: DeaiFinalStepDetectionMode
  conflictPolicy?: DeaiConflictPolicy
}

export type RequiredSkillDeaiMeta = Required<SkillDeaiMeta>

export interface SkillDeaiValidation {
  valid: boolean
  meta: RequiredSkillDeaiMeta
  errors: string[]
  warnings: string[]
}

export const DEFAULT_SKILL_DEAI_META: RequiredSkillDeaiMeta = {
  contractVersion: SKILL_DEAI_CONTRACT_VERSION,
  generation: 'on',
  finalStepDetection: 'on',
  conflictPolicy: 'report',
}

export const SUFFIX_ONLY_EQUIVALENT_MODE: DeaiGenerationMode = 'on'

const ALLOWED_KEYS = new Set([
  'contractVersion',
  'generation',
  'finalStepDetection',
  'conflictPolicy',
])

const ALLOWED_GENERATION: readonly DeaiGenerationMode[] = ['on', 'off', 'suffix-only']
const ALLOWED_DETECTION: readonly DeaiFinalStepDetectionMode[] = ['on', 'off']
const ALLOWED_CONFLICT: readonly DeaiConflictPolicy[] = ['skill-wins', 'app-wins', 'report']

function invalidValue(field: string, value: unknown, allowed: readonly string[]): string {
  return `${field} 必须是 ${allowed.join(' / ')}，当前值：${JSON.stringify(value)}`
}

export function validateSkillDeaiMeta(meta: unknown): SkillDeaiValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const normalized: RequiredSkillDeaiMeta = { ...DEFAULT_SKILL_DEAI_META }

  if (meta === undefined || meta === null) {
    return { valid: true, meta: normalized, errors, warnings }
  }
  if (typeof meta !== 'object' || Array.isArray(meta)) {
    return {
      valid: false,
      meta: normalized,
      errors: ['meta.deai 必须是对象'],
      warnings: ['meta.deai 非法，已回退应用默认降AI策略'],
    }
  }

  const source = meta as Record<string, unknown>
  for (const key of Object.keys(source)) {
    if (!ALLOWED_KEYS.has(key)) {
      const message = `未知字段：${key}`
      errors.push(message)
      warnings.push(`${message}，运行时忽略该字段`)
    }
  }

  if (source.contractVersion !== undefined) {
    if (source.contractVersion !== SKILL_DEAI_CONTRACT_VERSION) {
      const message = `contractVersion 仅支持 ${SKILL_DEAI_CONTRACT_VERSION}，当前值：${JSON.stringify(source.contractVersion)}`
      errors.push(message)
      warnings.push(`${message}，已回退默认契约`)
    } else {
      normalized.contractVersion = source.contractVersion as number
    }
  }

  if (source.generation !== undefined) {
    if (!ALLOWED_GENERATION.includes(source.generation as DeaiGenerationMode)) {
      const message = invalidValue('generation', source.generation, ALLOWED_GENERATION)
      errors.push(message)
      warnings.push(`${message}，已回退 generation: on`)
    } else {
      normalized.generation = source.generation as DeaiGenerationMode
    }
  }

  if (source.finalStepDetection !== undefined) {
    if (!ALLOWED_DETECTION.includes(source.finalStepDetection as DeaiFinalStepDetectionMode)) {
      const message = invalidValue('finalStepDetection', source.finalStepDetection, ALLOWED_DETECTION)
      errors.push(message)
      warnings.push(`${message}，已回退 finalStepDetection: on`)
    } else {
      normalized.finalStepDetection = source.finalStepDetection as DeaiFinalStepDetectionMode
    }
  }

  if (source.conflictPolicy !== undefined) {
    if (!ALLOWED_CONFLICT.includes(source.conflictPolicy as DeaiConflictPolicy)) {
      const message = invalidValue('conflictPolicy', source.conflictPolicy, ALLOWED_CONFLICT)
      errors.push(message)
      warnings.push(`${message}，已回退 conflictPolicy: report`)
    } else {
      normalized.conflictPolicy = source.conflictPolicy as DeaiConflictPolicy
    }
  }

  return { valid: errors.length === 0, meta: normalized, errors, warnings }
}
