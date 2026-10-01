import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

const send = vi.fn()
const registered = new Map()
const { registerApiHandlers } = await import('./api')

describe('electron ipc providerNet stream idle watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    registered.clear()
    send.mockClear()
    registerApiHandlers({ handle: (channel, handler) => registered.set(channel, handler) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createStream({ chunks, idleAfterDone = false, signal }) {
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
        if (!idleAfterDone) {
          controller.close()
        } else {
          signal?.addEventListener('abort', () => {
            controller.error(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }
      },
    })
    return new Response(stream, { status: 200 })
  }

  async function invokeStream(response) {
    const streamHandler = registered.get('providerNet:stream')
    const abortHandler = registered.get('providerNet:abort')
    const request = {
      url: 'https://example.test/v1/chat/completions',
      signalId: 'idle-stream',
      body: {},
    }
    const invocation = streamHandler({ sender: { send } }, request)
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('providerNet:streamChunk', {
      signalId: 'idle-stream',
      event: 'start',
      statusCode: 200,
    }))
    return { invocation, abortHandler }
  }

  async function invokeTolerantStream() {
    const streamHandler = registered.get('providerNet:stream')
    const request = {
      url: 'https://example.test/v1/chat/completions',
      signalId: 'tolerant-stream',
      body: {},
      slowStreamTolerant: true,
    }
    const invocation = streamHandler({ sender: { send } }, request)
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('providerNet:streamChunk', {
      signalId: 'tolerant-stream',
      event: 'start',
      statusCode: 200,
    }))
    return invocation
  }

  it('aborts and reports a network error when the stream stops producing bytes', async () => {
    globalThis.fetch = vi.fn((_url, options) => Promise.resolve(createStream({
      chunks: ['data: first\n\n'],
      idleAfterDone: true,
      signal: options.signal,
    })))

    const { invocation } = await invokeStream()
    await vi.advanceTimersByTimeAsync(15 * 60_000)
    await expect(invocation).resolves.toEqual({
      ok: false,
      kind: 'network',
      message: '流式响应长时间无输出，已按网络断流处理',
    })

    expect(send).toHaveBeenCalledWith('providerNet:streamChunk', expect.objectContaining({
      signalId: 'idle-stream',
      event: 'error',
      message: '流式响应长时间无输出，已按网络断流处理',
    }))
  })

  it('keeps a live stream running while bytes continue arriving', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(createStream({
      chunks: ['data: first\n\n', 'data: second\n\n', 'data: third\n\n'],
    })))

    const { invocation } = await invokeStream()
    await vi.advanceTimersByTimeAsync(14 * 60_000)
    await expect(invocation).resolves.toEqual({ ok: true, statusCode: 200 })
    expect(send).toHaveBeenCalledWith('providerNet:streamChunk', { signalId: 'idle-stream', event: 'end' })
  })

  it('reports user cancellation separately from idle timeout', async () => {
    globalThis.fetch = vi.fn((_url, options) => Promise.resolve(createStream({
      chunks: ['data: first\n\n'],
      idleAfterDone: true,
      signal: options.signal,
    })))

    const { invocation, abortHandler } = await invokeStream()
    await abortHandler(null, 'idle-stream')
    await expect(invocation).resolves.toEqual({ ok: false, kind: 'canceled', message: '请求已取消' })
    expect(send).toHaveBeenCalledWith('providerNet:streamChunk', { signalId: 'idle-stream', event: 'canceled' })
  })

})

describe('providerNet slow-stream tolerance wiring', () => {
  it('does not arm the idle watchdog for a tolerant stream', async () => {
    const sendTolerant = vi.fn()
    const handlers = new Map()
    registerApiHandlers({ handle: (channel, handler) => handlers.set(channel, handler) })
    let fetchOptions
    globalThis.fetch = vi.fn((_url, options) => {
      fetchOptions = options
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: first\n\n'))
          options.signal.addEventListener('abort', () => {
            controller.error(new DOMException('The operation was aborted.', 'AbortError'))
          })
        },
      }), { status: 200 }))
    })

    const invocation = handlers.get('providerNet:stream')(
      { sender: { send: sendTolerant } },
      {
        url: 'https://example.test/v1/chat/completions',
        signalId: 'wiring-tolerant',
        body: {},
        slowStreamTolerant: true,
      },
    )
    await vi.waitFor(() => expect(sendTolerant).toHaveBeenCalledWith('providerNet:streamChunk', {
      signalId: 'wiring-tolerant',
      event: 'start',
      statusCode: 200,
    }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(fetchOptions.signal.aborted).toBe(false)
    await handlers.get('providerNet:abort')(null, 'wiring-tolerant')
    await expect(invocation).resolves.toEqual({ ok: false, kind: 'canceled', message: '请求已取消' })
  })
})
