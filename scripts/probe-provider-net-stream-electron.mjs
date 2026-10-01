import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_PROBE_CDP_PORT || 9322)
const PROFILE = path.join(ROOT, '_data', 'provider-net-stream-probe-profile')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function startMockServer() {
  const server = http.createServer((request, response) => {
    const mode = request.url.endsWith('/abort') ? 'abort' : request.url.endsWith('/stall') ? 'stall' : 'normal'
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no',
    })
    response.flushHeaders()
    const first = `data: ${JSON.stringify({ choices: [{ delta: { content: '第一段终稿内容。' } }] })}\n\n`
    response.write(first)
    response.flush?.()
    if (mode === 'normal') {
      response.write('data: [DONE]\n\n')
      response.end()
      return
    }
    if (mode === 'abort') {
      const keepAlive = setInterval(() => {
        if (response.destroyed) {
          clearInterval(keepAlive)
          return
        }
        response.write('')
      }, 60_000)
      response.on('close', () => clearInterval(keepAlive))
      return
    }
    setTimeout(() => {
      response.write('data: [DONE]\n\n')
      response.end()
    }, 3000)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { port: server.address().port, close: () => new Promise(done => server.close(() => done())) }
}

async function waitForCdp() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(500)
  }
  return false
}

async function main() {
  const mock = await startMockServer()
  const child = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: false,
  })
  child.stdout.on('data', chunk => process.stdout.write(`[ELECTRON] ${chunk}`))
  child.stderr.on('data', chunk => process.stderr.write(`[ELECTRON STDERR] ${chunk}`))
  console.log(`[PROBE] electron pid=${child.pid} mockPort=${mock.port}`)

  let browser = null
  try {
    if (!(await waitForCdp())) throw new Error('CDP not reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
      if (!page) await sleep(500)
    }
    if (!page) throw new Error('renderer page not reachable')
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1000)

    const events = await page.evaluate(async ({ baseUrl }) => {
      const received = []
      const off = window.electronAPI.onProviderNetStreamChunk(payload => {
        received.push({
          event: payload.event,
          textLength: typeof payload.text === 'string' ? payload.text.length : null,
          text: typeof payload.text === 'string' ? payload.text : null,
          message: payload.message || null,
        })
      })
      const streamPromise = window.electronAPI.providerNetStream({
        url: `${baseUrl}/v1/chat/completions/abort`,
        headers: { authorization: 'sk-probe' },
        body: { model: 'probe-model', stream: true },
        signalId: 'probe-signal',
      })
      await new Promise(resolve => setTimeout(resolve, 500))
      const abortStartedAt = Date.now()
      const abortResult = await window.electronAPI.providerNetAbort('probe-signal')
      const invokeResult = await streamPromise
      return { received, invokeResult, abortResult, abortWaitMs: Date.now() - abortStartedAt }
    }, { baseUrl: `http://127.0.0.1:${mock.port}` })

    console.log('===== PROVIDER NET STREAM PROBE =====')
    console.log(JSON.stringify(events, null, 2))
    const hasCanceled = events.received.some(item => item.event === 'canceled')
    if (!hasCanceled || events.invokeResult?.ok !== false || events.invokeResult?.kind !== 'canceled' || !events.abortResult?.aborted) {
      throw new Error(`probe failed: canceled=${hasCanceled}, invoke=${JSON.stringify(events.invokeResult)}, abort=${JSON.stringify(events.abortResult)}`)
    }
    if (events.abortWaitMs > 1000) {
      throw new Error(`probe failed: abort wait ${events.abortWaitMs}ms exceeded 1000ms`)
    }
    console.log(`[PROBE] PASS stalled stream canceled by IPC abort in ${events.abortWaitMs}ms`)
  } finally {
    try { if (browser) await browser.close() } catch {}
    try {
      if (child.pid && child.exitCode === null) {
        const { execFileSync } = await import('node:child_process')
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      }
    } catch {}
    await mock.close()
    await sleep(500)
  }
}

main().catch(error => {
  console.error(`[PROBE] FAIL ${error?.stack || error}`)
  process.exitCode = 1
})
