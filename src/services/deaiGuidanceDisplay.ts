import type { RunTraceEvent } from '../stores/runTrace'
import { BODY_LAYER_STEP, type DeaiGuidanceOwnership } from './skillDeaiContract'

export type DeaiGuidanceDisplayTraceEvent = Pick<
  RunTraceEvent,
  'id' | 'ts' | 'level' | 'type' | 'label' | 'detail' | 'seq'
>

export type DeaiSkillGuidanceDisplayState = 'app' | 'skill' | 'off' | 'unknown'
export type DeaiChainGuidanceDisplayState = DeaiSkillGuidanceDisplayState | 'mixed'

export interface DeaiSkillGuidanceDisplay {
  skillIndex: number
  skillId: string | null
  state: DeaiSkillGuidanceDisplayState
  itemCount: number | null
  guidanceChars: number | null
  variant: string | null
  source: string | null
  warnings: string[]
}

export interface DeaiChainGuidanceDisplay {
  state: DeaiChainGuidanceDisplayState
  skills: DeaiSkillGuidanceDisplay[]
  observedCount: number
  itemCount: number | null
  guidanceChars: number | null
}

export interface DeaiCollaborationMethodologyDisplay {
  state: DeaiChainGuidanceDisplayState
  itemCount: number | null
  guidanceChars: number | null
}

export interface DeaiCollaborationDiagnosisDisplay {
  observed: boolean
  eventCount: number
  findingCount: number
  guidanceChars: number
}

export interface DeaiCollaborationCalibrationDisplay {
  observed: boolean
  findingCount: number
  ledgerWritten: boolean
}

export interface DeaiCollaborationDisplay {
  methodology: DeaiCollaborationMethodologyDisplay
  diagnosis: DeaiCollaborationDiagnosisDisplay
  calibration: DeaiCollaborationCalibrationDisplay
  lines: string[]
}

export interface DeaiCollaborationTraceSource {
  id: string
  mode?: string
  pipelineRunId?: string | null
  events: readonly DeaiGuidanceDisplayTraceEvent[]
}

interface DeaiInjectionPolicyDetail {
  step?: unknown
  skillIndex?: unknown
  skillId?: unknown
  source?: unknown
  variant?: unknown
  policy?: {
    generation?: unknown
    guidanceOwnership?: unknown
    [key: string]: unknown
  }
  warnings?: unknown
}

interface DeaiGuidancePackDetail {
  step?: unknown
  skillIndex?: unknown
  itemCount?: unknown
  guidanceChars?: unknown
}

function parseEventDetail(event: DeaiGuidanceDisplayTraceEvent): Record<string, unknown> | null {
  if (typeof event.detail !== 'string' || !event.detail) return null
  try {
    const parsed = JSON.parse(event.detail)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function unknownSkillDisplay(skillIndex: number): DeaiSkillGuidanceDisplay {
  return {
    skillIndex,
    skillId: null,
    state: 'unknown',
    itemCount: null,
    guidanceChars: null,
    variant: null,
    source: null,
    warnings: [],
  }
}

export function resolveDeaiChainGuidanceDisplay(input: {
  events: readonly DeaiGuidanceDisplayTraceEvent[]
  skillCount: number
}): DeaiChainGuidanceDisplay {
  const { events, skillCount } = input
  const normalizedSkillCount = Math.max(0, Math.trunc(skillCount))
  const policyEvents = events.filter(event => event.type === 'deai-injection-policy')
  const packEvents = events.filter(event => event.type === 'deai-guidance-pack')

  const skills: DeaiSkillGuidanceDisplay[] = []

  for (let skillIndex = 0; skillIndex < normalizedSkillCount; skillIndex += 1) {
    const skillPolicies = policyEvents.filter(event => {
      const detail = parseEventDetail(event)
      return detail?.step === BODY_LAYER_STEP
        && (detail.skillIndex === skillIndex || detail.skillId === `folder:KAI-S${skillIndex + 1}`)
    })
    const latestPolicy = [...skillPolicies].sort((a, b) => (b.seq ?? b.ts) - (a.seq ?? a.ts))[0]
    const latestPolicyDetail = latestPolicy ? parseEventDetail(latestPolicy) : null

    if (!latestPolicy || !latestPolicyDetail) {
      skills.push(unknownSkillDisplay(skillIndex))
      continue
    }

    const policy = latestPolicyDetail.policy
    const policyObject = policy && typeof policy === 'object' ? policy as Record<string, unknown> : null
    const ownership = policyObject?.guidanceOwnership as DeaiGuidanceOwnership | undefined
    const generation = policyObject?.generation
    const warnings = Array.isArray(latestPolicyDetail.warnings)
      ? latestPolicyDetail.warnings.filter(isString)
      : []

    if (generation === 'off') {
      skills.push({
        skillIndex,
        skillId: isString(latestPolicyDetail.skillId) ? latestPolicyDetail.skillId : null,
        state: 'off',
        itemCount: 0,
        guidanceChars: 0,
        variant: isString(latestPolicyDetail.variant) ? latestPolicyDetail.variant : null,
        source: isString(latestPolicyDetail.source) ? latestPolicyDetail.source : null,
        warnings,
      })
      continue
    }

    if (ownership === 'skill') {
      skills.push({
        skillIndex,
        skillId: isString(latestPolicyDetail.skillId) ? latestPolicyDetail.skillId : null,
        state: 'skill',
        itemCount: 0,
        guidanceChars: 0,
        variant: isString(latestPolicyDetail.variant) ? latestPolicyDetail.variant : null,
        source: isString(latestPolicyDetail.source) ? latestPolicyDetail.source : null,
        warnings,
      })
      continue
    }

    if (ownership === 'app') {
      const skillPacks = packEvents.filter(event => {
        const detail = parseEventDetail(event)
        return detail?.step === BODY_LAYER_STEP
          && (detail.skillIndex === skillIndex || detail.skillId === `folder:KAI-S${skillIndex + 1}`)
      })
      const latestPack = [...skillPacks].sort((a, b) => (b.seq ?? b.ts) - (a.seq ?? a.ts))[0]
      const packDetail = latestPack ? parseEventDetail(latestPack) : null

      if (!latestPack || !packDetail || !isNumber(packDetail.itemCount) || !isNumber(packDetail.guidanceChars)) {
        skills.push(unknownSkillDisplay(skillIndex))
        continue
      }

      skills.push({
        skillIndex,
        skillId: isString(latestPolicyDetail.skillId) ? latestPolicyDetail.skillId : null,
        state: 'app',
        itemCount: packDetail.itemCount,
        guidanceChars: packDetail.guidanceChars,
        variant: isString(latestPolicyDetail.variant) ? latestPolicyDetail.variant : null,
        source: isString(latestPolicyDetail.source) ? latestPolicyDetail.source : null,
        warnings,
      })
      continue
    }

    skills.push(unknownSkillDisplay(skillIndex))
  }

  const observedSkills = skills.filter(skill => skill.state !== 'unknown')
  const states = new Set(skills.map(skill => skill.state))
  const chainState: DeaiChainGuidanceDisplayState = observedSkills.length === 0
    ? 'unknown'
    : states.size === 1
    ? [...states][0] as DeaiSkillGuidanceDisplayState
    : 'mixed'

  const knownSkills = skills.filter(skill => skill.state !== 'unknown')
  const itemCount = knownSkills.length
    ? knownSkills.reduce((sum, skill) => sum + (skill.itemCount ?? 0), 0)
    : null
  const guidanceChars = knownSkills.length
    ? knownSkills.reduce((sum, skill) => sum + (skill.guidanceChars ?? 0), 0)
    : null

  return {
    state: chainState,
    skills,
    observedCount: observedSkills.length,
    itemCount,
    guidanceChars,
  }
}

export function mergeDeaiChainGuidanceDisplays(
  displays: readonly DeaiChainGuidanceDisplay[],
): DeaiChainGuidanceDisplay {
  if (displays.length === 0) {
    return {
      state: 'unknown',
      skills: [],
      observedCount: 0,
      itemCount: null,
      guidanceChars: null,
    }
  }
  if (displays.length === 1) return displays[0]

  const skillCount = Math.max(...displays.map(display => display.skills.length))
  let hasSkillConflict = false
  const skills: DeaiSkillGuidanceDisplay[] = Array.from({ length: skillCount }, (_, skillIndex) => {
    const candidates = displays
      .map(display => display.skills[skillIndex])
      .filter((skill): skill is DeaiSkillGuidanceDisplay => Boolean(skill))
    if (candidates.length === 1) return candidates[0]

    const states = new Set(candidates.map(skill => skill.state))
    if (states.size === 1) return candidates[0]
    hasSkillConflict = true
    return {
      ...candidates[0],
      state: 'unknown' as const,
      itemCount: null,
      guidanceChars: null,
      warnings: [...new Set([
        ...candidates.flatMap(skill => skill.warnings),
        'multi-trace-state-conflict',
      ])],
    }
  })

  const states = new Set(skills.map(skill => skill.state))
  const knownSkills = skills.filter(skill => skill.state !== 'unknown')
  const state: DeaiChainGuidanceDisplay['state'] = hasSkillConflict
    || states.size > 1
    ? 'mixed'
    : [...states][0] || 'unknown'
  return {
    state,
    skills,
    observedCount: knownSkills.length,
    itemCount: knownSkills.length ? knownSkills.reduce((sum, skill) => sum + (skill.itemCount ?? 0), 0) : null,
    guidanceChars: knownSkills.length
      ? knownSkills.reduce((sum, skill) => sum + (skill.guidanceChars ?? 0), 0)
      : null,
  }
}

export function resolveDeaiCollaborationDisplay(input: {
  events: readonly DeaiGuidanceDisplayTraceEvent[]
}): DeaiCollaborationDisplay {
  const events = input.events || []
  const policyDetails = events
    .filter(event => event.type === 'deai-injection-policy')
    .map(event => parseEventDetail(event))
    .filter((detail): detail is Record<string, unknown> => Boolean(detail))
  const skillCount = policyDetails.reduce((max, detail) => {
    const count = Number(detail.totalSkillCount)
    return Number.isFinite(count) && count > max ? Math.trunc(count) : max
  }, 0)
  const methodology = resolveDeaiChainGuidanceDisplay({ events, skillCount })

  const diagnosisEvents = events
    .filter(event => event.type === 'deai-stage-guidance')
    .map(event => parseEventDetail(event))
    .filter((detail): detail is Record<string, unknown> => Boolean(detail))
  const latestDiagnosis = diagnosisEvents[diagnosisEvents.length - 1] || null
  const diagnosis: DeaiCollaborationDiagnosisDisplay = {
    observed: Boolean(latestDiagnosis),
    eventCount: diagnosisEvents.length,
    findingCount: Number(latestDiagnosis?.findingCount) || 0,
    guidanceChars: Number(latestDiagnosis?.guidanceChars) || 0,
  }

  const calibrationEvents = events
    .filter(event => event.type === 'deai-calibration')
    .map(event => parseEventDetail(event))
    .filter((detail): detail is Record<string, unknown> => Boolean(detail))
  const latestCalibration = calibrationEvents[calibrationEvents.length - 1] || null
  const calibration: DeaiCollaborationCalibrationDisplay = {
    observed: Boolean(latestCalibration),
    findingCount: Number(latestCalibration?.findingCount) || 0,
    ledgerWritten: latestCalibration?.ledgerWritten === true,
  }

  const observedMethodologyStates = new Set(
    methodology.skills.map(skill => skill.state).filter(state => state !== 'unknown')
  )
  const methodologyState: DeaiChainGuidanceDisplayState = observedMethodologyStates.size === 0
    ? 'unknown'
    : observedMethodologyStates.size === 1
    ? [...observedMethodologyStates][0] as DeaiSkillGuidanceDisplayState
    : 'mixed'
  const methodologyLine = methodologyState === 'unknown'
    ? '方法论 · 未观测'
    : methodologyState === 'skill'
    ? `方法论 · SKILL接管 · ${methodology.itemCount ?? 0}条/${methodology.guidanceChars ?? 0}字符`
    : methodologyState === 'off'
    ? '方法论 · 关闭'
    : `方法论 · 应用注入 · ${methodology.itemCount ?? 0}条/${methodology.guidanceChars ?? 0}字符`
  const diagnosisLine = diagnosis.observed
    ? `诊断 · ${diagnosis.findingCount}条/${diagnosis.guidanceChars}字符`
    : '诊断 · 未观测'
  const calibrationLine = calibration.observed
    ? `校准 · ${calibration.findingCount}条 · ${calibration.ledgerWritten ? '已落账' : '未落账'}`
    : '校准 · 未观测'

  return {
    methodology: {
      state: methodology.state,
      itemCount: methodology.itemCount,
      guidanceChars: methodology.guidanceChars,
    },
    diagnosis,
    calibration,
    lines: [methodologyLine, diagnosisLine, calibrationLine],
  }
}

export function resolveDeaiCollaborationDisplayForPipelineRun(input: {
  pipelineRunId: string | null | undefined
  traces: readonly DeaiCollaborationTraceSource[]
  resolvePipelineRunId?: (traceId: string) => string | null | undefined
}): DeaiCollaborationDisplay {
  const { pipelineRunId, traces, resolvePipelineRunId } = input
  if (!pipelineRunId) {
    return resolveDeaiCollaborationDisplay({ events: [] })
  }

  const events = traces
    .filter(trace => trace.mode === 'body')
    .filter(trace => trace.pipelineRunId === pipelineRunId
      || resolvePipelineRunId?.(trace.id) === pipelineRunId)
    .flatMap(trace => trace.events.filter(
      (event): event is DeaiGuidanceDisplayTraceEvent => event.type === 'deai-injection-policy'
        || event.type === 'deai-guidance-pack'
        || event.type === 'deai-stage-guidance'
        || event.type === 'deai-calibration'
    ))

  return resolveDeaiCollaborationDisplay({ events })
}
