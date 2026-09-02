import { spawn, execFileSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = path.join(ROOT, '_data')
const TMP = path.join(ROOT, '_audit', 'tmp')
const BACKUP = path.join(TMP, 'outline-continuation-backup')
const PROFILE = path.join(TMP, 'outline-continuation-profile')
const MOCK_PORT = 8793
const CDP_PORT = 9229
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const PROJ = `probe-outline-${Date.now()}`

const steps = []
let allStepsOk = true
const runtimeErrors = []
const backupFiles = []

function record(name, ok, detail) {
  steps.push({ name, ok: Boolean(ok), detail: String(detail) })
  if (!ok) allStepsOk = false
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} :: ${String(detail).slice(0, 300)}`)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Mock provider: truncated first response, complete continuation ──
const requestLog = []

function sseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  })
}

async function streamChunks(res, chunks, finishReason, usage) {
  sseHeaders(res)
  for (const c of chunks) {
    res.write(`data: ${JSON.stringify({ id: 'chatcmpl-ow', object: 'chat.completion.chunk', created: Date.now(), model: 'probe-trunc-model', choices: [{ index: 0, delta: { content: c }, finish_reason: null }] })}\n\n`)
    await sleep(30)
  }
  res.write(`data: ${JSON.stringify({ id: 'chatcmpl-ow', object: 'chat.completion.chunk', created: Date.now(), model: 'probe-trunc-model', choices: [{ index: 0, delta: {}, finish_reason: finishReason }], usage })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}

const mockServer = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    })
    res.end()
    return
  }
  let body = ''
  req.on('data', d => { body += d })
  req.on('end', async () => {
    let payload = {}
    try { payload = JSON.parse(body || '{}') } catch { payload = {} }
    const messages = payload.messages || []
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    const isContinue = Boolean(lastUser && String(lastUser.content || '').includes('请从上次输出中断的位置继续生成'))
    requestLog.push({ url: req.url, isContinue, at: new Date().toISOString() })
    if (isContinue) {
      await streamChunks(res, ['续写内容：', '后续大纲段落已完成。'], 'stop', { prompt_tokens: 5, completion_tokens: 12 })
    } else {
      await streamChunks(res, ['第一幕大纲草稿，', '此处截断。'], 'max_tokens', { prompt_tokens: 5, completion_tokens: 21 })
    }
  })
})

// ── Data backup / seed / restore ────────────────────────────────────
const BACKUP_PATTERNS = [/^wa_providers\.json(\.bak)?$/, /^wa_lastProjectId\.json(\.bak)?$/]

function backupData() {
  fs.rmSync(BACKUP, { recursive: true, force: true })
  fs.mkdirSync(BACKUP, { recursive: true })
  for (const f of fs.readdirSync(DATA)) {
    if (BACKUP_PATTERNS.some(re => re.test(f))) {
      fs.copyFileSync(path.join(DATA, f), path.join(BACKUP, f))
      backupFiles.push(f)
    }
  }
}

function seedProbeData() {
  const providers = {
    providers: [{
      id: 'probe-local',
      name: '大纲续写探针供应商',
      baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`,
      apiKey: 'probe-key',
      models: ['probe-trunc-model'],
      selectedModel: 'probe-trunc-model',
      temperature: 0.7,
      maxTokens: 16384,
      purpose: ['generate'],
      streamMode: true,
      systemPrompt: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }],
    generateProvider: 'probe-local',
    verifyProvider: null,
    detectProvider: null
  }
  fs.writeFileSync(path.join(DATA, 'wa_providers.json'), JSON.stringify(providers, null, 2), 'utf8')
  fs.writeFileSync(path.join(DATA, `wa_project_${PROJ}.json`), JSON.stringify({
    name: '大纲续写探针项目',
    outlineText: '第一幕：主角登场。',
    outlineLocked: false,
    outlineChat: [],
    createdAt: Date.now()
  }, null, 2), 'utf8')
  fs.writeFileSync(path.join(DATA, 'wa_lastProjectId.json'), JSON.stringify(PROJ), 'utf8')
}

function probeFiles() {
  return fs.readdirSync(DATA).filter(f => f.includes(PROJ) || f === 'wa_providers.json')
}

function listSnapshots() {
  return fs.readdirSync(DATA).filter(f => f.startsWith(`wa_continuation_${PROJ}_`))
}

function restoreData() {
  for (const f of backupFiles) {
    try { fs.copyFileSync(path.join(BACKUP, f), path.join(DATA, f)) } catch (e) { runtimeErrors.push('restore ' + f + ': ' + e.message) }
  }
  for (const f of probeFiles()) {
    if (backupFiles.includes(f)) continue
    try { fs.rmSync(path.join(DATA, f), { force: true }) } catch (e) { runtimeErrors.push('clean ' + f + ': ' + e.message) }
  }
}

// ── Electron process control ────────────────────────────────────────
let electronProc = null

function startElectron() {
  electronProc = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  electronProc.stdout.on('data', d => {
    const s = String(d)
    if (/Uncaught|unhandledRejection/i.test(s)) runtimeErrors.push(s.slice(0, 400))
  })
  electronProc.stderr.on('data', d => {
    const s = String(d)
    if (/Uncaught|unhandledRejection|EADDRINUSE/i.test(s)) runtimeErrors.push(s.slice(0, 400))
  })
}

async function waitForCdp(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (res.ok) return true
    } catch { /* not up yet */ }
    await sleep(500)
  }
  return false
}

function killElectron() {
  if (electronProc && electronProc.pid) {
    try { execFileSync('taskkill', ['/PID', String(electronProc.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* already dead */ }
    electronProc = null
  }
}

let browser = null
let page = null

async function captureFailureEvidence(tag) {
  try {
    if (!page) return
    const evidencePath = path.join(TMP, `outline-continuation-${tag}.png`)
    await page.screenshot({ path: evidencePath, fullPage: true })
    const bubbleTexts = await page.locator('.ow-msg .ow-msg-bubble').allTextContents()
    const actionTexts = await page.locator('.ow-msg-actions').allTextContents()
    const evidence = { tag, url: page.url(), bubbleTexts, actionTexts, requestLog }
    fs.writeFileSync(path.join(TMP, `outline-continuation-${tag}.json`), JSON.stringify(evidence, null, 2), 'utf8')
    console.log(`[EVIDENCE] ${tag} bubbles=${JSON.stringify(bubbleTexts).slice(0, 400)} requests=${requestLog.length}`)
  } catch (e) {
    runtimeErrors.push(`capture ${tag}: ${e?.message || String(e)}`)
  }
}

async function connectPage() {
  const { chromium } = await import('playwright')
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  for (let i = 0; i < 24; i++) {
    const pages = browser.contexts()[0]?.pages() || []
    if (pages.length) { page = pages[0]; return }
    await sleep(500)
  }
  throw new Error('CDP connected but no page appeared')
}

function listenConsole(target) {
  target.on('console', msg => {
    const text = msg.text()
    if (text.includes('[CONTINUATION]')) console.log(`[CONSOLE] ${text}`)
  })
}

async function openOutlineChat() {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-workspace', { state: 'visible', timeout: 15000 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { state: 'visible', timeout: 10000 })
}

function continueButton() {
  return page.locator('.ow-msg.assistant .ow-msg-actions .msg-btn', { hasText: '续生成' }).last()
}

async function lastAssistantText() {
  return await page.locator('.ow-msg.assistant .ow-msg-bubble').last().textContent()
}

// ── Main verification flow ──────────────────────────────────────────
async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true })
  await new Promise(r => mockServer.listen(MOCK_PORT, '127.0.0.1', r))
  backupData()
  seedProbeData()

  // Phase 1: send in outline chat, truncation button + snapshot
  startElectron()
  const cdpUp = await waitForCdp(30000)
  record('cdp-up', cdpUp, `port=${CDP_PORT}`)
  if (!cdpUp) throw new Error('CDP did not open')
  await connectPage()
  listenConsole(page)
  await page.waitForSelector('#user-input', { timeout: 25000 })
  await openOutlineChat()

  await page.fill('#ow-chat-input', '帮我扩写第一幕大纲')
  await page.click('#btn-ow-send')
  const contBtn = continueButton()
  try {
    await contBtn.waitFor({ state: 'visible', timeout: 25000 })
  } catch (e) {
    await captureFailureEvidence('button-wait')
    throw e
  }
  const firstContent = await lastAssistantText()
  record('truncated-button', (firstContent || '').includes('此处截断。'), `content=${firstContent}`)

  const snapFiles = listSnapshots()
  let snap = null
  if (snapFiles.length) snap = JSON.parse(fs.readFileSync(path.join(DATA, snapFiles[0]), 'utf8'))
  record('snapshot-written', Boolean(snap) && snap.status === 'possibly_truncated' && snap.finishReason === 'length' && snap.providerId === 'probe-local' && snap.workspace === 'outline', `files=${snapFiles.length} status=${snap?.status} reason=${snap?.finishReason} ws=${snap?.workspace}`)
  const projectRaw = fs.readFileSync(path.join(DATA, `wa_project_${PROJ}.json`), 'utf8')
  record('project-json-continuation', projectRaw.includes('possibly_truncated') && projectRaw.includes('此处截断。'), 'project json persisted continuation + partial text')

  // Phase 2: restart, button must come back
  killElectron()
  await sleep(2000)
  startElectron()
  const cdpUp2 = await waitForCdp(30000)
  record('restart-cdp-up', cdpUp2, `port=${CDP_PORT}`)
  if (!cdpUp2) throw new Error('CDP did not reopen after restart')
  browser = null
  page = null
  await connectPage()
  listenConsole(page)
  await page.waitForSelector('#user-input', { timeout: 25000 })
  await sleep(1200)
  await openOutlineChat()
  const btnAfterRestart = continueButton()
  let restartVisible = false
  try { await btnAfterRestart.waitFor({ state: 'visible', timeout: 20000 }); restartVisible = true } catch { restartVisible = false }
  record('restart-restore', restartVisible && listSnapshots().length >= 1, `btnVisible=${restartVisible} snapshotFiles=${listSnapshots().length}`)

  // Phase 3: click continue, merged text, snapshot removed
  await btnAfterRestart.click()
  try { await btnAfterRestart.waitFor({ state: 'detached', timeout: 30000 }) } catch { /* verified below */ }
  await sleep(800)
  const merged = await lastAssistantText()
  const mergedOk = (merged || '').includes('第一幕大纲草稿，') && (merged || '').includes('此处截断。') && (merged || '').includes('续写内容：') && (merged || '').includes('后续大纲段落已完成。')
  const projectRawAfter = fs.readFileSync(path.join(DATA, `wa_project_${PROJ}.json`), 'utf8')
  record('continue-complete', mergedOk && listSnapshots().length === 0 && projectRawAfter.includes('后续大纲段落已完成。'), `merged=${mergedOk} snapshotsLeft=${listSnapshots().length} projectSaved=${projectRawAfter.includes('后续大纲段落已完成。')}`)
  record('api-call-count', requestLog.length === 2 && requestLog.some(r => r.isContinue) && requestLog.some(r => !r.isContinue), `requests=${requestLog.length} log=${JSON.stringify(requestLog)}`)

  const outcomeOk = allStepsOk
  fs.writeFileSync(path.join(TMP, 'outline-continuation-realops-result.json'), JSON.stringify({ allStepsOk: outcomeOk, runtimeErrors, steps, requestLog, finishedAt: new Date().toISOString() }, null, 2))
  console.log(`RESULT: ${outcomeOk && runtimeErrors.length === 0 ? 'PASS' : 'FAIL'} runtimeErrors=${runtimeErrors.length}`)
  process.exit(outcomeOk && runtimeErrors.length === 0 ? 0 : 1)
}

main().catch(err => {
  runtimeErrors.push('fatal: ' + (err?.stack || err?.message || String(err)))
  record('fatal', false, err?.message || String(err))
  try {
    fs.writeFileSync(path.join(TMP, 'outline-continuation-realops-result.json'), JSON.stringify({ allStepsOk: false, runtimeErrors, steps, requestLog }, null, 2))
  } catch { /* best effort */ }
  process.exit(1)
}).finally(() => {
  try { killElectron() } catch { /* already dead */ }
  try { if (browser) { browser.close().catch(() => {}) } } catch { /* best effort */ }
  try { restoreData() } catch (e) { runtimeErrors.push('finally restore: ' + e.message) }
  try { mockServer.close() } catch { /* best effort */ }
})
