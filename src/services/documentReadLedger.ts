import { hashEditorContent } from './editorTarget'

export type DocumentReadSource = 'editor' | 'outline'

export interface DocumentReadLedgerEntry {
  source: DocumentReadSource
  toolName: string
  /** Stable read key, normalized so cursor and explicit paging describe the same range. */
  readKey: string
  contentVersion: number
  structureIdentity: string
  requestedAt: number
  compactedAt?: number
}

export interface DocumentReadLedgerSnapshot {
  workspace: 'main' | 'outline'
  targetId: string
  uniqueReadCount: number
  duplicateReadCount: number
  rereadAfterCompactionCount: number
  compactedReadCount: number
  structureIdentity: string
}

interface RegisteredReadAnchor {
  ledger: DocumentReadLedger
  readKey: string
}

const readAnchors = new Map<string, RegisteredReadAnchor>()

export function buildDocumentStructureIdentity(
  input: { degraded: boolean; nodeIds: string[] },
): string {
  const identity = `structure:${input.degraded ? 'degraded' : 'standard'}:${input.nodeIds.join('|')}`
  return `${identity}:${hashEditorContent(identity)}`
}

export function documentReadKey(input: {
  source: DocumentReadSource
  toolName: string
  sectionId?: string | null
  nodeId?: string | null
  range?: { start: number; end: number } | null
  offset?: number | null
  maxChars?: number | null
}): string {
  const target = input.nodeId ?? input.sectionId
  const sectionPart = target ? `target=${target}` : `range=${input.range?.start ?? 0}-${input.range?.end ?? 0}`
  const offsetPart = input.offset == null ? 'offset=default' : `offset=${input.offset}`
  const sizePart = input.maxChars == null ? 'size=default' : `size=${input.maxChars}`
  return `${input.source}:${input.toolName}:${sectionPart}:${offsetPart}:${sizePart}`
}

export function documentReadLedgerKey(input: {
  source: DocumentReadSource
  toolName: string
  targetId?: string | null
  sectionId?: string | null
  nodeId?: string | null
  range?: { start: number; end: number } | null
  offset?: number | null
  maxChars?: number | null
}): string {
  const target = input.nodeId ?? input.sectionId
  const sectionPart = target ? `target=${target}` : `range=${input.range?.start ?? 0}-${input.range?.end ?? 0}`
  return `${input.source}:${input.toolName}:${input.targetId ?? ''}:${sectionPart}:${input.offset ?? 0}:${input.maxChars ?? 'default'}`
}

export function createDocumentReadLedger(input: {
  workspace: 'main' | 'outline'
  targetId: string
}) {
  const reads = new Map<string, DocumentReadLedgerEntry>()
  let uniqueReadCount = 0
  let duplicateReadCount = 0
  let rereadAfterCompactionCount = 0
  let currentStructureIdentity = ''
  const ledgerKeys = new Map<string, string>()

  const ledgerApi = {
    /**
     * Classifies one read. Content version and structure identity are included
     * in the entry so later writes can selectively invalidate only reads whose
     * structure actually changed.
     */
  classifyRead(entry: Omit<DocumentReadLedgerEntry, 'requestedAt'>): {
      duplicate: boolean
      rereadAfterCompaction: boolean
    } {
      const existing = reads.get(entry.readKey)
      if (existing && existing.structureIdentity === entry.structureIdentity) {
        const rereadAfterCompaction = existing.compactedAt !== undefined
        duplicateReadCount += 1
        if (rereadAfterCompaction) rereadAfterCompactionCount += 1
        return { duplicate: true, rereadAfterCompaction }
      }
      const previous = existing
      reads.set(entry.readKey, {
        ...entry,
        requestedAt: Date.now(),
      })
      if (previous && previous.compactedAt !== undefined) {
        rereadAfterCompactionCount += 1
      }
      uniqueReadCount += 1
      return { duplicate: false, rereadAfterCompaction: previous?.compactedAt !== undefined }
    },
    markCompacted(ledgerKey: string, toolName: string): boolean {
      const readKey = ledgerKeys.get(ledgerKey)
      const entry = readKey ? reads.get(readKey) : undefined
      if (!entry || entry.toolName !== toolName) return false
      entry.compactedAt = Date.now()
      return true
    },
    registerLedgerKey(ledgerKey: string, readKey: string): void {
      ledgerKeys.set(ledgerKey, readKey)
      readAnchors.set(ledgerKey, { ledger: ledgerApi, readKey })
    },
    setStructureIdentity(identity: string): void {
      currentStructureIdentity = identity
    },
    getStructureIdentity(): string {
      return currentStructureIdentity
    },
    pruneToCurrentStructure(): number {
      let removed = 0
      for (const [key, entry] of reads) {
        if (entry.structureIdentity !== currentStructureIdentity) {
          reads.delete(key)
          removed += 1
        }
      }
      return removed
    },
    snapshot(): DocumentReadLedgerSnapshot {
      return {
        workspace: input.workspace,
        targetId: input.targetId,
        uniqueReadCount,
        duplicateReadCount,
        rereadAfterCompactionCount,
        compactedReadCount: [...reads.values()].filter(entry => entry.compactedAt !== undefined).length,
        structureIdentity: currentStructureIdentity,
      }
    },
  }
  return ledgerApi
}

export function markDocumentReadCompacted(ledgerKey: string, toolName?: string): boolean {
  const anchor = readAnchors.get(ledgerKey)
  if (!anchor) return false
  return anchor.ledger.markCompacted(ledgerKey, toolName || '')
}

export type DocumentReadLedger = ReturnType<typeof createDocumentReadLedger>
