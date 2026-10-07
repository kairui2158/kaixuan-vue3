import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const PROFILE = path.join(ROOT, '_data', 'electron-provider-fetch-diagnostic-profile')
const CDP_PORT = 9292

const providerPath = path.join(ROOT, '_data', 'api-direct-write-live-v3-profile', 'documents-data', 'wa_providers.json')
const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8')).providers[0]
const payloadPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, '_data', 'api-direct-write-live-v3-profile', 'documents-data', 'run-trace', 'outline', 'run-trace-outline-20261007-151627', 'payloads', '001-request.json')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

fs.rmSync(PROFILE, { recursive: true, force: true })
const child = spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
    SHENYI_ALLOW_TEST_ISOLATION: '1',
  },
  windowsHide: false,
})
child.stdout.on('data', data => console.log(`[electron stdout] ${data}`))
child.stderr.on('data', data => console.error(`[electron stderr] ${data}`))

try {
  let browser = null
  for (let attempt = 0; attempt < 60 && !browser; attempt++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    } catch {
      await sleep(500)
    }
  }
  if (!browser) throw new Error('CDP not reachable')
  let page = null
  for (let attempt = 0; attempt < 30 && !page; attempt++) {
    page = browser.contexts()[0]?.pages()?.[0] || null
    if (!page) await sleep(500)
  }
  if (!page) throw new Error('renderer page not reachable')
  await page.waitForSelector('#app', { timeout: 20000 })

  const requestMessages = JSON.parse(fs.readFileSync(payloadPath, 'utf8'))
  const result = await page.evaluate(async ({ provider, requestMessages }) => {
    const base = String(provider.baseUrl).replace(/\/+$/, '')
    const headers = {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    }
    async function call(stream) {
      const body = stream || requestMessages
        ? {
            model: provider.selectedModel,
            messages: requestMessages,
            max_tokens: 128000,
            stream,
            tools: [{
              type: 'function',
              function: {
                name: 'editor.write',
                description: 'write',
                parameters: { type: 'object', properties: {} },
              },
            }],
          }
        : null
      try {
        const response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
        let text = ''
        if (stream) {
          const reader = response.body.getReader()
          while (true) {
            const chunk = await reader.read()
            if (chunk.done) break
            text += new TextDecoder().decode(chunk.value)
          }
        } else {
          text = await response.text()
        }
        return { ok: true, status: response.status, text: text.slice(0, 500) }
      } catch (error) {
        return {
          ok: false,
          name: error?.name,
          message: error?.message,
          causeName: error?.cause?.name,
          causeMessage: error?.cause?.message,
          causeCode: error?.cause?.code,
          stack: String(error?.stack || '').slice(0, 1000),
        }
      }
    }
    return { exactPayload: await call(true) }
  }, { provider, requestMessages })
  console.log(JSON.stringify(result, null, 2))
} finally {
  child.kill()
}
