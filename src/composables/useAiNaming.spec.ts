import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiNaming } from './useAiNaming'
import { useRunTraceStore } from '../stores/runTrace'
import * as namingService from '../services/namingService'

vi.mock('../services/namingService', async () => {
  const actual = await vi.importActual<typeof namingService>('../services/namingService')
  return {
    ...actual,
    generateNames: vi.fn(),
    isNamingError: vi.fn((error: unknown) => actual.isNamingError(error)),
    isCanceledError: vi.fn((error: unknown) => actual.isCanceledError(error))
  }
})

describe('useAiNaming partial trace contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('records the partial transition event before closing the run', async () => {
    vi.mocked(namingService.generateNames).mockResolvedValue({
      results: [],
      validCount: 3,
      filteredCount: 1
    } as any)

    const naming = useAiNaming()
    const store = useRunTraceStore()
    naming.openNaming({ source: 'editor' })
    naming.count.value = 4
    await naming.doGenerate()

    const run = store.runs[0]
    expect(run.status).toBe('success')
    expect(run.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'state-transition',
          label: 'NamingStatus：partial → RunTraceStatus degraded'
        })
      ])
    )
  })
})
