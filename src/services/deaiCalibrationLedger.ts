export const DEAI_CALIBRATION_LEDGER_STORAGE_KEY = 'wa_deai_calibration_ledger'
export const DEAI_CALIBRATION_LEDGER_VERSION = 1
export const DEAI_PROFILE_MIN_SAMPLE_COUNT = 5
export const DEAI_CALIBRATION_LEDGER_MAX_ENTRIES = 500

export interface DeaiCalibrationLedgerEntry {
  provider: string
  model: string
  ruleId: string
  sampleCount: number
  updatedAt: number
}

export interface DeaiCalibrationLedger {
  version: number
  entries: DeaiCalibrationLedgerEntry[]
}

export interface DeaiCalibrationStorage {
  read: () => Promise<unknown>
  write: (data: DeaiCalibrationLedger) => Promise<boolean>
}

export interface DeaiCalibrationFindingInput {
  id: string
}

export interface DeaiCalibrationTraceEvent {
  type: 'deai-calibration'
  level: 'info' | 'warn'
  label: string
  detail: string
}

export interface DeaiCalibrationPruneResult {
  pruned: boolean
  retainedCount: number
  prunedCount: number
}

export interface DeaiCalibrationRecordResult {
  ledger: DeaiCalibrationLedger
  pruneResult: DeaiCalibrationPruneResult
}

function emptyLedger(): DeaiCalibrationLedger {
  return {
    version: DEAI_CALIBRATION_LEDGER_VERSION,
    entries: [],
  }
}

function normalizeLedger(raw: unknown): DeaiCalibrationLedger {
  if (!raw || typeof raw !== 'object') return emptyLedger()
  const candidate = raw as Partial<DeaiCalibrationLedger>
  const entries = Array.isArray(candidate.entries)
    ? candidate.entries.filter((entry): entry is DeaiCalibrationLedgerEntry =>
      Boolean(entry)
      && typeof entry === 'object'
      && typeof (entry as DeaiCalibrationLedgerEntry).provider === 'string'
      && typeof (entry as DeaiCalibrationLedgerEntry).model === 'string'
      && typeof (entry as DeaiCalibrationLedgerEntry).ruleId === 'string'
      && typeof (entry as DeaiCalibrationLedgerEntry).sampleCount === 'number'
      && Number.isFinite((entry as DeaiCalibrationLedgerEntry).sampleCount))
    : []
  return {
    version: DEAI_CALIBRATION_LEDGER_VERSION,
    entries,
  }
}

export async function readDeaiCalibrationLedger(
  storage: DeaiCalibrationStorage,
): Promise<DeaiCalibrationLedger> {
  try {
    return normalizeLedger(await storage.read())
  } catch {
    // Calibration is observability. A broken store must not block generation.
    return emptyLedger()
  }
}

export async function recordDeaiCalibrationFindings(
  storage: DeaiCalibrationStorage,
  input: {
    provider: string
    model: string
    findings: readonly DeaiCalibrationFindingInput[]
    now?: number
  },
): Promise<DeaiCalibrationRecordResult | null> {
  const ledger = await readDeaiCalibrationLedger(storage)
  const now = input.now ?? Date.now()
  const provider = String(input.provider || '')
  const model = String(input.model || '')
  if (!provider || !model) return null

  const entries = [...ledger.entries]
  for (const finding of input.findings || []) {
    const ruleId = String(finding?.id || '')
    if (!ruleId) continue
    const index = entries.findIndex(entry =>
      entry.provider === provider && entry.model === model && entry.ruleId === ruleId)
    if (index >= 0) {
      entries[index] = {
        ...entries[index],
        sampleCount: entries[index].sampleCount + 1,
        updatedAt: now,
      }
      continue
    }
    entries.push({ provider, model, ruleId, sampleCount: 1, updatedAt: now })
  }

  const next = pruneDeaiCalibrationLedger({
    version: DEAI_CALIBRATION_LEDGER_VERSION,
    entries,
  })
  const pruneResult: DeaiCalibrationPruneResult = {
    pruned: next.entries.length < entries.length,
    retainedCount: next.entries.length,
    prunedCount: entries.length - next.entries.length,
  }
  try {
    const written = await storage.write(next)
    if (!written) return null
    return { ledger: next, pruneResult }
  } catch {
    return null
  }
}

export function selectDeaiProfileRules(
  ledger: DeaiCalibrationLedger,
  identity: { provider: string, model: string },
): DeaiCalibrationLedgerEntry[] {
  return (ledger.entries || [])
    .filter(entry =>
      entry.provider === identity.provider
      && entry.model === identity.model
      && entry.sampleCount >= DEAI_PROFILE_MIN_SAMPLE_COUNT)
}

export function pruneDeaiCalibrationLedger(
  ledger: DeaiCalibrationLedger,
): DeaiCalibrationLedger {
  if (ledger.entries.length <= DEAI_CALIBRATION_LEDGER_MAX_ENTRIES) return ledger
  const retained = [...ledger.entries]
    .sort((a, b) => b.sampleCount - a.sampleCount || b.updatedAt - a.updatedAt)
    .slice(0, DEAI_CALIBRATION_LEDGER_MAX_ENTRIES)
  return {
    version: DEAI_CALIBRATION_LEDGER_VERSION,
    entries: retained,
  }
}

export function buildDeaiCalibrationTraceEvent(input: {
  provider: string
  model: string
  findingCount: number
  ledger: DeaiCalibrationLedger | null
  pruneResult?: DeaiCalibrationPruneResult | null
}): DeaiCalibrationTraceEvent {
  const prune = input.pruneResult || null
  return {
    type: 'deai-calibration',
    level: input.ledger ? 'info' : 'warn',
    label: input.ledger
      ? input.ledger.entries.length >= DEAI_CALIBRATION_LEDGER_MAX_ENTRIES && prune?.pruned
        ? `降AI校准已落账：${input.findingCount}条，账本已裁剪`
        : `降AI校准已落账：${input.findingCount}条`
      : '降AI校准未落账',
    detail: JSON.stringify({
      provider: input.provider,
      model: input.model,
      findingCount: input.findingCount,
      ledgerWritten: input.ledger !== null,
      ledgerVersion: input.ledger?.version ?? null,
      ledgerEntryCount: input.ledger?.entries.length ?? null,
      maxEntries: DEAI_CALIBRATION_LEDGER_MAX_ENTRIES,
      pruned: prune?.pruned ?? false,
      prunedCount: prune?.prunedCount ?? 0,
    }),
  }
}
