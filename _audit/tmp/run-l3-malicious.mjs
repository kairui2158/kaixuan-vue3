import fs from 'node:fs'

async function currentTarget() {
  const pages = await fetch('http://127.0.0.1:9227/json').then(r => r.json())
  const page = pages.find(item => item.type === 'page' && item.url?.includes('dist-renderer/index.html'))
  if (!page?.webSocketDebuggerUrl) throw new Error('source Electron page target unavailable')
  return page.webSocketDebuggerUrl
}
const source = fs.readFileSync('D:/codex/novel-workshop-vue3/_audit/tmp/l3-malicious-v1.js', 'utf8')
const resultPath = 'D:/codex/novel-workshop-vue3/_audit/tmp/l3-malicious-result-v1.json'

const ws = new WebSocket(await currentTarget())
let nextId = 1

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    const listener = event => {
      const data = JSON.parse(event.data)
      if (data.id !== id) return
      ws.removeEventListener('message', listener)
      if (data.error) reject(new Error(data.error.message))
      else resolve(data.result)
    }
    ws.addEventListener('message', listener)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

ws.onopen = async () => {
  try {
    await call('Runtime.enable')
    const expression = `(async () => ${source})()`
    const evaluation = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description || 'evaluation failed')
    const value = evaluation.result.value
    fs.writeFileSync(resultPath, JSON.stringify(value, null, 2))
    const summary = {
      allStepsOk: value.allStepsOk === true,
      runtimeErrors: value.runtimeErrors || [],
      restored: value.restored === true,
      steps: value.steps.map(step => ({ name: step.name, ok: step.ok, requestCount: step.requestCount }))
    }
    console.log(JSON.stringify(summary, null, 2))
    if (!summary.allStepsOk) process.exitCode = 1
  } catch (error) {
    console.error(String(error?.stack || error))
    process.exitCode = 1
  } finally {
    ws.close()
  }
}

ws.onerror = error => {
  console.error(error)
  process.exitCode = 1
}
