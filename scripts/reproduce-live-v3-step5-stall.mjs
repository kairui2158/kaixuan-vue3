import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { safeStorage } = require('electron')

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9295
const PROFILE = path.join(ROOT, '_data', 'api-direct-write-live-v3-stall-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'api-direct-write-live-v3-stall-exports')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-api-direct-write-live-v3-failure-evidence')
const PROJECT_ID = 'api-direct-write-live-v3-stall'
const MANUSCRIPT_PATH = path.join(ROOT, '_audit', 'verification-api-direct-write-user-visible-2026-09-23', 'test-manuscript.md')
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_STEP_TIMEOUT_MS || 300000)
const PROBE_INTERVAL_MS = 1000

let API_KEY = process.env.SHENYI_LIVE_API_KEY
let BASE_URL = process.env.SHENYI_LIVE_BASE_URL
let MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
const CREDENTIAL_PROFILE_FALLBACKS = [
  path.join(ROOT, '_data', 'api-direct-write-live-v3-credentials'),
  path.join(ROOT, '_data', 'long-document-restructure-phase6-credentials'),
  path.join(ROOT, '_data', 'long-document-restructure-phase6-profile'),
  path.join(ROOT, '_data', 'long-document-operation-phase7-profile'),
  path.join(ROOT, '_data', 'outline-deletion-live-replay-profile'),
]

function restoreLiveCredentialsFromPreviousProfile() {
  for (const credentialProfile of CREDENTIAL_PROFILE_FALLBACKS) {
    const providerPath = path.join(credentialProfile, 'documents-data', 'wa_providers.json')
    if (!fs.existsSync(providerPath)) continue
    const stored = JSON.parse(fs.readFileSync(providerPath, 'utf8'))
    const provider = (stored?.providers || []).find(item =>
      item?.baseUrl === 'https://openapi.cloud-ai.cn/v1'
      && typeof item?.apiKey === 'string'
      && item.apiKey.startsWith('sk-'))
    if (!provider) continue
    process.env.SHENYI_LIVE_API_KEY = provider.apiKey
    process.env.SHENYI_LIVE_BASE_URL = provider.baseUrl
    const candidateModel = String(provider.selectedModel || provider.models?.[0] || '')
    if (candidateModel) process.env.SHENYI_LIVE_MODEL = candidateModel
    return
  }
}

if (!API_KEY || !BASE_URL) restoreLiveCredentialsFromPreviousProfile()
API_KEY = process.env.SHENYI_LIVE_API_KEY || API_KEY
BASE_URL = process.env.SHENYI_LIVE_BASE_URL || BASE_URL
MODEL = process.env.SHENYI_LIVE_MODEL || MODEL
assert(API_KEY && BASE_URL, 'live credentials are available')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists')
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundleNames = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references at least one JS bundle')
  const sourceRoot = path.join(ROOT, 'src')
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collectSources(sourceRoot)
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
}

function startElectron() {
  return spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_PROVIDER_NET_TRACE: '1',
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
    },
    windowsHide: false,
  })
}

async function waitForCdp() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(500)
  }
  return false
}

async function setupProject(page, manuscript) {
  await page.evaluate(async ({ apiKey, baseUrl, model, outline, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'api-direct-write-live-v3-provider',
        name: 'API Direct Write Live V3 Stall',
        baseUrl,
        apiKey,
        models: [model],
        selectedModel: model,
        temperature: 0.1,
        maxTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'api-direct-write-live-v3-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'API Direct Write Live V3 Stall',
      outlineText: outline,
      outlineLocked: false,
      outlineLockedText: '',
      bookWordCount: 0,
      volumesConfirmed: false,
      volumes: [],
      chapters: [],
      outlineRows: [],
      aiNaming: null,
      outlineChat: [],
      chat: [],
      editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { apiKey: API_KEY, baseUrl: BASE_URL, model: MODEL, outline: manuscript, projectId: PROJECT_ID })
}

async function currentRun(page) {
  return await page.evaluate(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    const turn = [...(run.turns || [])].sort((a, b) => b.startedAt - a.startedAt)[0]
    const calls = (run.apiCalls || []).filter(call => !turn || call.turnId === turn.id)
    return {
      runId: run.id,
      runStatus: run.status,
      turnId: turn?.id || null,
      turnStatus: turn?.status || null,
      apiCalls: calls.map(call => ({
        id: call.id,
        status: call.status,
        physicalCalls: (call.physicalCalls || []).map(physical => ({
          id: physical.id || physical.physicalCallId,
          status: physical.status,
          phase: physical.phase,
          heartbeat: physical.heartbeat || null,
          durationMs: physical.durationMs || null,
          error: physical.error || null,
        })),
        toolCalls: (call.toolCalls || []).map(tool => ({
          name: tool.name,
          status: tool.status,
        })),
      })),
      events: (run.events || []).map(event => ({
        type: event.type,
        label: event.label,
        at: event.at,
      })),
      loopHeartbeat: window.__shenyiStallLoopHeartbeat || null,
      now: Date.now(),
    }
  })
}

async function main() {
  assertFreshRendererBuild()
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.rmSync(EXPORT_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const manuscript = fs.readFileSync(MANUSCRIPT_PATH, 'utf8')

  const child = startElectron()
  const childStdout = []
  const childStderr = []
  child.stdout.on('data', data => {
    const text = String(data)
    childStdout.push(text)
    console.log(`[electron stdout] ${text}`)
  })
  child.stderr.on('data', data => {
    const text = String(data)
    childStderr.push(text)
    console.error(`[electron stderr] ${text}`)
  })

  try {
    assert(await waitForCdp(), 'CDP reachable')
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let attempt = 0; attempt < 30 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.[0] || null
      if (!page) await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await setupProject(page, manuscript)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1200)
    await page.evaluate(() => {
      window.__shenyiStallLoopHeartbeat = { startedAt: Date.now(), ticks: 0 }
      setInterval(() => {
        window.__shenyiStallLoopHeartbeat.ticks += 1
        window.__shenyiStallLoopHeartbeat.lastTickAt = Date.now()
      }, 1000)
      document.querySelector('.project-modal-content .btn-close')?.click()
    })
    await sleep(500)
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 15000 })
    await page.locator('#outline-editor').fill(manuscript)
    await sleep(300)
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 15000 })

    const instruction = '整理整篇文章：统一小节编号、清除多余空行、按编号重排，并保持所有正文内容不丢失。'
    await page.locator('#ow-chat-input').fill(instruction)
    await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
    await page.locator('#btn-ow-send').click()

    const probePath = path.join(EVIDENCE_DIR, 'step5-stall-probe.jsonl')
    const diagnostics = []
    let timeout = false
    const startedAt = Date.now()
    while (Date.now() - startedAt < STEP_TIMEOUT_MS) {
      let snapshot = null
      let responsive = true
      try {
        snapshot = await Promise.race([
          currentRun(page),
          sleep(3000).then(() => null),
        ])
        if (!snapshot) responsive = false
      } catch (error) {
        responsive = false
      }
      const item = { at: new Date().toISOString(), responsive, snapshot }
      diagnostics.push(item)
      fs.appendFileSync(probePath, JSON.stringify(item) + '\n', 'utf8')
      const lastCall = snapshot?.apiCalls?.at(-1)
      const lastPhysical = lastCall?.physicalCalls?.at(-1)
      if (!responsive) {
        timeout = true
        break
      }
      if (snapshot?.turnStatus && !['running'].includes(snapshot.turnStatus)) {
        console.log(`[DONE] turn status=${snapshot.turnStatus}`)
        break
      }
      if (lastPhysical?.status === 'running' && lastPhysical?.heartbeat === true) {
        // A heartbeat means the renderer loop is alive; keep waiting.
      }
      await sleep(PROBE_INTERVAL_MS)
    }
    if (Date.now() - startedAt >= STEP_TIMEOUT_MS) timeout = true

    const finalSnapshot = await Promise.race([
      currentRun(page),
      sleep(5000).then(() => null),
    ])
    const evidence = {
      generatedAt: new Date().toISOString(),
      instruction,
      timeout,
      finalSnapshot,
      diagnosticsTail: diagnostics.slice(-80),
      electronStdout: childStdout.join('').slice(-20000),
      electronStderr: childStderr.join('').slice(-20000),
    }
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'step5-stall-summary.json'), JSON.stringify(evidence, null, 2), 'utf8')
    console.log(JSON.stringify({
      timeout,
      turnStatus: finalSnapshot?.turnStatus,
      physicalCalls: finalSnapshot?.apiCalls?.at(-1)?.physicalCalls?.slice(-5),
      probe: finalSnapshot?.probe,
      loopHeartbeat: finalSnapshot?.loopHeartbeat,
      mainLog: fs.existsSync(path.join(PROFILE, 'logs', 'main.log'))
        ? fs.readFileSync(path.join(PROFILE, 'logs', 'main.log'), 'utf8').slice(-20000)
        : null,
    }, null, 2))
  } finally {
    child.kill()
  }
}

await main()
