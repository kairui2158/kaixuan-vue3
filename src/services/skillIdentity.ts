export const SKILL_CONTEXT_HISTORY_MODES = ['none', 'recent', 'summary', 'full'] as const

export type SkillContextHistoryMode = (typeof SKILL_CONTEXT_HISTORY_MODES)[number]

export const FOLDER_SKILL_ID_PREFIX = 'folder:'

const LEGACY_CONTEXT_HISTORY_ALIASES: Record<string, SkillContextHistoryMode> = {
  latest: 'recent',
  all: 'full',
}

export interface NormalizedContextPolicy {
  policy?: {
    chatHistory?: SkillContextHistoryMode
    includeOutline?: boolean
    includeMemory?: boolean
  }
  migratedFrom?: 'latest' | 'all'
}

/** Parse either the raw folder id or the namespaced store id. */
export function parseFolderSkillId(id: string): string {
  return String(id || '').replace(/^folder:/, '')
}

/** Build the one namespaced id used by the store, exports, and installer. */
export function buildFolderSkillId(id: string): string {
  return `${FOLDER_SKILL_ID_PREFIX}${parseFolderSkillId(id)}`
}

/** Normalize text/folder ids without inventing a second identity namespace. */
export function normalizeSkillId(id: string, format?: 'text' | 'folder'): string {
  return format === 'folder' ? buildFolderSkillId(id) : id
}

export function isSkillContextHistoryMode(value: unknown): value is SkillContextHistoryMode {
  return typeof value === 'string' && SKILL_CONTEXT_HISTORY_MODES.includes(value as SkillContextHistoryMode)
}

/**
 * Migrate persisted/imported context policies. Disk-authored SKILL packages
 * must not use this mapping; health checks report their legacy values as errors.
 */
export function normalizeContextPolicy(input: unknown): NormalizedContextPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const raw = input as Record<string, unknown>
  const chatHistory = raw.chatHistory
  if (typeof chatHistory !== 'string' || !chatHistory) return { policy: { ...raw } as NormalizedContextPolicy['policy'] }
  const alias = LEGACY_CONTEXT_HISTORY_ALIASES[chatHistory]
  if (!alias) return { policy: { ...raw } as NormalizedContextPolicy['policy'] }
  return {
    policy: { ...raw, chatHistory: alias } as NormalizedContextPolicy['policy'],
    migratedFrom: chatHistory as 'latest' | 'all',
  }
}
