export type OutlineJournalCommand =
  | { op: 'append'; messageId: string; message: Record<string, unknown> }
  | { op: 'patch'; messageId: string; patch: Record<string, unknown> }
  | { op: 'remove'; messageId: string }
  | { op: 'replace'; messageId: string; message: Record<string, unknown> }
  | { op: 'migrate'; messageId: string; message: Record<string, unknown> }
  | { op: 'clear'; messageId?: string }

export interface OutlineJournalSnapshot {
  schema: 'shenyi.outline-journal'
  version: 1
  projectId: string
  messages: Array<Record<string, unknown> & { messageId?: string }>
  checksum: string
}

function hashStableString(value: string): number {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0
  }
  return hash >>> 0
}

export function createOutlineMessageId(message: Record<string, unknown>, index: number): string {
  const existing = message.messageId
  if (typeof existing === 'string' && existing) return existing
  const legacyId = message.id
  if (typeof legacyId === 'string' && legacyId) return legacyId
  return `outline-msg-${index.toString(36)}-${hashStableString(stableStringify(message)).toString(36)}`
}

export function ensureOutlineMessageIds(messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return messages.map((message, index) => {
    if (typeof message.messageId === 'string' && message.messageId) return message
    return { ...message, messageId: createOutlineMessageId(message, index) }
  })
}

const TRANSIENT_FIELDS = new Set([
  'routingFallback',
  'budgetExhausted',
  'outlineBatchDiff',
  'outlineDeletionConfirmation',
])

function sanitizePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...patch }
  for (const field of TRANSIENT_FIELDS) {
    if (sanitized[field] === undefined) delete sanitized[field]
  }
  return sanitized
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function computeOutlineJournalChecksum(
  projectId: string,
  messages: Array<Record<string, unknown>>,
): string {
  const hash = hashStableString(`${projectId}\u0000${stableStringify(messages)}`)
  return hash.toString(36)
}

export function createOutlineJournalSnapshot(
  projectId: string,
  messages: Array<Record<string, unknown>>,
): OutlineJournalSnapshot {
  const normalized = ensureOutlineMessageIds(messages)
  return {
    schema: 'shenyi.outline-journal',
    version: 1,
    projectId,
    messages: normalized,
    checksum: computeOutlineJournalChecksum(projectId, normalized),
  }
}

function isValidSnapshot(snapshot: unknown): snapshot is OutlineJournalSnapshot {
  const candidate = snapshot as Partial<OutlineJournalSnapshot> | null
  return Boolean(
    candidate
    && candidate.schema === 'shenyi.outline-journal'
    && candidate.version === 1
    && typeof candidate.projectId === 'string'
    && Array.isArray(candidate.messages)
  )
}

export function validateOutlineJournalSnapshot(
  snapshot: unknown,
  options: { projectId?: string } = {},
): { valid: boolean; reason?: string; snapshot?: OutlineJournalSnapshot } {
  if (!isValidSnapshot(snapshot)) return { valid: false, reason: 'invalid_snapshot' }
  const normalized = {
    ...snapshot,
    messages: ensureOutlineMessageIds(snapshot.messages as Array<Record<string, unknown>>),
  }
  if (options.projectId && normalized.projectId !== options.projectId) {
    return { valid: false, reason: 'project_mismatch', snapshot: normalized }
  }
  const checksum = computeOutlineJournalChecksum(normalized.projectId, normalized.messages)
  if (checksum !== normalized.checksum) return { valid: false, reason: 'checksum_mismatch', snapshot: normalized }
  return { valid: true, snapshot: normalized }
}

export function applyOutlineJournalCommands(
  snapshot: OutlineJournalSnapshot,
  commands: OutlineJournalCommand[],
): OutlineJournalSnapshot {
  let messages = [...snapshot.messages]
  for (const command of commands) {
    switch (command.op) {
      case 'append':
      case 'migrate': {
        const message = { ...command.message, messageId: command.messageId }
        if (messages.some(item => item.messageId === command.messageId)) break
        messages = [...messages, message]
        break
      }
      case 'replace': {
        const nextMessage = { ...command.message, messageId: command.messageId }
        const index = messages.findIndex(item => item.messageId === command.messageId)
        messages = index >= 0
          ? [...messages.slice(0, index), nextMessage, ...messages.slice(index + 1)]
          : [...messages, nextMessage]
        break
      }
      case 'patch': {
        const index = messages.findIndex(item => item.messageId === command.messageId)
        if (index < 0) break
        const sanitized = sanitizePatch(command.patch)
        const nextMessage = { ...messages[index], ...sanitized, messageId: command.messageId }
        messages = [...messages.slice(0, index), nextMessage, ...messages.slice(index + 1)]
        break
      }
      case 'remove': {
        messages = messages.filter(item => item.messageId !== command.messageId)
        break
      }
      case 'clear': {
        messages = []
        break
      }
    }
  }
  return {
    ...snapshot,
    messages,
    checksum: computeOutlineJournalChecksum(snapshot.projectId, messages),
  }
}

export interface OutlineBackupImportStep {
  key: string
  value: unknown
  previous: unknown
  committed: boolean
}

export interface OutlineBackupImportPlan {
  valid: boolean
  reason?: string
  invalidJournalKeys?: string[]
  steps: OutlineBackupImportStep[]
}

export function buildOutlineBackupImportPlan(
  backup: unknown,
  options: { storageRead?: (key: string) => Promise<unknown> } = {},
): OutlineBackupImportPlan | Promise<OutlineBackupImportPlan> {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return { valid: false, reason: 'invalid_backup_object', steps: [] }
  }
  const entries = Object.entries(backup as Record<string, unknown>)
  const invalidJournalKeys = entries
    .filter(([key, value]) => key.startsWith('outline-journal_') && value != null)
    .filter(([key, value]) => !validateOutlineJournalSnapshot(value).valid)
    .map(([key]) => key)
  if (invalidJournalKeys.length > 0) {
    return { valid: false, reason: 'invalid_outline_journal_snapshot', invalidJournalKeys, steps: [] }
  }
  const steps: OutlineBackupImportStep[] = entries.map(([key, value]) => ({
    key,
    value,
    previous: undefined as OutlineBackupImportStep['previous'],
    committed: false,
  }))
  const storageRead = options.storageRead
  if (!storageRead) return { valid: true, steps }
  return (async () => {
    for (const step of steps) {
      step.previous = await storageRead(step.key)
    }
    return { valid: true, steps }
  })()
}
