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
        const r = await ev("JSON.stringify((() => { const ids = []; document.querySelectorAll('button[id]').forEach(b => ids.push({ id: b.id, text: b.textContent.trim().slice(0, 40), display: getComputedStyle(b).display, visibility: getComputedStyle(b).visibility, rect: b.getBoundingClientRect() })); return ids; })())")
        const buttons = JSON.parse(r.result.value)
        console.log('ALL_BUTTONS=' + JSON.stringify(buttons.filter(b => b.display !== 'none' && b.visibility !== 'hidden')))
        // 找 pipeline 入口: 包含 "流水线" 或 "pipeline" 的按钮
        const pipelineBtn = buttons.find(b => b.text.includes('流水线') || b.id.toLowerCase().includes('pipeline'))
        if (pipelineBtn) {
          console.log('PIPELINE_BTN=' + JSON.stringify(pipelineBtn))
        } else {
          console.log('PIPELINE_BTN=NOT_FOUND')
          // 输出所有可见按钮文本
          console.log('VISIBLE_BUTTONS=' + JSON.stringify(buttons.map(b => b.text)))
        }
        ws.close()
      })()
    })
    ws.on('error', (e) => { console.error('WS_ERROR=' + e.message); process.exit(1) })
  })
})
