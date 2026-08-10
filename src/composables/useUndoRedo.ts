 import { ref, computed } from 'vue'
 
 /**
  * 撤销重做栈 — 从旧架构_pushUndoState/_undo/_redo (L4235) 迁移
  * 替代废弃的document.execCommand('undo')
  * 栈深度50，比较快照避免重复
  */
 export function useUndoRedo(maxDepth: number = 50) {
   const undoStack = ref<string[]>([])
   const redoStack = ref<string[]>([])
   let lastSnapshot = ''
 
   const canUndo = computed(() => undoStack.value.length > 0)
   const canRedo = computed(() => redoStack.value.length > 0)
 
   function pushState(currentValue: string) {
     if (currentValue === lastSnapshot) return
     undoStack.value.push(lastSnapshot)
     if (undoStack.value.length > maxDepth) undoStack.value.shift()
     redoStack.value = []
     lastSnapshot = currentValue
   }
 
   function undo(): string | null {
     if (undoStack.value.length === 0) return null
     const current = lastSnapshot
     redoStack.value.push(current)
     const prev = undoStack.value.pop()!
     lastSnapshot = prev
     return prev
   }
 
   function redo(): string | null {
     if (redoStack.value.length === 0) return null
     const current = lastSnapshot
     undoStack.value.push(current)
     const next = redoStack.value.pop()!
     lastSnapshot = next
     return next
   }
 
   function reset(value: string = '') {
     undoStack.value = []
     redoStack.value = []
     lastSnapshot = value
   }
 
   return { pushState, undo, redo, reset, canUndo, canRedo }
 }
