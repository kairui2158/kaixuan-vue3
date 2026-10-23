import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-settings-lock-projection-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_SETTINGS_LOCK_ELECTRON
  ? path.resolve(process.env.SHENYI_SETTINGS_LOCK_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_SETTINGS_LOCK_CDP_PORT || 9391)
const PROFILE = path.join(ROOT, '_data', 'settings-lock-projection-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-settings-lock-projection-electron')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_SETTINGS_LOCK_GLOBAL_TIMEOUT_MS || 10 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_SETTINGS_LOCK_STEP_TIMEOUT_MS || 150_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_SETTINGS_LOCK_STALLED_TIMEOUT_MS || 20_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_SETTINGS_LOCK_DEAD_TIMEOUT_MS || 45_000)
const KEEP_PROFILE = process.env.SHENYI_SETTINGS_LOCK_KEEP_PROFILE === '1'

const PROJECT_ID = 'settings-lock-projection'
const VOLUME_ID = 'vol-settings-lock'
const CHAPTER_ID = 'ch-settings-lock'
const CATEGORY = '人物'
const STYLE_CATEGORY = '风格'
const ITEM_CATEGORY = '物品'
const LEGACY_NAME = '王芳'
const LEGACY_CONTENT = '幽默，风趣，话痨'
const DRAFT_NAME = '林舟'
const DRAFT_CONTENT = '沉默，冷静，行动派'
const CONFLICT_STYLE_NAME = '人物基调'
const CONFLICT_STYLE_CONTENT = '幽默，话痨'
const SUPPORT_STYLE_NAME = '主题基调'
const SUPPORT_STYLE_CONTENT = '都市夜感，信息密度高'
const OVERFLOW_ITEM_COUNT = 60

const VOLUME_OUTLINE = [
  '## 剧情单元 H1-01 灯塔',
  '> 作用域：单元级 H1-01',
  '章节范围：第 1 章',
  '- 雨夜中，王芳在灯塔底层发现纸条，并确认风暴信标的三次红色闪烁。',
].join('\n')

const BODY_PARAGRAPH = '王芳把纸条压进灯座，顺手又开了三个玩笑。她的声音先于潮水抵达，塔灯在她的语句之间亮了一次又一次。风暴还没有停，可灯塔底层已经被她说成了一个热闹的房间。她一边核对信标的闪烁，一边把纸条上的每个字都念出声音来，仿佛沉默会被浪头偷走。'
const BODY_REPLY = Array.from({ length: 30 }, (_, index) => `${index + 1}. ${BODY_PARAGRAPH}`).join('\n\n')
const HOME_REPLY = '已按当前锁定设定讨论：王芳的说话方式保持幽默、风趣、话痨。'

const STYLE_PROFILE = {
  profileVersion: 2,
  styleTags: '冷峻，克制',
  pacingParams: '中速，高张力',
  pacingParamsObj: {
    speed: '中速',
    tension: 4,
    density: '密集',
    perspective: '第三人称',
    tone: '冷峻',
  },
  customStyleTags: [],
  aiPacingSnapshot: null,
  locked: true,
  lockedAt: Date.parse('2026-10-20T08:00:00Z'),
  source: 'manual',
  positioning: {
    coreTemperament: ['冷峻', '克制'],
    genreTags: ['都市悬疑'],
    oneLinePositioning: '冷雨夜中的克制叙事，幽默只允许短暂破冰。',
  },
}

function parseChineseRange(text, label) {
  const patterns = Array.isArray(label)
    ? label.map(item => new RegExp(`${item}第(\\d+)[章卷]到第(\\d+)[章卷]`))
    : [new RegExp(`${label}第(\\d+)[章卷]到第(\\d+)[章卷]`)]
  const match = patterns.map(pattern => text.match(pattern)).find(Boolean) || null
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  return Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start < 100
    ? { start, end }
    : null
}

function buildVolumeReply(userText) {
  const range = parseChineseRange(userText, '补充生成')
  const start = range?.start || 2
  const end = range?.end || start
  return JSON.stringify(Array.from({ length: end - start + 1 }, (_, index) => {
    const volumeNumber = start + index
    return {
      name: `第二卷 灯塔之后${volumeNumber > 2 ? `（${volumeNumber}）` : ''}`,
      outline: `风暴过后，王芳把灯塔里的第${volumeNumber}条线索拼进航行图。`,
      summary: `王芳揭开纸条背后的第${volumeNumber}段航线。`,
      allocatedWords: 12000,
      readerExpectations: '看到王芳用幽默化解紧张，并确认航线。',
      mainPlotLine: '灯塔线索指向南方渔港。',
      unlockMilestone: `航行图第${volumeNumber}段完整展开。`,
      forbiddenFinalCards: [],
      contractRisk: 'contract_safe',
    }
  }))
}

function buildChapterReply(userText) {
  const range = parseChineseRange(userText, ['生成', '补充生成', '缺失'])
  const start = range?.start || 2
  const end = range?.end || start
  return JSON.stringify(Array.from({ length: end - start + 1 }, (_, index) => {
    const chapterNumber = start + index
    return {
      title: `第${chapterNumber}章 航行图${chapterNumber > 2 ? `（${chapterNumber}）` : ''}`,
      plot: `王芳在第${chapterNumber}章拼出航行图，并用三个玩笑压住林舟的沉默。`,
      summary: `王芳拼出第${chapterNumber}段航行图。`,
    }
  }))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  assert.equal(staleBundles.length, 0, `renderer build is stale; run npm run build:vue first. Stale: ${staleBundles.join(', ')}`)
  const bundleText = bundleNames.map(name =>
    fs.readFileSync(path.join(ROOT, 'dist-renderer', name), 'utf8')).join('\n')
  assert(bundleText.includes('settings-projection-composed'),
    'renderer bundle contains the settings-projection-composed trace event')
  assert(bundleText.includes('设定锁定投影已组装'),
    'renderer bundle contains the locked-settings projection label')
  assert(!bundleText.includes('绑定设定：'),
    'renderer bundle does not retain the old duplicate bound-settings prompt channel')
  const manifestPath = path.join(ROOT, 'dist-renderer', 'build-manifest.json')
  assert(fs.existsSync(manifestPath), 'dist-renderer/build-manifest.json exists')
  const diskManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert(bundleText.includes(JSON.stringify(diskManifest)),
    'renderer bundle contains the same build manifest injected at runtime')
  return diskManifest
}

function startProvider() {
  const requests = []
  let providerPort = 0
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', `http://127.0.0.1:${providerPort}`)
    const isChatCompletion = request.method === 'POST' && url.pathname === '/v1/chat/completions'
    if (!isChatCompletion) {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: { message: `unexpected path: ${request.method} ${url.pathname}` } }))
      return
    }
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      const parsed = (() => { try { return JSON.parse(bodyText) } catch { return {} } })()
      const systemText = (parsed.messages || [])
        .filter(message => message?.role === 'system')
        .map(message => String(message.content || ''))
        .join('\n')
      const userText = (parsed.messages || [])
        .filter(message => message?.role === 'user')
        .map(message => String(message.content || ''))
        .join('\n')
      const isIntentClassifier = systemText.includes('意图分类器')
      let reply = BODY_REPLY
      const isVolumePrompt = userText.includes('[大纲]') || userText.includes('[全书大纲]')
      const isChapterPrompt = userText.includes('[卷纲]')
      if (isVolumePrompt && !isChapterPrompt
        && (userText.includes('[设定规划约束]') || userText.includes('[设定]'))) reply = buildVolumeReply(userText)
      else if (isChapterPrompt) reply = buildChapterReply(userText)
      else if (userText.includes('王芳在这章应该怎么说话？')
        && (systemText.includes('[当前上下文设定]') || userText.includes('人物 - 王芳'))) reply = HOME_REPLY
      if (isIntentClassifier) {
        reply = JSON.stringify({ intent: 'discuss', confidence: 0.98, reason: '设定锁定投影按讨论语义分类' })
      }
      requests.push({
        at: new Date().toISOString(),
        bodyText,
        model: parsed.model || null,
        wantsStream: parsed.stream === true,
        isIntentClassifier,
        messages: parsed.messages || [],
      })
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
          usage: { prompt_tokens: 12, completion_tokens: 24, total_tokens: 36 },
        })}\n\n`)
        response.write('data: [DONE]\n\n')
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: reply } }],
      }))
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      providerPort = server.address().port
      resolve({
        port: providerPort,
        requests: () => requests.map(item => ({ ...item })),
        reset: () => { requests.length = 0 },
        close: () => new Promise(done => server.close(() => done())),
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
    page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable')
  return page
}

async function seedApplication(page, provider) {
  await page.evaluate(async seed => {
    const {
      baseUrl,
      projectId,
      volumeId,
      chapterId,
      volumeOutline,
      category,
      styleCategory,
      itemCategory,
      legacyName,
      legacyContent,
      draftName,
      draftContent,
      conflictStyleName,
      conflictStyleContent,
      supportStyleName,
      supportStyleContent,
      overflowItemCount,
      styleProfile,
      wangFangMemory,
    } = seed
    const overflowItems = Array.from({ length: overflowItemCount }, (_, index) => ({
      id: `set-overflow-item-${index + 1}`,
      name: `灯塔备件${String(index + 1).padStart(2, '0')}`,
      category: itemCategory,
      content: `编号${index + 1}的旧铜制信标部件，长期存放在灯塔底层，只有王芳知道它的用途。`,
      attrs: { desc: `编号${index + 1}的旧铜制信标部件，长期存放在灯塔底层，只有王芳知道它的用途。` },
      status: 'locked',
      lockedAt: Date.parse('2026-10-20T08:10:00Z'),
      isBound: true,
    }))
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'settings-lock-provider',
        name: 'Settings Lock Provider',
        baseUrl,
        apiKey: 'local-test-key',
        models: ['settings-lock-model'],
        selectedModel: 'settings-lock-model',
        temperature: 0.1,
        maxTokens: 8192,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'settings-lock-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '设定锁定投影真实UI实测',
      outlineText: volumeOutline,
      outlineLocked: true,
      outlineLockedText: volumeOutline,
      bookWordCount: 12,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 1, volumeWords: 12000, chapterWords: 3500 },
      chaptersConfirmed: true,
      settingsGenerated: true,
      settings: [],
      styleProfile,
      volumes: [{
        id: volumeId,
        name: '第一卷 雨夜',
        index: 0,
        outline: volumeOutline,
        summary: '雨夜中的灯塔纸条。',
        suggestedWords: 12000,
        wordsPerChapter: 3500,
        confirmed: true,
        locked: true,
        isBound: true,
      }],
      chapters: {
        [volumeId]: [{
          id: chapterId,
          title: '第1章 纸条',
          index: 0,
          plot: '雨夜中，王芳在灯塔底层发现纸条，并确认风暴信标的三次红色闪烁。',
          summary: '王芳发现纸条。',
          confirmed: true,
          pipelineGenerated: true,
          unitId: 'H1-01',
        }],
      },
      settingBindings: {},
      settingsCollection: {
        categories: [category, styleCategory, itemCategory],
        items: {
          [category]: [
            {
              id: 'set-legacy-wangfang',
              name: legacyName,
              category,
              content: legacyContent,
              attrs: { desc: legacyContent },
              isBound: true,
            },
            {
              id: 'set-draft-linzhou',
              name: draftName,
              category,
              content: draftContent,
              attrs: { desc: draftContent },
            },
          ],
          [styleCategory]: [
            {
              id: 'set-style-conflict',
              name: conflictStyleName,
              category: styleCategory,
              content: conflictStyleContent,
              attrs: { desc: conflictStyleContent },
              status: 'locked',
              lockedAt: Date.parse('2026-10-20T08:11:00Z'),
              isBound: true,
            },
            {
              id: 'set-style-support',
              name: supportStyleName,
              category: styleCategory,
              content: supportStyleContent,
              attrs: { desc: supportStyleContent },
              status: 'locked',
              lockedAt: Date.parse('2026-10-20T08:12:00Z'),
              isBound: true,
            },
          ],
          [itemCategory]: overflowItems,
        },
      },
      memories: {
        version: 1,
        entities: [wangFangMemory],
        relations: [],
        events: [],
        world: [],
        foreshadowing: [],
        meta: {
          extractionCount: 1,
          lastExtractedAt: '2026-10-20T08:20:00Z',
          lastFullRebuildAt: null,
          pendingCount: 0,
          totals: { entities: 1, relations: 0, events: 0, world: 0, foreshadowing: 0 },
        },
        history: [],
        categories: ['情节', '人物', '世界观', '伏笔'],
        items: [],
        sourceVersions: [],
      },
      memoryBlacklist: [],
      aiNaming: null,
      outlineChat: [],
      chat: [],
      editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_skills', { skills: [], pipelineSkills: [], deAiSkills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'compose', 3: 'compose', 4: 'compose' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    baseUrl: `http://127.0.0.1:${provider.port}`,
    projectId: PROJECT_ID,
    volumeId: VOLUME_ID,
    chapterId: CHAPTER_ID,
    volumeOutline: VOLUME_OUTLINE,
    category: CATEGORY,
    styleCategory: STYLE_CATEGORY,
    itemCategory: ITEM_CATEGORY,
    legacyName: LEGACY_NAME,
    legacyContent: LEGACY_CONTENT,
    draftName: DRAFT_NAME,
    draftContent: DRAFT_CONTENT,
    conflictStyleName: CONFLICT_STYLE_NAME,
    conflictStyleContent: CONFLICT_STYLE_CONTENT,
    supportStyleName: SUPPORT_STYLE_NAME,
    supportStyleContent: SUPPORT_STYLE_CONTENT,
    overflowItemCount: OVERFLOW_ITEM_COUNT,
    styleProfile: STYLE_PROFILE,
    wangFangMemory: {
      id: 'ent-wangfang-memory',
      name: LEGACY_NAME,
      type: 'character',
      aliases: ['芳姐'],
      firstAppearance: '',
      lastAppearance: '',
      appearances: [],
      description: '冷静寡言',
      personality: '',
      appearance: '',
      background: '',
      status: '重伤',
      possessions: [],
      skills: [],
      relationships: [],
      notes: '',
      lockedFields: [],
      evidence: [],
      createdAt: '2026-10-20T08:20:00Z',
      updatedAt: '2026-10-20T08:20:00Z',
    },
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(300)
}

async function settingState(page) {
  return page.evaluate(({ category, names }) => {
    const project = window.__pinia?._s?.get('project')
    const persisted = project?.settingsCollection?.items?.[category] || []
    const rows = names.map(name => {
      const item = persisted.find(entry => entry?.name === name) || null
      return {
        name,
        status: item?.status || null,
        isBound: item?.isBound === undefined ? null : Boolean(item.isBound),
        lockedAt: item?.lockedAt || null,
      }
    })
    return { schemaVersion: project?.schemaVersion || null, rows }
  }, { category: CATEGORY, names: [LEGACY_NAME, DRAFT_NAME] })
}

async function persistedProject(page) {
  return page.evaluate(async projectId => {
    const persisted = await window.electronAPI.storageRead(`wa_project_${projectId}`)
    const rows = persisted?.settingsCollection?.items || {}
    return {
      schemaVersion: persisted?.schemaVersion || null,
      items: rows,
    }
  }, PROJECT_ID)
}

function messageText(message) {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) return message.content.map(part => part?.text || '').join('\n')
  return ''
}

function requestText(request) {
  return (request.messages || []).map(messageText).join('\n')
}

function latestRun(page, source, stepName) {
  return page.evaluate(({ source, stepName }) => {
    const trace = window.__pinia?._s?.get('runTrace')
    return [...(trace?.runs || [])]
      .filter(item => item.source === source && (!stepName || item.stepName === stepName))
      .sort((a, b) => b.startedAt - a.startedAt)[0] || null
  }, { source, stepName })
}

function parseDetail(value) {
  if (typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return { raw: value } }
}

function projectionEvents(run) {
  return (run?.events || []).filter(event => event.type === 'settings-projection-composed')
}

function styleSemanticsEvents(run) {
  return (run?.events || []).filter(event => event.type === 'style-semantics-merged')
}

function contextConflictEvents(run) {
  return (run?.events || []).filter(event => event.type === 'context-conflict-detected')
}

function occurrences(text, needle) {
  return String(text || '').split(needle).length - 1
}

function assertSingleArbitratedStyleBlock(prompt, layer) {
  assert.equal(occurrences(prompt, '[风格指令]'), 1,
    `${layer} prompt has exactly one arbitrated style block, got ${occurrences(prompt, '[风格指令]')}`)
  assert(prompt.includes('优先级：风格档案指令优先'),
    `${layer} prompt declares the style profile priority`)
  assert(prompt.includes('一句话定位：冷雨夜中的克制叙事'),
    `${layer} prompt carries the locked v2 style profile positioning`)
  assert(prompt.includes('风格 - 人物基调 - 幽默，话痨（主题基调；若与上方风格指令冲突，以风格指令为准）'),
    `${layer} prompt keeps the conflicting settings style as bounded theme tone`)
  assert(prompt.includes('风格 - 主题基调 - 都市夜感，信息密度高'),
    `${layer} prompt keeps the non-conflicting settings style line`)
  assert(!prompt.includes('[卷级风格]'), `${layer} prompt strips the old volume style block`)
  assert(!prompt.includes('[章节节奏]'), `${layer} prompt strips the old chapter style block`)
  assert(!prompt.includes('[表达风格]'), `${layer} prompt strips the old body style block`)
}

function assertStyleSemanticsTrace(run, layer) {
  const events = styleSemanticsEvents(run)
  assert(events.length >= 1, `${layer} trace records style-semantics-merged, got ${events.length}`)
  const detail = parseDetail(events[events.length - 1].detail)
  assert.equal(detail.layer, layer, `${layer} style trace records the layer`)
  assert.deepEqual(detail.sources, { profileStyle: true, settingsStyle: true },
    `${layer} style trace records both style sources`)
  assert(/^[0-9a-f]{8}$/.test(String(detail.profileHash)), `${layer} style trace records profile hash`)
  assert(/^[0-9a-f]{8}$/.test(String(detail.settingsHash)), `${layer} style trace records settings hash`)
  assert(/^[0-9a-f]{8}$/.test(String(detail.settingsProjectionHash)), `${layer} style trace records projection hash`)
  assert(detail.conflictLineCount >= 1, `${layer} style trace detects the profile/settings conflict`)
  assert.equal(events[events.length - 1].level, 'warn', `${layer} conflict style trace is a warning`)
}

function assertBudgetTrim(run, prompt, layer, droppedNeedle, keptNeedle) {
  const events = projectionEvents(run)
  assert(events.length >= 1, `${layer} trace records projection event`)
  const projection = parseDetail(events[events.length - 1].detail)
  assert(projection.trimmedReasons.length >= 1,
    `${layer} projection records budget trims, got ${JSON.stringify(projection.trimmedReasons)}`)
  assert(projection.trimmedReasons[0].startsWith('layer_budget_trim:'),
    `${layer} budget trim reason uses the stable prefix`)
  assert(!prompt.includes(droppedNeedle), `${layer} prompt drops a low-priority line under budget`)
  assert(prompt.includes(keptNeedle), `${layer} prompt keeps the character line under budget`)
}

function batchAttemptEvents(run, type) {
  return (run?.events || []).filter(event => event.type === type)
}

function assertSuccessfulVolumeRun(run) {
  assert.equal(run?.status, 'success', `volume run must finish successfully, got ${run?.status}`)
  const attempts = batchAttemptEvents(run, 'volume-batch-attempt').map(event => parseDetail(event.detail))
  assert(attempts.length >= 1, `volume run records batch acceptance, got ${attempts.length}`)
  const final = attempts[attempts.length - 1]
  assert.equal(final.status, 'complete', `volume batch acceptance must complete, got ${JSON.stringify(final)}`)
  assert.equal(final.acceptedCount, final.requestedCount,
    `volume batch must accept every requested volume, got ${JSON.stringify(final)}`)
}

function assertSuccessfulChapterRun(run) {
  assert.equal(run?.status, 'success', `chapter run must finish successfully, got ${run?.status}`)
  const attempts = batchAttemptEvents(run, 'chapter-batch-attempt').map(event => parseDetail(event.detail))
  assert(attempts.length >= 1, `chapter run records batch acceptance, got ${attempts.length}`)
  const final = attempts[attempts.length - 1]
  assert.equal(final.status, 'complete', `chapter batch acceptance must complete, got ${JSON.stringify(final)}`)
  assert.equal(final.acceptedCount, final.requestedCount,
    `chapter batch must accept every requested chapter, got ${JSON.stringify(final)}`)
}

function assertSuccessfulBodyRun(run) {
  assert.equal(run?.status, 'success', `body run must finish successfully, got ${run?.status}`)
  const acceptance = parseDetail((run?.events || []).find(event => event.type === 'body-step-acceptance')?.detail)
  assert(acceptance?.decision === 'accept' && acceptance?.contractErrors?.length === 0,
    `body step acceptance must pass, got ${JSON.stringify(acceptance)}`)
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const startedAtMs = Date.now()
  const worker = (async () => {
    let written = 0
    while (!stopped) {
      try {
        const state = await page.evaluate(() => {
          const trace = window.__pinia?._s?.get('runTrace')
          const pipeline = window.__pinia?._s?.get('pipeline')
          const runs = [...(trace?.runs || [])]
          const running = runs.filter(run => run.status === 'running').map(run => ({
            id: run.id,
            source: run.source,
            stepName: run.stepName,
            events: (run.events || []).length,
            apiCalls: (run.apiCalls || []).length,
          }))
          return {
            at: new Date().toISOString(),
            running,
            pipelineStatus: pipeline?.activeSettingsRun?.statusText || null,
            isGenerating: Boolean(pipeline?.isGenerating),
          }
        })
        fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify({ ...state, electronPid, frame: written + 1 })}\n`, 'utf8')
        written += 1
      } catch (error) {
        fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify({
          at: new Date().toISOString(),
          error: String(error?.message || error),
          frame: written + 1,
        })}\n`, 'utf8')
        written += 1
      }
      await sleep(1000)
    }
    return written
  })()
  return {
    async stop() {
      stopped = true
      return worker
    },
    frameCount() {
      try {
        return fs.readFileSync(HEARTBEAT_PATH, 'utf8').split('\n').filter(Boolean).length
      } catch { return 0 }
    },
    durationMs() {
      return Date.now() - startedAtMs
    },
  }
}

async function waitForPipelineIdle(page, label) {
  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const pipeline = window.__pinia?._s?.get('pipeline')
      return {
        isGenerating: Boolean(pipeline?.isGenerating),
        status: pipeline?.activeSettingsRun?.statusText || null,
        progress: pipeline?.activeSettingsRun?.progress ?? null,
        pipelineRunStatus: pipeline?.activeSettingsRun?.status || null,
      }
    })
    const signature = JSON.stringify(state)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      lastSnapshot = state
      console.log(`[${label}] ${signature}`)
    } else if (Date.now() - lastProgressAt >= DEAD_TIMEOUT_MS) {
      throw new Error(`${label} is dead for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= STALLED_TIMEOUT_MS) {
      console.warn(`[STALL WARNING] ${label} unchanged for ${Date.now() - lastProgressAt}ms`)
    }
    if (!state.isGenerating) return state
    await sleep(500)
  }
  throw new Error(`${label} did not finish within ${STEP_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
}

async function openPipelineSettings(page) {
  const pipelineVisible = await page.locator('#pipeline-panel').isVisible()
  if (!pipelineVisible) {
    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  }
  await page.locator('#pl-steps .pl-step').nth(1).click()
  await page.waitForSelector('#pl-step-2-content', { state: 'visible' })
  await page.waitForSelector('#pl-bound-settings-list .pl-setting-card', { timeout: 20_000 })
}

async function clickSettingButton(page, name) {
  const settingsVisible = await page.locator('#pl-bound-settings-list').isVisible()
  if (!settingsVisible) {
    await openPipelineSettings(page)
  }
  const card = page.locator('#pl-bound-settings-list .pl-setting-card', { hasText: name })
  await card.locator('button', { hasText: /^(锁定|解锁)$/ }).click()
  await page.waitForFunction(itemName => {
    const cards = [...document.querySelectorAll('#pl-bound-settings-list .pl-setting-card')]
    const card = cards.find(element => (element.textContent || '').includes(itemName))
    return Boolean(card?.textContent)
  }, name, { timeout: 10_000, polling: 200 })
}

async function archiveScenario(name, data) {
  const scenarioDir = path.join(EVIDENCE_ROOT, name)
  fs.mkdirSync(scenarioDir, { recursive: true })
  for (const [filename, value] of Object.entries(data)) {
    fs.writeFileSync(path.join(scenarioDir, filename), typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2), 'utf8')
  }
}

async function dumpHomeDiagnostics(page, provider) {
    const snapshot = await page.evaluate(() => {
      const chat = window.__pinia?._s?.get('chat')
      const runTrace = window.__pinia?._s?.get('runTrace')
      const homeRuns = (runTrace?.runs || []).filter(run => run?.source === 'home')
      const runtimeErrorEvents = homeRuns.flatMap(run =>
        (run?.events || []).filter(event => event?.type === 'turn-runtime-error'))
      return {
        runtimeErrorEvents,
        chat: {
        activeSessionId: chat?.activeSessionId ?? null,
        activeSession: chat?.activeSession ?? null,
        activeMessages: chat?.activeMessages ?? [],
        generationStatus: chat?.generationStatus ?? null,
        generationMessage: chat?.generationMessage ?? null,
        currentContext: chat?.currentContext ?? null,
      },
      runTrace: {
        runs: (runTrace?.runs || []).map(run => ({
          id: run?.id,
          source: run?.source,
          stepName: run?.stepName,
          status: run?.status,
          events: run?.events,
          apiCalls: run?.apiCalls,
        })),
      },
    }
  })
  const diagnostics = {
    at: new Date().toISOString(),
    ...snapshot,
    providerRequests: provider.requests(),
  }
  const target = path.join(EVIDENCE_ROOT, 'home-diagnostics.json')
  fs.writeFileSync(target, JSON.stringify(diagnostics, null, 2), 'utf8')
  return diagnostics
}

async function main() {
  const diskManifest = assertFreshRendererBuild()
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.rmSync(HEARTBEAT_PATH, { force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()

  const provider = await startProvider()
  const electronProcess = startElectron()
  let browser = null
  let heartbeat = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, provider)
    heartbeat = startHeartbeat(page, electronProcess.pid)

    const migrated = await settingState(page)
    assert.equal(migrated.schemaVersion, 4, `schema migrates to 4, got ${migrated.schemaVersion}`)
    assert.deepEqual(migrated.rows, [
      { name: LEGACY_NAME, status: 'locked', isBound: true, lockedAt: migrated.rows[0].lockedAt },
      { name: DRAFT_NAME, status: 'draft', isBound: null, lockedAt: null },
    ], `legacy isBound becomes locked while draft stays draft: ${JSON.stringify(migrated.rows)}`)
    assert(migrated.rows[0].lockedAt > 0, 'legacy lockedAt is populated by migration')
    const persistedAfterMigration = await persistedProject(page)
    assert.equal(persistedAfterMigration.schemaVersion, 4,
      `persisted schemaVersion becomes 4, got ${persistedAfterMigration.schemaVersion}`)
    const persistedRows = persistedAfterMigration.items[CATEGORY] || []
    assert.equal(persistedRows.find(item => item?.name === LEGACY_NAME)?.status, 'locked',
      'persisted Wang Fang status is locked')
    assert.equal(persistedRows.find(item => item?.name === DRAFT_NAME)?.status, 'draft',
      'persisted Lin Zhou status is draft')

    await openPipelineSettings(page)
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-settings-after-migration.png'), fullPage: false })

    await clickSettingButton(page, DRAFT_NAME)
    await page.waitForFunction(() => {
      const project = window.__pinia?._s?.get('project')
      const rows = project?.settingsCollection?.items?.['人物'] || []
      return rows.find(item => item?.name === '林舟')?.status === 'locked'
    }, null, { timeout: 10_000, polling: 200 })
    const afterLock = await settingState(page)
    assert.equal(afterLock.rows[1].status, 'locked', 'real click locks Lin Zhou')
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-linzhou-locked.png'), fullPage: false })

    await clickSettingButton(page, DRAFT_NAME)
    await page.waitForFunction(() => {
      const project = window.__pinia?._s?.get('project')
      const rows = project?.settingsCollection?.items?.['人物'] || []
      return rows.find(item => item?.name === '林舟')?.status === 'draft'
    }, null, { timeout: 10_000, polling: 200 })
    const afterUnlock = await settingState(page)
    assert.equal(afterUnlock.rows[1].status, 'draft', 'real click unlocks Lin Zhou')
    assert.equal(afterUnlock.rows[1].lockedAt, null, 'unlock clears lockedAt')
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-linzhou-unlocked.png'), fullPage: false })

    await page.locator('.pl-sc-category-actions button', { hasText: '锁定本类全部' }).click()
    await page.waitForFunction(() => {
      const project = window.__pinia?._s?.get('project')
      const rows = project?.settingsCollection?.items?.['人物'] || []
      return rows.length > 0 && rows.every(item => item?.status === 'locked')
    }, null, { timeout: 10_000, polling: 200 })
    const afterBatchLock = await settingState(page)
    assert.equal(afterBatchLock.rows[0].status, 'locked', 'batch lock keeps Wang Fang locked')
    assert.equal(afterBatchLock.rows[1].status, 'locked', 'batch lock locks Lin Zhou')
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-category-batch-locked.png'), fullPage: false })

    await page.locator('#pl-steps .pl-step').nth(2).click()
    await page.waitForSelector('#pl-step-3-content', { state: 'visible' })
    const volumeCountInput = page.locator('#pl-volume-count')
    await volumeCountInput.fill('2')
    await volumeCountInput.press('Enter')
    await page.waitForFunction(() => {
      const input = document.querySelector('#pl-volume-count')
      return input?.value === '2'
    }, null, { timeout: 10_000, polling: 200 })
    provider.reset()
    await page.click('#btn-pl-gen-volumes')
    await waitForPipelineIdle(page, 'volume-generation')
    let volumeRun = await latestRun(page, 'pipeline', '卷纲层')
    let volumeRequests = provider.requests()
    assert(volumeRun, 'volume run trace exists')
    assert(volumeRequests.length >= 1, `volume request reaches provider, got ${volumeRequests.length}`)
    const volumePrompt = requestText(volumeRequests[0])
    await archiveScenario('volume-layer', {
      'trace-run.json': volumeRun,
      'provider-requests.json': volumeRequests,
    })
    assertSuccessfulVolumeRun(volumeRun)
    assert(volumePrompt.includes('人物 - 王芳 - 幽默，风趣，话痨'),
      `volume prompt carries locked Wang Fang projection: ${volumePrompt.slice(-600)}`)
    assert(volumePrompt.includes('人物 - 林舟 - 沉默，冷静，行动派'),
      'volume prompt carries locked Lin Zhou projection')
    assert(volumePrompt.includes('[设定规划约束]'), 'volume prompt uses the planning semantics marker')
    assert(volumePrompt.includes('[人物规划约束]'), 'volume prompt groups character constraints')
    assert(!volumePrompt.includes('[正文执行约束]'), 'volume prompt does not carry body execution semantics')
    assertSingleArbitratedStyleBlock(volumePrompt, 'volume')
    assertStyleSemanticsTrace(volumeRun, 'volume')
    assertBudgetTrim(volumeRun, volumePrompt, 'volume',
      '灯塔备件60', '人物 - 王芳 - 幽默，风趣，话痨')
    let volumeEvents = projectionEvents(volumeRun)
    assert(volumeEvents.length >= 1, `volume trace records projection event, got ${volumeEvents.length}`)
    let volumeProjection = parseDetail(volumeEvents[0].detail)
    assert.equal(volumeProjection.layer, 'volume', 'volume projection layer is recorded')
    assert.equal(volumeProjection.policyVersion, 2, 'volume projection records the policy version')
    assert.equal(volumeProjection.lockedCount, 64, 'volume projection counts every locked setting before trimming')
    assert.equal(volumeProjection.draftExcludedCount, 0, 'volume projection excludes no draft after batch lock')
    const volumeProjectionPromptSection = volumePrompt.split(/\n\n\[风格与节奏\]/)[0]
    const volumeDistributionFromPrompt = {
      character: volumeProjectionPromptSection.split(/\r?\n/).filter(line => /^人物 - .+ - /.test(line)).length,
      item: volumeProjectionPromptSection.split(/\r?\n/).filter(line => /^物品 - .+ - /.test(line)).length,
      style: 2,
    }
    assert.deepStrictEqual(volumeProjection.categoryDistribution, volumeDistributionFromPrompt,
      `volume distribution matches the post-trim prompt: ${JSON.stringify(volumeProjection.categoryDistribution)}`)
    assert(volumeProjection.projectionChars > 0, 'volume projection records character count')
    assert(/^[0-9a-f]{8}$/.test(String(volumeProjection.contentHash)), 'volume projection records FNV hash')
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-volume-generated.png'), fullPage: false })
    await archiveScenario('volume-layer', {
      'trace-run.json': volumeRun,
      'provider-requests.json': volumeRequests,
    })

    await page.locator('#pl-steps .pl-step').nth(3).click()
    await page.waitForSelector('#pl-step-4-content', { state: 'visible' })
    provider.reset()
    await page.click('#btn-pl-gen-chapters')
    await waitForPipelineIdle(page, 'chapter-generation')
    const chapterRun = await latestRun(page, 'pipeline', '章节层')
    const chapterRequests = provider.requests()
    assert(chapterRun, 'chapter run trace exists')
    assert(chapterRequests.length >= 1, `chapter request reaches provider, got ${chapterRequests.length}`)
    const chapterPrompt = requestText(chapterRequests[0])
    await archiveScenario('chapter-layer', {
      'trace-run.json': chapterRun,
      'provider-requests.json': chapterRequests,
    })
    assertSuccessfulChapterRun(chapterRun)
    assert(chapterPrompt.includes('人物 - 王芳 - 幽默，风趣，话痨'),
      'chapter prompt carries locked Wang Fang projection')
    assert(chapterPrompt.includes('人物 - 林舟 - 沉默，冷静，行动派'),
      'chapter prompt carries locked Lin Zhou projection')
    assert(chapterPrompt.includes('[章节规划约束]'), 'chapter prompt uses the chapter planning semantics marker')
    assert(chapterPrompt.includes('[出场人物约束]'), 'chapter prompt groups character constraints')
    assert(!chapterPrompt.includes('[设定规划约束]'), 'chapter prompt does not carry volume planning semantics')
    assertSingleArbitratedStyleBlock(chapterPrompt, 'chapter')
    assertStyleSemanticsTrace(chapterRun, 'chapter')
    assertBudgetTrim(chapterRun, chapterPrompt, 'chapter',
      '灯塔备件60', '人物 - 王芳 - 幽默，风趣，话痨')
    const chapterEvents = projectionEvents(chapterRun)
    assert(chapterEvents.length >= 1, `chapter trace records projection event, got ${chapterEvents.length}`)
    const chapterProjection = parseDetail(chapterEvents[0].detail)
    assert.equal(chapterProjection.layer, 'chapter', 'chapter projection layer is recorded')
    assert.equal(chapterProjection.policyVersion, 2, 'chapter projection records the policy version')
    assert.equal(chapterProjection.lockedCount, 64, 'chapter projection counts every locked setting before trimming')
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-chapters-generated.png'), fullPage: false })
    await archiveScenario('chapter-layer', {
      'trace-run.json': chapterRun,
      'provider-requests.json': chapterRequests,
    })

    await clickSettingButton(page, DRAFT_NAME)
    await page.waitForFunction(() => {
      const project = window.__pinia?._s?.get('project')
      const rows = project?.settingsCollection?.items?.['人物'] || []
      return rows.find(item => item?.name === '林舟')?.status === 'draft'
    }, null, { timeout: 10_000, polling: 200 })

    await page.locator('#pl-steps .pl-step').nth(4).click()
    await page.waitForSelector('#pl-step-5-content', { state: 'visible' })
    provider.reset()
    await page.click('#btn-primary-gen-body')
    await waitForPipelineIdle(page, 'body-generation')
    const bodyRun = await latestRun(page, 'pipeline', '正文层')
    const bodyRequests = provider.requests()
    assert(bodyRun, 'body run trace exists')
    assert(bodyRequests.length >= 1, `body request reaches provider, got ${bodyRequests.length}`)
    const bodyPrompt = requestText(bodyRequests[0])
    await archiveScenario('body-layer', {
      'trace-run.json': bodyRun,
      'provider-requests.json': bodyRequests,
    })
    assertSuccessfulBodyRun(bodyRun)
    assert(bodyPrompt.includes('人物 - 王芳 - 幽默，风趣，话痨'),
      'body prompt carries locked Wang Fang projection')
    assert(!bodyPrompt.includes('林舟'), 'body prompt excludes draft Lin Zhou')
    assert(bodyPrompt.includes('[正文执行约束]'), 'body prompt uses the execution semantics marker')
    assert(bodyPrompt.includes('[人物口吻与行为]'), 'body prompt groups character voice constraints')
    assert(!bodyPrompt.includes('[设定规划约束]'), 'body prompt does not carry volume planning semantics')
    assertSingleArbitratedStyleBlock(bodyPrompt, 'body')
    assertStyleSemanticsTrace(bodyRun, 'body')
    assertBudgetTrim(bodyRun, bodyPrompt, 'body',
      '灯塔备件60', '人物 - 王芳 - 幽默，风趣，话痨')
    const bodyConflictEvents = contextConflictEvents(bodyRun)
    assert(bodyConflictEvents.length >= 1, `body trace records context conflict, got ${bodyConflictEvents.length}`)
    const bodyConflict = parseDetail(bodyConflictEvents[bodyConflictEvents.length - 1].detail)
    assert.equal(bodyConflict.conflictCount, 1, 'body conflict detail counts one Wang Fang conflict')
    assert.equal(bodyConflict.conflicts[0].entityName, LEGACY_NAME, 'body conflict identifies Wang Fang')
    assert.equal(bodyConflictEvents[bodyConflictEvents.length - 1].level, 'warn', 'body conflict trace is a warning')
    assert(bodyPrompt.includes('[相关记忆]'), 'body prompt still injects retrieved memory')
    assert(bodyPrompt.includes('已被锁定设定覆盖：- 王芳（别名：芳姐）'),
      'body prompt marks the conflicting memory as overridden')
    assert(bodyPrompt.includes('[上下文优先级]'), 'body prompt appends the context priority note')
    assert(bodyPrompt.includes('冷静寡言'), 'body prompt keeps the original memory evidence')
    const bodyEvents = projectionEvents(bodyRun)
    assert(bodyEvents.length >= 1, `body trace records projection event, got ${bodyEvents.length}`)
    const bodyProjection = parseDetail(bodyEvents[0].detail)
    assert.equal(bodyProjection.layer, 'body', 'body projection layer is recorded')
    assert.equal(bodyProjection.policyVersion, 2, 'body projection records the policy version')
    assert.equal(bodyProjection.lockedCount, 63, 'body projection counts every locked setting before trimming')
    assert.equal(bodyProjection.draftExcludedCount, 1, 'body projection excludes draft Lin Zhou')
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-body-generated.png'), fullPage: false })
    await archiveScenario('body-layer', {
      'trace-run.json': bodyRun,
      'provider-requests.json': bodyRequests,
    })

    await page.mouse.click(2, 2)
    await page.waitForSelector('#pipeline-panel', { state: 'detached', timeout: 20_000 }).catch(() => {})
    provider.reset()
    await page.fill('#user-input', '王芳在这章应该怎么说话？')
    await page.click('#btn-send')
    try {
      await page.waitForFunction(() => {
        const chat = window.__pinia?._s?.get('chat')
        return Boolean(chat?.activeMessages?.some?.(item => item?.role === 'assistant' && item?.content))
      }, null, { timeout: STEP_TIMEOUT_MS, polling: 500 })
    } catch (error) {
      const diagnostics = await dumpHomeDiagnostics(page, provider)
      error.message = `${error.message}; home diagnostics written to ${path.basename(EVIDENCE_ROOT)}${path.sep}home-diagnostics.json; activeMessages=${JSON.stringify(diagnostics.chat.activeMessages.map(item => ({ role: item?.role, content: String(item?.content || '').slice(0, 160) })))}`
      throw error
    }
    const homeRun = await latestRun(page, 'home', '主页共创')
    const homeRequests = provider.requests()
    assert(homeRun, 'home run trace exists')
    if (homeRequests.length < 1) {
      const diagnostics = await dumpHomeDiagnostics(page, provider)
      assert(false,
        `home request reaches provider, got ${homeRequests.length}; diagnostics written to ${path.basename(EVIDENCE_ROOT)}${path.sep}home-diagnostics.json; generation=${JSON.stringify({ status: diagnostics.chat.generationStatus, message: diagnostics.chat.generationMessage })}; activeMessages=${JSON.stringify(diagnostics.chat.activeMessages.map(item => ({ role: item?.role, content: String(item?.content || '').slice(0, 160) })))}; homeEvents=${JSON.stringify((diagnostics.runTrace.runs.find(run => run?.source === 'home')?.events || []).map(event => ({ type: event?.type, level: event?.level, label: event?.label })))}`)
    }
    const homePrompt = requestText(homeRequests[0])
    assert(homePrompt.includes('[当前上下文设定]'), 'home prompt uses the co-creation semantics marker')
    assert(homePrompt.includes('人物 - 王芳 - 幽默，风趣，话痨'),
      'home prompt carries locked Wang Fang projection')
    assert(!homePrompt.includes('林舟'), 'home prompt excludes draft Lin Zhou')
    assert(!homePrompt.includes('[正文执行约束]'), 'home prompt does not carry pipeline execution semantics')
    assert(!homePrompt.includes('[相关物品]'), 'home projection query keeps unrelated overflow items out')
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-home-projection.png'), fullPage: false })
    await archiveScenario('home-layer', {
      'trace-run.json': homeRun,
      'provider-requests.json': homeRequests,
    })

    const heartbeatFrames = heartbeat.frameCount()
    const heartbeatDurationMs = heartbeat.durationMs()
    assert(heartbeatFrames >= 1, `heartbeat records the run, got ${heartbeatFrames} frames`)
    assert(heartbeatFrames >= Math.max(1, Math.floor(heartbeatDurationMs / 1200)),
      `heartbeat cadence is continuous for ${heartbeatDurationMs}ms, got ${heartbeatFrames} frames`)
    fs.copyFileSync(HEARTBEAT_PATH, path.join(EVIDENCE_ROOT, 'heartbeat-copy.jsonl'))

    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.settings-lock-projection.electron',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      projectId: PROJECT_ID,
      runtimeFingerprint: {
        source: 'vite-manifest',
        manifestVersion: String(diskManifest.schemaVersion),
        commit: diskManifest.commit,
        buildTime: diskManifest.buildTime,
      },
      hardRules: {
        visibleElectron: true,
        realDomClicks: '#pl-bound-settings-list .pl-setting-card button / .pl-sc-category-actions button',
        storageUsedOnlyForSeedData: true,
        providerRequestsPersisted: true,
        noInjectionImpersonation: true,
      },
      assertions: {
        schemaMigration: { from: 3, to: 4, legacyIsBoundBecomesLocked: true, draftStaysDraft: true },
        lockLifecycle: { singleLock: true, singleUnlock: true, batchLock: true },
        styleArbitration: {
          singleBlockPerLayer: true,
          profilePriority: true,
          conflictKeptAsThemeTone: true,
          oldStyleLabelsRemoved: true,
          traceWarnOnConflict: true,
        },
        volumeProjection: {
          lockedCount: 64,
          draftExcludedCount: 0,
          marker: '[设定规划约束]',
          policyVersion: 2,
          budgetTrimmed: true,
          characterLineKept: true,
        },
        chapterProjection: {
          lockedCount: 64,
          draftExcludedCount: 0,
          marker: '[章节规划约束]',
          policyVersion: 2,
          budgetTrimmed: true,
          characterLineKept: true,
        },
        bodyProjection: {
          lockedCount: 63,
          draftExcludedCount: 1,
          marker: '[正文执行约束]',
          policyVersion: 2,
          budgetTrimmed: true,
          characterLineKept: true,
        },
        memoryConflictPriority: {
          conflictDetected: true,
          memoryKept: true,
          overridePrefixApplied: true,
          priorityNoteAppended: true,
          traceWarn: true,
        },
        homeProjection: { marker: '[当前上下文设定]', includesWangFang: true, excludesDraftLinZhou: true },
      },
      heartbeatFrames,
      heartbeatDurationMs,
    }, null, 2), 'utf8')
    console.log('===== SETTINGS LOCK PROJECTION ELECTRON PASSED =====')
  } finally {
    await heartbeat?.stop()
    closeElectron(electronProcess)
    try { await browser?.close() } catch {}
    await provider.close()
    clearTimeout(watchdog)
    if (!KEEP_PROFILE) {
      await removeDir(PROFILE)
    }
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
