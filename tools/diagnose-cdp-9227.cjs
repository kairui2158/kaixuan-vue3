'use strict'

async function main() {
  const versionResp = await fetch('http://127.0.0.1:9227/json/version')
  const version = await versionResp.json()
  console.log('browser:', version.Browser)

  const response = await fetch('http://127.0.0.1:9227/json/list')
  if (!response.ok) throw new Error('HTTP ' + response.status)
  const targets = await response.json()
  const page = targets.find(t => t.type === 'page' && t.url.includes('dist-renderer/index.html'))
  if (!page) throw new Error('no electron page: ' + JSON.stringify(targets))
  console.log('target:', page.id, page.url)

  const browserWs = new WebSocket(version.webSocketDebuggerUrl)
  let nextId = 0
  const pending = new Map()

  browserWs.addEventListener('message', event => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id)
      clearTimeout(timer)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  })

  function browserRequest(method, params, timeout) {
    const id = ++nextId
    browserWs.send(JSON.stringify({ id, method, params: params || {} }))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout: ' + method)) }, timeout || 15000)
      pending.set(id, { resolve, reject, timer })
    })
  }

  function sessionRequest(sessionId, method, params, timeout) {
    const id = ++nextId
    const msg = { id, sessionId, method, params: params || {} }
    browserWs.send(JSON.stringify(msg))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout: ' + method)) }, timeout || 15000)
      pending.set(id, { resolve, reject, timer })
    })
  }

  await new Promise((resolve, reject) => {
    browserWs.addEventListener('open', resolve, { once: true })
    browserWs.addEventListener('error', () => reject(new Error('WebSocket connect failed')), { once: true })
  })
  console.log('browser websocket: open')

  const attachResult = await browserRequest('Target.attachToTarget', {
    targetId: page.id,
    flatten: true
  }, 10000)
  const sessionId = attachResult.sessionId
  console.log('attached, sessionId:', sessionId)

  // Runtime.evaluate must be sent as a SESSION command (sessionId at message level, not in params)
  const evalResult = await sessionRequest(sessionId, 'Runtime.evaluate', {
    expression: 'JSON.stringify({ok: true, title: document.title, readyState: document.readyState})',
    returnByValue: true,
    awaitPromise: true
  }, 30000)
  console.log('evaluate:', JSON.stringify(evalResult))

  browserWs.close()
}

main().then(() => process.exit(0)).catch(error => {
  console.error(String(error && error.stack ? error.stack : error))
  process.exit(1)
})
