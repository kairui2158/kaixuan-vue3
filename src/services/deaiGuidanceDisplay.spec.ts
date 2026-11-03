import { describe, expect, it } from 'vitest'
import {
  resolveDeaiCollaborationDisplay,
  resolveDeaiCollaborationDisplayForPipelineRun,
  mergeDeaiChainGuidanceDisplays,
  resolveDeaiChainGuidanceDisplay,
  type DeaiGuidanceDisplayTraceEvent,
} from './deaiGuidanceDisplay'

type TestEventInput = Record<string, unknown>

let eventSeq = 0
function event(
  type: 'deai-injection-policy' | 'deai-guidance-pack',
  detail: TestEventInput,
): DeaiGuidanceDisplayTraceEvent {
  eventSeq += 1
  return {
    id: `event-${eventSeq}`,
    ts: eventSeq,
    level: 'info',
    type,
    label: 'test',
    detail: JSON.stringify(detail),
  }
}

function skillTakenEvent(skillIndex: number) {
  return event('deai-injection-policy', {
    step: 4,
    skillIndex,
    totalSkillCount: 3,
    source: 'skill-declared',
    variant: skillIndex === 0 ? 'methodology' : skillIndex === 1 ? 'creative' : 'polish',
    policy: {
      contractVersion: 2,
      generation: 'on',
      finalStepDetection: 'on',
      conflictPolicy: 'skill-wins',
      guidanceOwnership: 'skill',
      overlaps: [],
    },
    warnings: [],
  })
}

function appPolicyEvent(skillIndex: number) {
  return event('deai-injection-policy', {
    step: 4,
    skillIndex,
    totalSkillCount: 3,
    source: 'skill-declared',
    variant: skillIndex === 0 ? 'methodology' : skillIndex === 1 ? 'creative' : 'polish',
    policy: {
      contractVersion: 2,
      generation: 'on',
      finalStepDetection: 'on',
      conflictPolicy: 'report',
      guidanceOwnership: 'app',
      overlaps: [],
    },
    warnings: [],
  })
}

function offPolicyEvent(skillIndex: number) {
  return event('deai-injection-policy', {
    step: 4,
    skillIndex,
    totalSkillCount: 3,
    source: 'skill-disabled',
    variant: 'off',
    policy: {
      contractVersion: 2,
      generation: 'off',
      finalStepDetection: 'on',
      conflictPolicy: 'skill-wins',
      guidanceOwnership: 'skill',
      overlaps: [],
    },
    warnings: [],
  })
}

function guidancePackEvent(skillIndex: number, itemCount: number, guidanceChars: number) {
  return event('deai-guidance-pack', {
    step: 4,
    skillIndex,
    totalSkillCount: 3,
    itemCount,
    guidanceChars,
  })
}

function detailEvent(type: string, detail: TestEventInput): DeaiGuidanceDisplayTraceEvent {
  eventSeq += 1
  return {
    id: `event-${eventSeq}`,
    ts: eventSeq,
    level: 'info',
    type: type as DeaiGuidanceDisplayTraceEvent['type'],
    label: 'test',
    detail: JSON.stringify(detail),
  }
}

describe('DEAI guidance display projection', () => {
  it('reports skill ownership independently for every chain skill', () => {
    const display = resolveDeaiChainGuidanceDisplay({
      events: [
        skillTakenEvent(0),
        skillTakenEvent(1),
        skillTakenEvent(2),
      ],
      skillCount: 3,
    })

    expect(display.state).toBe('skill')
    expect(display.skills.map(skill => skill.state)).toEqual(['skill', 'skill', 'skill'])
    expect(display.observedCount).toBe(3)
    expect(display.itemCount).toBe(0)
    expect(display.guidanceChars).toBe(0)
    expect(display.skills.every(skill => skill.itemCount === 0)).toBe(true)
    expect(display.skills.every(skill => skill.guidanceChars === 0)).toBe(true)
  })

  it('uses guidance-pack measurements for app-owned skills only', () => {
    const display = resolveDeaiChainGuidanceDisplay({
      events: [
        appPolicyEvent(0),
        guidancePackEvent(0, 6, 1180),
        appPolicyEvent(1),
        guidancePackEvent(1, 6, 1210),
        appPolicyEvent(2),
        guidancePackEvent(2, 4, 820),
      ],
      skillCount: 3,
    })

    expect(display.state).toBe('app')
    expect(display.itemCount).toBe(16)
    expect(display.guidanceChars).toBe(3210)
    expect(display.skills.map(skill => skill.itemCount)).toEqual([6, 6, 4])
    expect(display.skills.map(skill => skill.guidanceChars)).toEqual([1180, 1210, 820])
  })

  it('keeps generation off separate from skill takeover', () => {
    const display = resolveDeaiChainGuidanceDisplay({
      events: [offPolicyEvent(0), offPolicyEvent(1), offPolicyEvent(2)],
      skillCount: 3,
    })

    expect(display.state).toBe('off')
    expect(display.skills.every(skill => skill.state === 'off')).toBe(true)
    expect(display.itemCount).toBe(0)
    expect(display.guidanceChars).toBe(0)
  })

  it('shows unknown instead of an empty state when no contract event is observed', () => {
    const display = resolveDeaiChainGuidanceDisplay({ events: [], skillCount: 3 })

    expect(display.state).toBe('unknown')
    expect(display.skills).toHaveLength(3)
    expect(display.skills.every(skill => skill.state === 'unknown')).toBe(true)
    expect(display.observedCount).toBe(0)
    expect(display.itemCount).toBeNull()
    expect(display.guidanceChars).toBeNull()
  })

  it('marks mixed contracts instead of flattening them into one state', () => {
    const display = resolveDeaiChainGuidanceDisplay({
      events: [
        skillTakenEvent(0),
        appPolicyEvent(1),
        guidancePackEvent(1, 6, 1180),
        offPolicyEvent(2),
      ],
      skillCount: 3,
    })

    expect(display.state).toBe('mixed')
    expect(display.skills.map(skill => skill.state)).toEqual(['skill', 'app', 'off'])
    expect(display.itemCount).toBe(6)
    expect(display.guidanceChars).toBe(1180)
  })

  it('uses the latest valid policy for a skill after retry', () => {
    const display = resolveDeaiChainGuidanceDisplay({
      events: [
        appPolicyEvent(1),
        guidancePackEvent(1, 6, 1180),
        skillTakenEvent(1),
      ],
      skillCount: 3,
    })

    expect(display.skills[1]?.state).toBe('skill')
    expect(display.skills[1]?.itemCount).toBe(0)
    expect(display.skills[1]?.guidanceChars).toBe(0)
  })

  it('falls back to unknown for malformed event details without throwing', () => {
    const malformed: DeaiGuidanceDisplayTraceEvent = {
      ...appPolicyEvent(0),
      detail: '{not-json',
    }
    const display = resolveDeaiChainGuidanceDisplay({ events: [malformed], skillCount: 3 })

    expect(display.skills[0]?.state).toBe('unknown')
    expect(display.skills[1]?.state).toBe('unknown')
    expect(display.state).toBe('unknown')
  })

  it('does not mix trace runs passed by the caller', () => {
    const first = resolveDeaiChainGuidanceDisplay({
      events: [skillTakenEvent(0), skillTakenEvent(1), skillTakenEvent(2)],
      skillCount: 3,
    })
    const second = resolveDeaiChainGuidanceDisplay({ events: [], skillCount: 3 })

    expect(first.state).toBe('skill')
    expect(second.state).toBe('unknown')
  })

  it('returns an unknown display when no trace display is available', () => {
    const display = mergeDeaiChainGuidanceDisplays([])

    expect(display.state).toBe('unknown')
    expect(display.skills).toEqual([])
    expect(display.observedCount).toBe(0)
    expect(display.itemCount).toBeNull()
    expect(display.guidanceChars).toBeNull()
  })

  it('conflicts across multiple trace runs as unknown skills with a warning', () => {
    const first = resolveDeaiChainGuidanceDisplay({
      events: [skillTakenEvent(0), skillTakenEvent(1), skillTakenEvent(2)],
      skillCount: 3,
    })
    const second = resolveDeaiChainGuidanceDisplay({
      events: [
        appPolicyEvent(0),
        guidancePackEvent(0, 6, 1180),
        appPolicyEvent(1),
        guidancePackEvent(1, 6, 1210),
        appPolicyEvent(2),
        guidancePackEvent(2, 4, 820),
      ],
      skillCount: 3,
    })

    const display = mergeDeaiChainGuidanceDisplays([first, second])

    expect(display.state).toBe('mixed')
    expect(display.skills.map(skill => skill.state)).toEqual(['unknown', 'unknown', 'unknown'])
    expect(display.skills.every(skill => skill.warnings.includes('multi-trace-state-conflict'))).toBe(true)
    expect(display.observedCount).toBe(0)
    expect(display.itemCount).toBeNull()
    expect(display.guidanceChars).toBeNull()
  })

  it('never reports injected counts for a skill-owned contract', () => {
    const display = resolveDeaiChainGuidanceDisplay({
      events: [
        skillTakenEvent(0),
        guidancePackEvent(0, 6, 1180),
      ],
      skillCount: 3,
    })

    expect(display.skills[0]?.state).toBe('skill')
    expect(display.skills[0]?.itemCount).toBe(0)
    expect(display.skills[0]?.guidanceChars).toBe(0)
    expect(display.itemCount).toBe(0)
  })

  it('ignores non-body and non-chain policy events', () => {
    const bodyDetail = JSON.parse(skillTakenEvent(0).detail || '{}') as Record<string, unknown>
    const nonBody: DeaiGuidanceDisplayTraceEvent = {
      ...skillTakenEvent(0),
      detail: JSON.stringify({ ...bodyDetail, step: 3 }),
    }
    const chainDetail = JSON.parse(skillTakenEvent(1).detail || '{}') as Record<string, unknown>
    delete chainDetail.skillIndex
    const nonChain: DeaiGuidanceDisplayTraceEvent = {
      ...skillTakenEvent(1),
      detail: JSON.stringify(chainDetail),
    }
    const display = resolveDeaiChainGuidanceDisplay({
      events: [nonBody, nonChain, skillTakenEvent(2)],
      skillCount: 3,
    })

    expect(display.state).toBe('mixed')
    expect(display.skills[0]?.state).toBe('unknown')
    expect(display.skills[1]?.state).toBe('unknown')
    expect(display.skills[2]?.state).toBe('skill')
  })

  it('projects methodology, diagnosis, and calibration as separate UI lines', () => {
    const display = resolveDeaiCollaborationDisplay({
      events: [
        skillTakenEvent(0),
        skillTakenEvent(1),
        skillTakenEvent(2),
        detailEvent('deai-stage-guidance', {
          step: 4,
          sourceSkillIndex: 1,
          targetSkillIndex: 2,
          totalSkillCount: 3,
          findingCount: 3,
          droppedFindingCount: 0,
          guidanceChars: 420,
          durationMs: 8,
          degraded: false,
          budgetExceeded: false,
        }),
        detailEvent('deai-calibration', {
          step: 4,
          findingCount: 1,
          ledgerWritten: true,
          ledgerVersion: 1,
          eligibleRuleCount: 0,
        }),
      ],
    })

    expect(display.methodology.state).toBe('skill')
    expect(display.methodology.itemCount).toBe(0)
    expect(display.diagnosis.observed).toBe(true)
    expect(display.diagnosis.eventCount).toBe(1)
    expect(display.diagnosis.findingCount).toBe(3)
    expect(display.diagnosis.guidanceChars).toBe(420)
    expect(display.calibration.observed).toBe(true)
    expect(display.calibration.findingCount).toBe(1)
    expect(display.calibration.ledgerWritten).toBe(true)
    expect(display.lines).toEqual([
      '方法论 · SKILL接管 · 0条/0字符',
      '诊断 · 3条/420字符',
      '校准 · 1条 · 已落账',
    ])
  })

  it('binds collaboration display to the requested pipeline run only', () => {
    const traces = [
      {
        id: 'trace-a',
        mode: 'body',
        pipelineRunId: 'pipeline-a',
        events: [
          appPolicyEvent(0),
          guidancePackEvent(0, 6, 1180),
          appPolicyEvent(1),
          guidancePackEvent(1, 6, 1210),
          appPolicyEvent(2),
          guidancePackEvent(2, 4, 820),
        ],
      },
      {
        id: 'trace-b',
        mode: 'body',
        events: [
          skillTakenEvent(0),
          skillTakenEvent(1),
          skillTakenEvent(2),
        ],
      },
    ]

    const target = resolveDeaiCollaborationDisplayForPipelineRun({
      pipelineRunId: 'pipeline-a',
      traces,
      resolvePipelineRunId: traceId => traceId === 'trace-b' ? 'pipeline-b' : null,
    })
    const other = resolveDeaiCollaborationDisplayForPipelineRun({
      pipelineRunId: 'pipeline-b',
      traces,
      resolvePipelineRunId: traceId => traceId === 'trace-b' ? 'pipeline-b' : null,
    })

    expect(target.methodology.state).toBe('app')
    expect(target.methodology.itemCount).toBe(16)
    expect(target.methodology.guidanceChars).toBe(3210)
    expect(other.methodology.state).toBe('skill')
    expect(other.methodology.itemCount).toBe(0)
    expect(other.methodology.guidanceChars).toBe(0)
  })

  it('keeps diagnosis and calibration hidden when no evidence exists', () => {
    const display = resolveDeaiCollaborationDisplay({
      events: [skillTakenEvent(0), skillTakenEvent(1), skillTakenEvent(2)],
    })

    expect(display.diagnosis.observed).toBe(false)
    expect(display.calibration.observed).toBe(false)
    expect(display.lines).toEqual([
      '方法论 · SKILL接管 · 0条/0字符',
      '诊断 · 未观测',
      '校准 · 未观测',
    ])
  })

  it('never lets model-fact profile injection masquerade as methodology injection', () => {
    const display = resolveDeaiCollaborationDisplay({
      events: [
        skillTakenEvent(0),
        detailEvent('deai-model-profile', {
          step: 4,
          skillIndex: 0,
          provider: 'provider-a',
          model: 'model-a',
          profileVersion: 'v1:1',
          eligibleRuleCount: 2,
          injectedRuleCount: 2,
          guidanceChars: 180,
        }),
      ],
    })

    expect(display.methodology.itemCount).toBe(0)
    expect(display.lines[0]).toBe('方法论 · SKILL接管 · 0条/0字符')
  })
})
