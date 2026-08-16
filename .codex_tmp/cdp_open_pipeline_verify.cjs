const WebSocket = require('ws')
const http = require('http')
const fs = require('fs')

const OUT = '_audit/e2e/pipeline_skill_mode_v2.json'

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
        const log = []
        log.push({ step: 'find_pipeline_btn', action: 'Document.querySelector("#btn-pipeline")' })
        const btnCheck = await ev("document.querySelector('#btn-pipeline') !== null")
        log.push({ step: 'btn_exists', result: btnCheck.result.value })
        if (btnCheck.result.value) {
          log.push({ step: 'click_pipeline_btn', action: 'click()' })
          await ev("document.querySelector('#btn-pipeline').click()")
          await ev("new Promise(r => setTimeout(r, 500))", true)
          log.push({ step: 'clicked_wait', action: 'waited 500ms' })
        }
        const pipelineCheck = await ev("document.querySelector('#pipeline-panel') !== null")
        log.push({ step: 'pipeline_panel_exists', result: pipelineCheck.result.value })
        if (pipelineCheck.result.value) {
          const pipelineVis = await ev("getComputedStyle(document.querySelector('#pipeline-panel')).display !== 'none'")
          log.push({ step: 'pipeline_panel_visible', result: pipelineVis.result.value })
        }
        const controls = await ev("JSON.stringify((() => { const c = []; for (let i = 1; i <= 5; i++) { const agent = document.getElementById('pl-s' + i + '-agent'); const mode = document.getElementById('pl-s' + i + '-mode'); const sbar = document.querySelector('.pl-agent-mode-bar'); c.push({ step: i, agent: agent ? { exists: true, value: agent.value, options: [...agent.options].map(o => o.value) } : null, mode: mode ? { exists: true, value: mode.value, options: [...mode.options].map(o => o.value) } : null, agentBar: sbar ? { exists: true, rect: sbar.getBoundingClientRect() } : null }); } return c; })())")
        log.push({ step: 'controls_scanned', controls: JSON.parse(controls.result.value) })
        const results = { log, capturedAt: new Date().toISOString() }
        fs.mkdirSync('_audit/e2e', { recursive: true })
        fs.writeFileSync(OUT, JSON.stringify(results, null, 2), 'utf8')
        console.log('VERIFY_JSON=' + OUT)
        console.log('PANEL_EXISTS=' + pipelineCheck.result.value)
        console.log('CONTROLS_COUNT=' + (JSON.parse(controls.result.value) || []).length)
        ws.close()
      })()
    })
    ws.on('error', (e) => { console.error('WS_ERROR=' + e.message); process.exit(1) })
  })
})
