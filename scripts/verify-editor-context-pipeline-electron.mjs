import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { build as rolldownBuild } from 'rolldown'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9307
const VITE_PORT = 5199
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-context-pipeline-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-context-pipeline', 'electron-20-rounds.json')
const ROUNDS = 10
const RESTRUCTURE_ROUNDS = 10
const CONTEXT_WINDOW = 128000
const MAX_OUTPUT_TOKENS = 8192

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
  }
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}

function assertFreshRendererBuild() {
  const indexPath = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(indexPath), 'dist-renderer/index.html exists; run npm run build:vue first')
  const bundleNames = [...fs.readFileSync(indexPath, 'utf8').matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references a JS bundle')
  const sourceFiles = []
  const collect = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collect(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collect(path.join(ROOT, 'src'))
  const newestSource = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const stale = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSource)
  assert.equal(stale.length, 0, `stale renderer build: ${stale.join(', ')}`)
}

function startElectron() {
  return spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
}

function startVite() {
  return spawn(process.execPath, [
    path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', '127.0.0.1',
    '--port', String(VITE_PORT),
    '--strictPort',
    '--config', path.join(ROOT, 'vite.config.mts'),
    '--mode', 'development',
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
}

async function waitForVite() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${VITE_PORT}/src/services/editorEntryFacade.ts`)
      if (response.ok) return true
    } catch {}
    await sleep(400)
  }
  return false
}

async function waitForCdp() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(400)
  }
  return false
}

async function closeVisibleModals(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
    const transition = document.querySelector('.project-transition-confirm')
    if (transition && getComputedStyle(transition).display !== 'none') {
      ;[...transition.querySelectorAll('button')].find(button => button.textContent.trim() === '取消')?.click()
    }
  })
  await page.waitForTimeout(300)
}

async function loadPipelineModules() {
  const tmpDir = path.join(ROOT, '_audit', 'tmp')
  fs.mkdirSync(tmpDir, { recursive: true })
  const facadeBundle = path.join(tmpDir, 'editor-entry-facade.electron-probe.mjs')
  await rolldownBuild({
    input: path.join(ROOT, 'src/services/editorEntryFacade.ts'),
    output: { file: facadeBundle, format: 'esm' },
  })
  const { buildMainSnapshot, buildContextPack } = await import(pathToFileURL(facadeBundle).href)
  const { classifyLongDocumentOperation, shouldAutoRouteToEditTask } = await import(pathToFileURL(path.join(ROOT, 'src/services/longDocumentPolicy.ts')).href)
  assert(typeof buildMainSnapshot === 'function', 'buildMainSnapshot exported')
  assert(typeof buildContextPack === 'function', 'buildContextPack exported')
  assert(typeof classifyLongDocumentOperation === 'function', 'classifyLongDocumentOperation exported')
  assert(typeof shouldAutoRouteToEditTask === 'function', 'shouldAutoRouteToEditTask exported')
  return { buildMainSnapshot, buildContextPack, classifyLongDocumentOperation, shouldAutoRouteToEditTask }
}

async function computeProbe(modules, round = 0) {
  const { buildMainSnapshot, buildContextPack, classifyLongDocumentOperation, shouldAutoRouteToEditTask } = modules
  const offset = Math.floor(documentText.length * (round / 10))
  const target = buildMainSnapshot({
    workspace: 'main',
    targetId: `electron-probe-${round || 'base'}`,
    label: `Electron 第${round || 'base'}轮`,
    content: documentText,
    selectionStart: offset,
    selectionEnd: offset + 2,
  }, `project-${round || 'base'}`)
  const pack = buildContextPack(target, undefined, {
    provider: { contextWindowTokens: CONTEXT_WINDOW },
    model: 'gpt-4o',
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  })
  const policy = shouldAutoRouteToEditTask({
    length: documentText.length,
    operationType: classifyLongDocumentOperation('把整篇文档重新整理排序，统一编号'),
    availableContextTokens: CONTEXT_WINDOW,
    estimatedDocumentTokens: Math.ceil(documentText.length / 2),
  })
  return {
    mode: pack?.mode,
    hasMap: pack?.content.includes('editor.document_map'),
    hasReadRange: pack?.content.includes('editor.read_range'),
    estimatedInputTokens: pack?.pipeline.estimatedInputTokens,
    availableContextTokens: pack?.pipeline.availableContextTokens,
    validationReason: pack?.pipeline.validationReason,
    editTask: policy.editTask,
    autoRouteReason: policy.reason,
    contentRatio: pack ? pack.content.length / documentText.length : null,
  }
}

async function computeRestructureProbe(modules, round) {
  const { classifyLongDocumentOperation, shouldAutoRouteToEditTask } = modules
  const content = buildHugeRestructureDocument()
  const operationType = classifyLongDocumentOperation('请把整篇文档重新整理排序，统一编号')
  const decision = shouldAutoRouteToEditTask({
    length: content.length,
    operationType,
    availableContextTokens: CONTEXT_WINDOW,
    estimatedDocumentTokens: Math.ceil(content.length / 2),
  })
  return {
    round,
    documentChars: content.length,
    operationType,
    editTask: decision.editTask,
    autoRouteReason: decision.reason,
  }
}

function buildDocument() {
  const lines = []
  for (let volume = 1; volume <= 10; volume++) {
    lines.push(`# 第${volume}卷 上下文管道实测`)
    for (let section = 1; section <= 20; section++) {
      lines.push(`## 第${volume}-${section}节 上下文管道`)
      for (let paragraph = 1; paragraph <= 8; paragraph++) {
        lines.push(`第${paragraph}段：上下文管道实测内容，验证 packed 上下文、document_map 指引和 read_range 工具联动。编号 ${volume}-${section}-${paragraph}。`)
      }
    }
  }
  const document = lines.join('\n')
  assert(document.length >= 40000, `document >= 40000 chars, got ${document.length}`)
  return document
}

const documentText = buildDocument()

let hugeRestructureDocument = null
function buildHugeRestructureDocument() {
  if (hugeRestructureDocument) return hugeRestructureDocument
  const lines = []
  for (let chapter = 1; lines.join('\n').length < 100000; chapter++) {
    lines.push(`## 第${chapter}章 整篇重排实测`)
    lines.push(`这一章验证 10 万字级全文重排必须进入 EditTask，而不是塞进单次对话上下文。编号 ${chapter}。`)
    lines.push('角色关系、时间线和伏笔保持不变，仅调整章节顺序、层级编号和段落衔接。')
  }
  hugeRestructureDocument = lines.join('\n')
  assert(hugeRestructureDocument.length >= 100000, `huge restructure document >= 100000 chars, got ${hugeRestructureDocument.length}`)
  return hugeRestructureDocument
}

async function prepareEditor(page) {
  await closeVisibleModals(page)
  await page.evaluate(content => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    if (!pinia) throw new Error('pinia unavailable')
    const store = pinia._s.get('editor')
    store.tabs.splice(0)
    store.clearUndoHistoryForTab('editor-context-pipeline-probe')
    store.openTab({
      id: 'editor-context-pipeline-probe',
      title: '上下文管道实测',
      content,
      chapterId: '',
      isDirty: false,
      mode: 'ch-body',
    })
    store.activeTabId = 'editor-context-pipeline-probe'
  }, documentText)
  await page.waitForSelector('#editor-content', { timeout: 10000 })
  await page.waitForTimeout(300)
}

async function main() {
  assertFreshRendererBuild()
  removeDir(PROFILE)
  removeDir(path.dirname(RESULT_FILE))
  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true })

  const electronProcess = startElectron()
  let browser = null
  const rounds = []
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = browser.contexts()[0]?.pages()?.[0]
    assert(page, 'renderer page reachable')
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) pageErrors.push(`${message.type()}: ${message.text()}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await page.waitForTimeout(2000)
    await prepareEditor(page)

    const modules = await loadPipelineModules()
    {
      const probe = await computeProbe(modules)
      assert.equal(probe.mode, 'packed', `expected packed mode, got ${probe.mode}`)
      assert(probe.hasMap, 'pack contains editor.document_map')
      assert(probe.hasReadRange, 'pack contains editor.read_range')
      assert(probe.validationReason === 'within-available-window', `validation reason=${probe.validationReason}`)
      assert(probe.estimatedInputTokens <= probe.availableContextTokens, 'estimated input fits available window')

      for (let round = 1; round <= ROUNDS; round++) {
        const result = await computeProbe(modules, round)
        assert.equal(result.mode, 'packed', `round ${round}: packed mode`)
        assert(result.hasMap, `round ${round}: editor.document_map present`)
        assert(result.hasReadRange, `round ${round}: editor.read_range present`)
        assert(result.editTask, `round ${round}: whole-document restructure auto-routes to EditTask`)
        assert.equal(result.autoRouteReason, 'whole-document-operation+length>=10000', `round ${round}: route reason`)
        assert(result.estimatedInputTokens <= result.availableContextTokens, `round ${round}: pack fits window`)
        assert(result.contentRatio < 1, `round ${round}: packed pack is smaller than full document`)
        rounds.push(result)
      }
    }

    const restructureRounds = []
    for (let round = 1; round <= RESTRUCTURE_ROUNDS; round++) {
      const result = await computeRestructureProbe(modules, round)
      assert.equal(result.operationType, 'whole-document-restructure', `restructure round ${round}: operation type`)
      assert(result.editTask, `restructure round ${round}: 100k whole-document restructure auto-routes to EditTask`)
      assert.equal(result.autoRouteReason, 'whole-document-operation+length>=10000', `restructure round ${round}: route reason`)
      restructureRounds.push(result)
    }

    const editorValue = await page.evaluate(() => document.querySelector('#editor-content')?.value || '')
    assert.equal(editorValue, documentText, 'editor content unchanged by probes')
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)

    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-context-pipeline.electron',
      version: 1,
      documentChars: documentText.length,
      rounds,
      restructureRounds,
      restructureDocumentChars: buildHugeRestructureDocument().length,
      assertions: '10 rounds: long main document uses packed context with editor.document_map and editor.read_range; whole-document restructure auto-routes to EditTask; editor content unchanged; no page errors',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: ${ROUNDS}/${ROUNDS} context pipeline rounds; report=${RESULT_FILE}`)
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (electronProcess?.pid) {
      try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    }
    removeDir(PROFILE)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
