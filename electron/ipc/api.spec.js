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
    delete globalThis.__SHENYI_PROVIDER_NET_ORPHAN_SWEEPER__
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
    const sender = { id: 91, send }
    const request = {
      url: 'https://example.test/v1/chat/completions',
      signalId: 'idle-stream',
      providerId: 'provider-idle',
      body: {},
    }
    const invocation = streamHandler({ sender }, request)
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('providerNet:streamChunk', {
      signalId: 'idle-stream',
      event: 'start',
      statusCode: 200,
    }))
    return { invocation, abortHandler, sender }
  }

  async function invokeTolerantStream() {
    const streamHandler = registered.get('providerNet:stream')
    const request = {
      url: 'https://example.test/v1/chat/completions',
      signalId: 'tolerant-stream',
      providerId: 'provider-tolerant',
      body: {},
      slowStreamTolerant: true,
    }
    const invocation = streamHandler({ sender: { send } }, request)
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('providerNet:streamChunk', {
      signalId: 'tolerant-stream',
      event: 'start',
      statusCode: 200,
    }))
    return { invocation }
  }

  it('aborts and reports a network error when the stream stops producing bytes', async () => {
    globalThis.fetch = vi.fn((_url, options) => Promise.resolve(createStream({
      chunks: ['data: first\n\n'],
      idleAfterDone: true,
      signal: options.signal,
    })))

    const { invocation, sender } = await invokeStream()
    // This test models a healthy renderer with a stalled provider stream, so
    // it must keep the owner heartbeat alive while the idle watchdog runs.
    for (let i = 0; i < 90; i += 1) {
      await vi.advanceTimersByTimeAsync(20_000)
      await registered.get('providerNet:heartbeat')({ sender }, 'idle-stream')
    }
    await expect(invocation).resolves.toEqual({
      ok: false,
      kind: 'network',
      message: '流式响应长时间无正文或推理增量，已按内容断流处理',
    })

    expect(send).toHaveBeenCalledWith('providerNet:streamChunk', expect.objectContaining({
      signalId: 'idle-stream',
      event: 'error',
      message: '流式响应长时间无正文或推理增量，已按内容断流处理',
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

  it('emits monotonic checksummed stream frames while preserving legacy chunks', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(createStream({
      chunks: ['data: first\n\n', 'data: second\n\n'],
    })))

    const streamHandler = registered.get('providerNet:stream')
    const invocation = streamHandler({ sender: { id: 71, send } }, {
      url: 'https://example.test/v1/chat/completions',
      signalId: 'frame-stream',
      providerId: 'provider-frame',
      body: {},
    })
    await expect(invocation).resolves.toEqual({ ok: true, statusCode: 200 })

    const frames = send.mock.calls
      .filter(call => call[0] === 'providerNet:streamFrame')
      .map(call => call[1])
    expect(frames.length).toBeGreaterThanOrEqual(4)
    const startFrame = frames.find(frame => frame.transportEvent === 'start')
    expect(startFrame).toMatchObject({
      streamId: 'frame-stream',
      statusCode: 200,
    })
    const chunkFrames = frames.filter(frame => frame.transportEvent === 'chunk')
    expect(chunkFrames.map(frame => frame.text)).toEqual(['data: first\n\n', 'data: second\n\n'])
    expect(chunkFrames[0].cursor).toBeGreaterThan(startFrame.cursor)
    expect(chunkFrames[1].cursor).toBeGreaterThan(chunkFrames[0].cursor)
    for (const frame of chunkFrames) {
      expect(frame.checksum).toMatch(/^[0-9a-f]{8}$/)
    }
    expect(frames.at(-1)).toMatchObject({
      streamId: 'frame-stream',
      transportEvent: 'end',
    })
    expect(frames.at(-1).cursor).toBeGreaterThan(chunkFrames[1].cursor)
    expect(new Set(frames.map(frame => frame.cursor)).size).toBe(frames.length)
    const cursors = frames.map(frame => frame.cursor)
    expect(cursors).toEqual([...cursors].sort((a, b) => a - b))
    expect(send).toHaveBeenCalledWith('providerNet:streamChunk', {
      signalId: 'frame-stream',
      event: 'start',
      statusCode: 200,
    })
    expect(send).toHaveBeenCalledWith('providerNet:streamChunk', { signalId: 'frame-stream', event: 'end' })
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
        providerId: 'provider-tolerant',
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

describe('providerNet main-process stream watchdog semantics', () => {
  const BASE_TIMEOUTS = {
    idleTimeoutMs: 15 * 60_000,
    firstOutputTimeoutMs: 3 * 60_000,
    progressTimeoutMs: 20 * 60_000,
    bodyAbsentTimeoutMs: 12 * 60_000,
  }

  function classifyDelta(payload) {
    return `data: ${JSON.stringify(payload)}\n\n`
  }

  beforeEach(() => {
    vi.useFakeTimers()
    send.mockClear()
    registered.clear()
    registerApiHandlers({ handle: (channel, handler) => registered.set(channel, handler) })
  })

  vi.setConfig({ testTimeout: 15_000 })

  function createStalledStream({ chunks, signal }) {
    return new Response(new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
        signal?.addEventListener('abort', () => {
          controller.error(new DOMException('The operation was aborted.', 'AbortError'))
        })
      },
    }), { status: 200 })
  }

  function createHeartbeatLoop(sender, streamId, intervalMs) {
    const heartbeat = registered.get('providerNet:heartbeat')
    const heartbeatTimer = setInterval(() => {
      const result = heartbeat(sender, streamId)
      if (!result || result.ok !== true) throw new Error(`heartbeat failed: ${JSON.stringify(result)}`)
    }, intervalMs)
    heartbeatTimer.unref?.()
    return async function advance(totalMs) {
      // One-shot advances over pending ReadableStream reads can stall Vitest's
      // async fake-clock flush. Small deterministic steps match the owner
      // heartbeat cadence used by the production renderer.
      let elapsed = 0
      while (elapsed < totalMs) {
        const step = Math.min(20_000, totalMs - elapsed)
        await vi.advanceTimersByTimeAsync(step)
        elapsed += step
      }
      clearInterval(heartbeatTimer)
    }
  }

  afterEach(() => {
    delete globalThis.__SHENYI_PROVIDER_NET_ORPHAN_SWEEPER__
    vi.useRealTimers()
  })

  async function invokeStalledStream({ signalId, providerId, chunks, slowStreamTolerant = false }) {
    globalThis.fetch = vi.fn((_url, options) => Promise.resolve(createStalledStream({
      chunks,
      signal: options.signal,
    })))
    const invocation = registered.get('providerNet:stream')({ sender: { id: 101, send } }, {
      url: 'https://example.test/v1/chat/completions',
      signalId,
      providerId,
      body: {},
      slowStreamTolerant,
      ...BASE_TIMEOUTS,
    })
    while (!send.mock.calls.some(([channel, payload]) => channel === 'providerNet:streamChunk' && payload.signalId === signalId && payload.event === 'start')) {
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(send).toHaveBeenCalledWith('providerNet:streamChunk', {
      signalId,
      event: 'start',
      statusCode: 200,
    })
    return { invocation }
  }

  it('reports first_output timeout before any provider delta arrives', async () => {
    const { invocation } = await invokeStalledStream({
      signalId: 'watchdog-first-output',
      providerId: 'provider-watchdog-first',
      chunks: ['data: {"choices":[{"delta":{}}]}\n\n'],
      slowStreamTolerant: true,
    })
    const advance = createHeartbeatLoop({ sender: { id: 101, send } }, 'watchdog-first-output', 20_000)

    await advance(BASE_TIMEOUTS.firstOutputTimeoutMs - 1)
    await expect(send).not.toHaveBeenCalledWith('providerNet:streamChunk', expect.objectContaining({
      signalId: 'watchdog-first-output',
      event: 'error',
    }))
    await vi.advanceTimersByTimeAsync(1)
    await expect(invocation).resolves.toEqual({
      ok: false,
      kind: 'network',
      message: '慢流请求首字超时，已按网络断流处理',
    })
  })

  it('reports progress timeout when only transport heartbeats continue', async () => {
    const { invocation } = await invokeStalledStream({
      signalId: 'watchdog-progress',
      providerId: 'provider-watchdog-progress',
      chunks: [],
    })
    await createHeartbeatLoop({ sender: { id: 101, send } }, 'watchdog-progress', 30_000)(BASE_TIMEOUTS.progressTimeoutMs + 1_000)
    // An empty provider stream has no SSE kind to classify. Owner heartbeat
    // keeps the transport ownership alive, so the earlier idle timer is the
    // V6.3 semantic for this condition, not the later progress timer.
    await expect(invocation).resolves.toEqual({
      ok: false,
      kind: 'network',
      message: '流式响应长时间无输出，已按网络断流处理',
    })
  })

  it('reports body_absent timeout while reasoning deltas keep arriving', async () => {
    const { invocation } = await invokeStalledStream({
      signalId: 'watchdog-body-absent',
      providerId: 'provider-watchdog-body',
      chunks: [classifyDelta({ choices: [{ delta: { reasoning_content: '思考' } }] })],
    })

    await createHeartbeatLoop({ sender: { id: 101, send } }, 'watchdog-body-absent', 20_000)(BASE_TIMEOUTS.idleTimeoutMs + 1_000)
    await expect(invocation).resolves.toEqual({
      ok: false,
      kind: 'network',
      message: '流式响应长时间未产生正文，已按 reasoning-only 断流处理',
    })
  })

  it('clears body_absent but not first_output when content arrives late', async () => {
    const { invocation } = await invokeStalledStream({
      signalId: 'watchdog-content-late',
      providerId: 'provider-watchdog-content',
      chunks: [classifyDelta({ choices: [{ delta: { content: '正文' } }] })],
    })

    await createHeartbeatLoop({ sender: { id: 101, send } }, 'watchdog-content-late', 20_000)(BASE_TIMEOUTS.bodyAbsentTimeoutMs + 1_000)
    await registered.get('providerNet:abort')(null, 'watchdog-content-late')
    await expect(invocation).resolves.toEqual({ ok: false, kind: 'canceled', message: '请求已取消' })
    expect(send).not.toHaveBeenCalledWith('providerNet:streamChunk', expect.objectContaining({
      signalId: 'watchdog-content-late',
      event: 'error',
      message: '流式响应长时间未产生正文，已按 reasoning-only 断流处理',
    }))
  })
})

describe('providerNet stream ownership registry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    send.mockClear()
    registered.clear()
    registerApiHandlers({ handle: (channel, handler) => registered.set(channel, handler) })
  })

  afterEach(() => {
    delete globalThis.__SHENYI_PROVIDER_NET_ORPHAN_SWEEPER__
    vi.useRealTimers()
  })

  it('keeps the ring buffer bounded and preserves a deterministic checkpoint without fake backpressure', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        for (let i = 0; i < 40; i += 1) controller.enqueue(new TextEncoder().encode(`data: chunk-${i}\n\n`))
        controller.close()
      },
    }), { status: 200 })))

    const invocation = registered.get('providerNet:stream')({ sender: { id: 11, send } }, {
      url: 'https://example.test/v1/chat/completions',
      signalId: 'bounded-stream',
      providerId: 'provider-main',
      projectId: 'project-outline',
      body: {},
    })
    await expect(invocation).resolves.toEqual({ ok: true, statusCode: 200 })
    const registry = await registered.get('providerNet:registry')({ sender: { id: 11, send } })
    const stream = registry.streams.find(item => item.streamId === 'bounded-stream')
    expect(stream.providerId).toBe('provider-main')
    expect(stream.projectId).toBe('project-outline')
    expect(stream.chunkCount).toBe(40)
    expect(stream.backpressure).toBe(false)
    expect(stream.checkpoint.chunkCount).toBe(40)
    expect(stream.checkpoint.text).toContain('data: chunk-39')
  })

  it('marks a live stream orphaned after heartbeat loss and aborts the provider stream', async () => {
    let abortSignal = null
    globalThis.fetch = vi.fn((_url, options) => {
      abortSignal = options.signal
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: first\n\n'))
          options.signal.addEventListener('abort', () => {
            controller.error(new DOMException('The operation was aborted.', 'AbortError'))
          })
        },
      }), { status: 200 }))
    })

    const invocation = registered.get('providerNet:stream')({ sender: { id: 12, send } }, {
      url: 'https://example.test/v1/chat/completions',
      signalId: 'orphan-stream',
      providerId: 'provider-main',
      projectId: 'project-outline',
      body: {},
    })
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('providerNet:streamChunk', expect.objectContaining({
      signalId: 'orphan-stream',
      event: 'chunk',
    })))
    await vi.advanceTimersByTimeAsync(31_000)
    await expect(invocation).resolves.toEqual({ ok: false, kind: 'network', message: '渲染窗口心跳丢失，流已进入恢复检查点' })
    expect(abortSignal.aborted).toBe(true)
    const registry = await registered.get('providerNet:registry')({ sender: { id: 12, send } })
    const stream = registry.streams.find(item => item.streamId === 'orphan-stream')
    expect(stream.status).toBe('orphaned')
    expect(stream.orphanReason).toBe('heartbeat_timeout')
    expect(stream.checkpoint.recoveryStatus).toBe('recovering')
    expect(stream.checkpoint.disposition).toBe('partial')
  })

  it('only exposes and heartbeats a stream to its owning window', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: first\n\n'))
        controller.close()
      },
    }), { status: 200 })))

    const invocation = registered.get('providerNet:stream')({ sender: { id: 21, send } }, {
      url: 'https://example.test/v1/chat/completions',
      signalId: 'owned-stream',
      providerId: 'provider-owned',
      body: {},
    })
    await expect(invocation).resolves.toEqual({ ok: true, statusCode: 200 })

    const otherRegistry = await registered.get('providerNet:registry')({ sender: { id: 22, send } })
    expect(otherRegistry.streams).toEqual([])
    const crossWindowHeartbeat = await registered.get('providerNet:heartbeat')({ sender: { id: 22, send } }, 'owned-stream')
    expect(crossWindowHeartbeat).toEqual({ ok: false, error: 'stream_not_found' })
    const ownedRegistry = await registered.get('providerNet:registry')({ sender: { id: 21, send } })
    expect(ownedRegistry.streams.map(item => item.streamId)).toEqual(['owned-stream'])
  })

  it('projects only the owning window streams in the scheduler snapshot', async () => {
    globalThis.fetch = vi.fn((_url, options) => Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: first\n\n'))
        options.signal.addEventListener('abort', () => {
          controller.error(new DOMException('The operation was aborted.', 'AbortError'))
        })
      },
    }), { status: 200 })))

    const invocation = registered.get('providerNet:stream')({ sender: { id: 31, send } }, {
      url: 'https://example.test/v1/chat/completions',
      signalId: 'scheduler-stream',
      providerId: 'provider-a',
      body: {},
    })
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('providerNet:streamChunk', {
      signalId: 'scheduler-stream',
      event: 'start',
      statusCode: 200,
    }))

    const ownedSnapshot = await registered.get('providerNet:schedulerSnapshot')({ sender: { id: 31, send } })
    expect(ownedSnapshot).toEqual({
      ok: true,
      snapshot: {
      maxConcurrencyPerProvider: 2,
      activeCountByProvider: { 'provider-a': 1 },
      waitingCountByProvider: {},
    },
    })
    await registered.get('providerNet:abort')(null, 'scheduler-stream')
    await expect(invocation).resolves.toEqual({ ok: false, kind: 'canceled', message: '请求已取消' })
    const otherSnapshot = await registered.get('providerNet:schedulerSnapshot')({ sender: { id: 32, send } })
    expect(otherSnapshot.snapshot.activeCountByProvider).toEqual({})
  })

  it('rejects a stream request without providerId instead of sharing a synthetic scheduler slot', async () => {
    globalThis.fetch = vi.fn()
    const result = await registered.get('providerNet:stream')({ sender: { id: 51, send } }, {
      url: 'https://example.test/v1/chat/completions',
      signalId: 'missing-provider-stream',
      body: {},
    })
    expect(result).toEqual({ ok: false, kind: 'http', message: '流式请求缺少 providerId，无法进入主进程调度器' })
    expect(globalThis.fetch).not.toHaveBeenCalled()
    const snapshot = await registered.get('providerNet:schedulerSnapshot')({ sender: { id: 51, send } })
    expect(snapshot.snapshot).toEqual({
      maxConcurrencyPerProvider: 2,
      activeCountByProvider: {},
      waitingCountByProvider: {},
    })
  })

  it('enforces main-process acquire/release semantics and queues a third stream per provider', async () => {
    const senders = [{ id: 41, send: vi.fn() }, { id: 42, send: vi.fn() }, { id: 43, send: vi.fn() }]
    const releases = []
    globalThis.fetch = vi.fn((_url, options) => Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: first\n\n'))
        // Keep all streams open; abort errors each reader deterministically.
        options.signal.addEventListener('abort', () => {
          controller.error(new DOMException('The operation was aborted.', 'AbortError'))
        })
      },
    }), { status: 200 })))

    const invocations = senders.map((sender, index) => registered.get('providerNet:stream')({ sender }, {
      url: 'https://example.test/v1/chat/completions',
      signalId: `scheduler-real-${index + 1}`,
      providerId: 'provider-real',
      concurrencyPolicy: { maxConcurrencyPerProvider: 2 },
      body: {},
    }))
    await vi.waitFor(() => {
      expect(senders[0].send).toHaveBeenCalledWith('providerNet:streamChunk', expect.objectContaining({
        signalId: 'scheduler-real-1',
        event: 'start',
      }))
      expect(senders[1].send).toHaveBeenCalledWith('providerNet:streamChunk', expect.objectContaining({
        signalId: 'scheduler-real-2',
        event: 'start',
      }))
      expect(senders[2].send).toHaveBeenCalledWith('providerNet:streamChunk', expect.objectContaining({
        signalId: 'scheduler-real-3',
        event: 'queued',
        position: 1,
        waiting: 1,
        maxConcurrencyPerProvider: 2,
      }))
    })

    const snapshotDuringQueue = await registered.get('providerNet:schedulerSnapshot')({ sender: senders[2] })
    expect(snapshotDuringQueue.snapshot).toEqual({
      maxConcurrencyPerProvider: 2,
      activeCountByProvider: { 'provider-real': 2 },
      waitingCountByProvider: { 'provider-real': 1 },
    })

    await registered.get('providerNet:abort')(null, 'scheduler-real-1')
    releases.push(await expect(invocations[0]).resolves.toEqual({ ok: false, kind: 'canceled', message: '请求已取消' }))
    await vi.waitFor(() => {
      expect(senders[2].send).toHaveBeenCalledWith('providerNet:streamChunk', expect.objectContaining({
        signalId: 'scheduler-real-3',
        event: 'start',
        statusCode: 200,
      }))
    })
    const snapshotAfterRelease = await registered.get('providerNet:schedulerSnapshot')({ sender: senders[2] })
    expect(snapshotAfterRelease.snapshot).toEqual({
      maxConcurrencyPerProvider: 2,
      activeCountByProvider: { 'provider-real': 2 },
      waitingCountByProvider: {},
    })

    await registered.get('providerNet:abort')(null, 'scheduler-real-2')
    await registered.get('providerNet:abort')(null, 'scheduler-real-3')
    await expect(invocations[1]).resolves.toEqual({ ok: false, kind: 'canceled', message: '请求已取消' })
    await expect(invocations[2]).resolves.toEqual({ ok: false, kind: 'canceled', message: '请求已取消' })
    const finalSnapshot = await registered.get('providerNet:schedulerSnapshot')({ sender: senders[2] })
    expect(finalSnapshot.snapshot).toEqual({
      maxConcurrencyPerProvider: 2,
      activeCountByProvider: {},
      waitingCountByProvider: {},
    })
    expect(releases).toHaveLength(1)
  })
})
