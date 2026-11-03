import { describe, expect, it } from 'vitest'
import {
  DEAI_CALIBRATION_LEDGER_STORAGE_KEY,
  DEAI_CALIBRATION_LEDGER_VERSION,
  readDeaiCalibrationLedger,
  recordDeaiCalibrationFindings,
  selectDeaiProfileRules,
  pruneDeaiCalibrationLedger,
  DEAI_CALIBRATION_LEDGER_MAX_ENTRIES,
} from './deaiCalibrationLedger'

function memoryStorage(initial: unknown = null) {
  let value = initial
  const writes: unknown[] = []
  return {
    writes,
    read: async () => value,
    write: async (data: unknown) => {
      writes.push(data)
      value = data
      return true
    },
  }
}

describe('deaiCalibrationLedger', () => {
  it('starts with an empty versioned ledger and never throws on read failure', async () => {
    const storage = {
      read: async () => { throw new Error('storage offline') },
      write: async () => true,
    }
    const ledger = await readDeaiCalibrationLedger(storage)

    expect(ledger).toEqual({
      version: DEAI_CALIBRATION_LEDGER_VERSION,
      entries: [],
    })
  })

  it('merges findings into provider/model keyed entries and keeps the ledger version', async () => {
    const storage = memoryStorage()
    const first = await recordDeaiCalibrationFindings(storage, {
      provider: 'provider-a',
      model: 'model-a',
      findings: [{ id: 'deai-banned-vocab' }, { id: 'deai-style-drift' }],
      now: 1000,
    })
    const second = await recordDeaiCalibrationFindings(storage, {
      provider: 'provider-a',
      model: 'model-a',
      findings: [{ id: 'deai-banned-vocab' }],
      now: 2000,
    })
    const third = await recordDeaiCalibrationFindings(storage, {
      provider: 'provider-b',
      model: 'model-b',
      findings: [{ id: 'deai-banned-vocab' }],
      now: 3000,
    })

    expect(first?.ledger.version).toBe(DEAI_CALIBRATION_LEDGER_VERSION)
    expect(second?.ledger.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'provider-a',
        model: 'model-a',
        ruleId: 'deai-banned-vocab',
        sampleCount: 2,
        updatedAt: 2000,
      }),
      expect.objectContaining({
        provider: 'provider-a',
        model: 'model-a',
        ruleId: 'deai-style-drift',
        sampleCount: 1,
        updatedAt: 1000,
      }),
    ]))
    expect(second?.ledger.entries).toHaveLength(2)
    expect(third?.ledger.entries).toHaveLength(3)
    expect(storage.writes).toHaveLength(3)
  })

  it('returns null and keeps the old ledger when a write fails', async () => {
    let failWrites = false
    let stored: unknown = null
    const storage = {
      read: async () => stored,
      write: async (data: unknown) => {
        if (failWrites) throw new Error('write failed')
        stored = data
        return true
      },
    }
    await recordDeaiCalibrationFindings(storage, {
      provider: 'provider-a',
      model: 'model-a',
      findings: [{ id: 'rule-a' }],
    })
    const before = await readDeaiCalibrationLedger(storage)
    failWrites = true
    const result = await recordDeaiCalibrationFindings(storage, {
      provider: 'provider-a',
      model: 'model-a',
      findings: [{ id: 'rule-a' }],
    })

    expect(result).toBeNull()
    expect(await readDeaiCalibrationLedger(storage)).toEqual(before)
  })

  it('only promotes rules that reached the profile sample threshold', () => {
    const ledger = {
      version: DEAI_CALIBRATION_LEDGER_VERSION,
      entries: [
        { provider: 'provider-a', model: 'model-a', ruleId: 'rule-threshold', sampleCount: 5, updatedAt: 1 },
        { provider: 'provider-a', model: 'model-a', ruleId: 'rule-low', sampleCount: 4, updatedAt: 2 },
        { provider: 'provider-a', model: 'model-b', ruleId: 'rule-other-model', sampleCount: 20, updatedAt: 3 },
      ],
    }

    expect(selectDeaiProfileRules(ledger, {
      provider: 'provider-a',
      model: 'model-a',
    })).toEqual([
      expect.objectContaining({ ruleId: 'rule-threshold' }),
    ])
  })

  it('uses the fixed storage key so migration cannot fork the ledger', () => {
    expect(DEAI_CALIBRATION_LEDGER_STORAGE_KEY).toBe('wa_deai_calibration_ledger')
  })

  it('caps retained entries and keeps the strongest calibration evidence first', () => {
    const entries = Array.from({ length: DEAI_CALIBRATION_LEDGER_MAX_ENTRIES + 50 }, (_, index) => ({
      provider: `provider-${Math.floor(index / 20)}`,
      model: `model-${index}`,
      ruleId: `rule-${index}`,
      sampleCount: index % 20,
      updatedAt: index,
    }))
    const ledger = { version: DEAI_CALIBRATION_LEDGER_VERSION, entries }

    const pruned = pruneDeaiCalibrationLedger(ledger)

    expect(pruned.entries).toHaveLength(DEAI_CALIBRATION_LEDGER_MAX_ENTRIES)
    expect(pruned.entries[0].sampleCount).toBe(19)
    expect(pruned.entries[0].updatedAt).toBeGreaterThanOrEqual(
      Math.max(...entries.filter(entry => entry.sampleCount === 19).map(entry => entry.updatedAt)) - 20
    )
    expect(pruned.version).toBe(DEAI_CALIBRATION_LEDGER_VERSION)
  })

  it('reports pruning through the record API so trace can retain the boundary', async () => {
    const storage = memoryStorage()
    const entries = Array.from({ length: DEAI_CALIBRATION_LEDGER_MAX_ENTRIES }, (_, index) => ({
      provider: 'provider-a',
      model: `model-${index}`,
      ruleId: `rule-${index}`,
      sampleCount: 1,
      updatedAt: index,
    }))
    await storage.write({ version: DEAI_CALIBRATION_LEDGER_VERSION, entries })

    const result = await recordDeaiCalibrationFindings(storage, {
      provider: 'provider-new',
      model: 'model-new',
      findings: [{ id: 'rule-new' }],
      now: 9999,
    })

    expect(result?.ledger.entries).toHaveLength(DEAI_CALIBRATION_LEDGER_MAX_ENTRIES)
    expect(result?.pruneResult).toEqual({
      pruned: true,
      retainedCount: DEAI_CALIBRATION_LEDGER_MAX_ENTRIES,
      prunedCount: 1,
    })
    expect(result?.ledger.entries.some(entry => entry.provider === 'provider-new')).toBe(true)
    expect(result?.ledger.entries.some(entry => entry.model === 'model-0')).toBe(false)
  })

  it('returns the same ledger instance when below the cap', () => {
    const ledger = {
      version: DEAI_CALIBRATION_LEDGER_VERSION,
      entries: [{ provider: 'p', model: 'm', ruleId: 'r', sampleCount: 1, updatedAt: 1 }],
    }

    expect(pruneDeaiCalibrationLedger(ledger)).toBe(ledger)
  })
})
