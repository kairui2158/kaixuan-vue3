// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  outlineMarkdownContentVersion,
  renderOutlineMarkdown,
  setOutlineMarkdownWorkerFactoryForTests,
} from './outlineMarkdownRenderService'

function createWorkerMock(options: { html?: string; error?: Error } = {}) {
  const listeners = new Map<string, (event: any) => void>()
  const worker = {
    postMessage: vi.fn((message: any) => {
      queueMicrotask(() => {
        if (options.error) {
          listeners.get('error')?.({ message: options.error.message })
          return
        }
        listeners.get('message')?.({
          data: {
            type: 'render-result',
            id: message.id,
            ok: true,
            html: options.html ?? `<p>${message.text}</p>`,
          },
        })
      })
    }),
    terminate: vi.fn(),
    set onmessage(value: (event: any) => void | null) {
      if (value) listeners.set('message', value)
    },
    set onerror(value: (event: any) => void | null) {
      if (value) listeners.set('error', value)
    },
  }
  return worker as unknown as Worker
}

describe('outline markdown render service', () => {
  it('returns worker html and caches it by message identity', async () => {
    setOutlineMarkdownWorkerFactoryForTests(() => createWorkerMock({ html: '<p>worker-html</p>' }))
    const first = await renderOutlineMarkdown({
      messageId: 'message-worker',
      contentVersion: 1,
      text: '# 标题',
    })
    const second = await renderOutlineMarkdown({
      messageId: 'message-worker',
      contentVersion: 1,
      text: '# 标题',
    })
    expect(first).toBe('<p>worker-html</p>')
    expect(second).toBe('<p>worker-html</p>')
    setOutlineMarkdownWorkerFactoryForTests(null)
  })

  it('falls back to sanitized renderer and emits a warning when the worker fails', async () => {
    setOutlineMarkdownWorkerFactoryForTests(() => createWorkerMock({ error: new Error('boom') }))
    const onWarning = vi.fn()
    const html = await renderOutlineMarkdown({
      messageId: 'message-fail',
      contentVersion: 1,
      text: '**加粗**',
      onWarning,
    })
    expect(html).toContain('<strong>加粗</strong>')
    expect(onWarning).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'message-fail', reason: 'worker_error' }),
    )
    setOutlineMarkdownWorkerFactoryForTests(null)
  })

  it('falls back when no worker is available', async () => {
    setOutlineMarkdownWorkerFactoryForTests(null)
    const html = await renderOutlineMarkdown({
      messageId: 'message-no-worker',
      contentVersion: outlineMarkdownContentVersion('**加粗**'),
      text: '**加粗**',
    })
    expect(html).toContain('<strong>加粗</strong>')
  })
})
