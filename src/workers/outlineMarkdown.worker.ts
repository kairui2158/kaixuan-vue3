import { parseMarkdownHtml } from '../utils/markdownPure'

export type OutlineMarkdownWorkerRequest = {
  type: 'render'
  id: string
  messageId: string
  contentVersion: number
  text: string
}

export type OutlineMarkdownWorkerResponse = {
  type: 'render-result'
  id: string
  messageId: string
  contentVersion: number
  ok: boolean
  html?: string
  error?: string
}

export function handleOutlineMarkdownWorkerMessage(
  event: MessageEvent<OutlineMarkdownWorkerRequest>,
): void {
  const request = event.data
  if (!request || request.type !== 'render') return
  const respond = (response: Omit<OutlineMarkdownWorkerResponse, 'type' | 'id'>): void => {
    ;(self as unknown as Worker).postMessage({ type: 'render-result', id: request.id, ...response })
  }
  try {
    respond({
      messageId: request.messageId,
      contentVersion: request.contentVersion,
      ok: true,
      html: parseMarkdownHtml(request.text || ''),
    })
  } catch (error) {
    respond({
      messageId: request.messageId,
      contentVersion: request.contentVersion,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const workerScope = self as unknown as { onmessage?: ((event: MessageEvent<OutlineMarkdownWorkerRequest>) => void) | null }
workerScope.onmessage = handleOutlineMarkdownWorkerMessage
