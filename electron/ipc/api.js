const { ipcMain } = require('electron')
const {
  buildProviderModelsUrl,
  buildProviderHeaders,
  httpErrorMessage,
} = require('../../dist-renderer/providerProtocols.cjs')

const activeStreams = new Map()
const PROVIDER_NET_STREAM_IDLE_TIMEOUT_MS = Number(process.env.SHENYI_PROVIDER_NET_STREAM_IDLE_TIMEOUT_MS || 15 * 60_000)
const providerNetLog = process.env.SHENYI_PROVIDER_NET_TRACE === '1'
  ? require('electron-log/main')
  : null

function traceProviderNet(event, message, detail) {
  if (!providerNetLog) return
  try {
    providerNetLog.info('provider-net-trace: ' + event + ' ' + message + ' ' + JSON.stringify(detail || {}))
  } catch (e) {
    providerNetLog.warn('provider-net-trace-failed: ' + (e && e.message))
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
  ipc.handle('providerNet:request', async function(event, request) {
    if (!request || typeof request.url !== 'string') {
      return { ok: false, kind: 'http', message: '请求缺少有效 URL' }
    }
    const controller = new AbortController()
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
    const slowStreamTolerant = request.slowStreamTolerant === true
    const controller = new AbortController()
    activeStreams.set(signalId, controller)
    let idleTimedOut = false
    let idleTimer = null
    const clearIdleTimer = () => {
      if (idleTimer == null) return
      clearTimeout(idleTimer)
      idleTimer = null
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
      traceProviderNet(event.sender.id, 'start', {
        signalId,
        statusCode: response.status,
      })
      const decoder = new TextDecoder()
      const reader = response.body.getReader()
      const armIdleTimer = () => {
        clearIdleTimer()
        idleTimer = setTimeout(() => {
          idleTimedOut = true
          controller.abort()
        }, PROVIDER_NET_STREAM_IDLE_TIMEOUT_MS)
      }
      if (!slowStreamTolerant) armIdleTimer()
      while (true) {
        const chunk = await reader.read()
        if (!slowStreamTolerant) clearIdleTimer()
        if (chunk.done) break
        if (!slowStreamTolerant) armIdleTimer()
        event.sender.send('providerNet:streamChunk', {
          signalId,
          event: 'chunk',
          text: decoder.decode(chunk.value, { stream: true }),
        })
        traceProviderNet(event.sender.id, 'chunk', {
          signalId,
          bytes: chunk.value ? chunk.value.byteLength : 0,
        })
      }
      event.sender.send('providerNet:streamChunk', { signalId, event: 'end' })
      traceProviderNet(event.sender.id, 'end', { signalId })
      return { ok: true, statusCode: response.status }
    } catch (e) {
      traceProviderNet(event.sender.id, 'error', {
        signalId,
        name: e && e.name,
        message: e && e.message,
      })
      if (e.name === 'AbortError') {
        if (idleTimedOut) {
          event.sender.send('providerNet:streamChunk', {
            signalId,
            event: 'error',
            message: '流式响应长时间无输出，已按网络断流处理',
          })
          return { ok: false, kind: 'network', message: '流式响应长时间无输出，已按网络断流处理' }
        }
        event.sender.send('providerNet:streamChunk', { signalId, event: 'canceled' })
        return { ok: false, kind: 'canceled', message: '请求已取消' }
      }
      event.sender.send('providerNet:streamChunk', { signalId, event: 'error', message: e.message })
      return { ok: false, kind: 'network', message: e.message || '网络错误' }
    } finally {
      clearIdleTimer()
      activeStreams.delete(signalId)
    }
  })

  ipc.handle('providerNet:abort', async function(event, signalId) {
    const controller = activeStreams.get(signalId)
    if (controller) controller.abort()
    return { aborted: Boolean(controller) }
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

module.exports = { registerApiHandlers }
