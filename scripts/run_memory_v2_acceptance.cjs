const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const http = require('http')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mockScript = path.join(root, '_audit/tmp/memory_v2_request_mock_server.cjs')
const acceptanceScript = path.join(root, '_audit/tmp/run_memory_v2_request_acceptance.cjs')
const evidencePath = path.join(root, '_audit/tmp/memory-v2-request-evidence.json')

let mockProcess = null
let failed = false

function stopMock() {
  if (!mockProcess || mockProcess.killed) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(mockProcess.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    mockProcess.kill('SIGTERM')
  }
  mockProcess = null
}

function waitForMock(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const check = () => {
      const request = http.get(url, response => {
        response.resume()
        if (response.statusCode === 200) {
          resolve()
          return
        }
        retry()
      })
      request.on('error', retry)
      function retry() {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Mock server not ready at ${url}`))
          return
        }
        setTimeout(check, 250)
      }
    }
    check()
  })
}

function runAcceptance() {
  const result = spawnSync(process.execPath, [acceptanceScript], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  })
  return result
}

function readEvidence() {
  if (!fs.existsSync(evidencePath)) return null
  return JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
}

async function main() {
  mockProcess = spawn(process.execPath, [mockScript], {
    cwd: root,
    stdio: 'ignore',
    env: process.env
  })
  await waitForMock('http://127.0.0.1:18080/requests', 10000)

  const result = runAcceptance()
  const evidence = readEvidence()
  const allStepsOk = evidence?.allStepsOk === true
  if (result.error || result.status !== 0 || !allStepsOk) {
    failed = true
    console.error(`Memory V2 request acceptance failed: exit=${result.status}, allStepsOk=${allStepsOk}`)
    process.exitCode = 1
  } else {
    console.log(`Memory V2 request acceptance passed: exit=${result.status}, allStepsOk=${allStepsOk}`)
  }
}

main().catch(error => {
  failed = true
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  stopMock()
  if (failed) {
    console.error('Acceptance failed. Evidence retained in _audit/tmp/memory-v2-request-evidence.json')
  }
})
