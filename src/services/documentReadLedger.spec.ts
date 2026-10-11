import { describe, expect, it } from 'vitest'
import { compactToolContextMessages } from './toolContextCompactor'
import {
  createDocumentReadLedger,
  documentReadKey,
  markDocumentReadCompacted,
} from './documentReadLedger'

const baseEntry = {
  source: 'editor' as const,
  toolName: 'editor.read_range',
  readKey: 'editor:editor.read_range:target=section-1:offset=0:size=1000',
  contentVersion: 1,
  structureIdentity: 'structure-standard',
}

function assistantToolCall(id: string, name: string) {
  return {
    role: 'assistant',
    content: '',
    toolCalls: [{ id, type: 'function', function: { name, arguments: '{}' } }],
  }
}

describe('documentReadLedger', () => {
  it('classifies a repeated read as duplicate', () => {
    const ledger = createDocumentReadLedger({ workspace: 'main', targetId: 'chapter-1' })
    expect(ledger.classifyRead(baseEntry)).toEqual({
      duplicate: false,
      rereadAfterCompaction: false,
    })
    expect(ledger.classifyRead(baseEntry)).toEqual({
      duplicate: true,
      rereadAfterCompaction: false,
    })
    expect(ledger.snapshot()).toMatchObject({
      uniqueReadCount: 1,
      duplicateReadCount: 1,
      rereadAfterCompactionCount: 0,
    })
  })

  it('marks compacted reads through ledger keys and restores them on reread', () => {
    const ledger = createDocumentReadLedger({ workspace: 'main', targetId: 'chapter-1' })
    ledger.classifyRead(baseEntry)
    const ledgerKey = 'editor:editor.read_range:chapter-1:target=section-1:0:1000'
    ledger.registerLedgerKey(ledgerKey, baseEntry.readKey)

    expect(markDocumentReadCompacted(ledgerKey, baseEntry.toolName)).toBe(true)
    expect(markDocumentReadCompacted('missing', baseEntry.toolName)).toBe(false)
    expect(ledger.classifyRead(baseEntry)).toEqual({
      duplicate: true,
      rereadAfterCompaction: true,
    })
    expect(ledger.snapshot()).toMatchObject({
      compactedReadCount: 1,
      rereadAfterCompactionCount: 1,
    })
  })

  it('marks reads compacted when the context compactor compacts their result', () => {
    const ledger = createDocumentReadLedger({ workspace: 'main', targetId: 'chapter-1' })
    ledger.classifyRead(baseEntry)
    const ledgerKey = 'editor:editor.read_range:chapter-1:target=section-1:0:1000'
    ledger.registerLedgerKey(ledgerKey, baseEntry.readKey)
    const longRead = { ok: true, data: { readLedgerKey: ledgerKey, content: 'a'.repeat(1_000) } }
    const messages = [
      { role: 'user', content: 'request' },
      assistantToolCall('old', baseEntry.toolName),
      { role: 'tool', toolCallId: 'old', toolName: baseEntry.toolName, content: JSON.stringify(longRead) },
      assistantToolCall('recent-1', baseEntry.toolName),
      { role: 'tool', toolCallId: 'recent-1', toolName: baseEntry.toolName, content: JSON.stringify({ ok: true, data: { content: 'b'.repeat(1_000) } }) },
      assistantToolCall('recent-2', baseEntry.toolName),
      { role: 'tool', toolCallId: 'recent-2', toolName: baseEntry.toolName, content: JSON.stringify({ ok: true, data: { content: 'c'.repeat(1_000) } }) },
    ]

    const result = compactToolContextMessages(messages)

    expect(result.compactedMessageCount).toBe(1)
    expect(result.compactedReadLedgerKeys).toEqual([ledgerKey])
    expect(result.messages[2].content).toContain('_readLedgerKey')
    expect(result.messages[2].content).toContain('_compactionAnchor')
    expect(ledger.classifyRead(baseEntry)).toEqual({
      duplicate: true,
      rereadAfterCompaction: true,
    })
  })

  it('normalizes equivalent read keys', () => {
    expect(documentReadKey({
      source: 'outline',
      toolName: 'outline.read_range',
      nodeId: 'chapter-1',
      offset: 500,
      maxChars: 500,
    })).toBe('outline:outline.read_range:target=chapter-1:offset=500:size=500')
  })
})
