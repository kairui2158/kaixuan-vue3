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

let nextVersion = 1

export function createEditorTargetSnapshot(source: EditorTargetLike): EditorTargetSnapshot {
  const content = source.content || ''
  const requestedStart = source.selectionStart ?? content.length
  const requestedEnd = source.selectionEnd ?? requestedStart
  const start = Math.max(0, Math.min(requestedStart, content.length))
  const end = Math.max(start, Math.min(requestedEnd, content.length))

  return {
    workspace: source.workspace || 'main',
    targetId: source.targetId,
    label: source.label,
    chapterId: source.chapterId,
    mode: source.mode,
    content,
    contentVersion: nextVersion++,
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
