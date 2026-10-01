import { computed, nextTick, ref } from 'vue'

export interface ModalEntry {
  id: string
  zIndex: number
  canClose: boolean
}

const BASE_Z = 3000
const CONFIRM_BASE_Z = 9000
const modalStack = ref<ModalEntry[]>([])
const focusRestoreTargets = new Map<string, HTMLElement | null>()
const focusableSelector = [
  '[autofocus]',
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const topId = computed(() => modalStack.value.length > 0 ? modalStack.value[modalStack.value.length - 1].id : null)

function open(id: string, canClose = true) {
  if (isOpen(id)) return
  if (modalStack.value.length === 0) focusRestoreTargets.set('__origin__', currentFocusTarget())
  focusRestoreTargets.set(id, currentFocusTarget())
  modalStack.value.push({ id, zIndex: BASE_Z + modalStack.value.length, canClose })
  focusModal(id)
}

function close(id: string) {
  const idx = modalStack.value.findIndex(e => e.id === id)
  if (idx === -1) return
  modalStack.value.splice(idx, 1)
  const restoreTarget = focusRestoreTargets.get(id) ?? null
  focusRestoreTargets.delete(id)
  if (modalStack.value.length > 0) {
    const parentId = modalStack.value[modalStack.value.length - 1].id
    const parent = resolveModalElement(parentId)
    if (restoreTarget && parent?.contains(restoreTarget)) {
      nextTick(() => restoreTarget.focus({ preventScroll: true }))
    } else {
      focusModal(parentId)
    }
  } else {
    restoreOriginFocus()
  }
}

function closeTop() {
  const top = modalStack.value[modalStack.value.length - 1]
  if (top && top.canClose) close(top.id)
}

function isOpen(id: string) {
  return modalStack.value.some(e => e.id === id)
}

function getZIndex(id: string) {
  if (id === 'app-confirm') return CONFIRM_BASE_Z
  const entry = modalStack.value.find(e => e.id === id)
  return entry ? entry.zIndex : BASE_Z
}

function currentFocusTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const active = document.activeElement as HTMLElement | null
  return active && typeof active.focus === 'function' ? active : null
}

function resolveModalElement(id: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById(id) ?? document.querySelector(`[data-modal-id="${id}"]`)
}

function focusModal(id: string) {
  if (typeof document === 'undefined') return
  void nextTick(() => {
    const dialog = resolveModalElement(id)
    if (!dialog) return
    const control = dialog.querySelector<HTMLElement>(focusableSelector)
    const target = control ?? dialog
    if (target.tabIndex < 0) target.tabIndex = -1
    target.focus({ preventScroll: true })
  })
}

function restoreOriginFocus() {
  const target = focusRestoreTargets.get('__origin__') ?? null
  focusRestoreTargets.delete('__origin__')
  if (!target || typeof document === 'undefined' || !document.contains(target)) return
  nextTick(() => target.focus({ preventScroll: true }))
}

function trapTabFocus(event: KeyboardEvent) {
  const top = modalStack.value[modalStack.value.length - 1]
  if (!top) return
  const dialog = resolveModalElement(top.id)
  if (!dialog || typeof document === 'undefined' || !dialog.contains(document.activeElement)) return
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter(control => !control.hasAttribute('disabled'))
  if (controls.length === 0) return
  const first = controls[0]
  const last = controls[controls.length - 1]
  const active = document.activeElement
  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus({ preventScroll: true })
  } else if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus({ preventScroll: true })
  }
}

let escBound = false
function bindEsc() {
  if (escBound) return
  escBound = true
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeTop()
    else if (e.key === 'Tab') trapTabFocus(e)
  })
}

export function useModalQueue() {
  bindEsc()
  return { modalStack, topId, open, close, closeTop, isOpen, getZIndex }
}
