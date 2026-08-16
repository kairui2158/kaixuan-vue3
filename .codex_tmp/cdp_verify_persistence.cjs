const WebSocket = require('ws')
const http = require('http')
const fs = require('fs')

const OUT = '_audit/e2e/pipeline_skill_mode_persistence.json'

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
        // Phase 1: read current modes
        const r1 = await ev("JSON.stringify((() => { const m = {}; for (let i = 0; i < 5; i++) { const el = document.getElementById('pl-s' + (i+1) + '-mode'); m[i] = el ? el.value : 'missing'; } return m; })())")
        log.push({ phase: 'read_initial', modes: JSON.parse(r1.result.value) })
        // Phase 2: change step 1 mode from compose -> chain, step 5 from compose -> chain
        await ev("document.getElementById('pl-s1-mode').value = 'chain'; document.getElementById('pl-s1-mode').dispatchEvent(new Event('change'))")
        await ev("document.getElementById('pl-s5-mode').value = 'chain'; document.getElementById('pl-s5-mode').dispatchEvent(new Event('change'))")
        await ev("new Promise(r => setTimeout(r, 300))", true)
        log.push({ phase: 'changed_modes', action: 's1->chain, s5->chain' })
        // Phase 3: read after change
        const r2 = await ev("JSON.stringify((() => { const m = {}; for (let i = 0; i < 5; i++) { const el = document.getElementById('pl-s' + (i+1) + '-mode'); m[i] = el ? el.value : 'missing'; } return m; })())")
        log.push({ phase: 'read_after_change', modes: JSON.parse(r2.result.value) })
        // Phase 4: read from storage (electronAPI.storageRead)
        const r3 = await ev("JSON.stringify(window.electronAPI.storageRead('pipeline_step_config'))")
        log.push({ phase: 'storage_after_change', storage: JSON.parse(r3.result.value) })
        // Phase 5: close and reopen pipeline panel
        await ev("document.querySelector('#btn-close-pl')?.click()")
        await ev("new Promise(r => setTimeout(r, 300))", true)
        log.push({ phase: 'closed_panel' })
        await ev("document.querySelector('#btn-pipeline')?.click()")
        await ev("new Promise(r => setTimeout(r, 500))", true)
        log.push({ phase: 'reopened_panel' })
        // Phase 6: read modes after reopen
        const r4 = await ev("JSON.stringify((() => { const m = {}; for (let i = 0; i < 5; i++) { const el = document.getElementById('pl-s' + (i+1) + '-mode'); m[i] = el ? el.value : 'missing'; } return m; })())")
        log.push({ phase: 'read_after_reopen', modes: JSON.parse(r4.result.value) })
        // Phase 7: check agent values saved
        const r5 = await ev("JSON.stringify((() => { const a = {}; for (let i = 0; i < 5; i++) { const el = document.getElementById('pl-s' + (i+1) + '-agent'); a[i] = el ? el.value : 'missing'; } return a; })())")
        log.push({ phase: 'agent_values_after_reopen', agents: JSON.parse(r5.result.value) })
        const result = { log, capturedAt: new Date().toISOString() }
        fs.mkdirSync('_audit/e2e', { recursive: true })
        fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8')
        console.log('PERSIST_JSON=' + OUT)
        console.log('PERSIST_INITIAL=' + JSON.stringify(log[0].modes))
        console.log('PERSIST_AFTER_CHANGE=' + JSON.stringify(log[2].modes))
        console.log('PERSIST_AFTER_REOPEN=' + JSON.stringify(log[6].modes))
        ws.close()
      })()
    })
    ws.on('error', (e) => { console.error('WS_ERROR=' + e.message); process.exit(1) })
  })
})
