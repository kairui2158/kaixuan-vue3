import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-pipeline-provider-channel-electron.mjs'
const LIVE_MODE = process.env.SHENYI_PROVIDER_CHANNEL_LIVE === '1'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_PROVIDER_CHANNEL_CDP_PORT || 9379)
const PROFILE = LIVE_MODE
  ? path.join(ROOT, '_data', 'pipeline-provider-channel-live-profile')
  : path.join(ROOT, '_data', 'pipeline-provider-channel-profile')
const EVIDENCE_ROOT = LIVE_MODE
  ? path.join(ROOT, '_audit', 'verification-pipeline-provider-channel-live')
  : path.join(ROOT, '_audit', 'verification-pipeline-provider-channel')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const PROJECT_ID = 'pipeline-provider-channel-ui'
const VOLUME_ID = 'vol-provider-channel'
const CHAPTER_ID = 'ch-provider-channel'
const LAYER_PROVIDERS = {
  settings: 'provider-settings',
  volumes: 'provider-volumes',
  chapters: 'provider-chapters',
  body: 'provider-body',
}
const REAL_USER_DATA_DIR = process.env.SHENYI_REAL_USER_DATA_DIR
  || path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'), 'shenyi-assistant')
const REAL_PROVIDER_CONFIG_PATH = path.join(REAL_USER_DATA_DIR, 'data', 'wa_providers.json')
const LIVE_PROVIDER_NAME = process.env.SHENYI_PROVIDER_CHANNEL_LIVE_PROVIDER || '全局'
const LIVE_MODEL_NAME = process.env.SHENYI_PROVIDER_CHANNEL_LIVE_MODEL || 'deepseek-v4-pro'
const BODY_SENTENCES = [
  '雨点在灯塔玻璃上排成细密的鼓点。',
  '王芳把纸条压进灯座，指尖停了半秒。',
  '红色信标每闪一次，她就把呼吸放慢一拍。',
  '楼梯下的海水声像有人在翻旧账。',
  '她把玩笑说给风暴听，风暴没有回嘴。',
  '纸条上的字迹被潮气咬出一圈毛边。',
  '她数到第三次红闪，才敢承认自己在怕。',
  '灯光把她的影子钉在潮湿的墙上。',
  '远处的货船鸣笛，声音被雨压得很低。',
  '她想起南方航线，又想起一个没兑现的约定。',
  '手指抚过灯座裂纹时，纸条轻轻颤了一下。',
  '她把恐惧折成话多的样子，好让自己站住。',
]

function buildBodyReply() {
  const buildParagraph = index => {
    const start = (index * 3) % BODY_SENTENCES.length
    const sentenceCount = 3 + (index % 2)
    const sentences = Array.from({ length: sentenceCount },
      (_, offset) => BODY_SENTENCES[(start + offset) % BODY_SENTENCES.length])
    return `${index + 1}. ${sentences.join('')}`
  }
  return [
    Array.from({ length: 70 }, (_, index) => buildParagraph(index)).join('\n\n'),
    '【正文交接】',
    'FACT_LOCK:人物状态=王芳发现纸条并确认三次红色闪烁',
    'FACT_LOCK:位置=灯塔底层',
    'FACT_LOCK:持有物=纸条',
    '【正文交接结束】',
    '【来源覆盖】',
    'H1-01',
    '【来源覆盖结束】',
  ].join('\n\n')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function writeJson(name, value) {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, name), JSON.stringify(value, null, 2), 'utf8')
  return path.join(EVIDENCE_ROOT, name)
}

function writeRunLog(step, value) {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  const body = typeof value === 'string' ? value : JSON.stringify(value)
  fs.appendFileSync(RUN_LOG_PATH, `[${new Date().toISOString()}] ${step} ${body}\n`, 'utf8')
}

function assertFreshRenderer() {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'dist-renderer', 'index.html'), 'utf8')
  const bundles = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundles.length > 0, 'dist-renderer/index.html references a production bundle')
  const assetRoot = path.join(ROOT, 'dist-renderer', 'assets')
  const allBundles = fs.readdirSync(assetRoot)
    .filter(name => name.endsWith('.js'))
    .map(name => path.join(assetRoot, name))
  const sourceFiles = []
  const collect = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collect(full)
      else if (/\.(vue|ts|js|mjs)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collect(path.join(ROOT, 'src'))
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const stale = bundles.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(stale.length, 0, `renderer is stale; rebuild with npm run build:vue. stale=${stale.join(',')}`)
  const bundleText = allBundles.map(file => fs.readFileSync(file, 'utf8')).join('\n')
  assert(bundleText.includes('生成流水线层通道'), 'renderer contains the layer channel settings UI')
  assert(bundleText.includes('pipeline-provider-channel-resolved'), 'renderer emits provider-channel trace events')
}

function providerConfig(requestCounts) {
  const providers = Object.entries(LAYER_PROVIDERS).map(([layer, id]) => ({
    id,
    name: `${layer}通道供应商`,
    baseUrl: `http://127.0.0.1:${requestCounts.port}/v1`,
    apiKey: `local-${layer}`,
    models: [`${layer}-model`],
    selectedModel: `${layer}-model`,
    temperature: 0.1,
    maxTokens: 8192,
    contextWindowTokens: 128000,
    purpose: ['generate'],
    providerType: 'openai-compatible',
    streamMode: true,
  }))
  return {
    providers,
    generateProvider: 'provider-global',
    verifyProvider: null,
    detectProvider: null,
    pipelineLayerProviders: {},
  }
}

function liveProviderConfig(proxyBaseUrl, apiKey) {
  assert(LIVE_MODE, 'liveProviderConfig only runs in live mode')
  assert(String(apiKey || '').length > 20, 'live provider key is usable; value is never logged')
  const providers = Object.entries(LAYER_PROVIDERS).map(([layer, id]) => ({
    id,
    name: `live-${layer}通道供应商`,
    baseUrl: proxyBaseUrl,
    apiKey,
    models: [LIVE_MODEL_NAME],
    selectedModel: LIVE_MODEL_NAME,
    temperature: 0.1,
    maxTokens: 8192,
    contextWindowTokens: 128000,
    purpose: ['generate'],
    providerType: 'openai-compatible',
    streamMode: true,
  }))
  return {
    providers,
    generateProvider: providers[0]?.id || null,
    verifyProvider: null,
    detectProvider: null,
    pipelineLayerProviders: {},
  }
}

async function startLiveProxy({ targetBaseUrl, apiKey }) {
  assert(LIVE_MODE, 'startLiveProxy only runs in live mode')
  const requests = []
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks)
      let parsed = {}
      try { parsed = JSON.parse(body) } catch {}
      const record = {
        at: new Date().toISOString(),
        url: request.url,
        method: request.method,
        model: parsed.model || null,
        wantsStream: parsed.stream === true,
        userPreview: (parsed.messages || [])
          .filter(message => message?.role === 'user')
          .map(message => String(message.content || ''))
          .join('\n')
          .slice(0, 300),
      }
      requests.push(record)
      writeRunLog('live-provider-request', record)
      const upstreamUrl = new URL(request.url, targetBaseUrl)
      const headers = { ...request.headers }
      delete headers.host
      delete headers.connection
      headers.authorization = `Bearer ${apiKey}`
      fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : body,
      }).then(upstream => {
        record.status = upstream.status
        response.writeHead(upstream.status, Object.fromEntries(upstream.headers))
        if (!upstream.body) {
          response.end()
          return
        }
        Readable.fromWeb(upstream.body).pipe(response)
      }).catch(error => {
        record.error = String(error?.message || error)
        response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: 'live proxy upstream failure' }))
      })
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    port: server.address().port,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    requests: () => requests.map(item => ({ ...item })),
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

function decryptLiveProviderKeyOnce() {
  assert(LIVE_MODE, 'decryptLiveProviderKeyOnce only runs in live mode')
  assert(fs.existsSync(REAL_PROVIDER_CONFIG_PATH),
    `live provider config exists: ${REAL_PROVIDER_CONFIG_PATH}; no new key is entered by this verifier`)
  const config = JSON.parse(fs.readFileSync(REAL_PROVIDER_CONFIG_PATH, 'utf8'))
  const selected = (config.providers || []).find(item => item?.name === LIVE_PROVIDER_NAME)
    || (config.providers || []).find(item => item?.id === config.generateProvider)
  assert(selected, `configured real provider found: ${LIVE_PROVIDER_NAME}`)
  const keyState = String(selected.apiKey || '').startsWith('enc:') ? 'encrypted' : 'plaintext'
  assert.equal(keyState, 'encrypted', 'live provider key is DPAPI-protected in the real application profile')
  const script = path.join(ROOT, 'scripts', 'decrypt-provider-key.cjs')
  const result = execFileSync(ELECTRON_EXE, [
    script,
    '--config', REAL_PROVIDER_CONFIG_PATH,
    '--name', LIVE_PROVIDER_NAME,
    '--user-data', REAL_USER_DATA_DIR,
    '--decrypt',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  })
  const lines = String(result).split('\n').filter(line => line.trim())
  const payload = JSON.parse(lines[lines.length - 1])
  assert.equal(payload.result, 'ok', `provider key bridge helper succeeds: ${payload.message || payload.result}`)
  assert.equal(payload.keyState, 'decrypted', 'provider key bridge decrypts under the real userData profile')
  assert(Number(payload.keyLength) > 20, `provider key bridge returns a usable key, got ${payload.keyLength} chars`)
  return { sourceKeyState: keyState, keyLength: payload.keyLength, apiKey: payload.apiKey }
}

function readLiveTargetBaseUrl(config) {
  const selected = (config.providers || []).find(item => item?.name === LIVE_PROVIDER_NAME)
    || (config.providers || []).find(item => item?.id === config.generateProvider)
  assert(selected?.baseUrl, 'configured real provider exposes a base URL')
  return selected.baseUrl
}

async function startLocalProviders() {
  const requests = []
  let port = 0
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      let parsed = {}
      try { parsed = JSON.parse(body) } catch {}
      const apiKey = String(request.headers.authorization || '')
      const layer = Object.entries(LAYER_PROVIDERS).find(([layerName]) => apiKey.includes(`local-${layerName}`))?.[0] || null
      const record = {
        at: new Date().toISOString(),
        url: request.url,
        apiKey,
        layer,
        model: parsed.model || null,
        wantsStream: parsed.stream === true,
        userPreview: (parsed.messages || [])
          .filter(message => message?.role === 'user')
          .map(message => String(message.content || ''))
          .join('\n')
          .slice(0, 300),
      }
      requests.push(record)
      writeRunLog('provider-request', record)
      const reply = layer === 'volumes'
        ? JSON.stringify([{
          name: '第二卷 航线',
          outline: '王芳确认航线与纸条之间的关系。',
          summary: '航线确认。',
          allocatedWords: 12000,
          readerExpectations: '确认航线。',
          mainPlotLine: '纸条推动航线。',
          unlockMilestone: '航线确认。',
          forbiddenFinalCards: [],
          contractRisk: 'contract_safe',
        }])
        : layer === 'chapters'
          ? JSON.stringify([{
            title: '第2章 航线',
            plot: '王芳确认纸条。',
            summary: '确认纸条。',
          }])
          : buildBodyReply()
      if (parsed.stream === true) {
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: reply } }] })}\n\n`)
        response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`)
        response.end('data: [DONE]\n\n')
        return
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: reply } }],
      }))
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
  return {
    port,
    requests: () => requests.map(item => ({ ...item })),
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

let electronProcess = null

function startElectron() {
  electronProcess = spawn(ELECTRON_EXE, [
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
      SHENYI_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: false,
  })
  electronProcess.stdout.on('data', data => writeRunLog('electron:stdout', String(data).slice(0, 2000)))
  electronProcess.stderr.on('data', data => writeRunLog('electron:stderr', String(data).slice(0, 2000)))
}

function stopElectron() {
  if (!electronProcess?.pid) return
  try {
    execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
  electronProcess = null
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

async function connectPage(browser) {
  let page = null
  for (let index = 0; index < 24 && !page; index++) {
    page = browser.contexts()
      .flatMap(context => context.pages())
      .find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable over CDP')
  return page
}

async function closeProjectModal(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(300)
}

async function reloadApp(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  // Provider store hydration is async on app boot; wait for it explicitly so
  // UI assertions never race the warning state from before hydration.
  await page.waitForFunction(() => {
    const store = window.__pinia?._s?.get('provider')
    return Boolean(store?.providers?.length)
  }, null, { timeout: 20_000 })
  await sleep(200)
  await closeProjectModal(page)
}

async function seedApplication(page, providers) {
  await page.evaluate(async ({ providers, projectId, volumeId, chapterId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', providers)
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '层通道真实UI验证',
      outlineText: '# 层通道真实UI验证\n## 剧情单元 H1-01 纸条\n章节范围：第 1 章\n- 王芳在灯塔发现纸条。',
      outlineLocked: true,
      outlineLockedText: '# 层通道真实UI验证\n## 剧情单元 H1-01 纸条\n章节范围：第 1 章\n- 王芳在灯塔发现纸条。',
      bookWordCount: 24000,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 2, volumeWords: 12000, chapterWords: 3500 },
      chaptersConfirmed: true,
      settingsGenerated: true,
      settings: [],
      styleProfile: null,
      volumes: [{
        id: volumeId,
        name: '第一卷 层通道',
        index: 0,
        outline: '王芳在灯塔发现纸条。',
        summary: '确认纸条。',
        allocatedWords: 12000,
        suggestedWords: 12000,
        wordsPerChapter: 3500,
        chapterCount: 2,
        confirmed: true,
        locked: true,
        isBound: true,
        bodyGenerated: false,
      }],
      chapters: {
        [volumeId]: [{
          id: chapterId,
          title: '第1章 层通道',
          index: 0,
          plot: '王芳确认纸条。',
          summary: '确认纸条。',
          confirmed: true,
          pipelineGenerated: true,
          unitId: 'H1-01',
        }],
      },
      settingBindings: {},
      settingsCollection: { categories: [], items: {} },
      memories: {},
      memoryBlacklist: [],
      aiNaming: null,
      outlineChat: [],
      chat: [],
      editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'compose', 3: 'compose', 4: 'compose' },
      skillAgents: {},
    })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    providers,
    projectId: PROJECT_ID,
    volumeId: VOLUME_ID,
    chapterId: CHAPTER_ID,
  })
  await reloadApp(page)
}

async function assertProviderStoreState(page, expected, message) {
  const state = await page.evaluate(async () => {
    const raw = await window.electronAPI.storageRead('wa_providers')
    const store = window.__pinia?._s?.get('provider')
    return {
      rawPipelineLayerProviders: raw?.pipelineLayerProviders || null,
      providers: store?.providers || [],
      generateProvider: store?.generateProvider || null,
      pipelineLayerProviders: store?.pipelineLayerProviders || {},
    }
  })
  assert.deepEqual(state.rawPipelineLayerProviders, expected,
    `${message}: persisted wa_providers.pipelineLayerProviders`)
  assert.deepEqual(state.pipelineLayerProviders, expected, message)
  return state
}

async function assertChannelUi(page, { expectedValues, warningLayers = [] }) {
  await page.click('#btn-settings')
  await page.waitForSelector('#pipeline-provider-channel-settings', { timeout: 20_000 })
  const settings = page.locator('#pipeline-provider-channel-settings')
  const visibleCount = await settings.locator('[data-pipeline-layer]').count()
  assert.equal(visibleCount, 4, `four layer selects are visible, got ${visibleCount}`)
  const visible = {}
  const warnings = []
  for (const layer of Object.keys(LAYER_PROVIDERS)) {
    const select = settings.locator(`[data-pipeline-layer="${layer}"]`)
    visible[layer] = await select.inputValue()
    const warning = settings.locator(`[data-pipeline-layer="${layer}"] ~ .pipeline-channel-warning, .pipeline-channel-row:has([data-pipeline-layer="${layer}"]) .pipeline-channel-warning`)
    if (await warning.isVisible({ timeout: 1000 }).catch(() => false)) warnings.push(layer)
  }
  assert.deepEqual(warnings.sort(), [...warningLayers].sort(), `real settings UI warnings: ${JSON.stringify(warnings)}`)
  writeRunLog('settings-channel-diagnostics', { visible, warnings })
  assert.deepEqual(visible, expectedValues, `real settings UI values: ${JSON.stringify(visible)}`)
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'settings-layer-channels.png'), fullPage: true })
  await page.click('#btn-close-settings')
  return visible
}

async function operateLayerChannelsThroughRealUi(page) {
  await page.click('#btn-settings')
  await page.waitForSelector('#pipeline-provider-channel-settings', { timeout: 20_000 })
  for (const [layer, providerId] of Object.entries(LAYER_PROVIDERS)) {
    await page.selectOption(`#pipeline-provider-${layer}`, providerId)
    const diagnostics = await page.evaluate(layerName => ({
      domValue: document.querySelector(`#pipeline-provider-${layerName}`)?.value || null,
      storeValue: window.__pinia?._s?.get('provider')?.pipelineLayerProviders?.[layerName] || null,
    }), layer)
    writeRunLog('layer-select-operation', { layer, providerId, ...diagnostics })
  }
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'settings-layer-channels-selected.png'), fullPage: true })
  await page.click('#btn-save-settings')
  await page.waitForSelector('#settings-modal', { state: 'hidden', timeout: 10_000 }).catch(() => {})
  await sleep(500)
  const saveDiagnostics = await page.evaluate(async () => {
    const store = window.__pinia?._s?.get('provider')
    const plain = value => JSON.parse(JSON.stringify(value ?? null))
    const readBefore = await window.electronAPI.storageRead('wa_providers').catch(error => ({ readError: String(error) }))
    const beforeSave = plain(readBefore)
    const saveResult = await Promise.resolve(store?.saveProviders?.())
      .then(value => ({ ok: value === true }))
      .catch(error => ({ saveError: String(error) }))
    const readAfter = await window.electronAPI.storageRead('wa_providers').catch(error => ({ readError: String(error) }))
    const afterSave = plain(readAfter)
    return {
      storeValue: store?.pipelineLayerProviders || null,
      beforeSave: beforeSave?.pipelineLayerProviders || null,
      saveResult,
      afterSave: afterSave?.pipelineLayerProviders || null,
    }
  })
  writeRunLog('save-settings-operation', saveDiagnostics)
  const persisted = await assertProviderStoreState(page, LAYER_PROVIDERS,
    'real select operations persist all four layer bindings in memory')
  await reloadApp(page)
  await assertProviderStoreState(page, LAYER_PROVIDERS,
    'layer bindings survive an app reload through the production provider store')
  return persisted
}

async function waitForLayerTerminal(page, layer, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs
  let snapshot = null
  while (Date.now() < deadline) {
    snapshot = await page.evaluate(layerName => {
      const store = window.__pinia?._s?.get('pipeline')
      return {
        runs: (store?.runs || []).filter(run => run.layer === layerName),
      }
    }, layer)
    const terminal = snapshot.runs.findLast(run => run.status === 'succeeded' || run.status === 'failed')
    if (terminal) return terminal
    await sleep(500)
  }
  throw new Error(`${layer} did not reach a terminal state: ${JSON.stringify(snapshot?.runs)}`)
}

async function exportTraceEvidence(page, runId, fileName) {
  const result = await page.evaluate(async ({ wantedRunId }) => {
    const trace = window.__pinia?._s?.get('runTrace')
    const run = [...(trace?.runs || [])].find(item => item.pipelineRunId === wantedRunId)
    return run ? JSON.parse(JSON.stringify(run)) : null
  }, { wantedRunId: runId })
  assert(result, `trace run exists for pipeline run ${runId}`)
  writeJson(fileName, result)
  return result
}

async function assertRunProviderChannel(page, layer, step, providerBridge) {
  const run = await waitForLayerTerminal(page, layer)
  assert.equal(run.status, 'succeeded', `${layer} run succeeds with its layer provider`)
  const trace = await exportTraceEvidence(page, run.runId, `${layer}-trace.json`)
  const events = (trace.events || [])
    .filter(event => event.type === 'pipeline-provider-channel-resolved')
    .map(event => JSON.parse(String(event.detail || '{}')))
  assert(events.length > 0, `${layer} trace records pipeline-provider-channel-resolved events`)
  assert(events.every(event => event.layer === layer),
    `${layer} trace channel events stay on their own layer`)
  assert(events.every(event => event.providerId === LAYER_PROVIDERS[layer]),
    `${layer} trace channel events use ${LAYER_PROVIDERS[layer]}`)
  assert(events.every(event => event.source === 'layer'),
    `${layer} trace channel events report source=layer`)
  const expectedModel = LIVE_MODE ? LIVE_MODEL_NAME : `${layer}-model`
  assert(events.every(event => event.model === expectedModel),
    `${layer} trace channel events use model=${expectedModel}, got ${JSON.stringify(events.map(event => event.model))}`)
  const apiCalls = (trace.apiCalls || []).filter(call => call.model !== undefined)
  assert(apiCalls.length > 0, `${layer} trace records apiCall model provenance`)
  assert(apiCalls.every(call => call.model === expectedModel),
    `${layer} apiCalls use model=${expectedModel}, got ${JSON.stringify(apiCalls.map(call => call.model))}`)
  const physicalRequests = ((trace.apiCalls || [])
    .flatMap(call => call.physicalCalls || [])
    .filter(physical => physical.requestMessages?.length > 0))
  assert(physicalRequests.length > 0, `${layer} trace records physical request bodies`)
  const modelBoundLayers = ['volumes', 'chapters', 'body']
  if (modelBoundLayers.includes(layer)) {
    const providerRequests = providerBridge.requests()
    const layerRequests = LIVE_MODE
      ? providerRequests
      : providerRequests.filter(request => request.layer === layer)
    assert(layerRequests.length > 0, `${layer} physical requests reached the ${layer} provider`)
    assert(layerRequests.every(request => request.model === expectedModel),
      `${layer} provider requests use model=${expectedModel}, got ${JSON.stringify(layerRequests.map(request => request.model))}`)
  }
  return { run, trace, channelEvents: events, expectedModel }
}

async function selectPipelineStep(page, stepIndex) {
  await page.locator('#pl-steps .pl-step').nth(stepIndex).click()
  await page.waitForSelector(`#pl-step-${stepIndex + 1}-content`, { state: 'visible' })
}

async function startLayerRun(page, stepIndex, buttonId) {
  await selectPipelineStep(page, stepIndex)
  await page.click(buttonId)
  await sleep(300)
}

async function main() {
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  assertFreshRenderer()
  let liveBridge = null
  let liveProxy = null
  let providers = null
  if (LIVE_MODE) {
    liveBridge = decryptLiveProviderKeyOnce()
    const liveConfig = JSON.parse(fs.readFileSync(REAL_PROVIDER_CONFIG_PATH, 'utf8'))
    liveProxy = await startLiveProxy({
      targetBaseUrl: readLiveTargetBaseUrl(liveConfig),
      apiKey: liveBridge.apiKey,
    })
    liveBridge = { ...liveBridge, proxyBaseUrl: liveProxy.baseUrl }
  } else {
    providers = await startLocalProviders()
  }
  if (LIVE_MODE) {
    console.log(`[MODE] live supplier via local transparent proxy: ${liveProxy.baseUrl}`)
    console.log(`[LIVE KEY] keyLength=${liveBridge.keyLength}, sourceKeyState=${liveBridge.sourceKeyState}; value intentionally not logged`)
  } else {
    console.log('[MODE] mock local providers')
  }
  startElectron()
  let browser = null
  let provider = null
  try {
    assert(await waitForCdp(), 'Electron CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    provider = LIVE_MODE
      ? liveProviderConfig(liveBridge.proxyBaseUrl, liveBridge.apiKey)
      : providerConfig({ port: providers.port })
    if (!LIVE_MODE) {
      provider.providers.push({
        id: 'provider-global',
        name: '全局生成供应商',
        baseUrl: `http://127.0.0.1:${providers.port}/v1`,
        apiKey: 'local-global',
        models: ['global-model'],
        selectedModel: 'global-model',
        temperature: 0.1,
        maxTokens: 8192,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      })
    }
    await seedApplication(page, provider)

    const initialUi = await assertChannelUi(page, {
      expectedValues: { settings: '', volumes: '', chapters: '', body: '' },
    })
    writeJson('settings-before-real-operation.json', initialUi)

    await operateLayerChannelsThroughRealUi(page)
    const selectedUi = await assertChannelUi(page, {
      expectedValues: LAYER_PROVIDERS,
    })
    writeJson('settings-after-real-operation.json', selectedUi)

    await page.evaluate(async () => {
      const stored = await window.electronAPI.storageRead('wa_providers')
      stored.providers = stored.providers.filter(item => item?.id !== 'provider-body')
      stored.pipelineLayerProviders.body = 'provider-deleted'
      await window.electronAPI.storageWrite('wa_providers', stored)
    })
    await reloadApp(page)
    await assertChannelUi(page, {
      // A native <select> falls back to the empty option when its bound id no
      // longer exists in <option>. The warning and persisted binding prove the
      // missing-channel state instead of relying on the visual fallback.
      expectedValues: { ...LAYER_PROVIDERS, body: '' },
      warningLayers: ['body'],
    })

    const restoreDiagnostics = await page.evaluate(async liveOverrides => {
      const stored = await window.electronAPI.storageRead('wa_providers')
      const providersBefore = stored.providers.map(item => item?.id)
      const bodyIndex = providersBefore.indexOf('provider-body')
      if (bodyIndex >= 0) throw new Error('provider-body should be deleted before restore')
      stored.providers.push({
        id: 'provider-body',
        name: 'body通道供应商',
        baseUrl: stored.providers.find(item => item?.id === 'provider-settings')?.baseUrl || 'http://127.0.0.1/v1',
        apiKey: 'local-body',
        models: ['body-model'],
        selectedModel: 'body-model',
        temperature: 0.1,
        maxTokens: 8192,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
        ...liveOverrides,
      })
      stored.pipelineLayerProviders.body = 'provider-body'
      const writeResult = await window.electronAPI.storageWrite('wa_providers', stored)
      const persisted = await window.electronAPI.storageRead('wa_providers')
      return {
        providersBefore,
        writeResult,
        providersAfter: persisted.providers.map(item => item?.id),
        persistedBinding: persisted.pipelineLayerProviders || null,
      }
    }, LIVE_MODE ? { apiKey: 'live-shared-key', models: [LIVE_MODEL_NAME], selectedModel: LIVE_MODEL_NAME } : {})
    writeRunLog('restore-deleted-provider-binding', restoreDiagnostics)
    assert.deepEqual(restoreDiagnostics.providersAfter.sort(), [
      'provider-body', 'provider-chapters',
      ...LIVE_MODE ? [] : ['provider-global'],
      'provider-settings', 'provider-volumes',
    ].sort(), 'restore fixture recreates provider-body')
    assert.equal(restoreDiagnostics.persistedBinding.body, 'provider-body',
      'restore fixture persists body binding before reload')
    await reloadApp(page)
    await assertChannelUi(page, { expectedValues: LAYER_PROVIDERS })

    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
    await startLayerRun(page, 2, '#btn-pl-gen-volumes')
    await startLayerRun(page, 3, '#btn-pl-gen-chapters')
    await startLayerRun(page, 4, '#btn-primary-gen-body')
    const providerBridge = LIVE_MODE ? liveProxy : providers
    const volumeEvidence = await assertRunProviderChannel(page, 'volumes', 2, providerBridge)
    const chapterEvidence = await assertRunProviderChannel(page, 'chapters', 3, providerBridge)
    const bodyEvidence = await assertRunProviderChannel(page, 'body', 4, providerBridge)

    const requests = LIVE_MODE ? liveProxy.requests() : providers.requests()
    assert(requests.length > 0, 'providers observed real application requests')
    if (LIVE_MODE) {
      assert(requests.every(item => item.model === LIVE_MODEL_NAME),
        `live requests use the configured real model, got ${JSON.stringify(requests.map(item => item.model))}`)
      assert(requests.some(item => item.status >= 200 && item.status < 400),
        'live supplier returns at least one successful response')
    } else {
      const observedLayers = requests.map(request => ({
        layer: request.layer || null,
        apiKey: String(request.apiKey || ''),
      }))
      for (const layer of ['volumes', 'chapters', 'body']) {
        const layerRequests = observedLayers.filter(item => item.layer === layer)
        assert(layerRequests.length > 0, `${layer} request reached the ${layer} provider`)
        assert(layerRequests.every(item => item.apiKey.includes(`local-${layer}`)),
          `${layer} requests use the ${layer} provider key`)
      }
    }
    writeJson('provider-requests.json', requests)
    writeJson('report.json', {
      script: SCRIPT_NAME,
      at: new Date().toISOString(),
      result: 'PASS',
      ui: { initialUi, selectedUi },
      runs: {
        volumes: volumeEvidence.run,
        chapters: chapterEvidence.run,
        body: bodyEvidence.run,
      },
      modelAssertions: {
        volumes: volumeEvidence.expectedModel,
        chapters: chapterEvidence.expectedModel,
        body: bodyEvidence.expectedModel,
        surfaces: ['trace-event', 'apiCall', 'provider-request'],
      },
      requestCount: requests.length,
      mode: LIVE_MODE ? 'live-single-supplier' : 'mock-four-layer-providers',
      live: LIVE_MODE ? {
        credentialSource: REAL_PROVIDER_CONFIG_PATH,
        sourceKeyState: liveBridge.sourceKeyState,
        keyLength: liveBridge.keyLength,
        proxyBaseUrl: liveBridge.proxyBaseUrl,
        model: LIVE_MODEL_NAME,
        successfulRequests: requests.filter(item => item.status >= 200 && item.status < 400).length,
      } : null,
    })
    console.log(`[PASS] layer provider UI, persistence, warnings, and routing verified; mode=${LIVE_MODE ? 'live-single-supplier' : 'mock-four-layer-providers'}; requests=${requests.length}`)
  } finally {
    if (browser) await browser.close().catch(() => {})
    stopElectron()
    await providers?.close()
    await liveProxy?.close()
  }
}

main().catch(error => {
  console.error(`[FAIL] ${SCRIPT_NAME}: ${error?.stack || error}`)
  process.exitCode = 1
})
