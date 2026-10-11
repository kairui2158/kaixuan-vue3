import { describe, expect, it } from 'vitest'
import { shouldRetryStalledDirectWrite } from './dialogueToolSurface'

describe('shouldRetryStalledDirectWrite', () => {
  it('retries short-document edit turns only when a write tool is present', () => {
    expect(shouldRetryStalledDirectWrite({
      supervisorReason: 'stuck_timeout',
      intent: 'edit',
      longDocument: false,
      toolSurface: [{ policy: 'read' }, { policy: 'write' }],
    })).toEqual({
      retryable: true,
      scope: 'short-document-edit',
      longDocumentRetry: false,
    })

    expect(shouldRetryStalledDirectWrite({
      supervisorReason: 'stuck_timeout',
      intent: 'edit',
      longDocument: false,
      toolSurface: [{ policy: 'read' }],
    }).retryable).toBe(false)
  })

  it('retries read-only discussion and analysis turns regardless of document size', () => {
    for (const intent of ['discuss', 'analyze'] as const) {
      expect(shouldRetryStalledDirectWrite({
        supervisorReason: 'stuck_timeout',
        intent,
        longDocument: true,
        toolSurface: [{ policy: 'read' }],
      })).toEqual({
        retryable: true,
        scope: 'read-only-dialogue',
        longDocumentRetry: false,
      })
    }
  })

  it('never retries long-document edit runs automatically', () => {
    expect(shouldRetryStalledDirectWrite({
      supervisorReason: 'stuck_timeout',
      intent: 'edit',
      longDocument: true,
      toolSurface: [{ policy: 'write' }],
    }).retryable).toBe(false)
  })

  it('does not retry other supervisor failures or write-capable intents', () => {
    for (const supervisorReason of ['hard_deadline', 'repeated_tool_error', null]) {
      expect(shouldRetryStalledDirectWrite({
        supervisorReason,
        intent: 'edit',
        longDocument: false,
        toolSurface: [{ policy: 'write' }],
      }).retryable).toBe(false)
    }
    expect(shouldRetryStalledDirectWrite({
      supervisorReason: 'stuck_timeout',
      intent: 'generate',
      longDocument: false,
      toolSurface: [{ policy: 'write' }],
    }).retryable).toBe(false)
  })
})
