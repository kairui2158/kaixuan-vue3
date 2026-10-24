const { ipcMain } = require('electron')
const {
  buildProviderModelsUrl,
  buildProviderHeaders,
  httpErrorMessage,
} = require('../../dist-renderer/providerProtocols.cjs')

const activeStreams = new Map()
const streamRegistry = new Map()
const PROVIDER_NET_STREAM_IDLE_TIMEOUT_MS = Number(process.env.SHENYI_PROVIDER_NET_STREAM_IDLE_TIMEOUT_MS || 15 * 60_000)
const PROVIDER_NET_STREAM_FIRST_OUTPUT_TIMEOUT_MS = Number(process.env.SHENYI_PROVIDER_NET_FIRST_OUTPUT_TIMEOUT_MS || 3 * 60_000)
const PROVIDER_NET_STREAM_PROGRESS_TIMEOUT_MS = Number(process.env.SHENYI_PROVIDER_NET_PROGRESS_TIMEOUT_MS || 20 * 60_000)
const PROVIDER_NET_STREAM_BODY_ABSENT_TIMEOUT_MS = Number(process.env.SHENYI_PROVIDER_NET_BODY_ABSENT_TIMEOUT_MS || 12 * 60_000)
const STREAM_RING_BUFFER_LIMIT = 1024
const STREAM_RING_BUFFER_BYTES = 2 * 1024 * 1024
const STREAM_HEARTBEAT_TIMEOUT_MS = Number(process.env.SHENYI_PROVIDER_NET_HEARTBEAT_TIMEOUT_MS || 30_000)
const STREAM_REGISTRY_SWEEP_MS = Number(process.env.SHENYI_PROVIDER_NET_SWEEP_MS || 5_000)
const providerNetLog = process.env.SHENYI_PROVIDER_NET_TRACE === '1'
  ? require('electron-log/main')
  : null

const WATCHDOG_MESSAGES = {
  idle: '流式响应长时间无输出，已按网络断流处理',
  first_output: '慢流请求首字超时，已按网络断流处理',
  progress: '流式响应长时间无正文或推理增量，已按内容断流处理',
  body_absent: '流式响应长时间未产生正文，已按 reasoning-only 断流处理',
}

function createFrameChecksum(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function createStreamFrameSender(sender, streamId) {
  let cursor = 0
  return function(transportEvent, fields = {}) {
    cursor += 1
    const text = typeof fields.text === 'string' ? fields.text : ''
    sender.send('providerNet:streamFrame', {
      streamId,
      cursor,
      transportEvent,
      text,
      timestamp: Date.now(),
      ...(transportEvent === 'chunk' ? { checksum: createFrameChecksum(text) } : {}),
      ...fields,
    })
  }
}

function classifyProviderStreamDelta(decodedText) {
  const lines = decodedText.split('\n')
  const trailingLine = lines.pop() || ''
  for (const line of lines) {
    const classified = classifyProviderStreamLine(line)
    if (classified) return classified
  }
  return classifyProviderStreamLine(trailingLine)
}

function classifyProviderStreamLine(decodedLine) {
  const trimmed = decodedLine.trim()
  if (!trimmed.startsWith('data: ')) return null
  const payload = trimmed.slice(6)
  if (payload === '[DONE]') return null
  try {
    const json = JSON.parse(payload)
    if (!json || typeof json !== 'object') return null
    if (Array.isArray(json.choices) && json.choices.length > 0) {
      const delta = json.choices[0].delta
      if (delta && typeof delta === 'object') {
        if (delta.content != null && delta.content !== '') return 'content'
        if (delta.reasoning_content != null && delta.reasoning_content !== '') return 'reasoning'
        if (delta.tool_calls != null) return 'tool'
      }
    }
    if (json.type === 'content_block_delta') {
      if (json.delta && typeof json.delta === 'object') {
        if (json.delta.text != null && json.delta.text !== '') return 'content'
        if (json.delta.thinking != null && json.delta.thinking !== '') return 'reasoning'
      }
    }
    if (Array.isArray(json.candidates) && json.candidates.length > 0) return 'content'
  } catch (e) {
    // Partial SSE lines are classified by the next complete frame.
  }
  return null
}

function createProviderStreamActivityClassifier() {
  let pendingLine = ''
  return {
    push: function(decodedText) {
      const text = pendingLine + decodedText
      const lines = text.split('\n')
      pendingLine = lines.pop() || ''
      let activity = null
      for (const line of lines) {
        const classified = classifyProviderStreamLine(line)
        if (classified) activity = classified
      }
      return activity || (decodedText.length > 0 ? 'transport' : activity)
    },
  }
}

function traceProviderNet(event, message, detail) {
  if (!providerNetLog) return
  try {
    providerNetLog.info('provider-net-trace: ' + event + ' ' + message + ' ' + JSON.stringify(detail || {}))
  } catch (e) {
    providerNetLog.warn('provider-net-trace-failed: ' + (e && e.message))
  }
}

function createTrackedAbortController() {
  const controller = new AbortController()
  const abortState = { reason: null }
  const originalAbort = controller.abort.bind(controller)
  controller.abort = function(reason) {
    abortState.reason = reason || abortState.reason
    return originalAbort()
  }
  return { controller, abortState }
}

function streamRegistrySnapshot() {
  return Array.from(streamRegistry.entries()).map(function(entry) {
    const stream = entry[1]
    return {
      streamId: entry[0],
      status: stream.status,
      providerId: stream.providerId || null,
      windowId: stream.windowId,
      projectId: stream.projectId || null,
      createdAt: stream.createdAt,
      lastHeartbeatAt: stream.lastHeartbeatAt,
      orphanReason: stream.orphanReason || null,
      orphanedAt: stream.orphanedAt || null,
      bytesReceived: stream.bytesReceived,
      chunkCount: stream.chunkCount,
      backpressure: stream.backpressure,
      checkpoint: stream.checkpoint,
    }
  })
}

function createRingBuffer() {
  const items = []
  return {
    push: function(item) {
      items.push(item)
      while (items.length > STREAM_RING_BUFFER_LIMIT) items.shift()
    },
    toArray: function() { return items.slice() },
  }
}

function createCheckpoint(state) {
  return {
    status: state.status,
    bytesReceived: state.bytesReceived,
    chunkCount: state.chunkCount,
    checkpointAt: Date.now(),
    text: state.tailBuffer.toArray().join(''),
  }
}

function createRecoveryCheckpoint(state) {
  return {
    ...createCheckpoint(state),
    recoveryStatus: 'recovering',
    disposition: 'partial',
  }
}

function sweepOrphanStreams() {
  const now = Date.now()
  for (const [streamId, stream] of streamRegistry.entries()) {
    if (stream.status !== 'connecting' && stream.status !== 'streaming') continue
    if (now - stream.lastHeartbeatAt <= STREAM_HEARTBEAT_TIMEOUT_MS) continue
    stream.status = 'orphaned'
    stream.orphanReason = 'heartbeat_timeout'
    stream.orphanedAt = now
    stream.checkpoint = createRecoveryCheckpoint(stream)
    const controller = activeStreams.get(streamId)
    if (controller) {
      try { controller.abort('orphaned') } catch (e) {
        traceProviderNet(stream.windowId, 'orphan-abort-failed', { streamId, error: e && e.message })
      }
    }
    traceProviderNet(stream.windowId, 'orphaned', {
      streamId,
      providerId: stream.providerId,
      projectId: stream.projectId,
      heartbeatAgeMs: now - stream.lastHeartbeatAt,
      bytesReceived: stream.bytesReceived,
    })
  }
}

function startOrphanSweeper() {
  const existing = globalThis.__SHENYI_PROVIDER_NET_ORPHAN_SWEEPER__
  if (existing) return existing
  const timer = setInterval(sweepOrphanStreams, Math.max(1000, STREAM_REGISTRY_SWEEP_MS))
  timer.unref()
  globalThis.__SHENYI_PROVIDER_NET_ORPHAN_SWEEPER__ = timer
  return timer
}

function createProviderNetWatchdog(options) {
  const idleTimeoutMs = Math.max(1000, Number(options && options.idleTimeoutMs) || PROVIDER_NET_STREAM_IDLE_TIMEOUT_MS)
  const firstOutputTimeoutMs = Math.max(
    1000,
    Number(options && options.firstOutputTimeoutMs) || PROVIDER_NET_STREAM_FIRST_OUTPUT_TIMEOUT_MS,
  )
  const progressTimeoutMs = Math.max(
    1000,
    Number(options && options.progressTimeoutMs) || PROVIDER_NET_STREAM_PROGRESS_TIMEOUT_MS,
  )
  const bodyAbsentTimeoutMs = Math.max(
    1000,
    Number(options && options.bodyAbsentTimeoutMs) || PROVIDER_NET_STREAM_BODY_ABSENT_TIMEOUT_MS,
  )
  const state = {
    idleTimer: null,
    firstOutputTimer: null,
    progressTimer: null,
    bodyAbsentTimer: null,
    sawReasoning: false,
    triggered: null,
  }
  const clearTimer = function(name) {
    if (state[name] == null) return
    clearTimeout(state[name])
    state[name] = null
  }
  const clearAll = function() {
    clearTimer('idleTimer')
    clearTimer('firstOutputTimer')
    clearTimer('progressTimer')
    clearTimer('bodyAbsentTimer')
  }
  const trigger = function(kind, callback) {
    if (state.triggered) return
    state.triggered = kind
    clearAll()
    callback(kind)
  }
  const armTimer = function(name, delayMs, kind, callback) {
    if (options && options.slowStreamTolerant && name !== 'firstOutputTimer' && name !== 'progressTimer') return
    clearTimer(name)
    state[name] = setTimeout(function() {
      state[name] = null
      trigger(kind, callback)
    }, delayMs)
  }
  return {
    exposeForTest: function() {
      return {
        state,
        timeouts: { idleTimeoutMs, firstOutputTimeoutMs, progressTimeoutMs, bodyAbsentTimeoutMs },
        slowStreamTolerant: Boolean(options && options.slowStreamTolerant),
      }
    },
    arm: function(callback) {
      if (options && options.slowStreamTolerant) {
        armTimer('firstOutputTimer', firstOutputTimeoutMs, 'first_output', callback)
        return
      }
      armTimer('idleTimer', idleTimeoutMs, 'idle', callback)
      armTimer('progressTimer', progressTimeoutMs, 'progress', callback)
    },
    markActivity: function(kind) {
      if (state.triggered) return
      clearTimer('idleTimer')
      if (kind === 'content' || kind === 'reasoning' || kind === 'tool') {
        clearTimer('firstOutputTimer')
        armTimer('idleTimer', idleTimeoutMs, 'idle', state.onTrigger)
        if (kind === 'content' || kind === 'tool') {
          clearTimer('bodyAbsentTimer')
          armTimer('progressTimer', progressTimeoutMs, 'progress', state.onTrigger)
        }
        if (kind === 'reasoning') {
          state.sawReasoning = true
          armTimer('bodyAbsentTimer', bodyAbsentTimeoutMs, 'body_absent', state.onTrigger)
          armTimer('progressTimer', progressTimeoutMs, 'progress', state.onTrigger)
        }
      }
    },
    bind: function(callback) {
      state.onTrigger = callback
    },
    clear: clearAll,
    state: state,
  }
}

function createProviderNetScheduler() {
  const maxConcurrencyPerProvider = Math.max(
    1,
    Number(process.env.SHENYI_PROVIDER_NET_MAX_CONCURRENCY) || 2,
  )
  const activeCounts = new Map()
  const queues = new Map()

  function cancelQueued(streamId) {
    for (const [providerId, queue] of queues) {
      const index = queue.findIndex(function(item) { return item.streamId === streamId })
      if (index < 0) continue
      const item = queue[index]
      queue.splice(index, 1)
      if (queue.length === 0) queues.delete(providerId)
      item.cancel()
      report(providerId)
      return true
    }
    return false
  }

  function report(providerId) {
    const queue = queues.get(providerId) || []
    queue.forEach(function(item, index) {
      item.onEvent({
        providerId,
        status: 'queued',
        position: index + 1,
        waiting: queue.length,
        maxConcurrencyPerProvider,
      })
    })
  }

  function startWaiting(providerId) {
    const queue = queues.get(providerId)
    if (!queue) return
    while (
      queue.length > 0 &&
      (activeCounts.get(providerId) || 0) < maxConcurrencyPerProvider
    ) {
      const item = queue.shift()
      if (queue.length === 0) queues.delete(providerId)
      activeCounts.set(providerId, (activeCounts.get(providerId) || 0) + 1)
      item.onEvent({
        providerId,
        status: 'started',
        maxConcurrencyPerProvider,
      })
      item.start()
    }
    report(providerId)
  }

  function release(streamId, providerId) {
    const count = activeCounts.get(providerId) || 0
    if (count <= 1) activeCounts.delete(providerId)
    else activeCounts.set(providerId, count - 1)
    startWaiting(providerId)
  }

  return {
    acquire: function(input) {
      const providerId = input.providerId
      const streamId = input.streamId
      if ((activeCounts.get(providerId) || 0) < maxConcurrencyPerProvider) {
        activeCounts.set(providerId, (activeCounts.get(providerId) || 0) + 1)
        input.onEvent({ providerId, status: 'started', maxConcurrencyPerProvider })
        return { queued: false, release: function() { release(streamId, providerId) } }
      }
      return new Promise(function(resolve) {
        const queue = queues.get(providerId) || []
        const item = {
          streamId,
          onEvent: input.onEvent,
          start: function() {
            resolve({ queued: true, release: function() { release(streamId, providerId) } })
          },
          cancel: function() {
            resolve({ queued: true, canceled: true, release: function() {} })
          },
        }
        queue.push(item)
        queues.set(providerId, queue)
        input.onEvent({
          providerId,
          status: 'queued',
          position: queue.length,
          waiting: queue.length,
          maxConcurrencyPerProvider,
        })
      })
    },
    cancel: cancelQueued,
    snapshot: function() {
      return {
        maxConcurrencyPerProvider,
        activeCountByProvider: Object.fromEntries(activeCounts),
        waitingCountByProvider: Object.fromEntries(
          Array.from(queues.entries()).map(function(entry) {
            return [entry[0], entry[1].length]
          }),
        ),
      }
    },
  }
}

function errorKindForStatus(statusCode) {
  if (statusCode === 401 || statusCode === 403) return 'auth'
  if (statusCode === 408) return 'timeout'
  return 'http'
}

async function readBody(response) {
  const chunks = []
  for await (const chunk of response.body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function parseErrorBody(buffer) {
  const text = buffer.toString('utf8').slice(0, 2000)
  try {
    const parsed = JSON.parse(text)
    return parsed && parsed.error && parsed.error.message ? parsed.error.message : (parsed && parsed.message ? parsed.message : text)
  } catch (e) {
    return text
  }
}

function registerProviderNetHandlers(ipc) {
  startOrphanSweeper()
  const providerNetScheduler = createProviderNetScheduler()

  ipc.handle('providerNet:schedulerSnapshot', function(event) {
    return {
      ok: true,
      snapshot: providerNetScheduler.snapshot(),
    }
  })

  ipc.handle('providerNet:registry', function(event) {
    return {
      ok: true,
      streams: streamRegistrySnapshot().filter(function(stream) {
        return stream.windowId === event.sender.id
      }),
    }
  })

  ipc.handle('providerNet:heartbeat', function(event, streamId) {
    const stream = streamRegistry.get(streamId)
    if (!stream || stream.windowId !== event.sender.id) return { ok: false, error: 'stream_not_found' }
    stream.lastHeartbeatAt = Date.now()
    return { ok: true }
  })

  ipc.handle('providerNet:request', async function(event, request) {
    if (!request || typeof request.url !== 'string') {
      return { ok: false, kind: 'http', message: '请求缺少有效 URL' }
    }
    const { controller: requestController, abortState: requestAbortState } = createTrackedAbortController()
    const controller = requestController
    const signalId = request.signalId
    if (signalId) {
      activeStreams.set(signalId, controller)
    }
    try {
      const response = await fetch(request.url, {
        method: request.method || 'GET',
        headers: request.headers || {},
        body: request.body == null ? undefined : JSON.stringify(request.body),
        signal: controller.signal,
      })
      const body = await readBody(response)
      let parsed = null
      try { parsed = JSON.parse(body.toString('utf8')) } catch (e) { parsed = null }
      if (!response.ok) {
        return {
          ok: false,
          kind: errorKindForStatus(response.status),
          statusCode: response.status,
          message: parseErrorBody(body),
          providerErrorSummary: parseErrorBody(body),
        }
      }
      return {
        ok: true,
        statusCode: response.status,
        data: parsed,
        text: body.toString('utf8'),
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        if (requestAbortState.reason === 'orphaned') {
          return { ok: false, kind: 'network', message: '渲染窗口心跳丢失，流已进入恢复检查点' }
        }
        return { ok: false, kind: 'canceled', message: '请求已取消' }
      }
      if (e.name === 'TimeoutError') {
        return { ok: false, kind: 'timeout', message: '请求超时' }
      }
      return { ok: false, kind: 'network', message: e.message || '网络错误' }
    } finally {
      if (signalId) activeStreams.delete(signalId)
    }
  })

  ipc.handle('providerNet:stream', async function(event, request) {
    traceProviderNet(event.sender.id, 'entry', {
      signalId: request && request.signalId,
      url: request && request.url,
      slowStreamTolerant: Boolean(request && request.slowStreamTolerant),
      messageCount: request && request.body && Array.isArray(request.body.messages)
        ? request.body.messages.length
        : null,
    })
    if (!request || typeof request.url !== 'string') {
      return { ok: false, kind: 'http', message: '请求缺少有效 URL' }
    }
    const signalId = request.signalId
    if (!signalId) return { ok: false, kind: 'http', message: '流式请求缺少 signalId' }
    // Requests without a provider identity cannot enter the scheduler: a
    // shared synthetic id would let unrelated providers consume each other's
    // slots.
    if (request.providerId == null) {
      return { ok: false, kind: 'http', message: '流式请求缺少 providerId，无法进入主进程调度器' }
    }
    const slowStreamTolerant = request.slowStreamTolerant === true
    const sendStreamFrame = createStreamFrameSender(event.sender, signalId)
    const schedulerSlot = providerNetScheduler.acquire({
      providerId: request.providerId,
      streamId: signalId,
      onEvent: function(queueEvent) {
        sendStreamFrame(queueEvent.status, {
          position: queueEvent.position,
          waiting: queueEvent.waiting,
          maxConcurrencyPerProvider: queueEvent.maxConcurrencyPerProvider,
        })
        event.sender.send('providerNet:streamChunk', {
          signalId,
          event: queueEvent.status,
          position: queueEvent.position,
          waiting: queueEvent.waiting,
          maxConcurrencyPerProvider: queueEvent.maxConcurrencyPerProvider,
        })
      },
    })
    const slot = await schedulerSlot
    if (slot.canceled) {
      sendStreamFrame('canceled')
      event.sender.send('providerNet:streamChunk', { signalId, event: 'canceled' })
      return { ok: false, kind: 'canceled', message: '请求已取消' }
    }
    const streamId = signalId
    const { controller: streamController, abortState: streamAbortState } = createTrackedAbortController()
    const controller = streamController
    activeStreams.set(signalId, controller)
    const watchdog = createProviderNetWatchdog({
      slowStreamTolerant: slowStreamTolerant,
      idleTimeoutMs: Number(request.idleTimeoutMs) || PROVIDER_NET_STREAM_IDLE_TIMEOUT_MS,
      firstOutputTimeoutMs: Number(request.firstOutputTimeoutMs) || PROVIDER_NET_STREAM_FIRST_OUTPUT_TIMEOUT_MS,
      progressTimeoutMs: Number(request.progressTimeoutMs) || PROVIDER_NET_STREAM_PROGRESS_TIMEOUT_MS,
      bodyAbsentTimeoutMs: Number(request.bodyAbsentTimeoutMs) || PROVIDER_NET_STREAM_BODY_ABSENT_TIMEOUT_MS,
    })
    const streamState = {
      status: 'connecting',
      providerId: request.providerId || null,
      windowId: event.sender.id,
      projectId: request.projectId || null,
      createdAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      bytesReceived: 0,
      chunkCount: 0,
      backpressure: false,
      tailBuffer: createRingBuffer(),
      checkpoint: null,
    }
    streamRegistry.set(signalId, streamState)
    const onWatchdogTrigger = function(kind) {
      traceProviderNet(event.sender.id, 'watchdog', {
        signalId,
        kind,
      })
      controller.abort(kind)
    }
    try {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers || {},
        body: JSON.stringify(request.body || {}),
        signal: controller.signal,
      })
      if (!response.ok) {
        const body = await readBody(response)
        return {
          ok: false,
          kind: errorKindForStatus(response.status),
          statusCode: response.status,
          message: parseErrorBody(body),
          // The renderer's native-tool fallback depends on this field to
          // distinguish "provider rejected tools" from a generic HTTP 400.
          providerErrorSummary: parseErrorBody(body),
        }
      }
      event.sender.send('providerNet:streamChunk', {
        signalId,
        event: 'start',
        statusCode: response.status,
      })
      sendStreamFrame('start', { statusCode: response.status })
      streamState.status = 'streaming'
      traceProviderNet(event.sender.id, 'start', {
        signalId,
        statusCode: response.status,
      })
      const decoder = new TextDecoder()
      const reader = response.body.getReader()
      const streamClassifier = createProviderStreamActivityClassifier()
      watchdog.bind(onWatchdogTrigger)
      watchdog.arm(onWatchdogTrigger)
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        const decodedText = decoder.decode(chunk.value, { stream: true })
        watchdog.markActivity(streamClassifier.push(decodedText))
        event.sender.send('providerNet:streamChunk', {
          signalId,
          event: 'chunk',
          text: decodedText,
        })
        sendStreamFrame('chunk', { text: decodedText })
        streamState.bytesReceived += chunk.value ? chunk.value.byteLength : 0
        streamState.chunkCount += 1
        streamState.lastHeartbeatAt = Date.now()
        streamState.tailBuffer.push(decodedText)
        streamState.checkpoint = createCheckpoint(streamState)
        if (
          streamState.chunkCount > STREAM_RING_BUFFER_LIMIT ||
          streamState.bytesReceived > STREAM_RING_BUFFER_BYTES
        ) {
          streamState.backpressure = true
        }
        traceProviderNet(event.sender.id, 'chunk', {
          signalId,
          bytes: chunk.value ? chunk.value.byteLength : 0,
        })
      }
      event.sender.send('providerNet:streamChunk', { signalId, event: 'end' })
      sendStreamFrame('end')
      streamState.status = 'completed'
      streamState.checkpoint = createCheckpoint(streamState)
      traceProviderNet(event.sender.id, 'end', { signalId })
      return { ok: true, statusCode: response.status }
    } catch (e) {
      traceProviderNet(event.sender.id, 'error', {
        signalId,
        name: e && e.name,
        message: e && e.message,
      })
      if (e.name === 'AbortError') {
        if (streamAbortState.reason === 'orphaned') {
          event.sender.send('providerNet:streamChunk', {
            signalId,
            event: 'error',
            message: '渲染窗口心跳丢失，流已进入恢复检查点',
          })
          sendStreamFrame('error', { message: '渲染窗口心跳丢失，流已进入恢复检查点' })
          return { ok: false, kind: 'network', message: '渲染窗口心跳丢失，流已进入恢复检查点' }
        }
        if (streamAbortState.reason && WATCHDOG_MESSAGES[streamAbortState.reason]) {
          const watchdogMessage = WATCHDOG_MESSAGES[streamAbortState.reason]
          event.sender.send('providerNet:streamChunk', {
            signalId,
            event: 'error',
            message: watchdogMessage,
          })
          sendStreamFrame('error', { message: watchdogMessage })
          return { ok: false, kind: 'network', message: watchdogMessage }
        }
        event.sender.send('providerNet:streamChunk', { signalId, event: 'canceled' })
        sendStreamFrame('canceled')
        streamState.status = 'canceled'
        return { ok: false, kind: 'canceled', message: '请求已取消' }
      }
      event.sender.send('providerNet:streamChunk', { signalId, event: 'error', message: e.message })
      sendStreamFrame('error', { message: e.message })
      streamState.status = 'error'
      return { ok: false, kind: 'network', message: e.message || '网络错误' }
    } finally {
      watchdog.clear()
      activeStreams.delete(signalId)
      slot.release()
      if (streamRegistry.has(signalId)) {
        const stream = streamRegistry.get(signalId)
        stream.lastHeartbeatAt = Date.now()
        if (stream.status === 'connecting' || stream.status === 'streaming') stream.status = 'orphaned'
      }
    }
  })

  ipc.handle('providerNet:abort', async function(event, signalId) {
    const controller = activeStreams.get(signalId)
    // Queued streams are not in streamRegistry yet; scan the scheduler queues
    // directly so cancellation never depends on fetch having started.
    const schedulerCanceled = providerNetScheduler.cancel(signalId)
    if (controller) controller.abort()
    return { aborted: Boolean(controller) || schedulerCanceled }
  })
}

function registerApiHandlers(ipc = ipcMain) {
  registerProviderNetHandlers(ipc)
  // Legacy bridge kept for old callers. It delegates to the shared protocol
  // layer so no second URL/header rule can drift from aiService.
  ipc.handle('api:fetchModels', async function(event, baseUrl, apiKey) {
    var url = ''
    try {
      url = buildProviderModelsUrl({ baseUrl: baseUrl, providerType: 'openai-compatible' })
    } catch (e) {
      throw new Error(e.message || '接口地址必须是有效的 http 或 https URL')
    }
    var response = await fetch(url, {
      method: 'GET',
      headers: buildProviderHeaders('openai-compatible', apiKey),
      signal: AbortSignal.timeout(30000),
    })
    var body = await readBody(response)
    if (!response.ok) throw new Error(httpErrorMessage(response.status, parseErrorBody(body)))
    try {
      var data = JSON.parse(body.toString('utf8'))
      var models = (Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : []))
        .map(function(m) { return typeof m === 'string' ? m : (m && (m.id || m.name)) })
        .filter(Boolean)
      if (!models.length) throw new Error('供应商未返回可用模型列表')
      return models
    } catch (e) {
      if (e && e.message === '供应商未返回可用模型列表') throw e
      throw new Error('模型列表响应解析失败：' + body.toString('utf8').slice(0, 200))
    }
  })
}

module.exports = {
  registerApiHandlers,
  __testHooks: {
    createProviderNetWatchdog,
    createProviderStreamActivityClassifier,
  },
}
