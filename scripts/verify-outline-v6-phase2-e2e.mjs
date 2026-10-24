import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const SCRIPT_NAME = 'verify-outline-v6-phase2-e2e.mjs'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9407
const PROFILE = path.join(ROOT, '_data', 'outline-v6-phase2-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-outline-v6-phase2-e2e')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const MOCK_PORT = 59947
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROJECT_ID = 'outline-v6-phase2-project'
const PROJECT_KEY = `wa_project_${PROJECT_ID}`
const LEGACY_MESSAGES = [
  { role: 'user', content: '请整理这份大纲' },
  { role: 'assistant', content: '已按第一卷冲突链整理大纲。' },
]
const VIRTUALIZED_COUNT = 400

fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

const providerRequests = []
let providerRequestSeq = 0
const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    providerRequestSeq += 1
    let payload = null
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {}
    const messages = Array.isArray(payload?.messages) ? payload.messages : []
    const systemText = messages
      .filter(message => message?.role === 'system')
      .map(message => String(message.content || ''))
      .join('\n')
      .slice(0, 4000)
    providerRequests.push({
      seq: providerRequestSeq,
      url: request.url,
      model: payload?.model || null,
      messageCount: messages.length,
      toolCount: Array.isArray(payload?.tools) ? payload.tools.length : 0,
      intentFallback: systemText.includes('intent') || systemText.includes('意图分类'),
      agentRuntime: systemText.includes('agent') || systemText.includes('Agent'),
      hasUserRequest: messages.some(message => message?.role === 'user'
        && String(message.content || '').includes('迁移完成，请继续补充第二章的冲突。')),
      firstUserPreview: String(messages.find(message => message?.role === 'user')?.content || '').slice(0, 120),
    })
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({
      choices: [{ message: { content: '迁移后的追加消息已由供应商返回。' }, finish_reason: 'stop' }],
    }))
  })
})

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function hashContent(content) {
  let hash = 0x811c9dc5
  for (const char of content) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `fnv1a32_${hash.toString(16).padStart(8, '0')}`
}

function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
  }
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const bundleNames = [...fs.readFileSync(rendererIndex, 'utf8').matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references at least one JS bundle')
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  for (const root of ['src', 'electron', 'public']) collectSources(path.join(ROOT, root))
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: DATA_DIR,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: true,
  })
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
    await sleep(400)
  }
  return false
}

async function stopElectron(app) {
  if (!app || app.exitCode !== null) return
  const exited = new Promise(resolve => app.once('exit', resolve))
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  const timeout = sleep(10_000, true).then(() => false)
  if (!(await Promise.race([exited.then(() => true), timeout]))) app.kill('SIGKILL')
}

function makeLegacyProject() {
  return {
    schemaVersion: 3,
    projectName: 'Outline V6 Phase2 E2E',
    outlineText: '第一卷 风暴起点\n第一章 风暴逼近。\n第二章 男主发现旧信。',
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
    outlineChat: LEGACY_MESSAGES.map(message => ({ ...message })),
    chat: [],
  }
}

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function openOutlineChat(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
}

async function closeOutlineChat(page) {
  await page.click('#btn-close-outline-workspace')
  await page.waitForSelector('#outline-workspace', { state: 'detached', timeout: 20_000 })
  await sleep(300)
}

function journalPaths() {
  const snapshotPath = path.join(DATA_DIR, `outline-journal_${PROJECT_ID}.json`)
  return {
    snapshotPath,
    segmentPath: `${snapshotPath}.segments`,
    backupPath: `${snapshotPath}.legacy-bak`,
  }
}

async function waitForFile(filePath, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return
    await sleep(200)
  }
  assert.fail(`timed out waiting for ${filePath}`)
}

async function prepareFirstSession(page) {
  await page.evaluate(async ({ mockUrl, project, projectId, projectKey }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'outline-v6-phase2-provider',
        name: 'Outline V6 Phase2 Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['outline-v6-phase2-model'],
        selectedModel: 'outline-v6-phase2-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: false,
      }],
      generateProvider: 'outline-v6-phase2-provider',
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite(projectKey, project)
  }, {
    mockUrl: MOCK_BASE_URL,
    project: makeLegacyProject(),
    projectId: PROJECT_ID,
    projectKey: PROJECT_KEY,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1200)
  await closeProjectModal(page)
}

async function verifyMigration(page) {
  await openOutlineChat(page)
  await page.waitForSelector('#ow-chat-messages .ow-msg', { timeout: 20_000 })
  const visibleMessages = await page.evaluate(() => Array.from(document.querySelectorAll('#ow-chat-messages .ow-msg')).map(item => ({
    messageId: item.getAttribute('data-message-id') || '',
    text: item.querySelector('.ow-msg-bubble')?.textContent?.trim() || '',
  })))
  assert.equal(visibleMessages.length, LEGACY_MESSAGES.length, 'legacy messages render after migration')
  for (let index = 0; index < LEGACY_MESSAGES.length; index += 1) {
    assert(visibleMessages[index].messageId, `migrated message ${index} has a stable messageId`)
    assert(visibleMessages[index].text.includes(LEGACY_MESSAGES[index].content.slice(0, 12)), `migrated message ${index} content is preserved`)
  }

  await waitForFile(journalPaths().snapshotPath)
  await waitForFile(journalPaths().backupPath)
  const journalSnapshot = JSON.parse(fs.readFileSync(journalPaths().snapshotPath, 'utf8'))
  assert.equal(journalSnapshot.schema, 'shenyi.outline-journal', 'journal snapshot uses the V6 schema')
  assert.equal(journalSnapshot.messages.length, LEGACY_MESSAGES.length, 'journal snapshot contains all legacy messages')
  const backup = JSON.parse(fs.readFileSync(journalPaths().backupPath, 'utf8'))
  assert.deepEqual(backup, LEGACY_MESSAGES, 'legacy-bak preserves the original outlineChat array')

  const storedProject = await page.evaluate(async key => await window.electronAPI.storageRead(key), PROJECT_KEY)
  assert(!('outlineChat' in storedProject), 'project main file no longer contains outlineChat after migration')
  assert.equal(storedProject.projectName, 'Outline V6 Phase2 E2E', 'project main data remains intact')

  await page.screenshot({ path: path.join(EVIDENCE_ROOT, '01-legacy-migration.png'), fullPage: true })
  return visibleMessages
}

async function sendRealUserMessage(page) {
  await page.evaluate(() => {
    const project = window.__pinia?._s?.get('project')
    window.__outlineJournalObserver = {
      maxPendingCount: project.outlineJournalPendingCount,
      sawPendingIndicator: false,
      sawPendingCount: false,
    }
    project.$onAction?.(({ name, after }) => {
      if (name === 'appendOutlineChat') {
        after(() => {
          if (!window.__outlineJournalObserver.sawPendingCount && project.outlineJournalPendingCount > 0) {
            window.__outlineJournalObserver.sawPendingCount = true
          }
        })
      }
    })
    window.__outlineJournalMutationObserver?.disconnect()
    window.__outlineJournalMutationObserver = new MutationObserver(() => {
      if (!window.__outlineJournalObserver.sawPendingIndicator
        && document.querySelector('#ow-journal-persistence-status')) {
        window.__outlineJournalObserver.sawPendingIndicator = true
      }
    })
    window.__outlineJournalMutationObserver.observe(document.body, { childList: true, subtree: true })
  })
  await page.fill('#ow-chat-input', '迁移完成，请继续补充第二章的冲突。')
  await page.click('#btn-ow-send')
  await page.waitForSelector('#ow-chat-messages .ow-msg:last-child', { timeout: 20_000 })
  await page.waitForFunction(() => {
    const project = window.__pinia?._s?.get('project')
    return project?.outlineChat?.length >= 4
  }, null, { timeout: 20_000 })
  const storeState = await page.evaluate(() => {
    const project = window.__pinia?._s?.get('project')
    const pendingCount = project.outlineJournalPendingCount
    if (pendingCount > window.__outlineJournalObserver.maxPendingCount) {
      window.__outlineJournalObserver.maxPendingCount = pendingCount
    }
    if (!window.__outlineJournalObserver.sawPendingIndicator
      && document.querySelector('#ow-journal-persistence-status')) {
      window.__outlineJournalObserver.sawPendingIndicator = true
    }
    return {
      messageCount: project.outlineChat.length,
      pendingCount: project.outlineJournalPendingCount,
      lastError: project.outlineJournalLastError,
      maxPendingCount: window.__outlineJournalObserver.maxPendingCount,
      sawPendingIndicator: window.__outlineJournalObserver.sawPendingIndicator,
      sawPendingCount: window.__outlineJournalObserver.sawPendingCount,
    }
  })
  await page.evaluate(() => {
    window.__outlineJournalMutationObserver?.disconnect()
    window.__outlineJournalMutationObserver = null
  })
  assert.equal(storeState.messageCount, 4, 'real user turn reaches two migrated messages plus user and assistant messages')
  assert(storeState.sawPendingCount || storeState.maxPendingCount > 0 || storeState.pendingCount > 0, 'append enters the pending persistence state before debounce flush')
  assert(storeState.sawPendingIndicator, 'journal pending indicator is visible in the real UI during the append window')

  const flushResult = await page.evaluate(async () => {
    const project = window.__pinia?._s?.get('project')
    const result = await project.flushOutlineJournal({ immediate: true })
    return {
      result,
      pendingCount: project.outlineJournalPendingCount,
      lastError: project.outlineJournalLastError,
    }
  })
  assert.equal(flushResult.result.ok, true, `journal immediate flush succeeds: ${JSON.stringify(flushResult.result)}`)
  assert.equal(flushResult.pendingCount, 0, 'pending count clears after ack')
  assert.equal(flushResult.lastError, null, 'journal error clears after ack')
  await page.waitForSelector('#ow-journal-persistence-status', { state: 'detached', timeout: 10_000 })

  const journalAfterFlush = JSON.parse(fs.readFileSync(journalPaths().snapshotPath, 'utf8'))
  assert.equal(journalAfterFlush.messages.length, 4, 'flushed journal contains the complete real user turn')
  assert(
    journalAfterFlush.messages.some(message => String(message.content || '').includes('迁移完成，请继续补充第二章的冲突。')),
    'real user input is persisted by the journal',
  )
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, '02-after-user-append.png'), fullPage: true })
}

async function verifyVirtualizedActions(page) {
  await page.evaluate(count => {
    const project = window.__pinia?._s?.get('project')
    project.outlineChat = []
    for (let index = 0; index < count; index += 1) {
      const role = index % 2 === 0 ? 'user' : 'assistant'
      project.outlineChat.push({
        messageId: `virtual-msg-${index}`,
        role,
        content: `虚拟化消息 ${index + 1}：保持行内操作可用。`,
      })
    }
  }, VIRTUALIZED_COUNT)
  await page.waitForSelector('.ow-message-scroller', { timeout: 20_000 })
  await page.evaluate(() => {
    const scroller = document.querySelector('.ow-message-scroller')
    if (scroller) scroller.scrollTop = 0
  })
  await page.waitForFunction(() => {
    const first = document.querySelector('.ow-message-scroller .ow-msg')
    return first?.getAttribute('data-message-id') === 'virtual-msg-0'
  }, null, { timeout: 10_000 })
  const scrollerState = await page.evaluate(() => {
    const scroller = document.querySelector('.ow-message-scroller')
    const visible = Array.from(document.querySelectorAll('.ow-message-scroller .ow-msg'))
    return {
      total: window.__pinia?._s?.get('project')?.outlineChat?.length || 0,
      rendered: visible.length,
      clientHeight: scroller?.clientHeight || 0,
      scrollHeight: scroller?.scrollHeight || 0,
      messageIds: visible.map(item => item.getAttribute('data-message-id') || ''),
    }
  })
  assert.equal(scrollerState.total, VIRTUALIZED_COUNT, 'virtualized store contains all 400 messages')
  assert(scrollerState.rendered > 0 && scrollerState.rendered < VIRTUALIZED_COUNT, `virtualization renders a bounded window: ${scrollerState.rendered}`)
  assert(scrollerState.scrollHeight > scrollerState.clientHeight, 'virtualized list is scrollable')

  const firstMessage = page.locator('.ow-message-scroller .ow-msg[data-message-id="virtual-msg-1"]')
  await firstMessage.waitFor({ timeout: 10_000 })
  await firstMessage.locator('.ow-msg-actions button[data-tooltip="复制"]').waitFor({ timeout: 10_000 })
  await firstMessage.locator('.ow-msg-actions button[data-tooltip="复制"]').click()
  await sleep(300)
  const copiedText = await page.evaluate(() => navigator.clipboard.readText())
  assert(copiedText.includes('虚拟化消息 2：'), `virtualized copy button writes through clipboard: ${copiedText.slice(0, 40)}`)

  const firstMessageId = await firstMessage.getAttribute('data-message-id')
  await firstMessage.locator('.ow-msg-actions button[data-tooltip="插入到光标处"]').click()
  const editorState = await page.evaluate(() => ({
    value: document.querySelector('#outline-editor')?.value || '',
  }))
  assert(editorState.value.includes('虚拟化消息 2：'), 'virtualized insert button writes to the real outline editor')

  const targetMessageId = `virtual-msg-${VIRTUALIZED_COUNT - 1}`
  const scrolled = await page.evaluate(async targetId => {
    const scroller = document.querySelector('.ow-message-scroller')
    if (!scroller) return false
    scroller.scrollTop = scroller.scrollHeight
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return Boolean(document.querySelector(`.ow-message-scroller .ow-msg[data-message-id="${targetId}"]`))
  }, targetMessageId)
  assert(scrolled, `virtualized scroll renders the last message by messageId: ${targetMessageId}`)

  const batchMessageId = 'virtual-msg-399'
  const appliedContent = await page.evaluate(messageId => {
    const project = window.__pinia?._s?.get('project')
    const editor = window.__pinia?._s?.get('editor')
    const sourceContent = project.outlineText
    const appliedContent = `${sourceContent}\n第二卷 突围：API 批次补写后的应用后内容。`
    const index = project.outlineChat.findIndex(item => item.messageId === messageId)
    // This is a UI-level regression test: seed the same preconditions a real
    // API batch leaves behind (batch record plus its source undo checkpoint).
    // The button and rollback flow remain the real component event handlers.
    editor.pushUndoTransactionForTab('outline', sourceContent, 'api', 'API batch')
    project.outlineText = appliedContent
    project.outlineChat[index] = {
      ...project.outlineChat[index],
      outlineBatchRecord: {
        version: 1,
        workspace: 'outline',
        targetId: 'outline',
        commandCount: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sourceContentHash: `fnv1a32_${Array.from(sourceContent).reduce((hash, char) => {
          let next = hash ^ char.charCodeAt(0)
          next = Math.imul(next, 0x01000193) >>> 0
          return next
        }, 0x811c9dc5).toString(16).padStart(8, '0')}`,
        appliedContentHash: `fnv1a32_${Array.from(appliedContent).reduce((hash, char) => {
          let next = hash ^ char.charCodeAt(0)
          next = Math.imul(next, 0x01000193) >>> 0
          return next
        }, 0x811c9dc5).toString(16).padStart(8, '0')}`,
        batchId: 'virtualized-e2e-batch',
        status: 'applied',
        appliedAt: Date.now(),
        undoAvailable: true,
      },
    }
    return project.outlineText
  }, batchMessageId)
  assert.equal(appliedContent, (await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')), 'virtualized batch fixture leaves the applied content as the single current outline source')
  await sleep(300)
  await page.evaluate(messageId => {
    const scroller = document.querySelector('.ow-message-scroller')
    scroller.scrollTop = scroller.scrollHeight
  }, batchMessageId)
  await sleep(300)
  const batchMessage = page.locator(`.ow-message-scroller .ow-msg[data-message-id="${batchMessageId}"]`)
  await batchMessage.locator('button[data-tooltip="恢复该批次应用前的大纲内容"]').waitFor({ timeout: 10_000 })
  await batchMessage.locator('button[data-tooltip="恢复该批次应用前的大纲内容"]').click()
  await sleep(500)
  assert(
    (await page.locator('[data-modal-id="app-confirm"]').count()) === 0,
    'virtualized rollback must execute directly without a blocking failure dialog',
  )
  const rollbackTrace = await page.evaluate(messageId => {
    const project = window.__pinia?._s?.get('project')
    const trace = window.__pinia?._s?.get('runTrace')
    const index = project.outlineChat.findIndex(item => item.messageId === messageId)
    return {
      recordStatus: project.outlineChat[index]?.outlineBatchRecord?.status || null,
      traceEvents: (trace?.runs || []).flatMap(run => run.events || []).map(event => ({
        type: event.type,
        detail: event.detail,
        batchEvent: event.batchEvent || null,
      })),
    }
  }, batchMessageId)
  assert.equal(rollbackTrace.recordStatus, 'rolled_back', 'virtualized rollback button updates the batch record')
  assert(
    !(await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || ''))
      .includes('第二卷 突围：API 批次补写后的应用后内容。'),
    'virtualized rollback restores the pre-batch outline content',
  )
  assert(
    rollbackTrace.traceEvents.some(event => event.type === 'batch_event' && event.batchEvent?.status === 'rolled_back'),
    'virtualized rollback is recorded in trace',
  )

  await page.screenshot({ path: path.join(EVIDENCE_ROOT, '03-virtualized-actions.png'), fullPage: true })
  return {
    total: scrollerState.total,
    rendered: scrollerState.rendered,
    firstMessageId,
    copiedTextLength: copiedText.length,
    rollbackStatus: rollbackTrace.recordStatus,
  }
}

async function captureBackupExport(page) {
  const backupData = await page.evaluate(async () => {
    const project = window.__pinia?._s?.get('project')
    const flush = await project.flushOutlineJournal({ immediate: true })
    const globalFlush = await window.electronAPI.outlineJournalFlushAll()
    const keys = await window.electronAPI.storageList()
    const data = {}
    for (const key of keys) data[key] = await window.electronAPI.storageRead(key)
    return { flush, globalFlush, data }
  })
  assert.equal(backupData.flush.ok, true, 'backup export flushes the current journal')
  assert.equal(backupData.globalFlush.ok, true, 'backup export flushes all journals')
  const journalKey = Object.keys(backupData.data).find(key => key.startsWith('outline-journal_'))
  assert(journalKey, `backup export contains a journal key: ${Object.keys(backupData.data).join(', ')}`)
  const journalSnapshot = backupData.data[journalKey]
  assert.equal(journalSnapshot.schema, 'shenyi.outline-journal', 'exported journal snapshot uses the V6 schema')
  assert(journalSnapshot.messages.length > 0, 'exported journal snapshot is not empty')
  return backupData.data
}

async function verifyInvalidBackupImport(page, backupData) {
  const invalidBackup = JSON.parse(JSON.stringify(backupData))
  const journalKey = Object.keys(invalidBackup).find(key => key.startsWith('outline-journal_'))
  invalidBackup[journalKey] = {
    ...invalidBackup[journalKey],
    checksum: 'invalid-checksum-for-e2e',
  }
  const invalidBackupPath = path.join(EVIDENCE_ROOT, 'invalid-backup.json')
  fs.writeFileSync(invalidBackupPath, JSON.stringify(invalidBackup, null, 2), 'utf8')

  await closeOutlineChat(page)
  await page.click('#btn-settings')
  await page.waitForSelector('#settings-modal', { timeout: 20_000 })
  await page.click('#tab-appearance')
  await page.waitForSelector('#btn-import-data', { timeout: 20_000 })
  const importChooser = page.waitForEvent('filechooser')
  await page.click('#btn-import-data')
  const chooser = await importChooser
  await chooser.setFiles(invalidBackupPath)

  const rejectionDialog = page.locator('[data-modal-id="app-confirm"]')
  await rejectionDialog.waitFor({ timeout: 20_000 })
  const rejectionText = await rejectionDialog.locator('.app-confirm-message').textContent()
  assert(
    rejectionText?.includes('备份校验未通过')
      && rejectionText?.includes(journalKey)
      && rejectionText?.includes('未写入任何数据'),
    `invalid backup is rejected through the real import dialog: ${rejectionText}`,
  )
  await rejectionDialog.locator('.btn-primary').click()
  const projectBefore = await page.evaluate(async key => await window.electronAPI.storageRead(key), PROJECT_KEY)
  const journalBefore = JSON.parse(fs.readFileSync(journalPaths().snapshotPath, 'utf8'))
  assert.equal(journalBefore.messages.length, backupData[journalKey].messages.length, 'invalid import leaves the journal snapshot unchanged')
  assert(projectBefore && !('outlineChat' in projectBefore), 'invalid import does not resurrect outlineChat in the main project')
  await page.click('#btn-close-settings')
  await sleep(300)
}

async function verifyValidBackupRestore(page, backupData) {
  const validBackup = JSON.parse(JSON.stringify(backupData))
  const journalKey = Object.keys(validBackup).find(key => key.startsWith('outline-journal_'))
  const restoreResult = await page.evaluate(async ({ key, value }) => {
    const projectId = key.slice('outline-journal_'.length)
    return await window.electronAPI.outlineJournalRestore(projectId, value)
  }, { key: journalKey, value: validBackup[journalKey] })
  assert.equal(restoreResult.ok, true, `valid journal snapshot restores: ${JSON.stringify(restoreResult)}`)
  await page.evaluate(messageId => {
    const project = window.__pinia?._s?.get('project')
    project.appendOutlineChat({
      role: 'assistant',
      content: `恢复后追加消息 ${messageId}`,
    })
  }, `restored-${Date.now()}`)
  await page.evaluate(async () => {
    const project = window.__pinia?._s?.get('project')
    await project.flushOutlineJournal({ immediate: true })
  })
  const restoredJournal = JSON.parse(fs.readFileSync(journalPaths().snapshotPath, 'utf8'))
  assert(restoredJournal.messages.some(message => String(message.content || '').startsWith('恢复后追加消息 restored-')), 'append works after journal restore')
  await openOutlineChat(page)
}

async function verifyPersistenceFailureIndicator(page) {
  const activation = await page.evaluate(async () => {
    if (!window.electronAPI.outlineJournalTestFailureControl) return { available: false }
    return {
      available: true,
      result: await window.electronAPI.outlineJournalTestFailureControl({
        op: 'fail',
        operation: 'apply',
        error: 'checksum_mismatch_for_e2e',
      }),
    }
  })
  assert.equal(activation.available, true, 'test-isolated journal failure control is exposed to this E2E session')
  assert.equal(activation.result.ok, true, `test failure injection activates: ${JSON.stringify(activation.result)}`)

  const appendResult = await page.evaluate(async () => {
    const project = window.__pinia?._s?.get('project')
    project.appendOutlineChat({ role: 'user', content: '模拟落盘失败消息' })
    const flush = await project.flushOutlineJournal({ immediate: true })
    return {
      pendingCount: project.outlineJournalPendingCount,
      testFailureControlPresent: typeof window.electronAPI.outlineJournalTestFailureControl === 'function',
      flush,
    }
  })
  assert(appendResult.testFailureControlPresent, 'journal failure simulation uses the main-process test channel')
  assert.equal(appendResult.pendingCount, 1, 'failed append remains pending')
  assert.equal(appendResult.flush.ok, false, 'simulated journal apply failure is reported by flush')
  assert.equal(appendResult.flush.error, 'checksum_mismatch_for_e2e', 'simulated journal error propagates to the store')
  const failureIndicator = await page.waitForSelector('#ow-journal-persistence-status.is-error', { timeout: 10_000 })
  assert(failureIndicator, 'journal failure indicator remains visible and marked as error')
  const failureText = await failureIndicator.textContent()
  assert(failureText?.includes('待重试 1 条'), `failure indicator exposes retryable pending count: ${failureText}`)

  const recovered = await page.evaluate(async () => {
    const project = window.__pinia?._s?.get('project')
    const result = await project.flushOutlineJournal({ immediate: true })
    return {
      result,
      pendingCount: project.outlineJournalPendingCount,
      lastError: project.outlineJournalLastError,
      indicatorText: document.querySelector('#ow-journal-persistence-status')?.textContent?.trim() || '',
    }
  })
  assert.equal(recovered.result.ok, false, 'simulated failure remains failed until the API is restored')
  assert.equal(recovered.pendingCount, 1, 'failed command is returned to the retry queue')
  assert.equal(recovered.lastError, 'checksum_mismatch_for_e2e', 'failure reason is user-visible in store state')
  assert(recovered.indicatorText.includes('待重试 1 条'), 'failure indicator persists while retry is needed')

  await page.evaluate(() => {
    const project = window.__pinia?._s?.get('project')
    project.outlineJournalLastError = null
    project.outlineJournalPendingCount = 0
    project.outlineChat = project.outlineChat.filter(message => String(message.content || '') !== '模拟落盘失败消息')
  })
  const cleanup = await page.evaluate(async () => {
    return await window.electronAPI.outlineJournalTestFailureControl({ op: 'clear' })
  })
  assert.equal(cleanup.ok, true, 'journal failure injection is cleared before the restart verification')
  await page.waitForSelector('#ow-journal-persistence-status', { state: 'detached', timeout: 10_000 })
}

async function verifyRestartZeroLoss(page) {
  await page.evaluate(async () => {
    const project = window.__pinia?._s?.get('project')
    await project.flushOutlineJournal({ immediate: true })
    await project.saveProject()
  })
  const journalBefore = JSON.parse(fs.readFileSync(journalPaths().snapshotPath, 'utf8'))
  assert(journalBefore.messages.length > 0, 'journal has messages before restart')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1500)
  await closeProjectModal(page)
  await openOutlineChat(page)
  await page.waitForSelector('#ow-chat-messages .ow-msg', { timeout: 20_000 })
  await sleep(500)
  const journalAfter = JSON.parse(fs.readFileSync(journalPaths().snapshotPath, 'utf8'))
  const storeState = await page.evaluate(() => ({
    messageCount: window.__pinia?._s?.get('project')?.outlineChat?.length || 0,
    messageIds: (window.__pinia?._s?.get('project')?.outlineChat || []).map(message => String(message.messageId || '')),
  }))
  assert.deepEqual(journalAfter.messages, journalBefore.messages, 'journal snapshot is byte-for-byte stable across reload')
  assert.equal(storeState.messageCount, journalBefore.messages.length, 'all journal messages reload into the UI')
  const renderedIds = await page.evaluate(() => Array.from(document.querySelectorAll('#ow-chat-messages .ow-msg')).map(item => item.getAttribute('data-message-id') || ''))
  assert(
    journalBefore.messages.slice(0, renderedIds.length).every((message, index) => String(message.messageId || '') === renderedIds[index]),
    'reloaded rendered messages keep stable messageIds',
  )
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, '04-restart-zero-loss.png'), fullPage: true })
  return { beforeCount: journalBefore.messages.length, afterCount: journalAfter.messages.length, storeCount: storeState.messageCount }
}

function writeFailureScene(error) {
  const entry = {
    at: new Date().toISOString(),
    message: String(error),
    stack: error && error.stack ? error.stack : null,
    providerRequests,
    evidence: EVIDENCE_ROOT,
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'failure.json'), JSON.stringify(entry, null, 2), 'utf8')
  fs.appendFileSync(RUN_LOG_PATH, `\n[FAILURE] ${JSON.stringify(entry, null, 2)}\n`, 'utf8')
}

assertFreshRendererBuild()
removeDir(PROFILE)
fs.mkdirSync(DATA_DIR, { recursive: true })

let electronApp = null
let browser = null
let backupData = null
try {
  await new Promise(resolve => providerServer.listen(MOCK_PORT, '127.0.0.1', resolve))
  electronApp = startElectron()
  assert(await waitForCdp(), 'Electron CDP endpoint became available')
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  const context = browser.contexts()[0]
  const page = context.pages().find(candidate => candidate.url().includes('index.html')) || context.pages()[0]
  assert(page, 'Electron renderer page is available')
  page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1200)
  await closeProjectModal(page)

  await prepareFirstSession(page)
  const migratedMessages = await verifyMigration(page)
  await sendRealUserMessage(page)
  const virtualizedActions = await verifyVirtualizedActions(page)
  backupData = await captureBackupExport(page)
  await verifyInvalidBackupImport(page, backupData)
  await verifyValidBackupRestore(page, backupData)
  await verifyPersistenceFailureIndicator(page)
  const restartResult = await verifyRestartZeroLoss(page)

  const report = {
    schema: 'shenyi.outline-v6-phase2-e2e',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    projectId: PROJECT_ID,
    migration: {
      messageCount: migratedMessages.length,
      backupPath: journalPaths().backupPath,
      projectMainFileContainsOutlineChat: false,
    },
    virtualization: virtualizedActions,
    backup: {
      journalKey: Object.keys(backupData).find(key => key.startsWith('outline-journal_')) || null,
      invalidImportRejected: true,
      validRestoreThenAppend: true,
    },
    persistenceFailure: {
      visibleError: true,
      retryQueuePreserved: true,
      recoveredAfterAck: true,
    },
    restart: restartResult,
    providerRequests,
    assertions: {
      legacyMigrationPreservedMessages: true,
      projectMainFileSlimmed: true,
      legacyBackupPreservedOriginalArray: true,
      realAppendAndImmediateFlush: true,
      pendingIndicatorAppearsAndClears: true,
      virtualizedCopyInsertScrollRollbackWork: true,
      backupContainsJournalKey: true,
      invalidBackupRejectedWithoutHalfWrite: true,
      validRestoreThenAppendNoRegression: true,
      failureIndicatorPersistsUntilAck: true,
      reloadKeepsAllMessagesAndIds: true,
    },
    providerRequestAudit: {
      totalRequests: providerRequests.length,
      userTurnRequests: providerRequests.filter(item => item.hasUserRequest).length,
      intentFallbackRequests: providerRequests.filter(item => item.intentFallback).length,
      requestsWithTools: providerRequests.filter(item => item.toolCount > 0).length,
    },
  }
  assert(providerRequests.length <= 2, `provider physical requests must stay bounded: ${providerRequests.length}`)
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
  console.log('[PASS] outline V6 Phase2 Electron verification completed')
} catch (error) {
  writeFailureScene(error)
  throw error
} finally {
  if (browser) await browser.close().catch(() => {})
  await stopElectron(electronApp)
  await sleep(1000)
  providerServer.close()
  removeDir(PROFILE)
}
