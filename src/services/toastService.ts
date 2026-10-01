import { ref } from 'vue'

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger'

export interface ToastItem {
  id: number
  variant: ToastVariant
  message: string
  leaving: boolean
}

type Listener = (toasts: ToastItem[]) => void

const toasts = ref<ToastItem[]>([])
const listeners = new Set<Listener>()
let sequence = 0
const timers = new Map<number, number>()

function emit() {
  for (const listener of listeners) listener([...toasts.value])
}

function remove(id: number) {
  const index = toasts.value.findIndex((toast) => toast.id === id)
  if (index === -1) return
  toasts.value.splice(index, 1)
  emit()
}

function show(message: string, variant: ToastVariant, duration = 2400) {
  const trimmed = message.trim()
  if (!trimmed) return
  const existing = toasts.value.find((toast) => toast.message === trimmed && toast.variant === variant && !toast.leaving)
  if (existing) {
    clearTimeout(timers.get(existing.id))
    timers.delete(existing.id)
    toasts.value = toasts.value.filter((toast) => toast.id !== existing.id)
  }

  const id = ++sequence
  const item: ToastItem = { id, variant, message: trimmed, leaving: false }
  toasts.value.push(item)
  emit()

  const hideTimer = window.setTimeout(() => {
    item.leaving = true
    emit()
    window.setTimeout(() => remove(id), 180)
  }, duration)
  timers.set(id, hideTimer)
}

function dismiss(id: number) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  remove(id)
}

export const toast = {
  info: (message: string, duration?: number) => show(message, 'info', duration),
  success: (message: string, duration?: number) => show(message, 'success', duration),
  warning: (message: string, duration?: number) => show(message, 'warning', duration),
  danger: (message: string, duration?: number) => show(message, 'danger', duration),
  dismiss,
  subscribe(listener: Listener) {
    listeners.add(listener)
    listener([...toasts.value])
    return () => listeners.delete(listener)
  },
}
