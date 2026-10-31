import {
  buildDeaiGuidancePack,
  type DeaiGuidancePack,
} from './deaiGuidancePack'
import {
  appendDeaiVoiceProfile,
  type DeAiVoiceProfile,
} from './deaiVoiceProfile'
import { findDeaiSharedTerms } from './deaiSharedTopics'
import {
  BODY_LAYER_STEP,
  DEFAULT_SKILL_DEAI_META,
  SKILL_DEAI_CONTRACT_VERSION,
  SUFFIX_ONLY_EQUIVALENT_MODE,
  type DeaiConflictPolicy,
  type DeaiFinalStepDetectionMode,
  type DeaiGenerationMode,
  type DeaiGuidanceOwnership,
  type RequiredSkillDeaiMeta,
  type SkillDeaiMeta,
  type SkillDeaiValidation,
  validateSkillDeaiMeta,
} from './skillDeaiContractValidation'

export {
  BODY_LAYER_STEP,
  DEFAULT_SKILL_DEAI_META,
  SKILL_DEAI_CONTRACT_VERSION,
  SUFFIX_ONLY_EQUIVALENT_MODE,
  validateSkillDeaiMeta,
}
export type {
  DeaiConflictPolicy,
  DeaiFinalStepDetectionMode,
  DeaiGenerationMode,
  DeaiGuidanceOwnership,
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
  guidancePack: DeaiGuidancePack | null
}

export interface DeaiConflictResolution {
  prompt: string
  overlaps: string[]
  overlapOrigins: Array<'keyword' | 'declared'>
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

    if (step !== BODY_LAYER_STEP || policy.generation === 'off') {
    return {
      prompt: '',
      variant: 'off',
      source,
      policy,
      warnings: validation.warnings,
      guidancePack: null,
    }
  }

  const promptVariant = resolveVariant(chainIndex, chainCount)
  if (policy.guidanceOwnership === 'skill') {
    return {
      prompt: '',
      variant: promptVariant,
      source,
      policy,
      warnings: validation.warnings,
      guidancePack: null,
    }
  }
  const guidancePack = buildDeaiGuidancePack({
    role: promptVariant === 'off' ? 'methodology' : promptVariant,
    voiceProfile: context.voiceProfile,
  })
  return {
    prompt: appendDeaiVoiceProfile(guidancePack.text, context.voiceProfile),
    variant: promptVariant,
    source,
    policy,
    warnings: validation.warnings,
    guidancePack,
  }
}

export function resolveDeaiPromptConflict(
  skillTemplateText: string,
  projection: DeaiPromptProjection,
): DeaiConflictResolution {
  if (!projection.prompt || !skillTemplateText) {
    return {
      prompt: projection.prompt,
      overlaps: [],
      overlapOrigins: [],
      action: 'none',
      policy: projection.policy.conflictPolicy,
    }
  }

  const keywordOverlaps = findDeaiSharedTerms(projection.prompt)
    .filter(term => skillTemplateText.includes(term))
  const declaredOverlaps = projection.policy.overlaps.filter(term =>
    projection.prompt.includes(term) || skillTemplateText.includes(term)
  )
  const overlaps = [...keywordOverlaps, ...declaredOverlaps]
  const overlapOrigins = [
    ...keywordOverlaps.map(() => 'keyword' as const),
    ...declaredOverlaps.map(() => 'declared' as const),
  ]
  if (!overlaps.length) {
    return {
      prompt: projection.prompt,
      overlaps,
      overlapOrigins,
      action: 'none',
      policy: projection.policy.conflictPolicy,
    }
  }

  if (projection.policy.conflictPolicy === 'skill-wins') {
    return {
      prompt: '',
      overlaps,
      overlapOrigins,
      action: 'skill-wins',
      policy: projection.policy.conflictPolicy,
    }
  }
  return {
    prompt: projection.prompt,
    overlaps,
    overlapOrigins,
    action: projection.policy.conflictPolicy === 'app-wins' ? 'app-wins' : 'report',
    policy: projection.policy.conflictPolicy,
  }
}
