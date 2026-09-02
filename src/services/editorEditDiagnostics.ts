import type { EditorEditFailureReason } from './editorEditProtocol'

export type EditorEditResult =
  | 'parsed'
  | 'rejected'
  | 'applied'
  | 'canceled'
  | 'no_edit'

export interface EditorEditLogParams {
  requestId: string
  batchId?: string
  workspace: 'main' | 'outline'
  tabId: string
  operation?: string
  result: EditorEditResult
  targetLength?: number
  contentLength?: number
  failureReason?: EditorEditFailureReason | 'target_not_found'
  durationMs: number
  detail?: string
}

export function logEditorEdit(params: EditorEditLogParams): void {
  const diag = typeof window !== 'undefined' ? (window as any).DiagLogger : null
  if (!diag || typeof diag.log !== 'function') return

  const level = params.result === 'applied' ? 'info' : params.result === 'rejected' ? 'error' : 'warn'
  const purpose = params.workspace === 'outline' ? 'outline-edit' : 'main-edit'
  const summary = [
    'Editor edit:',
    'request=' + params.requestId,
    params.batchId ? 'batch=' + params.batchId : '',
    'workspace=' + params.workspace,
    'tab=' + params.tabId,
    'operation=' + (params.operation || '-'),
    'result=' + params.result,
    params.failureReason ? 'failure=' + params.failureReason : '',
    params.durationMs + 'ms'
  ].filter(Boolean).join(' ')

  diag.log(level, 'ai-service', summary, {
    purpose,
    editorEdit: true,
    requestId: params.requestId,
    batchId: params.batchId,
    workspace: params.workspace,
    tabId: params.tabId,
    operation: params.operation,
    result: params.result,
    targetLength: params.targetLength,
    contentLength: params.contentLength,
    failureReason: params.failureReason,
    durationMs: params.durationMs,
    detail: params.detail || ''
  })
}
