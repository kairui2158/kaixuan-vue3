const assert = require('node:assert/strict')
const { Worker } = require('node:worker_threads')
const path = require('node:path')

const workerPath = path.join(__dirname, '..', '..', 'electron', 'ipc', 'skill-script-worker.js')

function run(script, payload) {
  return new Promise((resolve, reject) => {
    const child = new Worker(workerPath)
    const id = 'test'
    const timer = setTimeout(() => {
      child.terminate()
      reject(new Error('worker timeout'))
    }, 5000)
    child.on('message', message => {
      if (message.id !== id) return
      clearTimeout(timer)
      child.terminate()
      resolve(message)
    })
    child.on('error', reject)
    child.postMessage({ id, script, payload })
  })
}

// Electron utilityProcess wraps incoming messages as { data: request }, while
// Node worker_threads emits raw values. Cover both so a Node-only test cannot
// mask a broken Electron bridge.
async function runElectronEnvelope(script, payload) {
  return await new Promise((resolve, reject) => {
    const child = new Worker(workerPath)
    const id = 'electron-envelope'
    const timer = setTimeout(() => {
      child.terminate()
      reject(new Error('electron envelope worker timeout'))
    }, 5000)
    child.on('message', message => {
      if (message.id !== id) return
      clearTimeout(timer)
      child.terminate()
      resolve(message)
    })
    child.on('error', reject)
    child.postMessage({ data: { id, script, payload } })
  })
}

async function main() {
  const script = [
    "module.exports = {}",
    "console.error('diagnostic line')",
    "stdout.write(JSON.stringify({ output: 'structured result', valid: true }))",
    "console.log('ignored diagnostics')"
  ].join('\n')

  const response = await run(script, { hook: 'postProcess', payload: 'text' })
  assert.equal(response.ok, true)
  const result = response.result
  assert.equal(result.stdout, '{"output":"structured result","valid":true}')
  assert.equal(result.stderr, 'diagnostic line\n')
  assert.equal(result.exitCode, 0)
  assert.equal(result.consumedStructuredOutput, true)
  assert.deepEqual(result.results.postProcess, { output: 'structured result', valid: true })

  const legacy = await run("module.exports = { postProcess: function(text) { return { output: text + '-legacy' } } }", {
    hook: 'postProcess',
    payload: 'text'
  })
  assert.equal(legacy.ok, true)
  assert.equal(legacy.result.results.postProcess.output, 'text-legacy')
  assert.equal(legacy.result.consumedStructuredOutput, undefined)

  const failed = await run("module.exports = {}\nunknown_global()", { hook: 'preProcess', payload: 'text' })
  assert.equal(failed.ok, false)
  assert.equal(failed.code, 'script-failed')
  assert.match(failed.message, /unknown_global/)

  const envelope = await runElectronEnvelope("module.exports = { preProcess: function(input) { return { input: 'envelope:' + input } } }", {
    hook: 'preProcess',
    payload: 'raw'
  })
  assert.equal(envelope.ok, true)
  assert.equal(envelope.result.results.preProcess.input, 'envelope:raw')
}

main().then(() => {
  console.log('PASS skill-script-worker protocol')
  process.exit(0)
}, error => {
  console.error(error)
  process.exit(1)
})
