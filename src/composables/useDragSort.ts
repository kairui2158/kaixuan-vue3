import { ref, type Ref } from 'vue'

export function useDragSort<T>(
  list: Ref<T[]>,
  onReorder: () => void
) {
  const dragIndex = ref(-1)
  const overIndex = ref(-1)

  function onDragStart(e: DragEvent, index: number) {
    dragIndex.value = index
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: DragEvent, index: number) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    if (dragIndex.value !== index) overIndex.value = index
  }

  function onDrop(e: DragEvent, index: number) {
    e.preventDefault()
    const from = dragIndex.value
    const to = index
    if (from < 0 || from === to) { reset(); return }
    const arr = [...list.value]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    list.value = arr
    onReorder()
    reset()
  }

  function onDragEnd() { reset() }

  function reset() { dragIndex.value = -1; overIndex.value = -1 }

  return { dragIndex, overIndex, onDragStart, onDragOver, onDrop, onDragEnd }
}
