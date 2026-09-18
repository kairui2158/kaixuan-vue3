import { ref, computed } from 'vue'

export interface ModalEntry {
  id: string
  zIndex: number
  canClose: boolean
}

const BASE_Z = 3000
const CONFIRM_BASE_Z = 9000
const modalStack = ref<ModalEntry[]>([])

const topId = computed(() => modalStack.value.length > 0 ? modalStack.value[modalStack.value.length - 1].id : null)

function open(id: string, canClose = true) {
  if (isOpen(id)) return
  modalStack.value.push({ id, zIndex: BASE_Z + modalStack.value.length, canClose })
}

function close(id: string) {
  const idx = modalStack.value.findIndex(e => e.id === id)
  if (idx !== -1) modalStack.value.splice(idx, 1)
}

function closeTop() {
  const top = modalStack.value[modalStack.value.length - 1]
  if (top && top.canClose) modalStack.value.pop()
}

function isOpen(id: string) {
  return modalStack.value.some(e => e.id === id)
}

function getZIndex(id: string) {
  if (id === 'app-confirm') return CONFIRM_BASE_Z
  const entry = modalStack.value.find(e => e.id === id)
  return entry ? entry.zIndex : BASE_Z
}

let escBound = false
function bindEsc() {
  if (escBound) return
  escBound = true
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeTop()
  })
}

export function useModalQueue() {
  bindEsc()
  return { modalStack, topId, open, close, closeTop, isOpen, getZIndex }
}
