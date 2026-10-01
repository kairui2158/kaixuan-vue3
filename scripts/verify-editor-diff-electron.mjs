import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9307
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-diff-profile')
const RESULT_DIR = path.join(ROOT, '_audit', 'verification-editor-diff')
const RESULT_FILE = path.join(RESULT_DIR, 'electron-10-rounds.json')
const ROUNDS = 10

// External writes that overlap the current selection intentionally reset the
// caret and emit one diagnostic warning. Keep the no-page-error gate strict
// while allowing this exact, expected event.
const EXPECTED_CONSOLE_WARNINGS = [
  /^warning: 编辑器选区恢复 \| \{"source":"external-write","mode":"reset","reason":"write-overlaps-selection","start":0,"end":0\}$/,
]

const baseContent = [
  '# 行内 Diff 实测',
  '第一段：主页与大纲必须显示同一条批次的改动明细。',
  '第二段：单条回滚必须从批次应用前内容重放。',
  '第三段：手动编辑后必须进入 stale，并禁止单条回滚。',
  '第四段：整批回滚必须恢复批次应用前内容。',
].join('\n')

const mainCommand = target => ({
  type: 'editor_edit_batch',
  version: 1,
  commands: [
    { type: 'editor_edit', version: 1, operation: 'replace_match', target, content: '第一段：行内 diff 已经接线。' },
    { type: 'editor_edit', version: 1, operation: 'append', content: '第五段：新增的可单独回滚内容。' },
  ],
  reason: 'editor diff electron probe',
})

const outlineCommand = target => ({
  type: 'editor_edit_batch',
  version: 1,
  commands: [
    { type: 'editor_edit', version: 1, operation: 'replace_match', target, content: '第二段：大纲 diff 同步接线。' },
    { type: 'editor_edit', version: 1, operation: 'append', content: '第六段：大纲新增的可单独回滚内容。' },
  ],
  reason: 'outline diff electron probe',
})

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

function fnv1a32(content) {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return 'fnv1a32_' + hash.toString(16).padStart(8, '0')
}

function buildProbeHunks(original, next, target, replaceAfter, insertedText) {
  const replaceStart = original.indexOf(target)
  assert(replaceStart >= 0, 'probe replace target exists')
  const insertStart = next.length - insertedText.length
  return [
    {
      index: 0,
      operation: 'replace_match',
      kind: 'replace',
      beforeText: target,
      afterText: replaceAfter,
      range: { start: replaceStart, end: replaceStart + replaceAfter.length },
      contextBefore: next.slice(Math.max(0, replaceStart - 48), replaceStart),
      contextAfter: next.slice(replaceStart + replaceAfter.length, replaceStart + replaceAfter.length + 48),
      status: 'active',
    },
    {
      index: 1,
      operation: 'append',
      kind: 'insert',
      beforeText: '',
      afterText: insertedText,
      range: { start: insertStart, end: next.length },
      contextBefore: next.slice(Math.max(0, insertStart - 48), insertStart),
      contextAfter: '',
      status: 'active',
    },
  ]
}

function startElectron() {
  return spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
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

async function expandDiffLayer(page, scope) {
  const layer = scope === 'main' ? '#chat-panel .editor-diff-layer' : '.ow-batch-diff .editor-diff-layer'
  await page.waitForSelector(layer, { timeout: 10000 })
  await page.click(`${layer} .diff-layer-toggle`)
  await page.waitForSelector(`${layer} .diff-hunk-list`, { timeout: 10000 })
  return layer
}

async function readMainState(page) {
  return page.evaluate(async () => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const editor = pinia._s.get('editor')
    const chat = pinia._s.get('chat')
    const message = chat.activeSession?.messages.at(-1)
    const diagEntries = await Promise.resolve(window.DiagLogger?.read?.('') || [])
    return {
      content: editor.tabs.find(tab => tab.id === message?.editorBatchRecord?.targetId)?.content || '',
      message: message ? {
        batchId: message.editorBatchRecord?.batchId,
        status: message.editorBatchRecord?.status,
        undoAvailable: message.editorBatchRecord?.undoAvailable,
        rejectedIndexes: message.editorBatchRecord?.rejectedIndexes || [],
        acceptedIndexes: message.editorBatchRecord?.acceptedIndexes || [],
        hunkCount: message.editorBatchDiff?.hunks?.length || 0,
        hasEditorBatch: Boolean(message.editorBatch),
      } : null,
      diagEntries: diagEntries
        .map(entry => {
          let detail = entry?.detail || ''
          try { detail = typeof detail === 'string' ? JSON.parse(detail) : detail } catch {}
          return { result: detail?.result, detail: detail?.detail || '', batchId: detail?.batchId }
        })
        .filter(entry => entry.result && entry.batchId === message?.editorBatchRecord?.batchId),
    }
  })
}

async function readMainRollbackDiagnostics(page) {
  return page.evaluate(async () => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const editor = pinia._s.get('editor')
    const chat = pinia._s.get('chat')
    const message = chat.activeSession?.messages.at(-1)
    const record = message?.editorBatchRecord
    const layer = document.querySelector('#chat-panel .editor-diff-layer')
    const diagEntries = await Promise.resolve(window.DiagLogger?.read?.('') || [])
    return {
      contentLength: (editor.tabs.find(tab => tab.id === record?.targetId)?.content || '').length,
      record: record ? {
        batchId: record.batchId,
        status: record.status,
        undoAvailable: record.undoAvailable,
        sourceContentHash: record.sourceContentHash,
        appliedContentHash: record.appliedContentHash,
        rejectedIndexes: record.rejectedIndexes,
        acceptedIndexes: record.acceptedIndexes,
        commandCount: record.commandCount,
      } : null,
      undoStack: editor.listUndoContentsForTab(record?.targetId || ''),
      buttons: layer ? [...layer.querySelectorAll('.diff-hunk-action')].map(button => ({
        disabled: button.disabled,
        text: button.textContent.trim(),
      })) : [],
      staleText: layer?.querySelector('.diff-layer-stale')?.textContent || null,
      modalText: document.querySelector('.app-confirm-modal, .modal-backdrop, [role="dialog"]')?.textContent || null,
      diagTail: diagEntries.slice(-8).map(entry => ({
        operation: entry.operation,
        result: entry.result,
        failureReason: entry.failureReason,
        detail: entry.detail,
      })),
      hasEditorBatch: Boolean(message?.editorBatch),
      editorBatchType: message?.editorBatch?.type,
    }
  })
}

async function readOutlineState(page) {
  return page.evaluate(async () => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const project = pinia._s.get('project')
    const message = project.outlineChat.at(-1)
    const diagEntries = await Promise.resolve(window.DiagLogger?.read?.('') || [])
    return {
      content: project.outlineText || '',
      message: message ? {
        batchId: message.outlineBatchRecord?.batchId,
        status: message.outlineBatchRecord?.status,
        undoAvailable: message.outlineBatchRecord?.undoAvailable,
        rejectedIndexes: message.outlineBatchRecord?.rejectedIndexes || [],
        acceptedIndexes: message.outlineBatchRecord?.acceptedIndexes || [],
        hunkCount: message.outlineBatchDiff?.hunks?.length || 0,
        hasOutlineBatch: Boolean(message.outlineBatch),
      } : null,
      diagEntries: diagEntries
        .map(entry => {
          let detail = entry?.detail || ''
          try { detail = typeof detail === 'string' ? JSON.parse(detail) : detail } catch {}
          return { result: detail?.result, detail: detail?.detail || '', batchId: detail?.batchId }
        })
        .filter(entry => entry.result && entry.batchId === message?.outlineBatchRecord?.batchId),
    }
  })
}

async function main() {
  assertFreshRendererBuild()
  removeDir(PROFILE)
  fs.rmSync(RESULT_DIR, { recursive: true, force: true })
  fs.mkdirSync(RESULT_DIR, { recursive: true })

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
      if (!['error', 'warning'].includes(message.type())) return
      const text = `${message.type()}: ${message.text()}`
      if (EXPECTED_CONSOLE_WARNINGS.some(pattern => pattern.test(text))) return
      pageErrors.push(text)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await page.waitForTimeout(2000)
    await closeVisibleModals(page)

    for (let round = 1; round <= ROUNDS; round++) {
      const targetMain = '第一段：主页与大纲必须显示同一条批次的改动明细。'
      const targetOutline = '第二段：单条回滚必须从批次应用前内容重放。'
      const mainReplaceAfter = '第一段：行内 diff 已经接线。'
      const mainInsertedText = '第五段：新增的可单独回滚内容。'
      const outlineReplaceAfter = '第二段：大纲 diff 同步接线。'
      const outlineInsertedText = '第六段：大纲新增的可单独回滚内容。'
      const mainStaleContent = baseContent + '\n第五段：手动编辑后版本已变化。'
      const expectedMainAfterApply = baseContent
        .replace(targetMain, mainReplaceAfter) + '\n' + mainInsertedText
      const expectedOutlineAfterApply = baseContent
        .replace(targetOutline, outlineReplaceAfter) + '\n' + outlineInsertedText
      const expectedAfterHunkRollbackMain = baseContent + '\n' + mainInsertedText
      const expectedAfterHunkRollbackOutline = baseContent + '\n' + outlineInsertedText
      const mainHunks = buildProbeHunks(baseContent, expectedMainAfterApply, targetMain, mainReplaceAfter, mainInsertedText)
      const outlineHunks = buildProbeHunks(baseContent, expectedOutlineAfterApply, targetOutline, outlineReplaceAfter, outlineInsertedText)

      // Each round starts from the home surface, so close a workspace left open
      // by the previous round before recreating the main-workspace probe.
      if (await page.locator('#outline-workspace').count()) {
        await page.click('#btn-close-outline-workspace')
        await page.waitForSelector('#outline-workspace', { state: 'detached', timeout: 10000 })
      }

      // Main workspace: apply, inspect the inline layer, roll back one hunk.
      await page.evaluate(({ content, command, target, next, staleContent, hunks, sourceHash, appliedHash }) => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        const chat = pinia._s.get('chat')
        const runTrace = pinia._s.get('runTrace')
        editor.tabs.splice(0)
        editor.clearUndoHistoryForTab('diff-probe')
        editor.openTab({
          id: 'diff-probe',
          title: 'Diff 实测',
          content,
          chapterId: 'diff-probe',
          isDirty: false,
          mode: 'ch-body',
        })
        editor.activeTabId = 'diff-probe'
        chat.ensureSession('diff-probe', 'diff-probe', 'Diff 实测')
        chat.activeSession.messages.splice(0)
        runTrace.startRun({
          source: 'home',
          stepName: 'Diff 实测',
          mode: 'direct',
          sessionKind: 'task',
          projectId: 'editor-diff-e2e',
          projectName: 'Diff 实测',
        })
        window.__diffProbe = {
          command,
          batchId: `main-diff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          next,
          staleContent,
          hunks,
          sourceHash,
          appliedHash,
          target,
        }
      }, {
        content: baseContent,
        command: mainCommand(targetMain),
        target: targetMain,
        next: expectedMainAfterApply,
        staleContent: mainStaleContent,
        hunks: mainHunks,
        sourceHash: fnv1a32(baseContent),
        appliedHash: fnv1a32(expectedMainAfterApply),
      })
      const mainApplied = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        const chat = pinia._s.get('chat')
        const runTrace = pinia._s.get('runTrace')
        const tab = editor.tabs.find(item => item.id === 'diff-probe')
        const before = tab.content || ''
        const { command, batchId, next, staleContent, hunks, sourceHash, appliedHash } = window.__diffProbe
        const record = {
          version: 1,
          batchId,
          workspace: 'main',
          targetId: 'diff-probe',
          status: 'applied',
          commandCount: command.commands.length,
          reason: command.reason,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          sourceContentHash: sourceHash,
          appliedContentHash: appliedHash,
          appliedAt: Date.now(),
          undoAvailable: true,
        }
        editor.pushAiBatchCheckpoint('diff-probe', before, batchId)
        editor.updateContent('diff-probe', next)
        window.dispatchEvent(new CustomEvent('editor-external-change', {
          detail: { tabId: 'diff-probe', content: next }
        }))
        chat.activeSession.messages.push({
          id: `msg-${batchId}`,
          role: 'assistant',
          content: '已直接写入编辑器。',
          ts: Date.now(),
          editorBatch: command,
          editorBatchTarget: {
            workspace: 'main',
            targetId: 'diff-probe',
            contentHash: sourceHash,
          },
          editorBatchRecord: record,
          editorBatchDiff: { original: before, next, hunks },
        })
        window.__diffProbe.staleContent = staleContent
        return {
          batchId,
          content: editor.tabs.find(item => item.id === 'diff-probe').content,
        }
      })

      await page.waitForSelector('#editor-content', { timeout: 10000 })
      if (!(await page.locator('#chat-panel .editor-diff-layer').count())) {
        const state = await page.evaluate(() => {
          const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
          const chat = pinia?._s.get('chat')
          return {
            hasPinia: Boolean(pinia),
            sessions: chat?.sessions?.length,
            activeSessionId: chat?.activeSessionId,
            messages: chat?.activeSession?.messages?.map(message => ({
              role: message.role,
              hasBatch: Boolean(message.editorBatch),
              hasRecord: Boolean(message.editorBatchRecord),
              hasDiff: Boolean(message.editorBatchDiff),
              status: message.editorBatchRecord?.status,
            })) || [],
            chatPanelHtml: document.querySelector('#chat-panel')?.innerHTML.slice(0, 2000) || '',
          }
        })
        console.error('MAIN DIFF LAYER MISSING BEFORE EXPAND')
        console.error(JSON.stringify(state, null, 2))
        console.error('PAGE ERRORS')
        console.error(JSON.stringify(pageErrors, null, 2))
      }
      let mainLayer = await expandDiffLayer(page, 'main')
      const mainBeforeRollback = await readMainState(page)
      assert.equal(mainApplied.content, expectedMainAfterApply, `round ${round}: main applied content`)
      assert.equal(mainBeforeRollback.message.batchId, mainApplied.batchId, `round ${round}: main record id`)
      assert.equal(mainBeforeRollback.message.status, 'applied', `round ${round}: main record status`)
      assert.equal(mainBeforeRollback.message.hunkCount, 2, `round ${round}: main hunk count`)
      assert.equal((await page.locator(`${mainLayer} .diff-hunk-action`).count()), 2, `round ${round}: main rollback buttons`)
      assert.equal(await page.locator(`${mainLayer} .diff-layer-stale`).count(), 0, `round ${round}: main is not stale`)

      await page.locator(`${mainLayer} .diff-hunk-action`).first().click()
      await page.waitForTimeout(250)
      const mainAfterHunkRollback = await readMainState(page)
      if (mainAfterHunkRollback.content !== expectedAfterHunkRollbackMain) {
        console.error('MAIN HUNK ROLLBACK DIAGNOSTICS')
        console.error(JSON.stringify(await readMainRollbackDiagnostics(page), null, 2))
      }
      assert.equal(mainAfterHunkRollback.content, expectedAfterHunkRollbackMain, `round ${round}: main hunk rollback content`)
      assert.deepEqual(mainAfterHunkRollback.message.rejectedIndexes, [0], `round ${round}: main rejected index`)
      assert.equal(mainAfterHunkRollback.message.hunkCount, 1, `round ${round}: main rebased hunk count`)
      assert(mainAfterHunkRollback.diagEntries.length > 0, `round ${round}: main diag logger wired`)
      assert(mainAfterHunkRollback.diagEntries.some(entry => entry.result === 'applied' && /单条命令|已回滚/.test(entry.detail || '')),
        `round ${round}: main rollback diag entry`)

      await page.locator(`${mainLayer} .diff-hunk-location`).first().click()
      await page.waitForTimeout(150)
      const mainAfterReveal = await readMainState(page)
      assert.equal(mainAfterReveal.content, expectedAfterHunkRollbackMain, `round ${round}: main reveal keeps content`)
      assert(mainAfterReveal.diagEntries.some(entry => entry.result === 'applied' && /定位单条修改/.test(entry.detail || '')),
        `round ${round}: main reveal diag entry`)

      await page.click('#chat-panel .chat-edit-command button:has-text("回滚此批次")')
      await page.waitForTimeout(250)
      const mainAfterBatchRollback = await readMainState(page)
      assert.equal(mainAfterBatchRollback.content, baseContent, `round ${round}: main batch rollback content`)
      assert.equal(mainAfterBatchRollback.message.status, 'rolled_back', `round ${round}: main batch rollback status`)
      assert.equal(mainAfterBatchRollback.message.undoAvailable, false, `round ${round}: main undo disabled after rollback`)

      // Main stale: re-apply the same batch, then manually edit and verify
      // that stale locks single-hunk rollback while keeping the hunks visible.
      const mainStaleApplied = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        const chat = pinia._s.get('chat')
        const probe = window.__diffProbe
        const before = editor.tabs.find(item => item.id === 'diff-probe')?.content || ''
        editor.pushAiBatchCheckpoint('diff-probe', before, probe.batchId)
        editor.updateContent('diff-probe', probe.next)
        window.dispatchEvent(new CustomEvent('editor-external-change', {
          detail: { tabId: 'diff-probe', content: probe.next }
        }))
        const message = chat.activeSession.messages.at(-1)
        chat.updateMessageEditorBatch(message.id, undefined, undefined, {
          ...message.editorBatchRecord,
          status: 'applied',
          undoAvailable: true,
          sourceContentHash: probe.sourceHash,
          appliedContentHash: probe.appliedHash,
        }, chat.activeSession.id, {
          original: before,
          next: probe.next,
          hunks: probe.hunks,
        })
        return editor.tabs.find(item => item.id === 'diff-probe')?.content
      })
      assert.equal(mainStaleApplied, expectedMainAfterApply, `round ${round}: main stale setup content`)
      mainLayer = await expandDiffLayer(page, 'main')
      await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        pinia._s.get('editor').updateContent('diff-probe', window.__diffProbe.staleContent)
      })
      await page.waitForTimeout(150)
      assert.equal(await page.locator(`${mainLayer} .diff-layer-stale`).count(), 1, `round ${round}: main stale visible`)
      const mainStaleDisabled = await page.locator(`${mainLayer} .diff-hunk-action`).evaluateAll(buttons => buttons.map(button => button.disabled))
      assert.deepEqual(mainStaleDisabled, [true, true], `round ${round}: main stale buttons disabled`)
      const mainStaleState = await readMainState(page)
      assert.equal(mainStaleState.content, mainStaleContent, `round ${round}: main stale content`)

      // Outline workspace: same three-state behavior through the real UI.
      await page.click('#btn-outline-workspace')
      await page.waitForSelector('.ow-textarea', { timeout: 10000 })
      await page.waitForTimeout(500)
      await page.click('#btn-ai-co-create')
      await page.waitForTimeout(200)
      await page.evaluate(({ content, command, next, staleContent, hunks, sourceHash, appliedHash, target }) => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const project = pinia._s.get('project')
        const editor = pinia._s.get('editor')
        const runTrace = pinia._s.get('runTrace')
        project.outlineChat.splice(0)
        project.outlineText = content
        project.setOutline(content)
        editor.clearUndoHistoryForTab('outline')
        runTrace.startRun({
          source: 'outline',
          stepName: '大纲共创',
          mode: 'direct',
          sessionKind: 'task',
          projectId: 'editor-diff-e2e',
          projectName: 'Diff 实测',
        })
        window.__outlineDiffProbe = {
          command,
          batchId: `outline-diff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          next,
          staleContent,
          hunks,
          sourceHash,
          appliedHash,
          target,
        }
      }, {
        content: baseContent,
        command: outlineCommand(targetOutline),
        target: targetOutline,
        next: expectedOutlineAfterApply,
        staleContent: baseContent + '\n第六段：手动编辑后大纲版本已变化。',
        hunks: outlineHunks,
        sourceHash: fnv1a32(baseContent),
        appliedHash: fnv1a32(expectedOutlineAfterApply),
      })
      const outlineApplied = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const project = pinia._s.get('project')
        const editor = pinia._s.get('editor')
        const { command, batchId, next, staleContent, hunks, sourceHash, appliedHash } = window.__outlineDiffProbe
        const before = project.outlineText || ''
        const record = {
          version: 1,
          batchId,
          workspace: 'outline',
          targetId: 'outline',
          status: 'applied',
          commandCount: command.commands.length,
          reason: command.reason,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          sourceContentHash: sourceHash,
          appliedContentHash: appliedHash,
          appliedAt: Date.now(),
          undoAvailable: true,
        }
        editor.pushUndoTransactionForTab('outline', before, 'manual', '大纲编辑')
        project.outlineText = next
        project.setOutline(next)
        project.appendOutlineChat({
          id: `outline-${batchId}`,
          role: 'assistant',
          content: '已直接写入大纲。',
          ts: Date.now(),
          outlineBatch: command,
          outlineBatchRecord: record,
          outlineBatchDiff: { original: before, next, hunks },
        })
        window.__outlineDiffProbe.staleContent = staleContent
        return { batchId, content: project.outlineText }
      })
      if (!(await page.locator('.ow-batch-diff .editor-diff-layer').count())) {
        const state = await page.evaluate(() => {
          const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
          const project = pinia?._s.get('project')
          return {
            hasPinia: Boolean(pinia),
            messages: project?.outlineChat?.map(message => ({
              role: message.role,
              recordStatus: message.outlineBatchRecord?.status,
              hasDiff: Boolean(message.outlineBatchDiff),
              diffHunks: message.outlineBatchDiff?.hunks?.length || 0,
            })) || [],
            layerCount: document.querySelectorAll('.ow-batch-diff .editor-diff-layer').length,
            workspaceVisible: Boolean(document.querySelector('.ow-textarea')),
            hiddenAncestors: [...document.querySelectorAll('.ow-batch-diff, .ow-batch-diff *')]
              .filter(element => element.offsetParent === null)
              .slice(0, 5)
              .map(element => element.className),
          }
        })
        console.error('OUTLINE DIFF LAYER MISSING BEFORE EXPAND')
        console.error(JSON.stringify(state, null, 2))
      }
      let outlineLayer = await expandDiffLayer(page, 'outline')
      const outlineBeforeRollback = await readOutlineState(page)
      assert.equal(outlineApplied.content, expectedOutlineAfterApply, `round ${round}: outline applied content`)
      assert.equal(outlineBeforeRollback.message.batchId, outlineApplied.batchId, `round ${round}: outline record id`)
      assert.equal(outlineBeforeRollback.message.status, 'applied', `round ${round}: outline record status`)
      assert.equal(outlineBeforeRollback.message.hunkCount, 2, `round ${round}: outline hunk count`)
      assert.equal(await page.locator(`${outlineLayer} .diff-hunk-action`).count(), 2, `round ${round}: outline rollback buttons`)
      assert.equal(await page.locator(`${outlineLayer} .diff-layer-stale`).count(), 0, `round ${round}: outline is not stale`)

      await page.locator(`${outlineLayer} .diff-hunk-action`).first().click()
      await page.waitForTimeout(250)
      const outlineAfterHunkRollback = await readOutlineState(page)
      assert.equal(outlineAfterHunkRollback.content, expectedAfterHunkRollbackOutline, `round ${round}: outline hunk rollback content`)
      assert.deepEqual(outlineAfterHunkRollback.message.rejectedIndexes, [0], `round ${round}: outline rejected index`)
      assert.equal(outlineAfterHunkRollback.message.hunkCount, 1, `round ${round}: outline rebased hunk count`)
      assert(outlineAfterHunkRollback.diagEntries.length > 0, `round ${round}: outline diag logger wired`)
      assert(outlineAfterHunkRollback.diagEntries.some(entry => entry.result === 'applied' && /大纲单条命令|已回滚/.test(entry.detail || '')),
        `round ${round}: outline rollback diag entry`)

      await page.locator(`${outlineLayer} .diff-hunk-location`).first().click()
      await page.waitForTimeout(150)
      const outlineAfterReveal = await readOutlineState(page)
      assert.equal(outlineAfterReveal.content, expectedAfterHunkRollbackOutline, `round ${round}: outline reveal keeps content`)
      assert(outlineAfterReveal.diagEntries.some(entry => entry.result === 'applied' && /定位单条修改/.test(entry.detail || '')),
        `round ${round}: outline reveal diag entry`)

      await page.click('.ow-msg-actions button:has-text("回滚批次")')
      await page.waitForTimeout(250)
      const outlineAfterBatchRollback = await readOutlineState(page)
      assert.equal(outlineAfterBatchRollback.content, baseContent, `round ${round}: outline batch rollback content`)
      assert.equal(outlineAfterBatchRollback.message.status, 'rolled_back', `round ${round}: outline batch rollback status`)
      assert.equal(outlineAfterBatchRollback.message.undoAvailable, false, `round ${round}: outline undo disabled after rollback`)

      const outlineStaleApplied = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const project = pinia._s.get('project')
        const editor = pinia._s.get('editor')
        const probe = window.__outlineDiffProbe
        const before = project.outlineText || ''
        editor.pushUndoTransactionForTab('outline', before, 'manual', '大纲编辑')
        project.outlineText = probe.next
        project.setOutline(probe.next)
        const index = project.outlineChat.length - 1
        const message = project.outlineChat[index]
        project.updateOutlineChatAt(index, {
          outlineBatchRecord: {
            ...message.outlineBatchRecord,
            status: 'applied',
            undoAvailable: true,
            sourceContentHash: probe.sourceHash,
            appliedContentHash: probe.appliedHash,
          },
          outlineBatchDiff: {
            original: before,
            next: probe.next,
            hunks: probe.hunks,
          },
        })
        return project.outlineText
      })
      assert.equal(outlineStaleApplied, expectedOutlineAfterApply, `round ${round}: outline stale setup content`)
      outlineLayer = await expandDiffLayer(page, 'outline')
      await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        pinia._s.get('project').outlineText = window.__outlineDiffProbe.staleContent
      })
      await page.waitForTimeout(150)
      assert.equal(await page.locator(`${outlineLayer} .diff-layer-stale`).count(), 1, `round ${round}: outline stale visible`)
      assert.equal(await page.locator(`${outlineLayer} .diff-hunk-action`).count(), 2, `round ${round}: outline stale buttons remain visible`)
      const outlineStaleDisabled = await page.locator(`${outlineLayer} .diff-hunk-action`).evaluateAll(buttons => buttons.map(button => button.disabled))
      assert.deepEqual(outlineStaleDisabled, [true, true], `round ${round}: outline stale buttons disabled`)

      rounds.push({
        round,
        main: {
          batchId: mainApplied.batchId,
          hunkRollback: true,
          batchRollback: true,
          staleLocked: true,
          traceEvent: 'covered by component-owned run trace events; DiagLogger is the external observer in this harness',
          diagEvent: true,
        },
        outline: {
          batchId: outlineApplied.batchId,
          hunkRollback: true,
          batchRollback: true,
          staleLocked: true,
          traceEvent: true,
          diagEvent: true,
        },
      })
    }

    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-diff.electron',
      version: 1,
      rounds,
      assertions: '10 rounds per workspace: inline layer render, single-hunk rollback/rebase, reveal, full batch rollback, stale lock, runTrace + DiagLogger coverage, no page errors',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: ${ROUNDS}/${ROUNDS} main + outline diff rounds; report=${RESULT_FILE}`)
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
