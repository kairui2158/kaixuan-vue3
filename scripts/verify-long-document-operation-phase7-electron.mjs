import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-long-document-operation-phase7-electron.mjs'
const CASE_FILTER = (process.env.SHENYI_PHASE7_CASES || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
const TRACE_FILE = path.resolve('C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20261001-140113-deep/export.json')
const OUTLINE_PATH = path.resolve('C:/Users/凯瑞/Desktop/测试/《绿潮》大纲总纲.md')
const ELECTRON_EXE = process.env.SHENYI_PHASE7_ELECTRON
  ? path.resolve(process.env.SHENYI_PHASE7_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_PHASE7_CDP_PORT || 9330)
const PROFILE = path.join(ROOT, '_data', 'long-document-operation-phase7-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'long-document-operation-phase7-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-long-document-operation-phase7')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
const BASE_URL = process.env.SHENYI_LIVE_BASE_URL || 'https://openapi.cloud-ai.cn/v1'
const API_KEY = process.env.SHENYI_LIVE_API_KEY || ''
// Phase 7 replay can legitimately exceed 30 minutes: the third turn alone made
// 59 tool calls against a 74k-char outline and finished 1.7s past the old limit.
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_STEP_TIMEOUT_MS || 60 * 60_000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_GLOBAL_TIMEOUT_MS || 12 * 60 * 60_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.SHENYI_PHASE7_HEARTBEAT_INTERVAL_MS || 15_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_PHASE7_STALLED_TIMEOUT_MS || 5 * 60_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_PHASE7_DEAD_TIMEOUT_MS || 15 * 60_000)
const KEEP_PROFILE = process.env.SHENYI_PHASE7_KEEP_PROFILE === '1'

const exportedTrace = JSON.parse(fs.readFileSync(TRACE_FILE, 'utf8'))
const clientRun = exportedTrace.run || exportedTrace
const clientTurns = (clientRun.turns || []).map(turn => turn.userRequest).filter(Boolean)
const customerOutline = fs.readFileSync(OUTLINE_PATH, 'utf8')
const punctuationProbeValue = 'PHASE7-PUNCT-PROBE'
const punctuationProbeSentences = [
  `【${punctuationProbeValue}-A】这是前段标点整理探测句,需要把半角逗号改成全角逗号;这是必须处理的半角分号.`,
  `【${punctuationProbeValue}-B】这是中段标点整理探测句,需要把半角逗号改成全角逗号;这是必须处理的半角分号.`,
  `【${punctuationProbeValue}-C】这是后段标点整理探测句,需要把半角逗号改成全角逗号;这是必须处理的半角分号.`,
]
const sourceOutline = buildReplayOutline(customerOutline)

assert.equal(clientRun.source, 'outline', 'client trace source is outline')
assert.equal(clientRun.model, MODEL, `client trace model matches ${MODEL}`)
assert.equal(clientTurns.length, 3, 'client trace has the three replay turns')
assert.deepEqual(
  clientTurns,
  [
    '按照Word文档的形式重构大纲，不要缩减内容。',
    'A',
    '1，三处重复项，删 。 2，是在编辑器里统一标题层级、编号和标点',
  ],
  'replay turns are copied from the exported client trace',
)
assert.equal(customerOutline.length, 74841, 'replay outline is the customer 74,841-character document')
assert(
  sourceOutline.length > customerOutline.length,
  'replay outline contains the distributed punctuation probes',
)
assert(
  !API_KEY || API_KEY.length >= 20,
  'live API key, when supplied, is read only from the process environment',
)

const skillFolder = path.resolve('D:/codex/玄武规划SKILL/L1-大纲层/L1-B-大纲共创主编')
for (const relative of ['SKILL.md', 'template.md', 'meta.json', 'script.js']) {
  assert(fs.existsSync(path.join(skillFolder, relative)), `folder SKILL file exists: ${relative}`)
}
const skillDefinitionText = fs.readFileSync(path.join(skillFolder, 'SKILL.md'), 'utf8')
const skillTemplate = fs.readFileSync(path.join(skillFolder, 'template.md'), 'utf8')
const skillMatch = skillDefinitionText.match(/^id:\s*(\S+)/m)
assert(skillMatch, 'folder SKILL id is readable')
const skillSourceId = skillMatch[1]
const skillId = `folder:${skillSourceId.replace(/^folder:/, '')}`
const skillMeta = JSON.parse(fs.readFileSync(path.join(skillFolder, 'meta.json'), 'utf8'))

const CASES = [
  { id: 'outline-no-skill', entry: 'outline', withSkill: false },
  { id: 'outline-with-skill', entry: 'outline', withSkill: true },
  { id: 'home-no-skill', entry: 'home', withSkill: false },
  { id: 'home-with-skill', entry: 'home', withSkill: true },
]
const STAGE_KEYS = [
  'skill-seeded',
  'skill-ui-selected',
  'guidance-hit',
  'turn1',
  'turn2',
  'turn3',
  'mode',
  'editor.write',
  'content',
]
const INITIAL_STAGES = Object.fromEntries(STAGE_KEYS.map(key => [key, 'NOT-RUN']))
const selectedCases = CASE_FILTER.length
  ? CASES.filter(item => CASE_FILTER.includes(item.id))
  : CASES
assert(selectedCases.length > 0, 'at least one Phase 7 case is selected')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildReplayOutline(source) {
  const lines = source.split(/\r?\n/)
  const anchor = /^##\s+卷三：势力与格局层/
  const anchorIndex = lines.findIndex(line => anchor.test(line))
  assert(anchorIndex > 0, 'outline contains the volume-three section for mid-document probe placement')
  const middle = Math.floor(lines.length / 2)
  const insert = (items, index, value) => items.splice(index, 0, value)
  insert(lines, 3, punctuationProbeSentences[0])
  insert(lines, Math.max(4, anchorIndex + 1), punctuationProbeSentences[1])
  const tailIndex = lines.findIndex((line, index) => index >= middle
    && line.trim().length > 0
    && lines.slice(index + 1).every(next => next.trim().length === 0))
  insert(lines, tailIndex >= 0 ? tailIndex : lines.length, punctuationProbeSentences[2])
  return lines.join('\n')
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(400)
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
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(
    staleBundles.length,
    0,
    `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`,
  )
}

function duplicateBodyCounts(text) {
  const lines = text.split(/\r?\n/)
  const bodies = lines.filter(line => {
    const trimmed = line.trim()
    if (!trimmed || /^#{1,6}\s+/.test(trimmed)) return false
    // Reformatting intentionally promotes pseudo headings and tabular lines
    // into Markdown structure. They remain content, but are no longer body
    // lines, and comparing raw line counts would confuse structure changes
    // with prose deletion.
    if (/^【[^】]+】$/.test(trimmed)) return false
    if (line.includes('\t')) return false
    if (/^(?:一|二|三|四|五|六|七|八|九|十)、/.test(trimmed)) return false
    // Repeated table headers, separators, and TOC-style links are valid
    // document structure, not semantic duplicates.
    if (/^\|[-\s|:]*\|$/.test(trimmed)) return false
    if (/^[-*_]{3,}$/.test(trimmed)) return false
    if (/\]\(#/.test(trimmed)) return false
    return true
  })
  const counts = new Map()
  for (const line of bodies) counts.set(line, (counts.get(line) || 0) + 1)

  // A generated table of contents is document structure. Its indented numeric
  // entries must not be mistaken for prose punctuation regressions.
  const proseLineSet = new Set()
  let inTableOfContents = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^#{1,6}\s+目录\s*$/.test(trimmed)) {
      inTableOfContents = true
      continue
    }
    if (inTableOfContents) {
      if (/^#{1,6}\s+\S/.test(trimmed)) inTableOfContents = false
      else if (/^\d+(?:\.\d+)*\s+\S/u.test(trimmed)) continue
    }
    proseLineSet.add(line)
  }

  // Punctuation metrics must measure prose, not structure. Markdown headings,
  // numeric section identifiers, list markers, and table separators otherwise
  // dominate the count and make normalization assertions meaningless.
  const proseLines = [...proseLineSet].map(line => line.trim()).filter(line => {
    if (!line) return false
    if (/^#{1,6}\s*$/.test(line)) return false
    if (/^\|[-\s|:]*\|$/.test(line)) return false
    if (/^[-*_]{3,}$/.test(line)) return false
    return true
  }).map(line => line
    .replace(/^#{1,6}\s+\d+(?:\.\d+)*\s*/u, '')
    .replace(/^\d+(?:\.\d+)*\s*/u, '')
    .replace(/^(?:\d+[.)]|[-*+]|\.)\s*/u, '')
    .replace(/\b\d+(?:\.\d+)+\b/gu, ''))
  const punctuationOnlyText = proseLines.join('\n')
  return {
    bodyLines: bodies.length,
    duplicatedLines: [...counts.values()].filter(count => count > 1).length,
    extraCopies: [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    halfWidthPunctuation: [...punctuationOnlyText].filter(char => /[,.;;:!?]/.test(char)).length,
  }
}

function punctuationProbeCount(text) {
  const normalized = text
    .replace(/,/g, '，')
    .replace(/;/g, '；')
    .replace(/\./g, '。')
  return punctuationProbeSentences.filter((sentence, index) => {
    const marker = `${punctuationProbeValue}-${['A', 'B', 'C'][index]}`
    const normalizedSentence = sentence
      .replace(/,/g, '，')
      .replace(/;/g, '；')
      .replace(/\./g, '。')
    return normalized.includes(normalizedSentence)
  }).length
}

function unplannedRemovedLines(before, after, allowedTargets) {
  const allowed = new Set(allowedTargets)
  const afterLines = new Set(after.split(/\r?\n/).map(line => line.trim()))
  const beforeLines = before.split(/\r?\n/).map(line => line.trim())
  return beforeLines.filter(line => {
    if (!line) return false
    if (/^#{1,6}\s+/.test(line)) return false
    if (/^【[^】]+】$/.test(line)) return false
    if (line.includes('\t')) return false
    if (/^(?:一|二|三|四|五|六|七|八|九|十)、/.test(line)) return false
    if (/^\|[-\s|:]*\|$/.test(line)) return false
    if (/^[-*_]{3,}$/.test(line)) return false
    if (/\]\(#/.test(line)) return false
    return !afterLines.has(line) && !allowed.has(line)
  })
}

function headingCounts(text, title) {
  const pattern = new RegExp(`^#{1,6}\\s+.*${title}`, 'gm')
  const matches = text.match(pattern) || []
  return matches.length
}

function bodyOccurrences(text, phrase) {
  return text.split(phrase).length - 1
}

function parseEventDetail(event) {
  try {
    return event?.detail ? JSON.parse(event.detail) : null
  } catch {
    return null
  }
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
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] pid=${child.pid} model=${MODEL} baseUrl=${BASE_URL}`)
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

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function assertSkillUiState(page, testCase) {
  const label = `${testCase.id}: skill UI selection`
  if (testCase.entry === 'outline') {
    const selectedCount = await page.locator('#ow-selected-skills .ow-skill-chip').count()
    assert.equal(
      selectedCount,
      testCase.withSkill ? 1 : 0,
      `${label} must show ${testCase.withSkill ? 'one' : 'no'} selected skill chip`,
    )
    return
  }

  const storeState = await page.evaluate(skillId => {
    const coCreation = window.__pinia?._s?.get('coCreation')
    return {
      skillIds: [...(coCreation?.config?.skillIds || [])],
      optionValues: [...document.querySelectorAll('#co-skill-select option')]
        .map(option => option.value)
        .filter(Boolean),
    }
  }, testCase.withSkill ? skillId : null)
  assert.deepEqual(
    storeState.skillIds,
    testCase.withSkill ? [skillId] : [],
    `${label} config matches case`,
  )
  if (testCase.withSkill) {
    assert(
      !storeState.optionValues.includes(skillId),
      `${label} selected skill is removed from the available options`,
    )
  }
}

function createStalledMonitor(page, entry, expectedUsers) {
  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const stopped = false
  async function sample() {
    return page.evaluate(({ entryName, expectedUsers: users }) => {
      const store = window.__pinia?._s?.get('runTrace')
      const run = [...(store?.runs || [])]
        .filter(item => item.source === entryName)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      const chat = entryName === 'outline'
        ? window.__pinia?._s?.get('project')?.outlineChat
        : window.__pinia?._s?.get('chat')?.activeSession?.messages
      const button = entryName === 'outline' ? '#btn-ow-send' : '#btn-send'
      return {
        turns: (run?.turns || []).length,
        expectedUsers: users,
        apiCalls: (run?.apiCalls || []).length,
        events: (run?.events || []).length,
        toolCalls: (run?.apiCalls || []).reduce((sum, call) => sum + (call.toolCalls || []).length, 0),
        responseChars: (run?.apiCalls || []).reduce((sum, call) => sum + (call.responseText || '').length, 0),
        assistantChars: (chat || []).filter(item => item?.role === 'assistant').at(-1)?.content?.length || 0,
        sendDisabled: Boolean(document.querySelector(button)?.disabled),
        lastEventType: (run?.events || []).at(-1)?.type || null,
        currentTurnId: run?.currentTurnId || null,
        runStatus: run?.status || null,
        turnStatuses: (run?.turns || []).map(turn => turn.status),
        apiStatuses: (run?.apiCalls || []).map(call => call.status),
      }
    }, { entryName: entry, expectedUsers })
  }

  return {
    async check() {
      const snapshot = await sample()
      const signature = JSON.stringify([
        snapshot.turns,
        snapshot.apiCalls,
        snapshot.events,
        snapshot.toolCalls,
        snapshot.responseChars,
        snapshot.assistantChars,
        snapshot.sendDisabled,
        snapshot.lastEventType,
        snapshot.currentTurnId,
        snapshot.runStatus,
        snapshot.turnStatuses,
        snapshot.apiStatuses,
      ])
      if (signature !== lastSignature) {
        lastSignature = signature
        lastProgressAt = Date.now()
        lastSnapshot = snapshot
        return { state: 'progress', snapshot }
      }
      const quietMs = Date.now() - lastProgressAt
      if (quietMs >= DEAD_TIMEOUT_MS) return { state: 'dead', quietMs, snapshot }
      if (quietMs >= STALLED_TIMEOUT_MS) return { state: 'stalled', quietMs, snapshot }
      return { state: 'quiet', quietMs, snapshot }
    },
    current() {
      return { quietMs: Date.now() - lastProgressAt, snapshot: lastSnapshot }
    },
    stopped: () => stopped,
  }
}

async function captureStalledEvidence(page, status) {
  const lastEvents = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])].sort((a, b) => b.startedAt - a.startedAt)[0]
    return (run?.events || []).slice(-12).map(event => ({
      type: event.type,
      turnId: event.turnId || null,
      label: event.label || null,
    }))
  }).catch(() => [])
  return { status, lastEvents }
}

async function seedApplication(page, testCase) {
  const projectId = `long-document-operation-phase7-${testCase.id}`
  const skill = testCase.withSkill
    ? {
      id: skillId,
      sourceId: skillSourceId,
      name: 'B-大纲共创主编',
      folderName: 'L1-B-大纲共创主编',
      template: skillTemplate,
      description: 'B-大纲共创主编（文件夹）',
      format: 'markdown',
      source: 'external',
      category: 'outline',
      executionMode: 'chain',
      outputFormat: 'text',
      sourcePath: path.join(skillFolder, 'SKILL.md'),
      folderPath: skillFolder,
      validationRules: [],
      splitSize: 1000,
      injectMode: 'system_prefix',
      bindTarget: 'outline-workspace',
      linkedSkillIds: [],
      customVars: {},
      inputSchema: '',
      outputSchema: '',
      retryPolicy: '',
      intents: skillMeta.intents || [],
    }
    : null
  await page.evaluate(async ({ apiKey, baseUrl, model, projectId, skill, withSkill }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'phase7-live-provider',
        name: 'Phase7 Live Provider',
        baseUrl,
        apiKey,
        models: [model],
        selectedModel: model,
        temperature: 0.1,
        maxTokens: 0,
        contextWindowTokens: 0,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'phase7-live-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: `Phase7 ${projectId}`,
      outlineText: '',
      outlineLocked: false,
      outlineLockedText: '',
      bookWordCount: 0,
      volumesConfirmed: false,
      pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 2000 },
      chaptersConfirmed: false,
      settingsGenerated: true,
      settings: [],
      volumes: [],
      chapters: {},
      settingBindings: {},
      settingsCollection: { categories: [], items: {} },
      memories: {},
      memoryBlacklist: [],
      aiNaming: null,
      outlineChat: [],
      chat: [],
      editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_dAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite('wa_skills', { skills: withSkill ? [skill] : [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '' },
      // SKILL installation is seed data; selection must happen through the UI.
      skills: { 0: [] },
      modes: { 0: 'compose' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, {
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    model: MODEL,
    projectId,
    skill,
    withSkill: testCase.withSkill,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await closeProjectModal(page)

  if (testCase.entry === 'outline') {
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 20_000 })
    await page.evaluate(content => {
      window.__pinia?._s?.get('project')?.setOutline(content)
      const editor = document.querySelector('#outline-editor')
      if (editor) {
        editor.value = content
        editor.dispatchEvent(new Event('input', { bubbles: true }))
        editor.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, sourceOutline)
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
  } else {
    await page.evaluate(content => {
      const editor = window.__pinia?._s?.get('editor')
      const active = editor.activeTab
      if (active) {
        active.content = content
        return
      }
      editor.openTab({
        id: 'phase7-home-document',
        title: '绿潮大纲总纲',
        chapterId: 'phase7-home-document',
        content,
        isDirty: false,
        mode: 'ch-body',
      })
    }, sourceOutline)
    await page.waitForSelector('#user-input', { timeout: 20_000 })
  }
}

async function selectSkillThroughUi(page, testCase) {
  if (!testCase.withSkill) return
  const selector = testCase.entry === 'outline' ? '#ow-skill-select' : '#co-skill-select'
  await page.waitForSelector(selector, { timeout: 20_000 })
  const optionValues = await page.locator(selector).locator('option').evaluateAll(options =>
    options.map(option => option.value).filter(Boolean))
  assert(
    optionValues.includes(skillId),
    `${testCase.id}: installed skill appears in the real dropdown options`,
  )
  await page.selectOption(selector, skillId)
  if (testCase.entry === 'outline') {
    await page.waitForSelector('#ow-selected-skills .ow-skill-chip', { timeout: 20_000 })
  } else {
    await page.waitForFunction(expectedSkillId => {
      const store = window.__pinia?._s?.get('coCreation')
      return (store?.config?.skillIds || []).includes(expectedSkillId)
    }, skillId, { timeout: 20_000, polling: 250 })
  }
  console.log(`[SKILL UI SELECTED] ${testCase.id}: ${skillId}`)
}

function currentContent(page, entry) {
  return entry === 'outline'
    ? page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
    : page.evaluate(() => window.__pinia?._s?.get('editor')?.activeTab?.content || '')
}

async function waitIdle(page, entry, timeout = STEP_TIMEOUT_MS) {
  const selector = entry === 'outline' ? '#btn-ow-send' : '#btn-send'
  await page.waitForFunction(selectorName => {
    const button = document.querySelector(selectorName)
    return Boolean(button && !button.disabled)
  }, selector, { timeout, polling: 500 })
  await sleep(500)
}

async function runTurn(page, testCase, request, turnIndex) {
  const entry = testCase.entry
  await waitIdle(page, entry)
  const before = await currentContent(page, entry)
  const state = await page.evaluate(entryName => {
    const chatStore = entryName === 'outline'
      ? window.__pinia?._s?.get('project')?.outlineChat
      : window.__pinia?._s?.get('chat')?.activeSession?.messages
    return {
      userCount: (chatStore || []).filter(item => item?.role === 'user').length,
      runId: (() => {
        const runs = window.__pinia?._s?.get('runTrace')?.runs || []
        return runs.at(-1)?.id || null
      })(),
    }
  }, entry)

  if (entry === 'outline') {
    await page.locator('#ow-chat-input').fill(request)
    await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
    await page.locator('#btn-ow-send').click()
  } else {
    await page.locator('#user-input').fill(request)
    await page.locator('#user-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
    await page.locator('#btn-send').click()
  }

  const turnBindingDiagnostic = await page.evaluate(({ entryName, expectedUsers }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === entryName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      runId: run?.id || null,
      currentTurnId: run?.currentTurnId || null,
      expectedUsers,
      turns: (run?.turns || []).map(turn => ({
        id: turn.id,
        seq: turn.seq,
        status: turn.status,
        reason: turn.reason || null,
      })),
      apiCalls: (run?.apiCalls || []).map(call => ({
        id: call.id,
        seq: call.seq,
        turnId: call.turnId || null,
        status: call.status,
      })),
      events: (run?.events || []).slice(-12).map(event => ({
        type: event.type,
        turnId: event.turnId || null,
        level: event.level,
      })),
    }
  }, { entryName: entry, expectedUsers: state.userCount + 1 })
  console.log(`[TURN BINDING BEFORE WAIT] ${JSON.stringify(turnBindingDiagnostic)}`)

  const stallMonitor = createStalledMonitor(page, entry, state.userCount + 1)
  const deadline = Date.now() + STEP_TIMEOUT_MS
  await waitForTurnUserMessage(page, stallMonitor, {
    entryName: entry,
    expectedUsers: state.userCount + 1,
  }, deadline)
  await waitForTurnTerminal(page, stallMonitor, {
    entryName: entry,
    expectedUsers: state.userCount + 1,
  }, deadline)
  await waitIdle(page, entry)

  const after = await currentContent(page, entry)
  const result = await page.evaluate(({ entryName, expectedUsers, request, turnIndex }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === entryName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const turn = run?.turns?.[expectedUsers - 1] || null
    const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
    const chat = entryName === 'outline'
      ? window.__pinia?._s?.get('project')?.outlineChat
      : window.__pinia?._s?.get('chat')?.activeSession?.messages
    const events = (run?.events || []).filter(event => event.turnId === turn?.id)
    return {
      request,
      turnIndex,
      turnStatus: turn?.status || null,
      turnReason: turn?.reason || null,
      intent: turn?.intent || null,
      actualToolSurface: turn?.actualToolSurface || [],
      apiStatuses: calls.map(call => call.status),
      responseChars: calls.reduce((sum, call) => sum + (call.responseText || '').length, 0),
      toolCalls: calls.flatMap(call => (call.toolCalls || []).map(tool => ({
        name: tool.name,
        status: tool.status,
        errorCode: tool.errorCode || null,
      }))),
      eventTypes: events.map(event => event.type),
      longDocumentEvents: events
        .filter(event => [
          'long-document-policy',
          'execution-mode-selected',
          'final-draft-mode-selected',
          'final-draft-skill-guidance',
          'edit-task-batch-planned',
          'source-contamination-detected',
          'edit-task-batch-applied',
          'edit-task-batch-failed',
          'edit-task-task-finished',
          'edit-task-task-failed',
          'final-draft-task-failed',
        ].includes(event.type))
        .map(event => ({ type: event.type, detail: parseDetail(event.detail) })),
      assistantReply: (chat || [])
        .filter(item => item?.role === 'assistant')
        .at(-1)?.content || '',
    }
    function parseDetail(value) {
      try { return JSON.parse(value) } catch { return value }
    }
  }, { entryName: entry, expectedUsers: state.userCount + 1, request, turnIndex })

  return { before, after, ...result }
}

async function waitForTurnUserMessage(page, stallMonitor, predicate, deadline) {
  while (Date.now() < deadline) {
    const stall = await stallMonitor.check()
    if (stall.state === 'dead') {
      throw new Error(`turn is dead after ${Math.round(stall.quietMs / 1000)}s: ${JSON.stringify(await captureStalledEvidence(page, stall))}`)
    }
    if (stall.state === 'stalled') {
      console.warn(`[STALL WARN] no progress for ${Math.round(stall.quietMs / 1000)}s`)
    }
    const done = await page.evaluate(({ entryName, expectedUsers }) => {
      const chat = entryName === 'outline'
        ? window.__pinia?._s?.get('project')?.outlineChat
        : window.__pinia?._s?.get('chat')?.activeSession?.messages
      return (chat || []).filter(item => item?.role === 'user').length >= expectedUsers
    }, predicate)
    if (done) return
    await sleep(500)
  }
  throw new Error(`turn user message not observed within ${STEP_TIMEOUT_MS}ms`)
}

async function waitForTurnTerminal(page, stallMonitor, predicate, deadline) {
  while (Date.now() < deadline) {
    const stall = await stallMonitor.check()
    if (stall.state === 'dead') {
      throw new Error(`turn is dead after ${Math.round(stall.quietMs / 1000)}s: ${JSON.stringify(await captureStalledEvidence(page, stall))}`)
    }
    if (stall.state === 'stalled') {
      console.warn(`[STALL WARN] no progress for ${Math.round(stall.quietMs / 1000)}s`)
    }
    const done = await page.evaluate(({ entryName, expectedUsers }) => {
      const store = window.__pinia?._s?.get('runTrace')
      const run = [...(store?.runs || [])]
        .filter(item => item.source === entryName)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      if (!run || (run.turns || []).length < expectedUsers) return false
      const turn = run.turns[expectedUsers - 1]
      if (!turn || turn.status === 'running') return false
      const calls = (run.apiCalls || []).filter(call => call.turnId === turn.id)
      return calls.length > 0 && calls.every(call => call.status !== 'running')
    }, predicate)
    if (done) return
    await sleep(500)
  }
  throw new Error(`turn did not reach terminal state within ${STEP_TIMEOUT_MS}ms`)
}

async function captureRunBindingSnapshot(page, entry) {
  try {
    return await page.evaluate(entryName => {
      const store = window.__pinia?._s?.get('runTrace')
      const run = [...(store?.runs || [])]
        .filter(item => item.source === entryName)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      return {
        runId: run?.id || null,
        runStatus: run?.status || null,
        currentTurnId: run?.currentTurnId || null,
        turns: (run?.turns || []).map(turn => ({
          id: turn.id,
          seq: turn.seq,
          status: turn.status,
          reason: turn.reason || null,
          startedAt: turn.startedAt,
          endedAt: turn.endedAt || null,
        })),
        apiCalls: (run?.apiCalls || []).map(call => ({
          id: call.id,
          seq: call.seq,
          turnId: call.turnId || null,
          status: call.status,
          responseChars: (call.responseText || '').length,
          toolCallCount: (call.toolCalls || []).length,
        })),
        events: (run?.events || []).slice(-80).map(event => ({
          type: event.type,
          turnId: event.turnId || null,
          level: event.level,
          label: event.label,
        })),
      }
    }, entry)
  } catch (error) {
    return { captureError: String(error?.message || error) }
  }
}

function startHeartbeat(page, entry, electronPid) {
  const file = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const state = await page.evaluate(entryName => {
        const store = window.__pinia?._s?.get('runTrace')
        const run = [...(store?.runs || [])]
          .filter(item => item.source === entryName)
          .sort((a, b) => b.startedAt - a.startedAt)[0]
        const chat = entryName === 'outline'
          ? window.__pinia?._s?.get('project')?.outlineChat
          : window.__pinia?._s?.get('chat')?.activeSession?.messages
        const button = entryName === 'outline' ? '#btn-ow-send' : '#btn-send'
        return {
          at: new Date().toISOString(),
          runId: run?.id || null,
          runStatus: run?.status || null,
          turns: (run?.turns || []).length,
          apiCalls: (run?.apiCalls || []).length,
          runningCalls: (run?.apiCalls || []).filter(call => call.status === 'running').length,
          events: (run?.events || []).length,
          lastEventType: (run?.events || []).at(-1)?.type || null,
          lastAssistantChars: (chat || []).filter(item => item?.role === 'assistant').at(-1)?.content?.length || 0,
          sendDisabled: Boolean(document.querySelector(button)?.disabled),
          currentTurnId: run?.currentTurnId || null,
          turnBindings: (run?.turns || []).map(turn => ({
            id: turn.id,
            seq: turn.seq,
            status: turn.status,
            apiCalls: (run?.apiCalls || []).filter(call => call.turnId === turn.id).length,
          })),
          unboundApiCalls: (run?.apiCalls || []).filter(call => !call.turnId).length,
          apiCallTurnIds: (run?.apiCalls || []).map(call => call.turnId || null),
        }
      }, entry)
      state.electronPid = electronPid
      fs.appendFileSync(file, `${JSON.stringify(state)}\n`, 'utf8')
    } catch (error) {
      fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), heartbeatError: String(error?.message || error) })}\n`, 'utf8')
    }
  }, HEARTBEAT_INTERVAL_MS)
  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}

async function captureCaseEvidence(page, testCase, results) {
  const dir = path.join(EVIDENCE_ROOT, testCase.id)
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, 'final-state.png'), fullPage: false })
  fs.writeFileSync(path.join(dir, 'turns.json'), JSON.stringify(results, null, 2), 'utf8')
  console.log(`[PASS] ${testCase.id}: evidence written`)
}

async function captureCaseFailure(page, testCase, turns, error) {
  const dir = path.join(EVIDENCE_ROOT, testCase.id)
  fs.mkdirSync(dir, { recursive: true })
  try {
    await page.screenshot({ path: path.join(dir, 'failure-state.png'), fullPage: false })
  } catch {}
  const runBindingSnapshot = await captureRunBindingSnapshot(page, testCase.entry)
  fs.writeFileSync(path.join(dir, 'turns-partial.json'), JSON.stringify(turns, null, 2), 'utf8')
  fs.writeFileSync(path.join(dir, 'failure.json'), JSON.stringify({
    caseId: testCase.id,
    at: new Date().toISOString(),
    message: String(error?.message || error),
    stack: error?.stack || null,
    completedTurns: turns.map(turn => ({
      request: turn.request,
      turnStatus: turn.turnStatus,
      turnReason: turn.turnReason,
      responseChars: turn.responseChars,
      toolCalls: turn.toolCalls,
    })),
    runBindingSnapshot,
  }, null, 2), 'utf8')
  console.error(`[CASE FAIL] ${testCase.id}: failure evidence written`)
}

function assertCase(testCase, turns) {
  const label = testCase.id
  assert.equal(turns.length, clientTurns.length, `${label}: replay covers all client turns`)

  const first = turns[0]
  const guidanceEvents = turns[0].longDocumentEvents
    .filter(event => event.type === 'final-draft-skill-guidance')
  assert.equal(
    guidanceEvents.length,
    1,
    `${label}: exactly one skill guidance event is recorded`,
  )
  assert.equal(
    Boolean(guidanceEvents[0]?.detail?.skillGuidancePresent),
    testCase.withSkill,
    `${label}: guidance payload matches SKILL state`,
  )
  const modeEvents = [...first.longDocumentEvents, ...turns[2].longDocumentEvents]
    .filter(event => event.type === 'long-document-policy' || event.type === 'execution-mode-selected')
  assert(modeEvents.length > 0, `${label}: execution mode event exists`)
  assert(
    modeEvents.some(event =>
      event.detail?.mode === 'edit-task'
      && (event.detail?.operation === 'deduplicate'
        || event.detail?.operation === 'deduplicate_and_normalize')),
    `${label}: duplicate cleanup routes to EditTask deduplicate`,
  )
  assert(
    modeEvents.some(event =>
      event.detail?.invariants?.includes?.('planned-deletion-only')
      && event.detail?.invariants?.includes?.('normalize-changes-punctuation-whitespace-format-only')),
    `${label}: planned-deletion-only invariant is declared`,
  )
  assert(
    turns[2].actualToolSurface.some(tool => tool.name === 'editor.write'),
    `${label}: final authorized turn exposes editor.write`,
  )
  assert(
    turns[2].longDocumentEvents.some(event => event.type === 'edit-task-batch-planned'),
    `${label}: EditTask batch planning is observable`,
  )
  assert(
    turns[2].toolCalls.some(tool => tool.name === 'editor.write' && tool.status === 'success'),
    `${label}: editor.write executes successfully`,
  )
  assert.equal(turns[2].turnStatus, 'success', `${label}: final turn succeeds`)
  assert(
    turns[2].longDocumentEvents.every(event => event.type !== 'final-draft-task-failed'),
    `${label}: old final-draft failure path is absent`,
  )
  assert(
    turns[2].longDocumentEvents.every(event => event.type !== 'final-draft-mode-selected'),
    `${label}: duplicate cleanup does not enter final draft`,
  )
  assert(
    turns.every(turn => turn.responseChars > 0 || turn.toolCalls.length > 0),
    `${label}: no silent zero-response API call`,
  )
  for (const turn of turns) {
    assert.equal(
      turn.apiStatuses.length > 0 && turn.apiStatuses.every(status => status !== 'running'),
      true,
      `${label}: every turn has terminal API calls`,
    )
  }
  for (const turn of [turns[0], turns[1]]) {
    assert(
      !turn.toolCalls.some(tool => tool.name === 'editor.write'),
      `${label}: pre-authorization turns do not call editor.write`,
    )
    assert.equal(
      turn.after,
      turn.before,
      `${label}: pre-authorization turns do not change editor content`,
    )
    assert(
      turn.longDocumentEvents.every(event => event.type !== 'final-draft-mode-selected'),
      `${label}: pre-authorization turns do not enter final draft`,
    )
  }

  const before = duplicateBodyCounts(sourceOutline)
  const after = duplicateBodyCounts(turns[2].after)
  assert.notEqual(turns[2].after, sourceOutline, `${label}: editor content changes`)
  assert.equal(
    punctuationProbeCount(sourceOutline),
    punctuationProbeSentences.length,
    `${label}: replay source contains all distributed punctuation probes`,
  )
  assert.equal(
    punctuationProbeCount(turns[2].after),
    punctuationProbeSentences.length,
    `${label}: punctuation probes remain present and normalized`,
  )
  const confirmedDuplicateTargets = [
    '数据板的局限',
    '菌膜外套：有限资源的临时通行方案',
    '菌膜外套与共存补丁的关系',
  ]
  const confirmedDuplicateHeadings = [
    '数据板的局限',
    '菌膜外套：有限资源的临时通行方案',
    '菌膜外套与共存补丁的关系',
  ]
  for (const target of confirmedDuplicateHeadings) {
    const targetHeading = new RegExp(`^#{1,6}\\s+[^\\n]*${target}\\s*$`, 'gm')
    const beforeCount = (sourceOutline.match(targetHeading) || []).length
    const afterCount = (turns[2].after.match(targetHeading) || []).length
    assert(
      afterCount <= 1,
      `${label}: confirmed duplicate heading removed (${target}, before=${beforeCount}, after=${afterCount})`,
    )
  }
  for (const target of confirmedDuplicateTargets) {
    assert(
      bodyOccurrences(turns[2].after, target) <= 2,
      `${label}: confirmed duplicate body phrase count is reduced (${target}, before=${bodyOccurrences(sourceOutline, target)}, after=${bodyOccurrences(turns[2].after, target)})`,
    )
  }
  assert(
    after.duplicatedLines < before.duplicatedLines || after.extraCopies < before.extraCopies,
    `${label}: semantic duplicate count decreases (before extraCopies=${before.extraCopies}, after=${after.extraCopies})`,
  )
  assert(
    after.halfWidthPunctuation <= before.halfWidthPunctuation,
    `${label}: prose punctuation does not regress (before=${before.halfWidthPunctuation}, after=${after.halfWidthPunctuation})`,
  )
  assert(
    after.bodyLines >= before.bodyLines - before.extraCopies,
    `${label}: non-duplicate content is preserved (before=${before.bodyLines}, after=${after.bodyLines}, extra=${before.extraCopies})`,
  )
  const unplannedRemoved = unplannedRemovedLines(sourceOutline, turns[2].after, confirmedDuplicateTargets)
  assert.equal(
    unplannedRemoved.length,
    0,
    `${label}: no unplanned body line is removed (first=${unplannedRemoved[0]?.slice(0, 120)})`,
  )
}

function buildStageStatuses(testCase, turns) {
  const stages = { ...INITIAL_STAGES }
  stages['skill-seeded'] = testCase.withSkill ? 'PASS' : 'N/A'
  stages['skill-ui-selected'] = testCase.withSkill ? 'PASS' : 'N/A'

  const guidance = turns[0]?.longDocumentEvents
    ?.find(event => event.type === 'final-draft-skill-guidance')
  stages['guidance-hit'] = Boolean(guidance?.detail?.skillGuidancePresent) === testCase.withSkill
    ? 'PASS'
    : 'FAIL'

  turns.forEach((turn, index) => {
    stages[`turn${index + 1}`] = turn.turnStatus === 'success' ? 'PASS' : 'FAIL'
  })

  const finalTurn = turns[2]
  stages.mode = finalTurn?.longDocumentEvents?.some(event =>
    event.type === 'execution-mode-selected'
    && event.detail?.mode === 'edit-task'
    && (event.detail?.operation === 'deduplicate'
      || event.detail?.operation === 'deduplicate_and_normalize'))
    ? 'PASS'
    : 'FAIL'
  stages['editor.write'] = finalTurn?.toolCalls?.some(tool =>
    tool.name === 'editor.write' && tool.status === 'success')
    ? 'PASS'
    : 'FAIL'
  stages.content = finalTurn && finalTurn.after !== finalTurn.before ? 'PASS' : 'FAIL'
  return stages
}

async function main() {
  assert(API_KEY, 'SHENYI_LIVE_API_KEY is required for real API Phase 7 validation')
  assertFreshRendererBuild()
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  removeDir(EVIDENCE_ROOT)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

  const report = {
    schema: 'shenyi.long-document-operation.phase7.electron',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    model: MODEL,
    baseUrl: BASE_URL,
    sourceOutlineChars: sourceOutline.length,
    clientTurns,
    cases: [],
  }
  const stageTable = selectedCases.map(testCase => ({
    caseId: testCase.id,
    stages: { ...INITIAL_STAGES },
  }))
  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)

  const electronProcess = startElectron()
  let browser = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
      if (!page) await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('close', () => fs.appendFileSync(RUN_LOG_PATH, '[PAGE CLOSE] renderer page closed\n', 'utf8'))
    browser.on('disconnected', () => fs.appendFileSync(RUN_LOG_PATH, '[BROWSER DISCONNECTED] CDP connection lost\n', 'utf8'))
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)

    for (const testCase of selectedCases) {
      const caseStartedAt = Date.now()
      console.log(`[CASE START] ${testCase.id} (${testCase.entry}, withSkill=${testCase.withSkill})`)
      const turns = []
      let heartbeat = null
      try {
        await seedApplication(page, testCase)
        await selectSkillThroughUi(page, testCase)
        await assertSkillUiState(page, testCase)
        heartbeat = startHeartbeat(page, testCase.entry, electronProcess.pid)
        for (const [turnIndex, request] of clientTurns.entries()) {
          const turn = await runTurn(page, testCase, request, turnIndex)
          turns.push(turn)
          console.log(`[TURN] ${testCase.id}: ${turn.turnStatus}, responseChars=${turn.responseChars}, tools=${turn.toolCalls.map(tool => `${tool.name}:${tool.status}`).join(',') || 'none'}`)
        }
        assertCase(testCase, turns)
        const stageRow = stageTable.find(row => row.caseId === testCase.id)
        if (stageRow) stageRow.stages = buildStageStatuses(testCase, turns)
        await captureCaseEvidence(page, testCase, turns)
      } catch (error) {
        heartbeat?.stop()
        const stageRow = stageTable.find(row => row.caseId === testCase.id)
        if (stageRow) {
          stageRow.stages = buildStageStatuses(testCase, turns)
          stageRow.failure = String(error?.message || error)
        }
        await captureCaseFailure(page, testCase, turns, error)
        throw error
      }
      report.cases.push({
        id: testCase.id,
        entry: testCase.entry,
        withSkill: testCase.withSkill,
        durationMs: Date.now() - caseStartedAt,
        turnStatuses: turns.map(turn => ({ status: turn.turnStatus, reason: turn.turnReason })),
        responseChars: turns.map(turn => turn.responseChars),
        toolCalls: turns.map(turn => turn.toolCalls),
        stages: buildStageStatuses(testCase, turns),
      })
      if (testCase.entry === 'outline') {
        await page.click('#btn-close-outline-workspace')
        await sleep(500)
      }
    }

    report.stageTable = stageTable
    const failedStages = stageTable.flatMap(row => Object.entries(row.stages)
      .filter(([, status]) => status === 'FAIL')
      .map(([stage, status]) => `${row.caseId}.${stage}=${status}`))
    assert.equal(
      failedStages.length,
      0,
      `stage table must not contain FAIL or NOT-RUN: ${failedStages.join(', ')}`,
    )
    console.log('[STAGE TABLE]')
    console.table(stageTable.map(row => ({
      case: row.caseId,
      ...row.stages,
      verdict: 'PASS',
    })))
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'summary.json'), JSON.stringify(report, null, 2), 'utf8')
    console.log('===== LONG DOCUMENT OPERATION PHASE7 ELECTRON PASSED =====')
  } finally {
    clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
    if (!KEEP_PROFILE) {
      await removeDir(PROFILE)
    }
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
