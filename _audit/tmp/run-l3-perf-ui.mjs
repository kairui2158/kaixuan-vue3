import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const version = await fetch('http://127.0.0.1:9227/json/version').then(response => response.json())
if (!version?.Browser) throw new Error('CDP version endpoint unavailable')

const targets = await fetch('http://127.0.0.1:9227/json/list').then(response => response.json())
const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl)
if (!page) throw new Error('CDP page target unavailable')

const expression = fs.readFileSync(path.join(here, 'l3-perf-ui-v1.js'), 'utf8')
const socket = new WebSocket(page.webSocketDebuggerUrl)
const payload = JSON.stringify({
  id: 1,
  method: 'Runtime.evaluate',
  params: {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 350000
  }
})

const result = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error('CDP evaluation timed out'))
    socket.close()
  }, 420000)
  socket.addEventListener('open', () => socket.send(payload))
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    if (message.id !== 1) return
    clearTimeout(timeout)
    if (message.error) {
      reject(new Error(JSON.stringify(message.error)))
      socket.close()
      return
    }
    if (message.result?.exceptionDetails) {
      reject(new Error(JSON.stringify(message.result.exceptionDetails)))
      socket.close()
      return
    }
    resolve(message.result?.result?.value)
    socket.close()
  })
  socket.addEventListener('error', error => {
    clearTimeout(timeout)
    reject(error)
  })
})

const resultPath = path.join(here, 'l3-perf-ui-result-v1.json')
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', 'utf8')
console.log(JSON.stringify(result, null, 2))
