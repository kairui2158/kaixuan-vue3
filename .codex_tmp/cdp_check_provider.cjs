const WebSocket = require('ws')
const http = require('http')

http.get('http://127.0.0.1:9227/json/list', (res) => {
  let d = ''
  res.on('data', (c) => (d += c))
  res.on('end', () => {
    const t = JSON.parse(d).find((x) => x.type === 'page')
    if (!t) { console.error('No page'); process.exit(1) }
    const ws = new WebSocket(t.webSocketDebuggerUrl)
    ws.on('open', () => {
      let nextId = 1
      function ev(exp, awaitP) {
        const id = nextId++
        return new Promise((resolve, reject) => {
          const cb = (raw) => {
            const m = JSON.parse(raw.toString())
            if (m.id !== id) return
            ws.off('message', cb)
            if (m.error) reject(m.error)
            else resolve(m.result)
          }
          ws.on('message', cb)
          ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: exp, awaitPromise: !!awaitP, returnByValue: true } }))
        })
      }
      ;(async () => {
        const r = await ev("JSON.stringify((() => { try { const ps = window.__pinia; if (!ps) return {pinia: 'not found'}; const s = ps._s.get('provider'); if (!s) return {store: 'not found'}; return { providers: s.providers.map(function(p) { return { id: p.id, name: p.name, selectedModel: p.selectedModel, apiKey: p.apiKey ? (String(p.apiKey).slice(0,8) + '...') : 'empty' }; }), gen: s.generateProvider, ver: s.verifyProvider }; } catch(e) { return {error: e.message}; } })())")
        console.log('PROVIDERS=' + r.result.value)
        ws.close()
      })()
    })
    ws.on('error', (e) => { console.error('WS_ERROR=' + e.message); process.exit(1) })
  })
})
