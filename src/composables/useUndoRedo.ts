import { ref, computed } from 'vue'

/**
 * 撤销重做栈 — 从旧架构_pushUndoState/_undo/_redo (L4235) 迁移
 * 替代废弃的document.execCommand('undo')
 * 栈深度50，比较快照避免重复
 * P3: AI 批次以 checkpoint 标记进入 undo 栈，用户 Ctrl+Z 可撤销 AI 批次
 */
export interface UndoState {
  content: string
  isAiBatch?: boolean
  batchId?: string
}

export function useUndoRedo(maxDepth: number = 50) {
  const undoStack = ref<UndoState[]>([])
  const redoStack = ref<UndoState[]>([])
  let lastSnapshot: UndoState = { content: '' }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)
  const lastBatchId = computed(() => lastSnapshot.batchId || null)

  function pushState(currentValue: string) {
    if (currentValue === lastSnapshot.content) return
    undoStack.value.push(lastSnapshot)
    if (undoStack.value.length > maxDepth) undoStack.value.shift()
    redoStack.value = []
    lastSnapshot = { content: currentValue }
  }

  // P3: AI 批次以 checkpoint 进入 undo 栈，用户 Ctrl+Z 可撤销整批
  // 经验引用: §1 规则6（不得重新赋值）、§7 规则19（AI 批次专用回滚栈）
  function pushAiBatchCheckpoint(currentValue: string, batchId: string) {
    if (currentValue === lastSnapshot.content) return
    undoStack.value.push(lastSnapshot)
    if (undoStack.value.length > maxDepth) undoStack.value.shift()
    redoStack.value = []
    lastSnapshot = { content: currentValue, isAiBatch: true, batchId }
  }

  // External writes (AI batches) replace the current snapshot without adding
  // a user-edit undo entry. Batch rollback has its own dedicated stack.
  // 保留旧接口兼容: 无 batchId 时退化为快照替换
  function replaceCurrentSnapshot(currentValue: string, batchId?: string) {
    redoStack.value = []
    if (batchId) {
      pushAiBatchCheckpoint(currentValue, batchId)
    } else {
      lastSnapshot = { content: currentValue }
    }
  }

  function undo(): string | null {
    if (undoStack.value.length === 0) return null
    const current = lastSnapshot
    redoStack.value.push(current)
    const prev = undoStack.value.pop()!
    lastSnapshot = prev
    return prev.content
  }

  function redo(): string | null {
    if (redoStack.value.length === 0) return null
    const current = lastSnapshot
    undoStack.value.push(current)
    const next = redoStack.value.pop()!
    lastSnapshot = next
    return next.content
  }

  function reset(value: string = '') {
    undoStack.value = []
    redoStack.value = []
    lastSnapshot = { content: value }
  }

  return { pushState, pushAiBatchCheckpoint, replaceCurrentSnapshot, undo, redo, reset, canUndo, canRedo, lastBatchId }
}
