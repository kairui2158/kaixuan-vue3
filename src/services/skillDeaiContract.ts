import {
  resolveDeaiPromptForChainStep,
} from './de-ai'
import {
  appendDeaiVoiceProfile,
  type DeAiVoiceProfile,
} from './deaiVoiceProfile'
import {
  DEFAULT_SKILL_DEAI_META,
  SKILL_DEAI_CONTRACT_VERSION,
  SUFFIX_ONLY_EQUIVALENT_MODE,
  type DeaiConflictPolicy,
  type DeaiFinalStepDetectionMode,
  type DeaiGenerationMode,
  type RequiredSkillDeaiMeta,
  type SkillDeaiMeta,
  type SkillDeaiValidation,
  validateSkillDeaiMeta,
} from './skillDeaiContractValidation'

export {
  DEFAULT_SKILL_DEAI_META,
  SKILL_DEAI_CONTRACT_VERSION,
  SUFFIX_ONLY_EQUIVALENT_MODE,
  validateSkillDeaiMeta,
}
export type {
  DeaiConflictPolicy,
  DeaiFinalStepDetectionMode,
  DeaiGenerationMode,
  RequiredSkillDeaiMeta,
  SkillDeaiMeta,
  SkillDeaiValidation,
}

export type DeaiInjectionSource =
  | 'skill-declared'
  | 'app-default'
  | 'app-default-no-skill-meta'
  | 'skill-disabled'

export type DeaiPromptVariant =
  | 'methodology'
  | 'methodology-compose'
  | 'creative'
  | 'polish'
  | 'off'

export interface DeaiPromptProjection {
  prompt: string
  variant: DeaiPromptVariant
  source: DeaiInjectionSource
  policy: RequiredSkillDeaiMeta
  warnings: string[]
}

export interface DeaiConflictResolution {
  prompt: string
  overlaps: string[]
  action: 'none' | 'report' | 'skill-wins' | 'app-wins'
  policy: RequiredSkillDeaiMeta['conflictPolicy']
}


function resolveVariant(
  chainIndex: number | undefined,
  chainCount: number | undefined,
): DeaiPromptVariant {
  if (chainIndex === undefined) return 'methodology-compose'
  const count = Number.isFinite(chainCount) ? chainCount as number : 1
  if (count > 1) {
    if (chainIndex <= 0) return 'methodology'
    if (chainIndex >= count - 1) return 'polish'
    return 'creative'
  }
  return 'methodology'
}

function resolveSource(meta: unknown, generation: DeaiGenerationMode): DeaiInjectionSource {
  if (meta !== undefined && meta !== null) {
    return generation === 'off' ? 'skill-disabled' : 'skill-declared'
  }
  return 'app-default-no-skill-meta'
}

export function resolveDeaiPromptForSkillStep(
  step: number,
  chainIndex: number | undefined,
  chainCount: number | undefined,
  skillDeaiMeta: SkillDeaiMeta | null,
  context: { voiceProfile: DeAiVoiceProfile | null },
): DeaiPromptProjection {
  const validation = validateSkillDeaiMeta(skillDeaiMeta)
  const policy = validation.meta
  const source = resolveSource(skillDeaiMeta, policy.generation)

    if (step !== 4 || policy.generation === 'off') {
    return {
      prompt: '',
      variant: 'off',
      source,
      policy,
      warnings: validation.warnings,
    }
  }

  const basePrompt = resolveDeaiPromptForChainStep(step, chainIndex, chainCount)
  const prompt = appendDeaiVoiceProfile(basePrompt, context.voiceProfile)
  return {
    prompt,
    variant: resolveVariant(chainIndex, chainCount),
    source,
    policy,
    warnings: validation.warnings,
  }
}

const DEAI_CONFLICT_TERMS = [
  '短句',
  '句长',
  '碎片',
  '连接词',
  '过渡',
  '对白',
  '对话',
  '视角',
  '人物',
  '伏笔',
  'AI痕迹',
]

export function resolveDeaiPromptConflict(
  skillTemplateText: string,
  projection: DeaiPromptProjection,
): DeaiConflictResolution {
  if (!projection.prompt || !skillTemplateText) {
    return {
      prompt: projection.prompt,
      overlaps: [],
      action: 'none',
      policy: projection.policy.conflictPolicy,
    }
  }

  const overlaps = DEAI_CONFLICT_TERMS.filter(term =>
    projection.prompt.includes(term) && skillTemplateText.includes(term)
  )
  if (!overlaps.length) {
    return {
      prompt: projection.prompt,
      overlaps,
      action: 'none',
      policy: projection.policy.conflictPolicy,
    }
  }

  if (projection.policy.conflictPolicy === 'skill-wins') {
    return {
      prompt: '',
      overlaps,
      action: 'skill-wins',
      policy: projection.policy.conflictPolicy,
    }
  }
  return {
    prompt: projection.prompt,
    overlaps,
    action: projection.policy.conflictPolicy === 'app-wins' ? 'app-wins' : 'report',
    policy: projection.policy.conflictPolicy,
  }
}
