export interface EditorTargetSnapshot {
  workspace: 'main' | 'outline'
  targetId: string
  label: string
  chapterId?: string
  mode?: string
  content: string
  contentVersion: number
  selectionStart: number
  selectionEnd: number
  selectedText: string
}

export interface EditorTargetLike {
  workspace?: 'main' | 'outline'
  targetId: string
  label: string
  chapterId?: string
  mode?: string
  content: string
  selectionStart?: number
  selectionEnd?: number
}

export function hashEditorContent(content: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return 'fnv1a32_' + hash.toString(16).padStart(8, '0')
}

// Checkpoints compare both hash and version, so unchanged document content
// must always map to the same version. Repeated snapshots are common during
// dialogue and must not invalidate an in-flight edit task.
const contentVersions = new Map<string, number>()
let nextVersion = 1

function stableContentVersion(
  workspace: EditorTargetSnapshot['workspace'],
  targetId: string,
  content: string,
): number {
  const key = `${workspace}:${targetId}:${hashEditorContent(content)}`
  const existing = contentVersions.get(key)
  if (existing !== undefined) return existing
  const version = nextVersion++
  contentVersions.set(key, version)
  return version
}

export function createEditorTargetSnapshot(source: EditorTargetLike): EditorTargetSnapshot {
  const content = source.content || ''
  const workspace = source.workspace || 'main'
  const requestedStart = source.selectionStart ?? content.length
  const requestedEnd = source.selectionEnd ?? requestedStart
  const start = Math.max(0, Math.min(requestedStart, content.length))
  const end = Math.max(start, Math.min(requestedEnd, content.length))

  return {
    workspace,
    targetId: source.targetId,
    label: source.label,
    chapterId: source.chapterId,
    mode: source.mode,
    content,
    contentVersion: stableContentVersion(workspace, source.targetId, content),
    selectionStart: start,
    selectionEnd: end,
    selectedText: start < end ? content.slice(start, end) : ''
  }
}

export function validateEditorTarget(
  snapshot: EditorTargetSnapshot,
  current: { content: string; locked?: boolean }
): { valid: true } | { valid: false; reason: 'version_changed' | 'locked' } {
  if (current.locked) return { valid: false, reason: 'locked' }
  if (snapshot.content !== current.content) return { valid: false, reason: 'version_changed' }
  return { valid: true }
}
