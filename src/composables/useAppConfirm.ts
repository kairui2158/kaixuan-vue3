import { reactive } from 'vue'

export interface AppDialogOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

type DialogKind = 'confirm' | 'alert'

interface DialogState {
  visible: boolean
  kind: DialogKind
  title: string
  message: string
  confirmText: string
  cancelText: string
  danger: boolean
}

interface PendingRequest {
  kind: DialogKind
  options: AppDialogOptions
  resolve: (value: boolean) => void
}

const state = reactive<DialogState>({
  visible: false,
  kind: 'confirm',
  title: '确认',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
})

let current: PendingRequest | null = null
const queue: PendingRequest[] = []

function showDialog(req: PendingRequest) {
  current = req
  state.kind = req.kind
  state.title = req.options.title || (req.kind === 'alert' ? '提示' : '确认')
  state.message = req.options.message
  state.confirmText = req.options.confirmText || '确定'
  state.cancelText = req.options.cancelText || '取消'
  state.danger = req.options.danger === true
  state.visible = true
}

function settle(value: boolean) {
  if (!current) return
  state.visible = false
  const done = current
  current = null
  done.resolve(value)
  const next = queue.shift()
  if (next) showDialog(next)
}

function normalize(options: AppDialogOptions | string): AppDialogOptions {
  return typeof options === 'string' ? { message: options } : options
}

export function useAppConfirm() {
  function confirm(options: AppDialogOptions | string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const req: PendingRequest = { kind: 'confirm', options: normalize(options), resolve }
      if (state.visible) queue.push(req)
      else showDialog(req)
    })
  }

  function alert(options: AppDialogOptions | string): Promise<void> {
    return new Promise<void>((resolve) => {
      const req: PendingRequest = { kind: 'alert', options: normalize(options), resolve: () => resolve() }
      if (state.visible) queue.push(req)
      else showDialog(req)
    })
  }

  return { state, confirm, alert, accept: () => settle(true), dismiss: () => settle(false) }
}
