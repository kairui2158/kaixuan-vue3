import { describe, expect, it } from 'vitest'
import {
  DEAI_MODEL_PROFILE_RELEASE_GATE,
  DEAI_MODEL_PROFILE_RELEASED,
  DEAI_MODEL_PROFILE_VERSION,
  buildDeaiModelProfileGuidance,
  buildDeaiModelProfileSnapshot,
  buildDeaiModelProfileTraceEvent,
  createDeaiModelProfileRunSnapshotStore,
} from './deaiModelProfile'

const ledger = {
  version: 1,
  entries: [
    { provider: 'provider-a', model: 'model-a', ruleId: 'rule-1', sampleCount: 7, updatedAt: 10 },
    { provider: 'provider-a', model: 'model-a', ruleId: 'rule-2', sampleCount: 6, updatedAt: 20 },
    { provider: 'provider-a', model: 'model-a', ruleId: 'rule-3', sampleCount: 5, updatedAt: 30 },
    { provider: 'provider-a', model: 'model-a', ruleId: 'rule-4', sampleCount: 9, updatedAt: 40 },
    { provider: 'provider-a', model: 'model-b', ruleId: 'rule-other', sampleCount: 30, updatedAt: 50 },
    { provider: 'provider-a', model: 'model-a', ruleId: 'rule-low', sampleCount: 4, updatedAt: 60 },
  ],
}

describe('deaiModelProfile', () => {
  it('isolates profiles by provider and model', () => {
    const snapshot = buildDeaiModelProfileSnapshot(ledger, {
      provider: 'provider-a',
      model: 'model-a',
    })!

    expect(snapshot.provider).toBe('provider-a')
    expect(snapshot.model).toBe('model-a')
    expect(snapshot.profileVersion).toBe(`${DEAI_MODEL_PROFILE_VERSION}:${ledger.version}`)
    expect(snapshot.rules.map(rule => rule.ruleId)).toEqual(['rule-1', 'rule-2', 'rule-3', 'rule-4'])
  })

  it('returns an empty guidance pack when no rule reaches the threshold', () => {
    const snapshot = buildDeaiModelProfileSnapshot(ledger, {
      provider: 'provider-a',
      model: 'model-c',
    })

    expect(buildDeaiModelProfileGuidance(snapshot)).toBe('')
  })

  it('keeps released model facts bounded to three rules and 600 characters', () => {
    const snapshot = buildDeaiModelProfileSnapshot(ledger, {
      provider: 'provider-a',
      model: 'model-a',
    })!
    const guidance = DEAI_MODEL_PROFILE_RELEASED
      ? buildDeaiModelProfileGuidance(snapshot)
      : ''

    if (DEAI_MODEL_PROFILE_RELEASED) {
      expect(guidance).toContain('【模型事实情报】')
      expect(guidance).toContain('rule-1')
      expect(guidance).not.toContain('rule-4')
      expect(guidance.length).toBeLessThanOrEqual(600)
    } else {
      expect(guidance).toBe('')
    }
    expect(guidance).not.toContain('写作')
    expect(guidance).not.toContain('方法论')
  })

  it('freezes model-profile injection until calibration is released', () => {
    expect(DEAI_MODEL_PROFILE_RELEASED).toBe(false)
    const snapshot = buildDeaiModelProfileSnapshot(ledger, {
      provider: 'provider-a',
      model: 'model-a',
    })!
    const guidance = buildDeaiModelProfileGuidance(snapshot)
    const event = buildDeaiModelProfileTraceEvent(snapshot, guidance, {
      step: 4,
      skillIndex: 1,
      totalSkillCount: 3,
    })

    expect(guidance).toBe('')
    expect(event?.level).toBe('warn')
    expect(event?.label).toBe('模型事实画像已冻结，未注入')
    expect(JSON.parse(String(event?.detail))).toMatchObject({
      released: false,
      releaseGate: DEAI_MODEL_PROFILE_RELEASE_GATE,
      eligibleRuleCount: 4,
      injectedRuleCount: 0,
      guidanceChars: 0,
    })
  })

  it('keeps the release gate visible when no rule is eligible yet', () => {
    const snapshot = buildDeaiModelProfileSnapshot(ledger, {
      provider: 'provider-a',
      model: 'model-c',
    })
    const event = buildDeaiModelProfileTraceEvent(snapshot, '', {
      step: 4,
      skillIndex: 1,
      totalSkillCount: 3,
    })

    expect(event?.level).toBe('warn')
    expect(event?.label).toBe('模型事实画像未达标，未注入')
    expect(JSON.parse(String(event?.detail))).toMatchObject({
      released: false,
      releaseGate: DEAI_MODEL_PROFILE_RELEASE_GATE,
      eligibleRuleCount: 0,
      injectedRuleCount: 0,
      guidanceChars: 0,
    })
  })

  it('emits a bounded trace event without guidance prose', () => {
    const snapshot = buildDeaiModelProfileSnapshot(ledger, {
      provider: 'provider-a',
      model: 'model-a',
    })!
    const guidance = buildDeaiModelProfileGuidance(snapshot)
    const event = buildDeaiModelProfileTraceEvent(snapshot, guidance, {
      step: 4,
      skillIndex: 1,
      totalSkillCount: 3,
    })

    expect(event?.type).toBe('deai-model-profile')
    const detail = JSON.parse(String(event?.detail))
    expect(detail).toMatchObject({
      step: 4,
      skillIndex: 1,
      totalSkillCount: 3,
      provider: 'provider-a',
      model: 'model-a',
      profileVersion: snapshot.profileVersion,
      eligibleRuleCount: 4,
      injectedRuleCount: DEAI_MODEL_PROFILE_RELEASED ? 3 : 0,
      guidanceChars: guidance.length,
    })
    if (guidance) {
      expect(JSON.stringify(detail)).not.toContain(guidance)
    }
  })

  it('freezes one profile snapshot per run even when the ledger changes', async () => {
    let currentLedger = ledger
    const activeRunIds = new Set(['run-1'])
    const store = createDeaiModelProfileRunSnapshotStore({
      activeRunIds: () => activeRunIds,
      loadLedger: async () => currentLedger,
    })

    const first = await store.resolveForRun('run-1', 'provider-a', 'model-a')
    currentLedger = {
      version: 2,
      entries: [
        ...ledger.entries,
        { provider: 'provider-a', model: 'model-a', ruleId: 'rule-new', sampleCount: 20, updatedAt: 70 },
      ],
    }
    const second = await store.resolveForRun('run-1', 'provider-a', 'model-a')
    activeRunIds.clear()
    const afterTerminal = await store.resolveForRun('run-1', 'provider-a', 'model-a')

    expect(first?.rules.map(rule => rule.ruleId)).toEqual(['rule-1', 'rule-2', 'rule-3', 'rule-4'])
    expect(second).toBe(first)
    expect(afterTerminal?.rules.map(rule => rule.ruleId)).toContain('rule-new')
  })

  it('removes terminal run snapshots instead of retaining them in memory', async () => {
    let currentLedger = ledger
    const activeRunIds = new Set(['run-1'])
    const store = createDeaiModelProfileRunSnapshotStore({
      activeRunIds: () => activeRunIds,
      loadLedger: async () => currentLedger,
    })

    const first = await store.resolveForRun('run-1', 'provider-a', 'model-a')
    activeRunIds.clear()
    store.cleanupTerminalRuns()
    activeRunIds.add('run-1')
    currentLedger = {
      version: 2,
      entries: [
        ...ledger.entries,
        { provider: 'provider-a', model: 'model-a', ruleId: 'rule-new', sampleCount: 20, updatedAt: 70 },
      ],
    }
    const second = await store.resolveForRun('run-1', 'provider-a', 'model-a')

    expect(first?.rules.map(rule => rule.ruleId)).not.toContain('rule-new')
    expect(second?.rules.map(rule => rule.ruleId)).toContain('rule-new')
  })
})
