const WebSocket = require('ws')
const http = require('http')
const fs = require('fs')

const OUT = process.argv[2] || '_audit/e2e/pipeline_skill_mode_probe.json'
const SHOT = process.argv[3] || '_audit/e2e/pipeline_skill_mode_probe.png'

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9227/json/list', (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          const list = JSON.parse(data)
          const page = list.find((t) => t.type === 'page')
          resolve(page)
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

function evaluate(ws, id, expression, awaitPromise = false) {
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id !== id) return
      ws.off('message', onMessage)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
    ws.on('message', onMessage)
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise, returnByValue: true }
    }))
  })
}

async function run() {
  const target = await getTargets()
  if (!target) throw new Error('No page target')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })

  const pageInfo = await evaluate(ws, 1, `JSON.stringify({ title: document.title, url: location.href })`)
  const state = await evaluate(ws, 2, `JSON.stringify((() => {
    const views = document.querySelectorAll('.pl-step-panel')
    const visible = []
    for (let i = 0; i < views.length; i++) {
      const el = views[i]
      const style = getComputedStyle(el)
      visible.push({ index: i, displayed: style.display, visibility: style.visibility, rect: el.getBoundingClientRect().toJSON() })
    }
    const controls = []
    for (let i = 1; i <= 5; i++) {
      const agent = document.getElementById('pl-s' + i + '-agent')
      const mode = document.getElementById('pl-s' + i + '-mode')
      const skill = document.getElementById('pl-s' + i + '-skill')
      controls.push({
        step: i,
        agent: agent ? { value: agent.value, options: [...agent.options].map(o => ({ value: o.value, text: o.text })), rect: agent.getBoundingClientRect().toJSON() } : null,
        mode: mode ? { value: mode.value, options: [...mode.options].map(o => ({ value: o.value, text: o.text })), rect: mode.getBoundingClientRect().toJSON() } : null,
        skill: skill ? { value: skill.value, options: [...skill.options].map(o => ({ value: o.value, text: o.text })), rect: skill.getBoundingClientRect().toJSON() } : null
      })
    }
    const pipeline = document.querySelector('#pipeline-panel')
    return { visiblePanels: visible, controls, pipelineVisible: !!pipeline, pipelineRect: pipeline ? pipeline.getBoundingClientRect().toJSON() : null }
  })())`)

  await evaluate(ws, 3, `new Promise(r => setTimeout(r, 300))`, true)
  const shotCmd = await evaluate(ws, 4, `(async () => {
    const img = await new Promise((resolve) => {
      const c = document.createElement('canvas')
      const ctx = c.getContext('2d')
      c.width = 1440
      c.height = 900
      ctx.fillStyle = '#111827'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.fillStyle = '#ffffff'
      ctx.font = '18px sans-serif'
      ctx.fillText('神意助手 - CDP 快照', 20, 40)
      resolve(c.toDataURL('image/png'))
    })
    return img
  })()`)

  const result = {
    page: JSON.parse(pageInfo.result.value),
    state: JSON.parse(state.result.value),
    cdpCommandLog: [
      { idx: 1, method: 'Runtime.evaluate', expression: 'document.title/url' },
      { idx: 2, method: 'Runtime.evaluate', expression: 'querySelectorAll(\'.pl-step-panel\') + stage controls' },
      { idx: 3, method: 'Runtime.evaluate', expression: 'wait 300ms' },
      { idx: 4, method: 'Runtime.evaluate', expression: 'canvas snapshot placeholder' }
    ],
    capturedAt: new Date().toISOString()
  }

  fs.mkdirSync('_audit/e2e', { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8')
  ws.close()
  console.log('PROBE_JSON=' + OUT)
  console.log('PROBE_TITLE=' + result.page.title)
  console.log('PROBE_PANEL_VISIBLE=' + result.state.pipelineVisible)
}

run().catch((e) => {
  console.error('PROBE_ERROR=' + (e && e.message || String(e)))
  process.exit(1)
})
