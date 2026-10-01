export type EditorUndoOrigin = 'manual' | 'api' | 'import'

export interface EditorUndoTransaction {
  before: string
  after?: string
  label?: string
  origin: EditorUndoOrigin
  timestamp?: number
}

interface StoredUndoTransaction extends EditorUndoTransaction {
  timestamp: number
}

const MAX_HISTORY = 50
const undoTransactions = new Map<string, StoredUndoTransaction[]>()
const redoContents = new Map<string, string[]>()

function undoList(documentId: string): StoredUndoTransaction[] {
  const list = undoTransactions.get(documentId)
  if (!list) {
    const created: StoredUndoTransaction[] = []
    undoTransactions.set(documentId, created)
    return created
  }
  return list
}

function redoList(documentId: string): string[] {
  const list = redoContents.get(documentId)
  if (!list) {
    const created: string[] = []
    redoContents.set(documentId, created)
    return created
  }
  return list
}

export function pushUndoTransaction(
  documentId: string,
  transaction: EditorUndoTransaction,
): void {
  const stack = undoList(documentId)
  if (stack.length > 0 && stack[stack.length - 1].before === transaction.before) return
  stack.push({ ...transaction, timestamp: transaction.timestamp ?? Date.now() })
  if (stack.length > MAX_HISTORY) stack.shift()
  redoContents.set(documentId, [])
}

export function undo(documentId: string): string | null {
  const stack = undoList(documentId)
  if (stack.length === 0) return null
  const transaction = stack.pop()!
  redoList(documentId).push(transaction.before)
  return transaction.before
}

export function redo(documentId: string): string | null {
  const stack = redoList(documentId)
  if (stack.length === 0) return null
  const content = stack.pop()!
  undoList(documentId).push({
    before: content,
    after: undefined,
    label: 'redo',
    origin: 'manual',
    timestamp: Date.now(),
  })
  return content
}

export function canUndo(documentId: string): boolean {
  return undoList(documentId).length > 0
}

export function canRedo(documentId: string): boolean {
  return redoList(documentId).length > 0
}

export function listUndoContents(documentId: string): string[] {
  return [...undoList(documentId)].map(transaction => transaction.before)
}

export function listUndoTransactions(documentId: string): EditorUndoTransaction[] {
  return [...undoList(documentId)]
}

export function clearUndoHistory(documentId: string): void {
  undoTransactions.delete(documentId)
  redoContents.delete(documentId)
}

export function resetUndoService(): void {
  undoTransactions.clear()
  redoContents.clear()
}
