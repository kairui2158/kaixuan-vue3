import {
  selectDeaiProfileRules,
  type DeaiCalibrationLedger,
  type DeaiCalibrationLedgerEntry,
} from './deaiCalibrationLedger'
import type { RunTraceEvent } from '../stores/runTrace'

export const DEAI_MODEL_PROFILE_VERSION = 1
export const DEAI_MODEL_PROFILE_MAX_RULES = 3
export const DEAI_MODEL_PROFILE_MAX_CHARS = 600
export const DEAI_MODEL_PROFILE_RELEASED = false
export const DEAI_MODEL_PROFILE_RELEASE_GATE = 'calibration-not-ready'

export interface DeaiModelProfileSnapshot {
  provider: string
  model: string
  profileVersion: string
  rules: DeaiCalibrationLedgerEntry[]
}

export interface DeaiModelProfileRunSnapshotStore {
  resolveForRun: (
    runId: string | null | undefined,
    provider: string,
    model: string,
  ) => Promise<DeaiModelProfileSnapshot | null>
  cleanupTerminalRuns: () => void
}

export type DeaiModelProfileTraceEvent = Pick<RunTraceEvent, 'type' | 'level' | 'label' | 'detail'>

export function buildDeaiModelProfileSnapshot(
  ledger: DeaiCalibrationLedger,
  identity: { provider: string, model: string },
): DeaiModelProfileSnapshot | null {
  if (!identity.provider || !identity.model) return null
  return {
    provider: identity.provider,
    model: identity.model,
    profileVersion: `${DEAI_MODEL_PROFILE_VERSION}:${ledger.version}`,
    rules: selectDeaiProfileRules(ledger, identity),
  }
}

export function buildDeaiModelProfileGuidance(
  snapshot: DeaiModelProfileSnapshot | null,
): string {
  if (!DEAI_MODEL_PROFILE_RELEASED) return ''
  if (!snapshot || !snapshot.rules.length) return ''
  const lines = [
    '【模型事实情报】',
    ...snapshot.rules.slice(0, DEAI_MODEL_PROFILE_MAX_RULES)
      .map((rule, index) => `${index + 1}. ${rule.ruleId}：近${rule.sampleCount}次稳定命中`)
  ]
  let text = lines.join('\n')
  if (text.length > DEAI_MODEL_PROFILE_MAX_CHARS) {
    text = text.slice(0, DEAI_MODEL_PROFILE_MAX_CHARS)
  }
  return text
}

export function buildDeaiModelProfileTraceEvent(
  snapshot: DeaiModelProfileSnapshot | null,
  guidance: string,
  context: {
    step: number
    skillIndex: number
    totalSkillCount: number
  },
): DeaiModelProfileTraceEvent | null {
  if (!snapshot) return null
  const frozen = !DEAI_MODEL_PROFILE_RELEASED
  return {
    type: 'deai-model-profile',
    level: frozen ? 'warn' : guidance ? 'info' : 'warn',
    label: frozen
      ? snapshot.rules.length > 0
        ? '模型事实画像已冻结，未注入'
        : '模型事实画像未达标，未注入'
      : guidance
      ? `模型事实画像注入：${snapshot.rules.slice(0, DEAI_MODEL_PROFILE_MAX_RULES).length}条 / ${guidance.length}字符`
      : '模型事实画像未达标，未注入',
    detail: JSON.stringify({
      step: context.step,
      skillIndex: context.skillIndex,
      totalSkillCount: context.totalSkillCount,
      provider: snapshot.provider,
      model: snapshot.model,
      profileVersion: snapshot.profileVersion,
      released: DEAI_MODEL_PROFILE_RELEASED,
      releaseGate: frozen ? DEAI_MODEL_PROFILE_RELEASE_GATE : null,
      eligibleRuleCount: snapshot.rules.length,
      injectedRuleCount: guidance ? Math.min(snapshot.rules.length, DEAI_MODEL_PROFILE_MAX_RULES) : 0,
      guidanceChars: guidance.length,
    })
  }
}

export function createDeaiModelProfileRunSnapshotStore({
  activeRunIds,
  loadLedger,
}: {
  activeRunIds: () => ReadonlySet<string>
  loadLedger: () => Promise<DeaiCalibrationLedger>
}): DeaiModelProfileRunSnapshotStore {
  const snapshots = new Map<string, DeaiModelProfileSnapshot | null>()
  const pending = new Map<string, Promise<DeaiModelProfileSnapshot | null>>()

  function snapshotKey(runId: string, provider: string, model: string): string {
    return [runId, provider, model].join('\u001f')
  }

  async function resolve(provider: string, model: string): Promise<DeaiModelProfileSnapshot | null> {
    return buildDeaiModelProfileSnapshot(await loadLedger(), { provider, model })
  }

  async function resolveForRun(
    runId: string | null | undefined,
    provider: string,
    model: string,
  ): Promise<DeaiModelProfileSnapshot | null> {
    if (!runId || !activeRunIds().has(runId)) {
      return resolve(provider, model)
    }
    const key = snapshotKey(runId, provider, model)
    if (snapshots.has(key)) return snapshots.get(key) ?? null
    const existing = pending.get(key)
    if (existing) return existing

    const loaded = resolve(provider, model).then(snapshot => {
      if (activeRunIds().has(runId)) snapshots.set(key, snapshot)
      pending.delete(key)
      return snapshot
    }).catch(() => {
      pending.delete(key)
      return null
    })
    pending.set(key, loaded)
    return loaded
  }

  function cleanupTerminalRuns(): void {
    const activeRuns = activeRunIds()
    for (const key of [...snapshots.keys(), ...pending.keys()]) {
      const runId = key.split('\u001f')[0]
      if (!activeRuns.has(runId)) {
        snapshots.delete(key)
        pending.delete(key)
      }
    }
  }

  return { resolveForRun, cleanupTerminalRuns }
}
