import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import defaultPaths from '../electron/defaultPaths.js'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-pipeline-parallelism-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_PARALLELISM_ELECTRON
  ? path.resolve(process.env.SHENYI_PARALLELISM_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_PARALLELISM_CDP_PORT || 9369)
const LIVE_MODE = process.env.SHENYI_PARALLELISM_LIVE === '1'
const PROFILE = path.join(ROOT, '_data', 'pipeline-parallelism-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(ROOT, '_data', 'pipeline-parallelism-exports')
const EVIDENCE_ROOT = LIVE_MODE
  ? path.join(ROOT, '_audit', 'verification-pipeline-parallelism-live-supplier')
  : path.join(ROOT, '_audit', 'verification-pipeline-parallelism-live')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_PARALLELISM_GLOBAL_TIMEOUT_MS
  || (LIVE_MODE ? 30 * 60_000 : 15 * 60_000))
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_PARALLELISM_STEP_TIMEOUT_MS
  || (LIVE_MODE ? 15 * 60_000 : 8 * 60_000))
const HEARTBEAT_INTERVAL_MS = Number(process.env.SHENYI_PARALLELISM_HEARTBEAT_INTERVAL_MS || 5000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_PARALLELISM_STALLED_TIMEOUT_MS || 30_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_PARALLELISM_DEAD_TIMEOUT_MS || 60_000)
const KEEP_PROFILE = process.env.SHENYI_PARALLELISM_KEEP_PROFILE === '1'
const REAL_USER_DATA_DIR = process.env.SHENYI_PARALLELISM_REAL_USER_DATA
  ? path.resolve(process.env.SHENYI_PARALLELISM_REAL_USER_DATA)
  : defaultPaths.getUserDataDir(path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'), 'shenyi-assistant'))
const REAL_PROVIDER_CONFIG_PATH = process.env.SHENYI_PARALLELISM_PROVIDER_CONFIG
  ? path.resolve(process.env.SHENYI_PARALLELISM_PROVIDER_CONFIG)
  : path.join(defaultPaths.getDataRoot(path.join(process.env.USERPROFILE || '', 'Documents')), 'wa_providers.json')
const LIVE_PROVIDER_NAME = process.env.SHENYI_PARALLELISM_LIVE_PROVIDER || '全局'
const LIVE_MODEL_NAME = process.env.SHENYI_PARALLELISM_LIVE_MODEL || 'deepseek-v4-pro'

const PROJECT_ID = 'pipeline-parallelism-live'
const VOLUME_ID = 'vol-parallelism'
const CHAPTER_ID = 'ch-parallelism-1'
const SECOND_CHAPTER_ID = 'ch-parallelism-2'
const SKILL_ROOT = path.join(ROOT, '_data', 'pipeline-parallelism-skills')
const SKILL_IDS = ['PARALLELISM-S1', 'PARALLELISM-S2', 'PARALLELISM-S3']
const rendererConsoleMessages = []
const rendererPageErrors = []
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

function buildBodyReply(requestIndex, bodyPhysicalRequests = 1) {
  const buildParagraph = index => {
    const start = (index * 3) % BODY_SENTENCES.length
    const sentenceCount = 3 + (index % 2)
    const sentences = Array.from({ length: sentenceCount },
      (_, offset) => BODY_SENTENCES[(start + offset) % BODY_SENTENCES.length])
    return `${index + 1}. ${sentences.join('')}`
  }
  const body = Array.from({ length: 70 }, (_, index) => buildParagraph(index))
    .join('\n\n')
    .concat('\n\n', [
      `生成轮次标记：parallelism-${requestIndex + 1}-${bodyPhysicalRequests}`,
      '【正文交接】',
      'FACT_LOCK:人物状态=王芳发现纸条并确认三次红色闪烁',
      'FACT_LOCK:位置=灯塔底层',
      'FACT_LOCK:持有物=纸条',
      '【正文交接结束】',
      '【来源覆盖】',
      'H1-01',
      '【来源覆盖结束】',
    ].join('\n\n'))
  return body
}

const OUTLINE = [
  '# 三层并行真实UI实测',
  '## 剧情单元 H1-01 灯塔纸条',
  '> 作用域：单元级 H1-01',
  '章节范围：第 1 章',
  '- 雨夜中，王芳在灯塔底层发现纸条，并确认风暴信标的三次红色闪烁。',
  '第一卷 灯塔航线：纸条、信标与南方航线共同推动第一卷冲突。',
].join('\n')

function writeChainSkills() {
  fs.rmSync(SKILL_ROOT, { recursive: true, force: true })
  const definitions = [
    {
      id: SKILL_IDS[0],
      name: 'P1 骨架',
      folder: 'parallelism-s1',
      template: '输出本章节的写作骨架，不要输出正文。',
    },
    {
      id: SKILL_IDS[1],
      name: 'P2 生成',
      folder: 'parallelism-s2',
      template: [
        '输出本章节完整正文。',
        '字数契约：目标约3500字，必须不低于2800字，不得超过7000字。',
        '结构自查：至少写70个自然段，每段50-80字；每段都要落在场景、动作、对话、感官细节或心理中的一个具体面上，禁止用说明性总结替代正文。',
        '交付自查：输出前逐段计数，若不足70段或总字数低于2800，继续扩展场景与动作，直到达标后才允许输出【正文交接】块。',
        '输出结束后另起一行输出【正文交接】块，并在其中逐行输出FACT_LOCK。',
      ].join('\n'),
    },
    {
      id: SKILL_IDS[2],
      name: 'P3 打磨',
      folder: 'parallelism-s3',
      template: '只打磨表达，不改变事实；保留全文长度，禁止压缩或概括，输出完整正文。',
    },
  ]
  for (const definition of definitions) {
    const folderPath = path.join(SKILL_ROOT, definition.folder)
    fs.mkdirSync(folderPath, { recursive: true })
    fs.writeFileSync(path.join(folderPath, 'SKILL.md'), [
      '---',
      'schema: shenyi.skill',
      'version: 1',
      `id: ${definition.id}`,
      `name: ${definition.name}`,
      '---',
      'Created and removed by the pipeline-parallelism Electron verifier.',
      '',
    ].join('\n'), 'utf8')
    fs.writeFileSync(path.join(folderPath, 'template.md'), definition.template, 'utf8')
    fs.writeFileSync(path.join(folderPath, 'meta.json'), JSON.stringify({}, null, 2), 'utf8')
    fs.writeFileSync(path.join(folderPath, 'script.js'),
      'exports.preProcess = function (payload) { return { input: payload.input } }', 'utf8')
  }
}

function chainSkillRecords() {
  const names = ['P1 骨架', 'P2 生成', 'P3 打磨']
  return SKILL_IDS.map((sourceId, index) => ({
    id: `folder:${sourceId}`,
    sourceId,
    name: names[index],
    description: 'pipeline parallelism Electron verification skill',
    format: 'folder',
    source: 'external',
    category: 'folder',
    folderPath: path.join(SKILL_ROOT, `parallelism-s${index + 1}`),
    executionMode: 'chain',
    outputFormat: 'text',
    sourcePath: path.join(SKILL_ROOT, `parallelism-s${index + 1}`, 'SKILL.md'),
    samples: '',
    validationRules: [],
    splitSize: 1000,
    injectMode: 'system_prefix',
    bindTarget: 'project',
    linkedSkillIds: [],
    customVars: {},
    inputSchema: '',
    outputSchema: '',
    retryPolicy: '',
    intents: ['generate'],
  }))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function writeJsonEvidence(target, value) {
  const text = JSON.stringify(value, null, 2)
  let lastError = null
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.writeFileSync(target, text, 'utf8')
      return { path: target, retries: attempt }
    } catch (error) {
      lastError = error
      await sleep(250)
    }
  }
  const fallback = `${target}.${Date.now()}.retry.json`
  try {
    fs.writeFileSync(fallback, text, 'utf8')
    return { path: fallback, retries: 5, originalTarget: target, originalError: String(lastError) }
  } catch (fallbackError) {
    fallbackError.message = `evidence write failed for ${target}: ${fallbackError.message}; first error: ${lastError}`
    throw fallbackError
  }
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(300)
  }
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundleNames = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references at least one JS bundle')
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collectSources(path.join(ROOT, 'src'))
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name =>
    fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0,
    `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
  const bundleText = bundleNames.map(name =>
    fs.readFileSync(path.join(ROOT, 'dist-renderer', name), 'utf8')).join('\n')
  assert(bundleText.includes('provider-queue'), 'renderer bundle contains provider-queue trace events')
  assert(bundleText.includes('__SHENYI_PERFORMANCE_MONITOR__'),
    'renderer bundle installs the performance monitor read surface')
  assert(bundleText.includes('activeChaptersRun'), 'renderer bundle keeps per-layer chapter run readers')
  assert(bundleText.includes('activeBodyRun'), 'renderer bundle keeps per-layer body run readers')
}

function buildVolumeReply() {
  return JSON.stringify([{
    name: '第二卷 航线之后',
    outline: '王芳把灯塔纸条拼进航行图，南方航线逐步显形。',
    summary: '纸条指向南方渔港。',
    allocatedWords: 12000,
    readerExpectations: '看到航线从线索变成行动。',
    mainPlotLine: '灯塔纸条推动南方航线。',
    unlockMilestone: '航行图第二段展开。',
    forbiddenFinalCards: [],
    contractRisk: 'contract_safe',
  }])
}

function buildChapterReply() {
  return JSON.stringify([{
    title: '第3章 航线之后',
    plot: '王芳拼出航行图，并用三个玩笑压住风暴里的沉默。',
    summary: '王芳确认航线。',
  }])
}

function requestChapterHints(userText) {
  const hints = ['第1章 纸条', '第2章 航行图', '第3章 航线之后']
  return hints.filter(hint => userText.includes(hint))
}

function classifyRequest(parsed) {
  const messages = parsed.messages || []
  const userText = messages
    .filter(message => message?.role === 'user')
    .map(message => String(message.content || ''))
    .join('\n')
  // Anchors are the current production prompt headers, not step names.
  // Keeping them aligned prevents a canceled request from being attributed
  // to the wrong layer and hiding a real physical request from assertions.
  if (userText.includes('[卷纲]\n') || userText.includes('[本卷总章数]')) return 'chapters'
  if (userText.includes('[大纲]\n') || userText.includes('[全书大纲]\n')) return 'volumes'
  return 'body'
}

function requestPromptPreview(parsed) {
  return (parsed.messages || [])
    .filter(message => message?.role === 'user')
    .map(message => String(message.content || ''))
    .join('\n')
    .slice(0, 500)
}

function readLiveProviderConfig(proxyBaseUrl = '') {
  assert(LIVE_MODE, 'readLiveProviderConfig only runs in live mode')
  assert(fs.existsSync(REAL_PROVIDER_CONFIG_PATH),
    `live provider config exists: ${REAL_PROVIDER_CONFIG_PATH}`)
  const config = JSON.parse(fs.readFileSync(REAL_PROVIDER_CONFIG_PATH, 'utf8'))
  const providers = Array.isArray(config.providers) ? config.providers : []
  const selected = providers.find(item => item.name === LIVE_PROVIDER_NAME)
    || providers.find(item => item.id === config.generateProvider)
  assert(selected, `configured real provider found: ${LIVE_PROVIDER_NAME}`)
  assert(String(selected.apiKey || '').length > 20,
    'live provider key is present; the verifier never logs its value')
  const liveKeyState = String(selected.apiKey || '').startsWith('enc:')
    ? 'encrypted'
    : 'plaintext'
  assert.equal(liveKeyState, 'encrypted',
    `live provider key is DPAPI-protected in the source profile, got ${liveKeyState}`)
  return {
    ...config,
    providers: [{
      ...selected,
      ...(proxyBaseUrl ? {
        baseUrl: proxyBaseUrl,
        models: [LIVE_MODEL_NAME, ...selected.models.filter(item => item !== LIVE_MODEL_NAME)],
        selectedModel: LIVE_MODEL_NAME,
      } : {}),
      name: LIVE_PROVIDER_NAME === selected.name
        ? selected.name
        : `${LIVE_PROVIDER_NAME} (${selected.name})`,
    }],
    generateProvider: selected.id,
    verifyProvider: null,
    detectProvider: null,
    __liveKeyState: liveKeyState,
  }
}

function decryptLiveProviderKeyOnce({ encrypted } = {}) {
  assert(LIVE_MODE, 'decryptLiveProviderKeyOnce only runs in live mode')
  assert(fs.existsSync(REAL_USER_DATA_DIR),
    `real application userData exists: ${REAL_USER_DATA_DIR}`)
  const script = path.join(ROOT, 'scripts', 'decrypt-provider-key.cjs')
  const result = execFileSync(ELECTRON_EXE, [
    script,
    ...(encrypted ? ['--encrypted', encrypted] : [
      '--config', REAL_PROVIDER_CONFIG_PATH,
      '--name', LIVE_PROVIDER_NAME,
    ]),
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
  assert.equal(payload.keyState, 'decrypted',
    `provider key bridge decrypts under the real userData profile, got ${payload.keyState}`)
  assert(Number(payload.keyLength) > 20,
    `provider key bridge returns a usable key, got ${payload.keyLength} chars`)
  return { keyState: payload.keyState, keyLength: payload.keyLength, apiKey: payload.apiKey }
}

function startLiveFailureProxy({ targetBaseUrl, apiKey }) {
  const requests = []
  const failures = []
  let proxyPort = 0
  const server = http.createServer((request, response) => {
    const target = new URL(request.url || '/', targetBaseUrl)
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('error', () => response.destroy())
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8')
      const parsed = (() => { try { return JSON.parse(bodyText) } catch { return {} } })()
      const kind = classifyRequest(parsed)
      const userText = (parsed.messages || [])
        .filter(message => message?.role === 'user')
        .map(message => String(message.content || ''))
        .join('\n')
      const failureMatchesStep = failureStep => {
        if (failureStep == null) return true
        if (failureStep === 1) return !userText.includes('chain step ')
        return userText.includes(`chain step ${failureStep}/`)
      }
      const failureIndex = failures.findIndex(item =>
        (!item.kind || item.kind === kind) && failureMatchesStep(item.step))
      const failure = failureIndex >= 0 ? failures.splice(failureIndex, 1)[0] : null
      if (failure) {
        requests.push({
          at: new Date().toISOString(),
          kind,
          failed: true,
          failure: failure.failure,
          status: failure.status || 401,
          messageChars: (parsed.messages || [])
            .map(message => String(message.content || '').length)
            .reduce((sum, value) => sum + value, 0),
        })
        response.writeHead(failure.status || 401, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({
          error: {
            type: failure.failure,
            code: failure.failure,
            message: failure.message || `injected ${failure.failure} failure`,
          },
        }))
        return
      }

      const headers = { ...request.headers, host: target.host }
      if (apiKey) headers.authorization = `Bearer ${apiKey}`
      delete headers['content-length']
      const upstream = https.request(target, {
        method: request.method,
        headers,
      })
      const record = {
        at: new Date().toISOString(),
        kind,
        model: parsed.model || null,
        messageChars: (parsed.messages || [])
          .map(message => String(message.content || '').length)
          .reduce((sum, value) => sum + value, 0),
        status: null,
        durationMs: null,
      }
      const startedAt = performance.now()
      upstream.on('response', upstreamResponse => {
        record.status = upstreamResponse.statusCode || 0
        response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
        upstreamResponse.pipe(response)
      })
      upstream.on('error', error => {
        record.status = 502
        record.error = String(error?.message || error)
        if (!response.headersSent) {
          response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
          response.end(JSON.stringify({ error: { message: record.error } }))
        } else response.destroy()
      })
      response.on('finish', () => {
        record.durationMs = performance.now() - startedAt
        requests.push(record)
      })
      upstream.end(bodyText)
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      proxyPort = server.address().port
      resolve({
        port: proxyPort,
        baseUrl: `http://127.0.0.1:${proxyPort}/v1`,
        apiKey,
        requests: () => requests.map(item => ({ ...item })),
        enqueueFailure: failure => { failures.push(failure) },
        close: () => new Promise(done => server.close(() => done())),
      })
    })
  })
}

function startProvider() {
  const requests = []
  const failures = []
  let providerPort = 0
  const activeIntervals = []
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', `http://127.0.0.1:${providerPort}`)
    if (request.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: { message: `unexpected path: ${request.method} ${url.pathname}` } }))
      return
    }
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      const parsed = (() => { try { return JSON.parse(bodyText) } catch { return {} } })()
      const kind = classifyRequest(parsed)
      const startedAt = performance.now()
      const userText = (parsed.messages || [])
        .filter(message => message?.role === 'user')
        .map(message => String(message.content || ''))
        .join('\n')
      const chapterHints = requestChapterHints(userText)
      // A terminal failure must stay terminal. 500-class errors are retried
      // by the production transport, so injecting one here can make the run
      // succeed again and never create the breakpoint we are trying to test.
      const failureMatchesStep = failureStep => {
        if (failureStep == null) return true
        if (failureStep === 1) return !userText.includes('chain step ')
        return userText.includes(`chain step ${failureStep}/`)
      }
      const failureIndex = failures.findIndex(item =>
        (!item.kind || item.kind === kind) && failureMatchesStep(item.step))
      const failure = failureIndex >= 0 ? failures.splice(failureIndex, 1)[0] : null
      if (failure) {
        const failedAt = performance.now()
        requests.push({
          at: new Date().toISOString(),
          kind,
          model: parsed.model || null,
          wantsStream: parsed.stream === true,
          promptPreview: requestPromptPreview(parsed),
          messageChars: (parsed.messages || [])
            .map(message => String(message.content || '').length)
            .reduce((sum, value) => sum + value, 0),
          startedAt,
          endedAt: failedAt,
          durationMs: failedAt - startedAt,
          failed: true,
          failure: failure.failure,
        })
        response.writeHead(failure.status || 500, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({
          error: {
            type: failure.failure,
            code: failure.failure,
            message: failure.message || `injected ${failure.failure} failure`,
          },
        }))
        return
      }
      // Fixed durations keep the three-run overlap window deterministic;
      // random durations can let chapters finish before body starts.
      const durationMs = kind === 'chapters' ? 30_000
        : kind === 'volumes' ? 10_000
        : 20_000
      const requestRecord = {
        at: new Date().toISOString(),
        kind,
        model: parsed.model || null,
        wantsStream: parsed.stream === true,
        messageChars: (parsed.messages || [])
            .map(message => String(message.content || '').length)
            .reduce((sum, value) => sum + value, 0),
        promptPreview: requestPromptPreview(parsed),
        chapterHints,
        startedAt,
        endedAt: null,
        durationMs: null,
        canceled: false,
      }
      requests.push(requestRecord)
      const bodyRequestIndex = requests.filter(item => item.kind === 'body').length
      const reply = kind === 'volumes' ? buildVolumeReply()
        : kind === 'chapters' ? buildChapterReply()
        : buildBodyReply(bodyRequestIndex, requests.length + 1)
      const finish = () => {
        requestRecord.endedAt = performance.now()
        requestRecord.durationMs = requestRecord.endedAt - startedAt
        const index = activeIntervals.indexOf(timer)
        if (index >= 0) activeIntervals.splice(index, 1)
        if (parsed.stream === true) {
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          response.write(`data: ${JSON.stringify({
            choices: [{ delta: { role: 'assistant', content: reply } }],
          })}\n\n`)
          response.write(`data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 20, completion_tokens: 40, total_tokens: 60 },
          })}\n\n`)
          response.write('data: [DONE]\n\n')
          response.end()
          return
        }
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: reply } }],
        }))
      }
      const timer = setTimeout(finish, durationMs)
      activeIntervals.push(timer)
      const recordCanceledClose = () => {
        if (requestRecord.endedAt !== null) return
        requestRecord.endedAt = performance.now()
        requestRecord.durationMs = requestRecord.endedAt - startedAt
        requestRecord.canceled = true
        clearTimeout(timer)
        const intervalIndex = activeIntervals.indexOf(timer)
        if (intervalIndex >= 0) activeIntervals.splice(intervalIndex, 1)
      }
      response.on('close', () => {
        if (!response.writableEnded) recordCanceledClose()
      })
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      providerPort = server.address().port
      resolve({
        port: providerPort,
        requests: () => requests.map(item => ({ ...item })),
        enqueueFailure: (failure) => { failures.push(failure) },
        pendingFailures: () => failures.length,
        close: () => new Promise(done => {
          activeIntervals.forEach(timer => clearTimeout(timer))
          server.close(() => done())
        }),
      })
    })
  })
}

function startElectron() {
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
      SHENYI_DATA_DIR: DATA_DIR,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] pid=${child.pid}`)
  child.stdout.on('data', chunk => {
    const text = `[ELECTRON] ${chunk}`
    process.stdout.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.stderr.on('data', chunk => {
    const text = `[ELECTRON STDERR] ${chunk}`
    process.stderr.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.on('close', (code, signal) => {
    const text = `[ELECTRON CLOSE] code=${code} signal=${signal}\n`
    process.stdout.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  return child
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

function closeElectron(app) {
  if (!app || app.exitCode !== null) return
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
}

async function connectPage(browser) {
  let page = null
  for (let attempt = 0; attempt < 24 && !page; attempt++) {
    page = browser.contexts()
      .flatMap(context => context.pages())
      .find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable')
  return page
}

async function seedApplication(page, {
  mockProvider = null,
  liveProxy = null,
  liveBridge = null,
} = {}) {
  const sourceLiveBridge = mockProvider || liveProxy ? null : {
    sourceUserData: REAL_USER_DATA_DIR,
    ...decryptLiveProviderKeyOnce(),
  }
  const effectiveLiveBridge = liveBridge || sourceLiveBridge
  await page.evaluate(async ({ mockMode, providers, liveBridgeKey, projectId, volumeId, chapterId, secondChapterId, outline, skills }) => {
    if (mockMode) {
      if (providers.providers?.length !== 1) throw new Error('mock provider targets exactly one provider')
    } else if (!liveBridgeKey || providers.providers?.length !== 1) {
      throw new Error('live bridge targets exactly one provider')
    }
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', providers)
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '三层并行真实UI实测',
      outlineText: outline,
      outlineLocked: true,
      outlineLockedText: outline,
      bookWordCount: 12,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 2, volumeWords: 12000, chapterWords: 3500 },
      chaptersConfirmed: true,
      settingsGenerated: true,
      settings: [],
      styleProfile: null,
      volumes: [{
        id: volumeId,
        name: '第一卷 灯塔航线',
        index: 0,
        outline: outline,
        summary: '纸条与信标推动第一卷冲突。',
        allocatedWords: 12000,
        suggestedWords: 12000,
        wordsPerChapter: 3500,
        chapterCount: 3,
        confirmed: true,
        locked: true,
        isBound: true,
        bodyGenerated: false,
      }],
      chapters: {
        [volumeId]: [
          {
            id: chapterId,
            title: '第1章 纸条',
            index: 0,
            plot: '雨夜中，王芳在灯塔底层发现纸条，并确认风暴信标的三次红色闪烁。',
            summary: '王芳发现纸条。',
            confirmed: true,
            pipelineGenerated: true,
            unitId: 'H1-01',
          },
          {
            id: secondChapterId,
            title: '第2章 航行图',
            index: 1,
            plot: '王芳把灯塔纸条拼进航行图，并确认南方航线的下一段。',
            summary: '王芳确认航线。',
            confirmed: true,
            pipelineGenerated: true,
            unitId: 'H1-01',
          },
        ],
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
    await window.electronAPI.storageWrite('wa_skills', { skills, pipelineSkills: [], deAiSkills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'compose', 3: 'compose', 4: 'compose' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite('wa_appSettings', { autoExtractMemory: false })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    mockMode: Boolean(mockProvider),
    providers: mockProvider ? {
      providers: [{
        id: 'parallelism-provider',
        name: 'Pipeline Parallelism Provider',
        baseUrl: `http://127.0.0.1:${mockProvider.port}`,
        apiKey: 'local-test-key',
        models: ['parallelism-model'],
        selectedModel: 'parallelism-model',
        temperature: 0.1,
        maxTokens: 8192,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'parallelism-provider',
    } : readLiveProviderConfig(liveProxy?.baseUrl),
    liveBridgeKey: effectiveLiveBridge?.apiKey || null,
    projectId: PROJECT_ID,
    volumeId: VOLUME_ID,
    chapterId: CHAPTER_ID,
    secondChapterId: SECOND_CHAPTER_ID,
    outline: OUTLINE,
    skills: chainSkillRecords(),
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1500)
  if (mockProvider) {
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(400)
  } else {
    await selectLiveProviderThroughUi(page, effectiveLiveBridge)
    await sleep(400)
  }
}

async function selectLiveProviderThroughUi(page, liveBridge) {
  const expectedModel = LIVE_MODEL_NAME
  assert(liveBridge?.apiKey,
    'live provider bridge exposes a decrypted key for verifier-profile re-encryption')
  const reencryptedKey = await page.evaluate(async ({ decryptedKey }) => {
    if (!decryptedKey || typeof decryptedKey !== 'string') {
      throw new Error('live bridge key is missing in the verifier context')
    }
    const store = window.__pinia?._s?.get('provider')
    const selected = (store?.providers || []).find(item => item.id === store?.generateProvider)
    const apiKey = String(selected?.apiKey || '')
    if (!apiKey.startsWith('enc:')) return 'plaintext-or-missing'
    try {
      // The source profile's DPAPI blob is not portable. Re-encrypt the
      // bridge-decrypted key inside the verifier profile, persist it, and then
      // exercise the production decrypt path in loadProviders().
      const encryptedHere = String(await window.electronAPI.encrypt(decryptedKey))
      if (!encryptedHere.startsWith('enc:')) return 'encrypt-unavailable'
      const decryptedHere = String(await window.electronAPI.decrypt(encryptedHere))
      if (decryptedHere !== decryptedKey || decryptedHere.startsWith('enc:')) {
        return 'decrypt-roundtrip-failed'
      }
      // Pinia state contains reactive proxies, which Electron IPC cannot clone.
      const plainProviders = JSON.parse(JSON.stringify(store?.providers || []))
      await window.electronAPI.storageWrite('wa_providers', {
        generateProvider: store?.generateProvider || null,
        verifyProvider: store?.verifyProvider || null,
        detectProvider: store?.detectProvider || null,
        providers: plainProviders.map(item =>
          item.id === selected.id ? { ...item, apiKey: encryptedHere } : item),
      })
      await store.loadProviders()
      const reloaded = (store?.providers || []).find(item => item.id === store?.generateProvider)
      const reloadedKey = String(reloaded?.apiKey || '')
      if (reloadedKey !== decryptedKey) return 'production-decrypt-failed'
      if (reloadedKey.startsWith('enc:')) return 'production-decrypt-kept-encrypted'
      return encryptedHere.startsWith('enc:') ? 'reencrypted' : 'plaintext'
    } catch (error) {
      return `threw:${String(error?.message || error)}`
    }
  }, { decryptedKey: liveBridge.apiKey })
  assert.equal(reencryptedKey, 'reencrypted',
    `live provider key is re-encrypted inside the verifier profile, got ${reencryptedKey}`)
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
    document.querySelector('.modal-overlay .btn-close')?.click()
    document.querySelector('.project-modal .btn-close')?.click()
  })
  await sleep(600)
  await page.click('#btn-settings')
  await page.waitForSelector('#provider-list-view', { timeout: 20_000 })
  const card = page.locator('#provider-list-view .provider-card')
    .filter({ hasText: LIVE_PROVIDER_NAME })
    .first()
  assert(await card.count() === 1,
    `live provider card is visible in settings: ${LIVE_PROVIDER_NAME}`)
  // The middle of the card is the actions row, and that row stops click
  // propagation. Clicking the card center therefore never enters edit mode.
  const editButton = card.locator('.provider-card-actions button.btn-sm.btn-secondary').first()
  assert(await editButton.count() === 1,
    `live provider edit button is visible: ${LIVE_PROVIDER_NAME}`)
  await editButton.click()
  await page.waitForSelector('#provider-edit-view', { timeout: 20_000 })
  const modelSelect = page.locator('#provider-edit-view .model-select-row select').first()
  await modelSelect.selectOption(expectedModel)
  await page.click('#provider-edit-view .form-actions .btn-primary')
  await page.waitForSelector('#provider-list-view', { timeout: 20_000 })
  const persisted = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('provider')
    const selected = (store?.providers || []).find(item => item.id === store?.generateProvider)
    const apiKey = String(selected?.apiKey || '')
    const apiKeyState = !apiKey ? 'missing'
      : apiKey.startsWith('enc:') ? 'encrypted'
      : 'decrypted'
    return {
      providerId: selected?.id || null,
      providerName: selected?.name || null,
      selectedModel: selected?.selectedModel || null,
      purpose: selected?.purpose || null,
      apiKeyState,
      manualDecryptState: null,
    }
  })
  if (persisted.apiKeyState === 'encrypted') {
    persisted.manualDecryptState = await page.evaluate(async () => {
      const store = window.__pinia?._s?.get('provider')
      const selected = (store?.providers || []).find(item => item.id === store?.generateProvider)
      const apiKey = String(selected?.apiKey || '')
      if (!apiKey.startsWith('enc:')) return 'decrypted'
      try {
        const decrypted = String(await window.electronAPI.decrypt(apiKey))
        return !decrypted || decrypted.startsWith('enc:') ? 'failed' : 'decrypted'
      } catch {
        return 'threw'
      }
    })
  }
  assert.equal(persisted.providerName, LIVE_PROVIDER_NAME,
    `live provider selected through real UI, got ${persisted.providerName}`)
  assert.equal(persisted.selectedModel, expectedModel,
    `live model selected through real UI, got ${persisted.selectedModel}`)
  assert((persisted.purpose || []).includes('generate'),
    'live provider keeps the generate purpose')
  assert.equal(persisted.apiKeyState, 'decrypted',
    `live provider key state is decrypted, got ${persisted.apiKeyState}; manual decrypt ${persisted.manualDecryptState} (value intentionally not reported)`)
  // saveAndExit() returns to the provider list, so there is no back button to
  // click here. Close the settings modal directly before leaving this helper.
  await page.click('#btn-close-settings')
  return persisted
}

function layerSnapshot(page, bodyChapterId = CHAPTER_ID) {
  return page.evaluate(({ volumeId, chapterId, bodyChapterId }) => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const project = window.__pinia?._s?.get('project')
    const trace = window.__pinia?._s?.get('runTrace')
    const volumeRun = pipeline?.activeVolumesRun || null
    const chapterRun = pipeline?.activeChaptersRun || null
    const bodyRun = pipeline?.activeBodyRun || null
    const chapterRuns = (pipeline?.runs || []).filter(run => run.layer === 'chapters')
    const chapterRunByTarget = chapterRuns.findLast(run => run.target === volumeId) || null
    const chapterRunByChapter = chapterRuns.findLast(run => run.target === chapterId) || null
    const bodyRuns = (pipeline?.runs || []).filter(run => run.layer === 'body')
    const bodyRunByTarget = bodyRuns.findLast(run => run.target === bodyChapterId) || null
    return {
      at: Date.now(),
      volumes: volumeRun ? { runId: volumeRun.runId, status: volumeRun.status, progress: volumeRun.progress, statusText: volumeRun.statusText } : null,
      chapters: (chapterRunByTarget || chapterRun || null) ? {
        runId: (chapterRunByTarget || chapterRun).runId,
        status: (chapterRunByTarget || chapterRun).status,
        progress: (chapterRunByTarget || chapterRun).progress,
        statusText: (chapterRunByTarget || chapterRun).statusText,
      } : null,
      body: (bodyRunByTarget || bodyRun) ? {
        runId: (bodyRunByTarget || bodyRun).runId,
        target: (bodyRunByTarget || bodyRun).target,
        status: (bodyRunByTarget || bodyRun).status,
        progress: (bodyRunByTarget || bodyRun).progress,
        statusText: (bodyRunByTarget || bodyRun).statusText,
      } : null,
      allRuns: (pipeline?.runs || []).map(run => ({
        runId: run.runId,
        layer: run.layer,
        target: run.target,
        status: run.status,
        progress: run.progress,
      })),
      chapterCount: (project?.chapters?.[volumeId] || []).length,
      traceRuns: (trace?.runs || []).map(run => ({
        id: run.id,
        pipelineRunId: run.pipelineRunId || null,
        step: run.step,
        status: run.status,
        apiCalls: (run.apiCalls || []).length,
        providerQueueEvents: (run.events || []).filter(event => event.type === 'provider-queue').length,
      })),
    }
  }, { volumeId: VOLUME_ID, chapterId: CHAPTER_ID, bodyChapterId })
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const state = await layerSnapshot(page)
      state.electronPid = electronPid
      fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify(state)}\n`, 'utf8')
    } catch (error) {
      fs.appendFileSync(HEARTBEAT_PATH,
        `${JSON.stringify({ at: new Date().toISOString(), error: String(error?.message || error) })}\n`, 'utf8')
    }
  }, HEARTBEAT_INTERVAL_MS)
  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}

async function waitForThreeActiveRuns(page) {
  const deadline = Date.now() + 30_000
  let last = null
  while (Date.now() < deadline) {
    last = await layerSnapshot(page)
    const activeRuns = ['volumes', 'chapters', 'body']
      .map(layer => last.allRuns.find(run => run.layer === layer && run.status === 'running'))
    if (activeRuns.every(Boolean)) {
      return last
    }
    await sleep(250)
  }
  throw new Error(`three pipeline layers never became concurrently active: ${JSON.stringify(last)}`)
}

function assertConcurrentUiState(snapshot) {
  const layers = ['volumes', 'chapters', 'body']
  const activeRuns = layers.map(layer =>
    snapshot.allRuns.find(run => run.layer === layer && run.status === 'running'))
  assert(activeRuns.every(Boolean), `all three layers report active runs: ${JSON.stringify(snapshot)}`)
  const runIds = activeRuns.map(run => run.runId)
  assert.equal(new Set(runIds).size, 3, 'the three active run ids are distinct')
  activeRuns.forEach(run => assert(run.progress > 0,
    `${run.layer} progress is visible while all three run, got ${run.progress}`))
  const volumeRun = activeRuns.find(run => run.layer === 'volumes')
  assert.equal(volumeRun.target, 'all', `volume run target stays 'all': ${volumeRun.target}`)
}

async function collectStreamOwnershipSnapshot(page, {
  containerId,
  expectedPipelineRunId,
  expectedLayer,
}) {
  return page.evaluate(async ({
    containerId,
    expectedPipelineRunId,
    expectedLayer,
  }) => {
    const container = document.getElementById(containerId)
    if (!container) return { containerExists: false }
    const lines = [...container.querySelectorAll('.pl-gen-bar-stream-line')]
      .map(line => (line.textContent || '').trim())
    const streamLines = lines.filter(line => line.startsWith('API实时输出：'))
    const closeButtons = [...container.querySelectorAll('.pl-gen-bar-close')]
    const pipeline = window.__pinia?._s?.get('pipeline')
    const trace = window.__pinia?._s?.get('runTrace')
    const storeRun = pipeline?.runs?.find(run => run.runId === expectedPipelineRunId) || null
    const traceRuns = (trace?.runs || [])
      .filter(run => run.pipelineRunId === expectedPipelineRunId)
      .map(run => ({
        id: run.id,
        step: run.step,
        status: run.status,
        streamedCalls: (run.apiCalls || [])
          .filter(call => (call.streamTotalChars || call.streamText?.length || 0) > 0)
          .map(call => ({
            id: call.id,
            status: call.status,
            streamTotalChars: call.streamTotalChars ?? call.streamText?.length ?? 0,
            streamChars: call.streamText?.length ?? 0,
          })),
      }))
    return {
      containerExists: true,
      containerId,
      lineCount: lines.length,
      streamLineCount: streamLines.length,
      streamPreview: streamLines[0]?.slice(0, 300) || null,
      closeCount: closeButtons.length,
      storeRun: storeRun ? {
        runId: storeRun.runId,
        layer: storeRun.layer,
        status: storeRun.status,
        progress: storeRun.progress,
      } : null,
      traceRuns,
      expected: { expectedPipelineRunId, expectedLayer },
    }
  }, { containerId, expectedPipelineRunId, expectedLayer })
}

async function expandProgressStream(page, stepIndex) {
  await selectPipelineStep(page, stepIndex)
  const panelId = `#pl-step-${stepIndex + 1}-content`
  const streamToggle = page.locator(`${panelId} .pl-gen-bar .pl-gen-bar-stream-toggle`).first()
  try {
    await streamToggle.waitFor({ state: 'visible', timeout: 30_000 })
  } catch (error) {
    const diagnostics = await page.evaluate(targetPanelId => {
      const panel = document.querySelector(targetPanelId)
      const bar = panel?.querySelector('.pl-gen-bar') || null
      const barStyle = bar ? window.getComputedStyle(bar) : null
      return {
        panelExists: Boolean(panel),
        panelClass: panel?.getAttribute('class') || null,
        panelText: panel?.textContent?.slice(0, 500) || null,
        barExists: Boolean(bar),
        barDisplay: barStyle?.display || null,
        barVisibility: barStyle?.visibility || null,
        toggleText: panel?.querySelector('.pl-gen-bar-stream-toggle')?.textContent?.trim() || null,
        pipelineRuns: window.__pinia?._s?.get('pipeline')?.runs?.map(run => ({
          runId: run.runId,
          layer: run.layer,
          status: run.status,
        })) || [],
      }
    }, panelId)
    await fs.promises.writeFile(
      path.join(EVIDENCE_ROOT, `stream-toggle-diagnostics-step-${stepIndex}.json`),
      JSON.stringify({ stepIndex, panelId, diagnostics }, null, 2),
      'utf8',
    )
    throw new Error(`stream toggle missing before expansion: ${JSON.stringify(diagnostics)}`)
  }
  await streamToggle.click()
  try {
    await page.waitForFunction(({ panelId }) => {
      const lines = [...document.querySelectorAll(`${panelId} .pl-gen-bar-stream-line`)]
      return lines.some(line => (line.textContent || '').trim().startsWith('API实时输出：'))
    }, { panelId }, { timeout: 30_000 })
  } catch (error) {
    const diagnostics = await page.evaluate(targetPanelId => {
      const panel = document.querySelector(targetPanelId)
      return {
        panelExists: Boolean(panel),
        lines: panel ? [...panel.querySelectorAll('.pl-gen-bar-stream-line')]
          .map(line => (line.textContent || '').trim()) : [],
        toggleText: panel?.querySelector('.pl-gen-bar-stream-toggle')?.textContent?.trim() || null,
      }
    }, panelId)
    await fs.promises.writeFile(
      path.join(EVIDENCE_ROOT, `stream-expansion-diagnostics-step-${stepIndex}.json`),
      JSON.stringify({ stepIndex, panelId, diagnostics }, null, 2),
      'utf8',
    )
    throw new Error(`stream line missing after expansion: ${JSON.stringify(diagnostics)}`)
  }
}

async function assertActiveRunStreamOwnership(page, snapshot, layer, stepIndex, containerId) {
  const expectedRun = snapshot.allRuns.find(run =>
    run.layer === layer && run.status === 'running')
  assert(expectedRun, `active ${layer} run exists for stream ownership check: ${JSON.stringify(snapshot.allRuns)}`)

  await expandProgressStream(page, stepIndex)
  const streamOwnership = await collectStreamOwnershipSnapshot(page, {
    containerId,
    expectedPipelineRunId: expectedRun.runId,
    expectedLayer: layer,
  })
  assert(streamOwnership.containerExists,
    `${layer} progress bar renders its stream container`)
  assert(streamOwnership.streamLineCount >= 1,
    `${layer} real progress UI renders an API实时输出 line, got ${JSON.stringify(streamOwnership)}`)
  assert(streamOwnership.storeRun?.runId === expectedRun.runId,
    `${layer} displayed stream belongs to the active pipeline run`)
  assert(streamOwnership.storeRun?.layer === layer,
    `${layer} displayed stream stays on its own layer`)
  assert(streamOwnership.traceRuns.length >= 1,
    `${layer} trace ownership is recorded for the displayed pipeline run`)
  assert(streamOwnership.traceRuns.some(run =>
    (run.streamedCalls || []).some(call => call.streamTotalChars > 0)),
    `${layer} trace records stream accounting against its trace run`)
  assert(streamOwnership.traceRuns.every(run => run.step === stepIndex),
    `${layer} trace keeps its layer step identity, got ${JSON.stringify(streamOwnership.traceRuns.map(run => run.step))}`)
  assert(streamOwnership.closeCount === 0,
    `${layer} active run exposes cancel, not terminal close`)
  return streamOwnership
}

async function assertCloseDuringRunPreservesExecution(page, snapshot, layer, stepIndex, containerId) {
  const expectedRun = snapshot.allRuns.find(run =>
    run.layer === layer && run.status === 'running')
  assert(expectedRun, `active ${layer} run exists before feedback close: ${JSON.stringify(snapshot.allRuns)}`)
  const panelId = `#pl-step-${stepIndex + 1}-content`
  const closeOrCancel = page.locator(`${panelId} .pl-gen-bar`).first()
    .locator('.pl-gen-bar-cancel, .pl-gen-bar-close')
  const buttonCount = await closeOrCancel.count()
  assert(buttonCount === 1,
    `${layer} active progress bar exposes exactly one feedback control, got ${buttonCount}`)
  const buttonClass = await closeOrCancel.first().getAttribute('class')
  assert(String(buttonClass || '').includes('pl-gen-bar-cancel'),
    `${layer} active progress bar must expose cancel rather than close`)

  // Emulate the terminal close path while the run is still executing. This is
  // the regression guard for the old reset-based close, which deleted logs
  // and stream state from a still-running contract.
  const beforeClose = await page.evaluate(async ({ wantedRunId, layerName }) => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const trace = window.__pinia?._s?.get('runTrace')
    const traceRuns = (trace?.runs || []).filter(run => run.pipelineRunId === wantedRunId)
    return {
      run: pipeline?.getRun?.(wantedRunId) || pipeline?.runs?.find(run => run.runId === wantedRunId) || null,
      traceRuns: traceRuns.map(run => ({
        id: run.id,
        status: run.status,
        apiCalls: (run.apiCalls || []).length,
        streamTotalChars: (run.apiCalls || [])
          .reduce((total, call) => total + (call.streamTotalChars || call.streamText?.length || 0), 0),
      })),
      providerQueueEvents: (pipeline?.runs?.find(run => run.runId === wantedRunId)?.providerQueueEvents || []).length,
      layerName,
    }
  }, { wantedRunId: expectedRun.runId, layerName: layer })

  await page.evaluate(({ wantedRunId }) => {
    const panel = window.__pipelinePanelState
    if (!panel?.closeFeedbackForRun) throw new Error('test bridge closeFeedbackForRun is unavailable')
    panel.closeFeedbackForRun(wantedRunId)
  }, { wantedRunId: expectedRun.runId })

  const afterClose = await page.evaluate(async ({ wantedRunId }) => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const trace = window.__pinia?._s?.get('runTrace')
    const run = pipeline?.getRun?.(wantedRunId) || pipeline?.runs?.find(item => item.runId === wantedRunId) || null
    return {
      status: run?.status || null,
      progress: run?.progress ?? null,
      traceRuns: (trace?.runs || []).filter(item => item.pipelineRunId === wantedRunId)
        .map(item => ({
          id: item.id,
          status: item.status,
          apiCalls: (item.apiCalls || []).length,
          streamTotalChars: (item.apiCalls || [])
            .reduce((total, call) => total + (call.streamTotalChars || call.streamText?.length || 0), 0),
        })),
    }
  }, { wantedRunId: expectedRun.runId })

  assert(afterClose.status === beforeClose.run?.status,
    `${layer} close action does not alter the executing run status (${beforeClose.run?.status} -> ${afterClose.status})`)
  assert((afterClose.traceRuns || []).length === (beforeClose.traceRuns || []).length,
    `${layer} close action does not delete trace ownership records`)
  assert((afterClose.traceRuns || []).every(run =>
    (run.apiCalls || 0) >= (beforeClose.traceRuns?.find(item => item.id === run.id)?.apiCalls || 0)),
    `${layer} close action does not delete trace API calls`)
  assert((afterClose.traceRuns || []).every(run =>
    run.streamTotalChars >= (beforeClose.traceRuns?.find(item => item.id === run.id)?.streamTotalChars || 0)),
    `${layer} close action does not delete accumulated stream accounting`)
  return {
    layer,
    pipelineRunId: expectedRun.runId,
    statusAfterClose: afterClose.status,
    traceRunCount: (afterClose.traceRuns || []).length,
    streamTotalChars: (afterClose.traceRuns || []).reduce((total, run) => total + run.streamTotalChars, 0),
  }
}

async function assertTerminalCloseOnlyHidesFeedback(page, snapshot, layer, stepIndex, containerId) {
  const expectedRun = snapshot.allRuns.findLast(run => run.layer === layer
    && ['succeeded', 'failed', 'canceled'].includes(run.status))
  assert(expectedRun, `terminal ${layer} run exists for close-button assertion: ${JSON.stringify(snapshot.allRuns)}`)
  const panelId = `#pl-step-${stepIndex + 1}-content`
  const terminalBar = page.locator(`${panelId} .pl-gen-bar-close`)
  await ensurePipelinePanelOpen(page)
  await page.locator('#pl-steps .pl-step').nth(stepIndex).click()
  await page.waitForSelector(panelId, { state: 'visible', timeout: 20_000 })
  const closeButtonCount = await terminalBar.count()
  if (closeButtonCount !== 1) {
    const diagnostics = await page.evaluate(({ panelId, containerId, wantedRunId }) => {
      const panel = document.querySelector(panelId)
      const container = document.getElementById(containerId)
      const pipeline = window.__pinia?._s?.get('pipeline')
      return {
        panelExists: Boolean(panel),
        containerExists: Boolean(container),
        panelText: panel?.textContent?.slice(0, 1000) || null,
        closeButtons: panel ? [...panel.querySelectorAll('.pl-gen-bar-close')]
          .map(button => ({
            text: button.textContent?.trim() || null,
            visible: button.offsetParent !== null,
          })) : [],
        storeRuns: (pipeline?.runs || []).filter(run => run.layer === 'volumes')
          .map(run => ({ runId: run.runId, status: run.status })),
        expectedRunId: wantedRunId,
      }
    }, { panelId, containerId, wantedRunId: expectedRun.runId })
    await fs.promises.writeFile(
      path.join(EVIDENCE_ROOT, `terminal-close-diagnostics-${layer}.json`),
      JSON.stringify({ layer, stepIndex, containerId, diagnostics }, null, 2),
      'utf8',
    )
    assert(closeButtonCount === 1,
      `terminal ${layer} progress bar exposes exactly one close button: ${JSON.stringify(diagnostics)}`)
  }
  const streamToggle = page.locator(`${panelId} .pl-gen-bar .pl-gen-bar-stream-toggle`).first()
  if (await streamToggle.count() > 0 && await streamToggle.isVisible()) {
    await expandProgressStream(page, stepIndex)
  } else {
    await selectPipelineStep(page, stepIndex)
  }
  assert(closeButtonCount === 1,
    `terminal ${layer} progress bar exposes exactly one close button`)
  assert(await page.locator(`${panelId} .pl-gen-bar-cancel`).count() === 0,
    `terminal ${layer} progress bar no longer exposes cancel`)

  const before = await page.evaluate(({ wantedRunId }) => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const trace = window.__pinia?._s?.get('runTrace')
    const run = pipeline?.getRun?.(wantedRunId) || pipeline?.runs?.find(item => item.runId === wantedRunId) || null
    return {
      run,
      traceRuns: (trace?.runs || []).filter(item => item.pipelineRunId === wantedRunId).length,
    }
  }, { wantedRunId: expectedRun.runId })
  assert(before.run?.status && ['succeeded', 'failed', 'canceled'].includes(before.run.status),
    `${layer} terminal run remains in the store before close`)

  await page.locator(`${panelId} .pl-gen-bar-close`).click()
  const after = await page.evaluate(({ wantedRunId, containerId, panelIdForClose }) => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const trace = window.__pinia?._s?.get('runTrace')
    const run = pipeline?.getRun?.(wantedRunId) || pipeline?.runs?.find(item => item.runId === wantedRunId) || null
    const container = document.getElementById(containerId)
    return {
      run,
      traceRuns: (trace?.runs || []).filter(item => item.pipelineRunId === wantedRunId).length,
      containerExists: Boolean(container),
      panelBarCount: document.querySelectorAll(`${panelIdForClose} .pl-gen-bar`).length,
    }
  }, { wantedRunId: expectedRun.runId, panelIdForClose: panelId })

  assert(after.run?.runId === expectedRun.runId,
    `${layer} close only hides feedback; store still owns terminal run`)
  assert.equal(after.run?.status, before.run?.status,
    `${layer} close does not mutate terminal run status`)
  assert.equal(after.traceRuns, before.traceRuns,
    `${layer} close does not delete trace ownership`)
  assert(after.containerExists === false || after.panelBarCount === 0,
    `${layer} progress feedback is hidden after real close click`)
  return {
    layer,
    pipelineRunId: expectedRun.runId,
    status: after.run?.status,
    storeStillOwnsRun: Boolean(after.run?.runId === expectedRun.runId),
  }
}

async function cancelChaptersRun(page, chaptersRunId) {
  const selector = `button[data-cancel-run-id="${chaptersRunId}"]`
  await page.waitForSelector(selector, { timeout: 20_000 })
  const clickedAt = Date.now()
  await page.click(selector)
  const deadline = clickedAt + 10_000
  let last = null
  while (Date.now() < deadline) {
    last = await layerSnapshot(page)
    if (last.chapters?.status === 'canceled') return { clickToCanceledMs: Date.now() - clickedAt }
    await sleep(100)
  }
  throw new Error(`chapter run did not reach canceled state: ${JSON.stringify(last)}`)
}

async function waitForTerminalStates(page, expected, bodyChapterId = CHAPTER_ID) {
  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const snapshot = await layerSnapshot(page, bodyChapterId)
    const signature = JSON.stringify(snapshot)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      lastSnapshot = snapshot
    } else if (Date.now() - lastProgressAt >= DEAD_TIMEOUT_MS) {
      throw new Error(`pipeline runs made no progress for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= STALLED_TIMEOUT_MS) {
      console.warn(`[STALL WARNING] no progress for ${Date.now() - lastProgressAt}ms: ${JSON.stringify(lastSnapshot)}`)
    }
    const layerStatus = layer =>
      snapshot.allRuns.findLast(run => run.layer === layer)?.status
    if (layerStatus('volumes') === expected.volumes
      && layerStatus('chapters') === expected.chapters
      && layerStatus('body') === expected.body) {
      return snapshot
    }
    await sleep(1000)
  }
  throw new Error(`pipeline runs did not reach expected terminal states: ${JSON.stringify(lastSnapshot)}`)
}

function assertProviderRequests(requests) {
  assert(requests.length >= 3, `at least three mock physical requests execute, got ${requests.length}`)
  assert(new Set(requests.map(item => item.kind)).size === 3,
    `all three layers issue physical requests, got ${[...new Set(requests.map(item => item.kind))].join(',')}`)
  const points = requests.flatMap(item => [
    { at: item.startedAt, kind: item.kind, edge: 'start' },
    { at: item.endedAt, kind: item.kind, edge: 'end' },
  ]).sort((a, b) => a.at - b.at)
  let active = 0
  let maxConcurrency = 0
  for (const point of points) {
    active += point.edge === 'start' ? 1 : -1
    maxConcurrency = Math.max(maxConcurrency, active)
  }
  assert(maxConcurrency >= 2,
    `real request overlap is observed, max concurrency=${maxConcurrency}`)
  assert(maxConcurrency <= 2,
    `same-provider concurrency never exceeds 2, max concurrency=${maxConcurrency}`)
  const canceledRequests = requests.filter(item => item.canceled)
  assert(canceledRequests.length >= 1,
    `user cancellation closes at least one physical provider request, got ${canceledRequests.length}`)
  assert(canceledRequests.every(item => (item.durationMs || 0) < 5_000),
    `canceled physical requests close promptly, got ${JSON.stringify(canceledRequests)}`)
  const overlappedPairs = []
  for (let i = 0; i < requests.length; i += 1) {
    for (let j = i + 1; j < requests.length; j += 1) {
      const a = requests[i]
      const b = requests[j]
      if (a.endedAt === null || b.endedAt === null) continue
      if (Math.max(a.startedAt, b.startedAt) < Math.min(a.endedAt, b.endedAt)) {
        overlappedPairs.push([a.kind, b.kind])
      }
    }
  }
  assert(overlappedPairs.length > 0,
    `at least one overlapping provider request pair exists, got ${JSON.stringify(overlappedPairs)}`)
  return {
    requestCount: requests.length,
    byKind: requests.reduce((acc, item) => {
      acc[item.kind] = (acc[item.kind] || 0) + 1
      return acc
    }, {}),
    maxConcurrency,
    overlappedPairs,
    requestDurations: requests.map(item => ({ kind: item.kind, durationMs: item.durationMs })),
  }
}

async function collectLiveApiCalls(page) {
  return page.evaluate(({ volumeId, chapterId }) => {
    const trace = window.__pinia?._s?.get('runTrace')
    const pipeline = window.__pinia?._s?.get('pipeline')
    const layerByTarget = new Map()
    for (const run of pipeline?.runs || []) {
      if (!layerByTarget.has(run.runId)) layerByTarget.set(run.runId, run.layer)
    }
    const calls = []
    for (const run of trace?.runs || []) {
      for (const call of run.apiCalls || []) {
        for (const physical of call.physicalCalls || []) {
          calls.push({
            traceRunId: run.id,
            pipelineRunId: run.pipelineRunId || null,
            layer: layerByTarget.get(run.pipelineRunId) || null,
            status: physical.status,
            startedAt: physical.startedAt,
            endedAt: physical.endedAt ?? null,
            durationMs: physical.durationMs ?? null,
            error: physical.error || call.error || null,
          })
        }
      }
    }
    return {
      volumeId,
      chapterId,
      calls: calls.sort((a, b) => a.startedAt - b.startedAt),
    }
  }, { volumeId: VOLUME_ID, chapterId: CHAPTER_ID })
}

async function preserveFailedExports() {
  if (!fs.existsSync(EXPORT_ROOT)) return null
  const destination = path.join(EVIDENCE_ROOT, 'failed-exports')
  await fs.promises.cp(EXPORT_ROOT, destination, { recursive: true, force: true })
  return destination
}

function assertLiveProviderMetrics(liveCalls) {
  const calls = liveCalls.calls || []
  assert(calls.length >= 3, `live supplier serves at least three physical calls, got ${calls.length}`)
  assert(new Set(calls.map(item => item.layer)).size === 3,
    `all three layers own live physical calls, got ${[...new Set(calls.map(item => item.layer))].join(',')}`)
  const active = calls.filter(item => item.status === 'success')
  assert(active.length >= 3, `at least three live calls succeed, got ${active.length}`)
  const points = active.flatMap(item => [
    { at: item.startedAt, edge: 'start' },
    { at: item.endedAt || item.startedAt, edge: 'end' },
  ]).sort((a, b) => a.at - b.at)
  let concurrency = 0
  let maxConcurrency = 0
  for (const point of points) {
    concurrency += point.edge === 'start' ? 1 : -1
    maxConcurrency = Math.max(maxConcurrency, concurrency)
  }
  assert(maxConcurrency >= 2,
    `live supplier request overlap is observed, max concurrency=${maxConcurrency}`)
  assert(maxConcurrency <= 2,
    `live same-provider concurrency stays at the configured cap, got ${maxConcurrency}`)
  const overlappedPairs = []
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i]
      const b = active[j]
      if (a.endedAt == null || b.endedAt == null) continue
      if (Math.max(a.startedAt, b.startedAt) < Math.min(a.endedAt, b.endedAt)) {
        overlappedPairs.push([a.layer, b.layer])
      }
    }
  }
  assert(overlappedPairs.length > 0,
    `live supplier has at least one overlapping request pair, got ${JSON.stringify(overlappedPairs)}`)
  return {
    requestCount: calls.length,
    successCount: active.length,
    maxConcurrency,
    overlappedPairs,
    byLayer: calls.reduce((acc, item) => {
      acc[item.layer || 'unknown'] = (acc[item.layer || 'unknown'] || 0) + 1
      return acc
    }, {}),
    durations: calls.map(item => ({
      layer: item.layer,
      status: item.status,
      durationMs: item.durationMs,
    })),
  }
}

async function readPerformanceSnapshot(page) {
  const snapshot = await page.evaluate(() => {
    const surface = window.__SHENYI_PERFORMANCE_MONITOR__
    if (!surface?.getSnapshot) return null
    return surface.getSnapshot()
  })
  assert(snapshot, 'performance monitor read surface is installed and returns a snapshot')
  return snapshot
}

async function exportLayerRun(page, step) {
  const exported = await page.evaluate(async ({ exportRoot, step: wantedStep }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === wantedStep)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return { runId: null, result: null }
    const result = await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
    return { runId: run.id, result }
  }, { exportRoot: EXPORT_ROOT, step })
  assert(exported?.runId, `pipeline run trace exists for step ${step}`)
  assert(exported.result?.success,
    `deep export succeeds for step ${step}: ${exported.result?.error || 'unknown error'}`)
  const run = JSON.parse(fs.readFileSync(path.join(exported.result.path, 'run-trace.json'), 'utf8'))
  return { runId: exported.runId, directory: exported.result.path, run }
}

async function exportFailureTraceDiagnostics(page) {
  const diagnostics = {
    at: new Date().toISOString(),
    exports: [],
    error: null,
  }
  try {
    const exports = await page.evaluate(async ({ exportRoot }) => {
      const store = window.__pinia?._s?.get('runTrace')
      const runs = [...(store?.runs || [])]
        .filter(item => item.source === 'pipeline')
        .sort((a, b) => a.startedAt - b.startedAt)
      const results = []
      for (const run of runs) {
        try {
          const result = await window.electronAPI.runTraceExport({
            schema: 'shenyi.run-trace',
            version: 2,
            run: store.exportRunToJson(run),
            mode: 'deep',
            payloadDirectoryHint: exportRoot,
          })
          results.push({
            runId: run.id,
            step: run.step,
            status: run.status,
            eventTypes: (run.events || []).map(event => event.type),
            decisionEvents: (run.events || [])
              .filter(event => [
                'body-step-acceptance',
                'body-generator-step-rejected',
                'body-artifact-attempt',
                'failed',
              ].includes(event.type))
              .map(event => ({
                type: event.type,
                at: event.at,
                detail: (() => {
                  try { return JSON.parse(String(event.detail || '{}')) } catch { return String(event.detail || '') }
                })(),
              })),
            apiCalls: (run.apiCalls || []).map(call => ({
              status: call.status,
              skillName: call.skillName,
              error: call.error,
              physicalCalls: (call.physicalCalls || []).map(physical => ({
                status: physical.status,
                durationMs: physical.durationMs ?? null,
                error: physical.error || null,
              })),
            })),
            exportSuccess: Boolean(result?.success),
            exportPath: result?.path || null,
            exportError: result?.error || null,
          })
        } catch (error) {
          results.push({
            runId: run.id,
            step: run.step,
            status: run.status,
            exportSuccess: false,
            exportError: String(error?.message || error),
          })
        }
      }
      return results
    }, { exportRoot: EXPORT_ROOT })
    diagnostics.exports = exports
  } catch (error) {
    diagnostics.error = String(error?.stack || error?.message || error)
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'failure-trace-diagnostics.json'),
    JSON.stringify(diagnostics, null, 2), 'utf8')
  return diagnostics
}

function assertExportedTrace({ step, run, expectedStatus }) {
  const stepName = step === 2 ? 'volume' : step === 3 ? 'chapter' : 'body'
  assert.equal(run.step, step, `${stepName} trace keeps its layer step identity`)
  assert.equal(run.status, expectedStatus,
    `${stepName} trace terminal status is ${expectedStatus}, got ${run.status}`)
  assert((run.apiCalls || []).every(call => call.status !== 'running'),
    `${stepName} trace has no running API calls after completion`)
  assert((run.turns || []).every(turn => turn.status !== 'running'),
    `${stepName} trace has no running turns after completion`)
  if (expectedStatus === 'success') {
    assert((run.apiCalls || []).length > 0, `${stepName} success trace contains API calls`)
  }
}

function assertProviderQueueEvidence({ volumeRun, bodyRun }) {
  for (const [label, run] of [['volume', volumeRun], ['body', bodyRun]]) {
    const queueEvents = (run.events || []).filter(event => event.type === 'provider-queue')
    assert(queueEvents.length > 0,
      `${label} trace records provider-queue events; provider scheduler observability is live`)
    for (const event of queueEvents) {
      const detail = (() => {
        try { return JSON.parse(String(event.detail || '{}')) } catch { return {} }
      })()
      assert(['queued', 'started', 'canceled'].includes(detail.status),
        `${label} provider-queue event has a valid status, got ${detail.status}`)
    }
  }
}

async function selectPipelineStep(page, stepIndex) {
  await ensurePipelinePanelOpen(page)
  await page.locator('#pl-steps .pl-step').nth(stepIndex).click()
  await page.waitForSelector(`#pl-step-${stepIndex + 1}-content`, { state: 'visible' })
}

async function ensurePipelinePanelOpen(page) {
  const panel = page.locator('#pipeline-panel')
  if (await panel.count() > 0 && await panel.first().isVisible()) return
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { state: 'visible', timeout: 20_000 })
}

async function selectBodyChainSkillsThroughUi(page) {
  const skills = chainSkillRecords()
  await page.selectOption('#pl-s5-mode', 'chain')
  const existingCount = await page.locator('#pl-s5-skills-list .pl-skill-chip').count()
  for (let index = existingCount - 1; index >= 0; index -= 1) {
    await page.locator('#pl-s5-skills-list .pl-skill-chip').nth(index)
      .locator('.pl-chip-close').click()
  }
  for (const skill of skills) {
    await page.selectOption('#pl-s5-skill', skill.id)
    await page.click('#pl-s5-add-skill')
    await page.waitForFunction(({ skillId, skillName, expectedCount }) => {
      const chips = [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      return chips.length === expectedCount
        && chips.some(chip => (chip.textContent || '').includes(skillId)
          || (chip.textContent || '').includes(skillName))
    }, {
      skillId: skill.id,
      skillName: skill.name,
      expectedCount: skills.indexOf(skill) + 1,
    }, { timeout: 10_000, polling: 250 })
    console.log(`[SKILL UI SELECTED] ${skill.id} (${skill.name})`)
  }
  const selected = await page.evaluate(() =>
    [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      .map(chip => (chip.textContent || '').trim()))
  assert.equal(selected.length, skills.length,
    `all body SKILLs are selected through #pl-s5-skill; got ${JSON.stringify(selected)}`)
  return skills.map(skill => skill.id)
}

function sha256(text) {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex')
}

async function readBodyArtifact(page, chapterId = CHAPTER_ID) {
  const body = await page.evaluate(({ volumeId, chapterId }) => {
    const project = window.__pinia?._s?.get('project')
    const chapter = (project?.chapters?.[volumeId] || []).find(item => item.id === chapterId)
    return {
      body: chapter?.body ?? null,
      chapterExists: Boolean(chapter),
      chapterKeys: chapter ? Object.keys(chapter) : [],
    }
  }, { volumeId: VOLUME_ID, chapterId })
  const bodyValue = body.body
  const diagnostics = {
    chapterExists: body.chapterExists,
    chapterKeys: body.chapterKeys,
    bodyType: bodyValue === null ? 'null' : typeof bodyValue,
    bodyKeys: bodyValue && typeof bodyValue === 'object' ? Object.keys(bodyValue) : [],
    bodyPreview: (() => {
      try {
        return String(typeof bodyValue === 'string' ? bodyValue : JSON.stringify(bodyValue)).slice(0, 500)
      } catch {
        return '<unserializable>'
      }
    })(),
  }
  assert(diagnostics.bodyType === 'string' && diagnostics.bodyPreview.length > 0,
    `body artifact exists before successful-terminal reentry, diagnostics=${JSON.stringify(diagnostics)}`)
  return bodyValue
}

async function runSuccessfulTerminalReentry(page, { previousBodyRunId, previousBodyHash, chapterId }) {
  const previousBody = await readBodyArtifact(page, chapterId)
  const previousBodySnapshot = {
    previousBodyRunId,
    previousBodyHash,
    previousBodyPreview: String(previousBody || '').slice(0, 2000),
    previousBodyChars: String(previousBody || '').length,
  }
  const before = await layerSnapshot(page, chapterId)
  assert.equal(before.body?.status, 'succeeded',
    `body is in successful terminal state before reentry, got ${before.body?.status}`)
  // A successful body generation may auto-insert into the editor and close
  // this panel, but terminal assertions can also leave it open. Reopen only
  // when needed, through the same sidebar button a user would click.
  await ensurePipelinePanelOpen(page)
  await selectPipelineStep(page, 4)
  try {
    await page.click('#btn-primary-gen-body')
  } catch (error) {
    const failureShot = path.join(EVIDENCE_ROOT, 'reentry-button-failure.png')
    await page.screenshot({ path: failureShot, fullPage: true }).catch(() => {})
    const diagnostics = await page.evaluate(() => {
      const button = document.querySelector('#btn-primary-gen-body')
      const closeButtons = [...document.querySelectorAll('.pl-gen-bar-close')]
      const rect = button?.getBoundingClientRect()
      const centerX = rect ? rect.left + rect.width / 2 : -1
      const centerY = rect ? rect.top + rect.height / 2 : -1
      const hit = rect ? document.elementFromPoint(centerX, centerY) : null
      return {
        url: window.location.href,
        buttonExists: Boolean(button),
        buttonDisabled: button?.disabled ?? null,
        buttonRect: rect ? {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        } : null,
        hitTag: hit?.tagName ?? null,
        hitId: hit?.id ?? null,
        hitClass: hit?.getAttribute('class') ?? null,
        closeButtonCount: closeButtons.length,
        bodyTextStart: document.body.innerText.slice(0, 1000),
      }
    }).catch(error => ({ evaluateError: String(error) }))
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'reentry-button-diagnostics.json'),
      JSON.stringify(diagnostics, null, 2), 'utf8')
    throw error
  }
  const deadline = Date.now() + STEP_TIMEOUT_MS
  let snapshot = null
  while (Date.now() < deadline) {
    snapshot = await layerSnapshot(page, chapterId)
    const reentryRun = (snapshot.allRuns || [])
      .filter(run => run.layer === 'body' && run.runId !== previousBodyRunId)
      .findLast(run => run.status === 'succeeded')
    if (reentryRun) {
      snapshot.reentryRun = reentryRun
      break
    }
    const failedReentryRun = (snapshot.allRuns || [])
      .filter(run => run.layer === 'body' && run.runId !== previousBodyRunId)
      .findLast(run => run.status === 'failed')
    if (failedReentryRun) break
    await sleep(1000)
  }
  const reentryRun = snapshot?.reentryRun
  assert(reentryRun?.runId && reentryRun.runId !== previousBodyRunId,
    `body terminal-state reentry creates a new run id, got ${reentryRun?.runId || 'none'}; bodyRuns=${JSON.stringify((snapshot?.allRuns || []).filter(run => run.layer === 'body'))}`)
  assert.equal(reentryRun.status, 'succeeded',
    `body terminal-state reentry run succeeds, got ${reentryRun.status}`)
  const newBodyChapterId = reentryRun.target || chapterId
  const newBody = await readBodyArtifact(page, newBodyChapterId)
  const newBodyHash = sha256(newBody)
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'reentry-body-artifact-diagnostics.json'), JSON.stringify({
    ...previousBodySnapshot,
    previousBodyRunId,
    newBodyRunId: reentryRun.runId,
    newBodyStatus: reentryRun.status,
    newBodyTarget: newBodyChapterId,
    newBodyHash,
    newBodyPreview: String(newBody || '').slice(0, 2000),
    newBodyChars: String(newBody || '').length,
    bodyRuns: (snapshot.allRuns || [])
      .filter(run => run.layer === 'body')
      .map(run => ({
        runId: run.runId,
        target: run.target,
        status: run.status,
        progress: run.progress,
      })),
    traceRuns: snapshot.traceRuns,
  }, null, 2), 'utf8')
  if (newBodyChapterId === chapterId) {
    assert(newBodyHash !== previousBodyHash,
      'successful-terminal reentry writes a new body artifact for the same chapter; the old hash must not masquerade as new output')
  } else {
    const previousChapterBody = await readBodyArtifact(page, chapterId)
    assert.equal(sha256(previousChapterBody), previousBodyHash,
      'successful-terminal reentry does not overwrite the unrelated previous body artifact')
  }
  return {
    newBodyRunId: reentryRun.runId,
    newBodyChapterId,
    newBodyHash,
    newBodyChars: newBody.length,
  }
}

async function waitForBodyTerminalState(page, { excludeRunIds = [], expectedStatus, timeoutMs }) {
  const deadline = Date.now() + (timeoutMs || STEP_TIMEOUT_MS)
  let last = null
  while (Date.now() < deadline) {
    last = await layerSnapshot(page)
    const candidate = (last.allRuns || [])
      .filter(run => run.layer === 'body' && !excludeRunIds.includes(run.runId))
      .find(run => run.status === expectedStatus)
    if (candidate) {
      return { run: candidate, snapshot: last }
    }
    if ((last.allRuns || []).some(run =>
      run.layer === 'body' && !excludeRunIds.includes(run.runId) && run.status === 'failed')) {
      break
    }
    await sleep(500)
  }
  throw new Error(`body run did not reach ${expectedStatus}: ${JSON.stringify(last?.allRuns?.filter(run => run.layer === 'body'))}`)
}

async function readLatestBodyRunEvents(page, runId) {
  return page.evaluate(({ wantedRunId }) => {
    const trace = window.__pinia?._s?.get('runTrace')
    const run = [...(trace?.runs || [])].find(item => item.pipelineRunId === wantedRunId)
    return {
      events: (run?.events || []).map(event => ({
        type: event.type,
        level: event.level,
        detail: String(event.detail || '').slice(0, 500),
      })),
      apiCallCount: (run?.apiCalls || []).length,
      status: run?.status || null,
    }
  }, { wantedRunId: runId })
}

async function startBodyReentry(page) {
  const before = await layerSnapshot(page)
  const previousBodyRunId = (before.allRuns || [])
    .filter(run => run.layer === 'body')
    .findLast(run => run.status === 'failed' || run.status === 'succeeded')?.runId || null
  assert(previousBodyRunId?.startsWith('pipeline-run-'),
    `previous body run id is a pipeline run id, got ${previousBodyRunId}`)
  await page.click('#btn-primary-gen-body')
  return { previousBodyRunId }
}

function bodyRequestCount(provider) {
  assert(provider, 'request-count helper requires an injectable provider')
  return provider.requests().filter(item => item.kind === 'body').length
}

async function reopenPipelineBodyPanel(page) {
  const panelAlreadyOpen = await page.locator('#pipeline-panel').isVisible()
  if (!panelAlreadyOpen) {
    await page.click('#btn-pipeline')
  }
  await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  await selectPipelineStep(page, 4)
}

async function runBreakpointReentry(page, provider, chapterId = CHAPTER_ID) {
  // The chain is now real: S1 succeeds, S2 fails once, and the failure
  // checkpoint must be resumed by the next real UI generation click.
  const requestsBefore = bodyRequestCount(provider)
  provider.enqueueFailure({
    kind: 'body',
    step: 2,
    status: 401,
    failure: 'terminal_auth_error',
    message: 'injected S2 terminal auth failure',
  })
  const knownBodyRunIds = (await layerSnapshot(page)).allRuns
    .filter(run => run.layer === 'body')
    .map(run => run.runId)
  await reopenPipelineBodyPanel(page)
  await page.click('#btn-primary-gen-body')
  const failed = await waitForBodyTerminalState(page, {
    excludeRunIds: knownBodyRunIds,
    expectedStatus: 'failed',
    timeoutMs: STEP_TIMEOUT_MS,
  })
  const failedRunEvents = await readLatestBodyRunEvents(page, failed.run.runId)
  const requestsAfterFailure = bodyRequestCount(provider)
  assert(requestsAfterFailure > requestsBefore,
    `failed breakpoint attempt issues a real physical request (${requestsBefore} -> ${requestsAfterFailure})`)
  assert((failedRunEvents.events || []).some(event => event.type === 'failed' || event.type === 'error'),
    `failed breakpoint run records its failure trace event`)
  assert((failedRunEvents.events || []).some(event => event.type === 'api-failed'),
    `failed breakpoint run records its API failure trace event`)

  const resumeRequestsBefore = bodyRequestCount(provider)
  await reopenPipelineBodyPanel(page)
  await page.click('#btn-primary-gen-body')
  const resumed = await waitForBodyTerminalState(page, {
    excludeRunIds: [...knownBodyRunIds, failed.run.runId],
    expectedStatus: 'succeeded',
    timeoutMs: STEP_TIMEOUT_MS,
  })
  assert(resumed.run.runId !== failed.run.runId,
    `breakpoint reentry creates a new run id (${failed.run.runId} -> ${resumed.run.runId})`)
  const resumedRunEvents = await readLatestBodyRunEvents(page, resumed.run.runId)
  const resumeRequestsAfter = bodyRequestCount(provider)
  assert(resumeRequestsAfter > resumeRequestsBefore,
    `breakpoint reentry issues new physical requests (${resumeRequestsBefore} -> ${resumeRequestsAfter})`)
  assert((resumedRunEvents.events || []).some(event => event.type === 'chain-handoff-resume'),
    `breakpoint reentry records chain-handoff-resume; got ${JSON.stringify(resumedRunEvents.events.map(event => event.type))}`)
  assert.equal(resumedRunEvents.status, 'success',
    `breakpoint reentry trace succeeds, got ${resumedRunEvents.status}`)
  const newBody = await readBodyArtifact(page, chapterId)
  assert(newBody.length > 0, 'breakpoint reentry delivers a body artifact')
  return {
    failedRunId: failed.run.runId,
    resumedRunId: resumed.run.runId,
    failedPhysicalRequests: requestsAfterFailure - requestsBefore,
    resumedPhysicalRequests: resumeRequestsAfter - resumeRequestsBefore,
    resumedEventTypes: resumedRunEvents.events.map(event => event.type),
    finalBodyChars: newBody.length,
  }
}

async function runFailedTerminalReentry(page, provider, chapterId = CHAPTER_ID) {
  const requestsBefore = bodyRequestCount(provider)
  const knownBodyRunIds = (await layerSnapshot(page)).allRuns
    .filter(run => run.layer === 'body')
    .map(run => run.runId)
  provider.enqueueFailure({
    kind: 'body',
    status: 401,
    failure: 'terminal_auth_error',
    message: 'injected terminal provider failure',
  })
  await reopenPipelineBodyPanel(page)
  await page.click('#btn-primary-gen-body')
  const failed = await waitForBodyTerminalState(page, {
    excludeRunIds: knownBodyRunIds,
    expectedStatus: 'failed',
    timeoutMs: STEP_TIMEOUT_MS,
  })
  const failedRunId = failed.run.runId
  const requestsAfterFailure = bodyRequestCount(provider)
  assert(requestsAfterFailure > requestsBefore,
    `failed terminal attempt issues a real physical request (${requestsBefore} -> ${requestsAfterFailure})`)

  const reentryRequestsBefore = bodyRequestCount(provider)
  await reopenPipelineBodyPanel(page)
  await page.click('#btn-primary-gen-body')
  const succeeded = await waitForBodyTerminalState(page, {
    excludeRunIds: [...knownBodyRunIds, failedRunId],
    expectedStatus: 'succeeded',
    timeoutMs: STEP_TIMEOUT_MS,
  })
  assert(succeeded.run.runId !== failedRunId,
    `failed-terminal reentry creates a new run id (${failedRunId} -> ${succeeded.run.runId})`)
  const reentryRequestsAfter = bodyRequestCount(provider)
  assert(reentryRequestsAfter > reentryRequestsBefore,
    `failed-terminal reentry issues new physical requests (${reentryRequestsBefore} -> ${reentryRequestsAfter})`)
  const reentryRunEvents = await readLatestBodyRunEvents(page, succeeded.run.runId)
  assert.equal(reentryRunEvents.status, 'success',
    `failed-terminal reentry trace succeeds, got ${reentryRunEvents.status}`)
  assert(!(reentryRunEvents.events || []).some(event => event.type === 'chain-completed-checkpoint-rejected'),
    `failed-terminal reentry is not blocked by a completed-chain checkpoint`)
  const newBody = await readBodyArtifact(page, chapterId)
  assert(newBody.length > 0, 'failed-terminal reentry delivers a body artifact')
  return {
    failedRunId,
    reentryRunId: succeeded.run.runId,
    failedPhysicalRequests: requestsAfterFailure - requestsBefore,
    reentryPhysicalRequests: reentryRequestsAfter - reentryRequestsBefore,
    finalBodyChars: newBody.length,
  }
}

function assertNoProviderKeyLeak({ report, exportedTraceDirectories }) {
  const encConfig = LIVE_MODE ? readLiveProviderConfig() : null
  const encryptedKeys = encConfig ? encConfig.providers.map(item => String(item.apiKey || '')) : []
  const isolatedBridge = LIVE_MODE ? decryptLiveProviderKeyOnce() : null
  const decryptedKey = isolatedBridge?.apiKey || null
  const files = [
    { name: 'report.json', text: JSON.stringify(report || {}) },
    { name: 'electron-run.log', text: fs.existsSync(RUN_LOG_PATH) ? fs.readFileSync(RUN_LOG_PATH, 'utf8') : '' },
    { name: 'heartbeat.jsonl', text: fs.existsSync(HEARTBEAT_PATH) ? fs.readFileSync(HEARTBEAT_PATH, 'utf8') : '' },
    ...exportedTraceDirectories.map(directory => {
      const tracePath = path.join(directory, 'run-trace.json')
      return {
        name: path.relative(ROOT, tracePath),
        text: fs.existsSync(tracePath) ? fs.readFileSync(tracePath, 'utf8') : '',
      }
    }),
  ]
  const findings = []
  for (const file of files) {
    for (const key of encryptedKeys) {
      if (key && file.text.includes(key)) findings.push(`${file.name}: encrypted provider key`)
    }
    if (decryptedKey && file.text.includes(decryptedKey)) {
      findings.push(`${file.name}: decrypted provider key`)
    }
    if (/(sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})/.test(file.text)) {
      findings.push(`${file.name}: plaintext provider key pattern`)
    }
  }
  assert.equal(findings.length, 0, `live evidence contains no provider key material: ${findings.join('; ')}`)
  return {
    checkedFiles: files.map(file => file.name),
    checkedEncryptedKeyCount: encryptedKeys.length,
    checkedDecryptedKey: Boolean(decryptedKey),
    plaintextPatternFound: false,
  }
}

async function collectSummary(page, bodyArtifactChapterId = CHAPTER_ID) {
  return page.evaluate(({ volumeId, chapterId, bodyArtifactChapterId }) => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const project = window.__pinia?._s?.get('project')
    const chapters = project?.chapters?.[volumeId] || []
    const chapter = chapters.find(item => item.id === chapterId)
    const bodyArtifactChapter = chapters.find(item => item.id === bodyArtifactChapterId)
    return {
      runs: (pipeline?.runs || []).map(run => ({
        runId: run.runId,
        layer: run.layer,
        target: run.target,
        status: run.status,
        progress: run.progress,
      })),
      chapterBodyChars: String(chapter?.body || '').length,
      bodyArtifactChapterId,
      bodyArtifactType: bodyArtifactChapter?.body === undefined ? 'missing' : typeof bodyArtifactChapter.body,
      bodyArtifactChars: String(bodyArtifactChapter?.body || '').length,
      volumeCount: (project?.volumes || []).length,
      chapterCount: (project?.chapters?.[volumeId] || []).length,
    }
  }, { volumeId: VOLUME_ID, chapterId: CHAPTER_ID, bodyArtifactChapterId })
}

async function startSecondBodyRun(page) {
  await selectPipelineStep(page, 4)
  const before = await layerSnapshot(page)
  const firstBodyRun = (before.allRuns || [])
    .filter(run => run.layer === 'body')
    .findLast(run => run.status === 'running' || run.status === 'queued')
  assert(firstBodyRun?.runId, 'the first body run is still active before queuing the second')
  assert.equal(firstBodyRun.target, CHAPTER_ID,
    `the first body run targets the seeded first chapter, got ${firstBodyRun.target}`)

  const chapterSelect = page.locator('#pl-context-summary select').nth(1)
  const chapterOptions = chapterSelect.locator('option')
  const optionCount = await chapterOptions.count()
  assert(optionCount >= 2,
    `body chapter selector exposes the seeded second chapter, got ${optionCount} options`)
  const secondOptionText = ((await chapterOptions.nth(1).textContent()) || '').trim()
  await chapterSelect.selectOption({ index: 1 })
  await page.click('#btn-primary-gen-body')

  const deadline = Date.now() + 10_000
  let snapshot = null
  while (Date.now() < deadline) {
    snapshot = await layerSnapshot(page)
    const queuedBodyRun = (snapshot.allRuns || [])
      .find(run => run.layer === 'body' && run.target === SECOND_CHAPTER_ID && run.status === 'queued')
    if (queuedBodyRun) return {
      firstBodyRunId: firstBodyRun.runId,
      queuedBodyRunId: queuedBodyRun.runId,
      secondOptionText,
      snapshot,
    }
    await sleep(100)
  }
  throw new Error(`second body run never became queued: ${JSON.stringify(snapshot?.allRuns?.filter(run => run.layer === 'body'))}`)
}

async function assertSameLayerQueueIsolation({ page, provider, firstBodyRunId, queuedBodyRunId }) {
  assert(queuedBodyRunId && queuedBodyRunId !== firstBodyRunId,
    `queued body run has its own run id (${firstBodyRunId} -> ${queuedBodyRunId})`)
  const requestsBefore = provider ? provider.requests().length : 0
  await sleep(3_000)
  if (provider) {
    const newRequests = provider.requests().slice(requestsBefore)
    assert(newRequests.every(item => !item.chapterHints?.includes('第2章 航行图')),
      `queued body run does not dispatch physical requests for its target, got ${JSON.stringify(newRequests)}`)
  }
  const queuedSnapshot = await layerSnapshot(page)
  const runningBody = (queuedSnapshot.allRuns || []).find(run =>
    run.runId === firstBodyRunId && run.status === 'running')
  const queuedBody = (queuedSnapshot.allRuns || []).find(run =>
    run.runId === queuedBodyRunId && run.status === 'queued')
  assert(runningBody, `first body run keeps running while its sibling queues: ${JSON.stringify(queuedSnapshot.allRuns)}`)
  assert(queuedBody, `queued body run keeps queued state: ${JSON.stringify(queuedSnapshot.allRuns)}`)

  const bodyProgressbar = page.locator('#pl-step-5-content .pl-gen-bar').first()
  if (await bodyProgressbar.count() !== 1) {
    await captureBodyQueueDiagnostics(page, queuedSnapshot)
  }
  assert(await bodyProgressbar.count() === 1,
    'body progress bar exists while the same-layer queue is active')
  await bodyProgressbar.waitFor({ state: 'visible', timeout: 20_000 })
  const progressStatusText = ((await bodyProgressbar.locator('.pl-gen-bar-status').textContent()) || '').trim()
  assert(!/同层生成中|排队/.test(progressStatusText),
    `body progress bar displays the running run, not the queued sibling, got "${progressStatusText}"`)
  const runCenterRows = await page.locator('#pipeline-run-center .pipeline-run-center-row').count()
  assert(runCenterRows >= 2,
    `run center shows both same-layer body runs separately, got ${runCenterRows} rows`)
  const queuedRow = page.locator(
    `#pipeline-run-center .pipeline-run-center-row[data-run-id="${queuedBodyRunId}"]`)
  assert(await queuedRow.count() === 1,
    'run center has exactly one row for the queued body run')
  const queuedRowStatus = ((await queuedRow.locator('.pipeline-run-status').textContent()) || '').trim()
  assert(queuedRowStatus.includes('排队'),
    `run center displays the queued body run with a queue status, got "${queuedRowStatus}"`)

  const bodyCancelButton = page.locator('#pl-step-5-content .pl-gen-bar-cancel').first()
  assert(await bodyCancelButton.count() === 1,
    'body progress bar exposes its own cancel button while the first run is displayed')
  await bodyCancelButton.click()
  await page.waitForFunction(firstRunId => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const run = pipeline?.runs?.find(item => item.runId === firstRunId)
    return run?.status === 'canceled'
  }, firstBodyRunId, { timeout: 10_000 })
  const canceledSnapshot = await layerSnapshot(page)
  assert.equal((canceledSnapshot.allRuns || []).find(run => run.runId === firstBodyRunId)?.status,
    'canceled', 'progress-bar cancellation only terminates the displayed running body run')
  assert.equal((canceledSnapshot.allRuns || []).find(run => run.runId === queuedBodyRunId)?.status,
    'running', 'queued body run wakes up after the displayed run is canceled')

  await page.waitForFunction(queuedRunId => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const run = pipeline?.runs?.find(item => item.runId === queuedRunId)
    return run?.status === 'succeeded' || run?.status === 'failed' || run?.status === 'canceled'
  }, queuedBodyRunId, { timeout: STEP_TIMEOUT_MS })
  const terminalSnapshot = await layerSnapshot(page)
  const queuedTerminal = (terminalSnapshot.allRuns || []).find(run => run.runId === queuedBodyRunId)
  assert.equal(queuedTerminal?.status, 'succeeded',
    `woken body run reaches success, got ${queuedTerminal?.status}`)
  return {
    firstBodyRunId,
    queuedBodyRunId,
    queuedPhysicalRequests: 0,
    displayedRunCanceledWhileQueuedSurvived: true,
    queuedTerminalStatus: queuedTerminal.status,
  }
}

async function captureBodyQueueDiagnostics(page, queuedSnapshot) {
  const dom = await page.evaluate(() => {
    const panel = document.querySelector('#pl-step-5-content')
    const bar = panel?.querySelector('.pl-gen-bar') || null
    return {
      panelExists: Boolean(panel),
      panelVisible: panel ? getComputedStyle(panel).display !== 'none' : false,
      progressBars: [...(panel?.querySelectorAll('.pl-gen-bar') || [])].map(item => ({
        className: item.className,
        text: item.textContent,
        visible: getComputedStyle(item).display !== 'none',
      })),
      selectedChapter: document.querySelectorAll('#pl-context-summary select')[1]?.selectedOptions[0]?.textContent || null,
      bodyButton: (() => {
        const button = document.querySelector('#btn-primary-gen-body')
        return button ? { disabled: button.disabled, text: button.textContent } : null
      })(),
    }
  }).catch(error => ({ error: String(error?.message || error) }))
  const screenshot = path.join(EVIDENCE_ROOT, 'body-queue-progress-missing.png')
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {})
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'body-queue-progress-missing.json'), JSON.stringify({
    at: new Date().toISOString(),
    queuedSnapshot,
    dom,
    consoleMessages: rendererConsoleMessages.slice(-100),
    pageErrors: rendererPageErrors.slice(-20),
    screenshot,
  }, null, 2), 'utf8')
}

async function main() {
  console.log(`[${SCRIPT_NAME}] start`)
  console.log(`[MODE] ${LIVE_MODE ? 'live-supplier' : 'mock-provider'}`)
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(RUN_LOG_PATH, '', 'utf8')
  fs.writeFileSync(HEARTBEAT_PATH, '', 'utf8')
  assertFreshRendererBuild()
  await removeDir(PROFILE)
  await removeDir(EXPORT_ROOT)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })

  const provider = LIVE_MODE ? null : await startProvider()
  let liveProxy = null
  let liveBridge = null
  if (provider) {
    console.log(`[PROVIDER] http://127.0.0.1:${provider.port}`)
  } else {
    liveBridge = decryptLiveProviderKeyOnce()
    const liveConfig = readLiveProviderConfig()
    liveProxy = await startLiveFailureProxy({
      targetBaseUrl: liveConfig.providers[0].baseUrl,
      apiKey: liveBridge.apiKey,
    })
    console.log(`[LIVE PROXY] http://127.0.0.1:${liveProxy.port} -> ${liveConfig.providers[0].baseUrl}`)
  }
  const app = startElectron()
  const timeout = setTimeout(() => {
    console.error(`[FATAL] global timeout ${GLOBAL_TIMEOUT_MS}ms`)
    closeElectron(app)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  let browser = null
  let page = null
    let heartbeat = null
    let bodyArtifactChapterId = CHAPTER_ID
  let exitCode = 0
  try {
    assert(await waitForCdp(), 'Electron CDP becomes reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    page = await connectPage(browser)
    page.on('console', message => {
      rendererConsoleMessages.push({
        at: new Date().toISOString(),
        type: message.type(),
        text: message.text(),
      })
    })
    page.on('pageerror', error => {
      rendererPageErrors.push({
        at: new Date().toISOString(),
        message: String(error?.message || error),
      })
    })
    heartbeat = startHeartbeat(page, app.pid)
    await seedApplication(page, { mockProvider: provider, liveProxy, liveBridge })
    writeChainSkills()

    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })

    await selectPipelineStep(page, 4)
    const selectedBodySkillIds = await selectBodyChainSkillsThroughUi(page)
    assert.equal(selectedBodySkillIds.length, 3,
      `body chain has three real folder skills selected through UI, got ${selectedBodySkillIds.length}`)

    await selectPipelineStep(page, 2)
    await page.click('#btn-pl-gen-volumes')
    await selectPipelineStep(page, 3)
    await page.click('#btn-pl-gen-chapters')
    await selectPipelineStep(page, 4)
    await page.click('#btn-primary-gen-body')

    const concurrentSnapshot = await waitForThreeActiveRuns(page)
    assertConcurrentUiState(concurrentSnapshot)
    console.log('[PARALLEL] three layers are concurrently active with distinct run ids')

    const chaptersRunId = concurrentSnapshot.chapters.runId
    const cancelTiming = await cancelChaptersRun(page, chaptersRunId)
    assert(cancelTiming.clickToCanceledMs <= 10_000,
      `chapter cancellation is immediate enough, took ${cancelTiming.clickToCanceledMs}ms`)
    console.log(`[CANCEL] chapters canceled in ${cancelTiming.clickToCanceledMs}ms; other layers continue`)

    const volumeStreamOwnership = await assertActiveRunStreamOwnership(
      page, concurrentSnapshot, 'volumes', 2, 'pl-volume-api-log')
    const bodyStreamOwnership = await assertActiveRunStreamOwnership(
      page, concurrentSnapshot, 'body', 4, 'pl-body-api-log')
    console.log('[STREAM OWNERSHIP] active volume/body streams render in their owning progress bars')

    const activeClosePreservation = await assertCloseDuringRunPreservesExecution(
      page, concurrentSnapshot, 'body', 4, 'pl-body-api-log')
    console.log(`[STREAM OWNERSHIP] close path preserves executing body run ${activeClosePreservation.pipelineRunId}`)

    let sameLayerQueue = null
    if (provider || liveProxy) {
      const queued = await startSecondBodyRun(page)
      sameLayerQueue = await assertSameLayerQueueIsolation({
        page,
        provider: provider || liveProxy,
        firstBodyRunId: queued.firstBodyRunId,
        queuedBodyRunId: queued.queuedBodyRunId,
      })
      console.log(`[SAME-LAYER QUEUE] first=${sameLayerQueue.firstBodyRunId} queued=${sameLayerQueue.queuedBodyRunId} wake=${sameLayerQueue.queuedTerminalStatus}`)
      bodyArtifactChapterId = SECOND_CHAPTER_ID
    }

    const terminalSnapshot = await waitForTerminalStates(page, {
      volumes: 'succeeded',
      chapters: 'canceled',
      body: 'succeeded',
    }, bodyArtifactChapterId)
    if (sameLayerQueue) {
      assert.equal(sameLayerQueue.queuedTerminalStatus, 'succeeded',
        'same-layer queued body run completes after its displayed sibling is canceled')
    }
    const terminalVolumeClose = await assertTerminalCloseOnlyHidesFeedback(
      page, terminalSnapshot, 'volumes', 2, 'pl-volume-api-log')
    const terminalBodyClose = await assertTerminalCloseOnlyHidesFeedback(
      page, terminalSnapshot, 'body', 4, 'pl-body-api-log')
    console.log(`[STREAM OWNERSHIP] terminal close only hides feedback (${terminalVolumeClose.pipelineRunId}, ${terminalBodyClose.pipelineRunId})`)
    const summaryAfterTerminal = await collectSummary(page, bodyArtifactChapterId)
    assert(summaryAfterTerminal.volumeCount >= 2,
      `volume generation appends the seeded second volume, got ${summaryAfterTerminal.volumeCount}`)
    assert(terminalSnapshot.body?.status === 'canceled'
      || terminalSnapshot.body?.status === 'succeeded',
      `body run reaches a terminal state without being reset by chapter cancellation, got ${terminalSnapshot.body?.status}`)
    assert.equal(summaryAfterTerminal.bodyArtifactType, 'string',
      `successful body artifact keeps string contract, got ${summaryAfterTerminal.bodyArtifactType}`)
    assert(summaryAfterTerminal.bodyArtifactChars > 0,
      `successful body artifact exists, got ${summaryAfterTerminal.bodyArtifactChars} chars`)

    const performance = await readPerformanceSnapshot(page)
    assert.equal(performance.freezeCount, 0,
      `no main-thread freeze above ${performance.thresholds.freezeThresholdMs}ms`)
    assert.equal(performance.slowClickFeedbackCount, 0,
      `all run-start clicks report feedback within ${performance.thresholds.clickFeedbackBudgetMs}ms`)
    if (performance.longTaskCount > 0) {
      console.warn(`[PERF WARNING] long tasks observed: ${performance.longTaskCount}`)
    }

    let providerMetrics = null
    if (provider) {
      providerMetrics = assertProviderRequests(provider.requests())
      console.log(`[PROVIDER] requests=${providerMetrics.requestCount} maxConcurrency=${providerMetrics.maxConcurrency}`)
    } else if (liveProxy) {
      const proxyRequests = liveProxy.requests()
      assert(proxyRequests.length > 0,
        'live proxy observed at least one real provider request')
      assert(proxyRequests.every(item => item.model === LIVE_MODEL_NAME),
        `live requests use the configured real model, got ${JSON.stringify(proxyRequests.map(item => item.model))}`)
    }

    const volumeRun = await exportLayerRun(page, 2)
    const chapterRun = await exportLayerRun(page, 3)
    const bodyRun = await exportLayerRun(page, 4)
    assertExportedTrace({ step: 2, run: volumeRun.run, expectedStatus: 'success' })
    assertExportedTrace({ step: 3, run: chapterRun.run, expectedStatus: 'canceled' })
    assertExportedTrace({ step: 4, run: bodyRun.run, expectedStatus: 'success' })
    assertProviderQueueEvidence({ volumeRun: volumeRun.run, bodyRun: bodyRun.run })

    const requestProvider = provider || liveProxy
    const bodyRequestsBefore = provider
      ? bodyRequestCount(provider)
      : bodyRequestCount(liveProxy)
    const previousBodyArtifact = await readBodyArtifact(page, bodyArtifactChapterId)
    const previousBodyHash = sha256(previousBodyArtifact)
    const previousBodyRunId = terminalSnapshot.body?.runId
    assert(previousBodyRunId?.startsWith('pipeline-run-'),
      `previous body run id is a pipeline run id, got ${previousBodyRunId}`)
    const reentry = await runSuccessfulTerminalReentry(page, {
      previousBodyRunId,
      previousBodyHash,
      chapterId: bodyArtifactChapterId,
    })
    const bodyRequestsAfter = bodyRequestCount(requestProvider)
    assert(bodyRequestsAfter > bodyRequestsBefore,
      `successful-terminal reentry issues a new physical body request (${bodyRequestsBefore} -> ${bodyRequestsAfter})`)
    assert(reentry.newBodyRunId !== previousBodyRunId,
      'successful-terminal reentry creates a new body run id')

    const breakpointReentry = (provider || liveProxy)
      ? await runBreakpointReentry(page, provider || liveProxy, bodyArtifactChapterId)
      : null
    if (breakpointReentry) {
      console.log(`[BREAKPOINT] failed=${breakpointReentry.failedRunId} resumed=${breakpointReentry.resumedRunId} requests=${breakpointReentry.failedPhysicalRequests}/${breakpointReentry.resumedPhysicalRequests}`)
    }

    const failedTerminalReentry = (provider || liveProxy)
      ? await runFailedTerminalReentry(page, provider || liveProxy, bodyArtifactChapterId)
      : null
    if (failedTerminalReentry) {
      console.log(`[FAILED-REENTRY] failed=${failedTerminalReentry.failedRunId} resumed=${failedTerminalReentry.reentryRunId} requests=${failedTerminalReentry.failedPhysicalRequests}/${failedTerminalReentry.reentryPhysicalRequests}`)
    }

    const liveCalls = provider ? null : await collectLiveApiCalls(page)
    if (liveCalls) {
      providerMetrics = assertLiveProviderMetrics(liveCalls)
      console.log(`[LIVE PROVIDER] requests=${providerMetrics.requestCount} maxConcurrency=${providerMetrics.maxConcurrency}`)
    }
    const keyLeakCheck = LIVE_MODE
      ? assertNoProviderKeyLeak({
        report: { providerMetrics },
        exportedTraceDirectories: [volumeRun.directory, chapterRun.directory, bodyRun.directory],
      })
      : null

    const summary = await collectSummary(page, bodyArtifactChapterId)
    const report = {
      script: SCRIPT_NAME,
      at: new Date().toISOString(),
      result: 'PASS',
      concurrentSnapshot,
      cancelTiming,
      terminalSnapshot,
      streamOwnership: {
        active: { volumes: volumeStreamOwnership, body: bodyStreamOwnership },
        activeClosePreservation,
        terminalClose: { volumes: terminalVolumeClose, body: terminalBodyClose },
      },
      sameLayerQueue,
      providerMetrics,
      performance,
      traces: {
        volume: { runId: volumeRun.runId, directory: volumeRun.directory, status: volumeRun.run.status },
        chapter: { runId: chapterRun.runId, directory: chapterRun.directory, status: chapterRun.run.status },
        body: { runId: bodyRun.runId, directory: bodyRun.directory, status: bodyRun.run.status },
      },
      reentry: {
        previousBodyRunId,
        newBodyRunId: reentry.newBodyRunId,
        previousBodyChapterId: bodyArtifactChapterId,
        newBodyChapterId: reentry.newBodyChapterId,
        previousBodyHash,
        newBodyHash: reentry.newBodyHash,
        newBodyChars: reentry.newBodyChars,
        bodyPhysicalRequests: { before: bodyRequestsBefore, after: bodyRequestsAfter },
      },
      breakpointReentry,
      failedTerminalReentry,
      keyLeakCheck,
      mode: LIVE_MODE ? 'live-supplier' : 'mock-provider',
      summary,
      coverage: {
        freshStart: true,
        successfulTerminalReentry: true,
        canceledRunIsolation: true,
        sameLayerQueue: Boolean(sameLayerQueue),
        breakpointReentry: Boolean(breakpointReentry),
        failedTerminalReentry: Boolean(failedTerminalReentry),
        note: LIVE_MODE
          ? 'live 供应商矩阵覆盖真实 UI 启动、三层并发、取消隔离、同层排队、成功终态再入、断点恢复、失败终态再入；故障注入发生在本地代理层，成功请求仍由真实供应商完成。'
          : '四格再入均在真实 UI 点击与真实物理请求路径触发。',
      },
    }
    const reportWrite = await writeJsonEvidence(path.join(EVIDENCE_ROOT, 'report.json'), report)
    report.evidenceWrite = reportWrite
    if (provider) {
      await writeJsonEvidence(path.join(EVIDENCE_ROOT, 'provider-requests.json'), provider.requests())
    } else if (liveProxy) {
      await writeJsonEvidence(path.join(EVIDENCE_ROOT, 'provider-requests.json'), {
        proxyRequests: liveProxy.requests(),
        applicationCalls: liveCalls,
      })
    } else if (liveCalls) {
      await writeJsonEvidence(path.join(EVIDENCE_ROOT, 'provider-requests.json'), liveCalls)
    }
    await removeDir(EXPORT_ROOT)
    console.log(`[PASS] ${JSON.stringify({ ...report, performance: undefined }, null, 2)}`)
  } catch (error) {
    exitCode = 1
    console.error(`[PRIMARY FAIL] ${error?.stack || error}`)
    let traceDiagnostics = null
    let preservedExports = null
    let liveFailureRequests = null
    const primaryError = error
    try {
      traceDiagnostics = await exportFailureTraceDiagnostics(page)
      if (LIVE_MODE && page) {
        liveFailureRequests = await collectLiveApiCalls(page)
      }
      preservedExports = await preserveFailedExports()
    } catch (diagnosticError) {
      traceDiagnostics = { error: String(diagnosticError?.message || diagnosticError) }
      try {
        await writeJsonEvidence(path.join(EVIDENCE_ROOT, 'failure-trace-diagnostics.json'), {
            primaryError: String(primaryError?.stack || primaryError?.message || primaryError),
            diagnosticError: traceDiagnostics.error,
        })
      } catch {}
    }
    const failure = {
      script: SCRIPT_NAME,
      at: new Date().toISOString(),
      result: 'FAIL',
      error: String(error?.stack || error?.message || error),
      traceDiagnostics,
      mode: LIVE_MODE ? 'live-supplier' : 'mock-provider',
      preservedExports,
    }
    await writeJsonEvidence(path.join(EVIDENCE_ROOT, 'report.json'), failure)
    if (provider) {
      await writeJsonEvidence(path.join(EVIDENCE_ROOT, 'provider-requests.json'), provider.requests())
    } else if (liveProxy) {
      await writeJsonEvidence(path.join(EVIDENCE_ROOT, 'provider-requests.json'), {
        proxyRequests: liveProxy.requests(),
        applicationCalls: liveFailureRequests,
      })
    }
    if (liveFailureRequests) {
      await writeJsonEvidence(path.join(EVIDENCE_ROOT, 'provider-requests.json'), liveFailureRequests)
    }
    console.error(`[FAIL] ${failure.error}`)
  } finally {
    clearTimeout(timeout)
    heartbeat?.stop()
    await browser.close().catch(() => {})
    closeElectron(app)
    await provider?.close()
    await liveProxy?.close()
    if (!KEEP_PROFILE) await removeDir(PROFILE)
  }
  process.exit(exitCode)
}

await main()
