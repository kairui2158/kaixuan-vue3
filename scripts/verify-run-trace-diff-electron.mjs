import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9308
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'run-trace-diff-profile')
const RESULT_DIR = path.join(ROOT, '_audit', 'verification-run-trace-diff')
const RESULT_FILE = path.join(RESULT_DIR, 'electron-10-rounds.json')
const EXPORT_DIR = path.join(RESULT_DIR, 'exports')
const ROUNDS = 10

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
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_DIR,
    },
  })
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

function createRunInPage(page, variant, round) {
  return page.evaluate(({ variant, round }) => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    assert: {
      if (!pinia) throw new Error('pinia reachable')
    }
    const runTrace = pinia._s.get('runTrace')
    const isA = variant === 'A'
    const runId = runTrace.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chain',
      sessionKind: 'task',
      projectId: 'run-trace-diff-e2e',
      projectName: '运行对比实测',
      providerId: 'probe-provider',
      providerName: 'Probe Provider',
      model: 'probe-model',
      skillNames: ['大纲对比技能'],
      skillMode: 'folder',
    })
    const callId = runTrace.startApiCall(runId, {
      skillId: 'outline-compare',
      skillName: '大纲对比技能',
      skillVersion: isA ? '1.0.0' : '1.1.0',
      providerId: 'probe-provider',
      providerName: 'Probe Provider',
      model: 'probe-model',
      intent: 'edit',
      toolSurface: [
        { name: 'editor.read', policy: 'read' },
        { name: 'editor.write', policy: 'write' },
      ],
      actualToolSurface: [
        { name: 'editor.read', policy: 'read' },
        { name: 'editor.write', policy: 'write' },
      ],
      requestMessages: [
        { role: 'system', content: isA ? '模板 A system prompt 全文。' : '模板 B system prompt 全文。' },
        { role: 'user', content: `第 ${round} 轮对比请求${isA ? '（A）' : '（B）'}` },
      ],
    })
    runTrace.appendToolCall(runId, callId, {
      name: 'editor.read',
      toolCallId: `read-${variant}-${round}`,
      input: { target: 'outline', range: { from: 0, to: 200 } },
      result: { text: isA ? 'A 侧大纲片段' : 'B 侧大纲片段' },
      status: 'success',
      durationMs: 12,
    })
    runTrace.appendToolCall(runId, callId, {
      name: isA ? 'editor.search' : 'editor.write',
      toolCallId: `diverge-${variant}-${round}`,
      input: isA ? { query: '第一卷' } : { content: 'B 侧写入内容' },
      result: { ok: true },
      status: isA ? 'success' : 'failed',
      error: isA ? undefined : 'probe-tool-failed',
      durationMs: 18,
    })
    runTrace.attachPromptSnapshot(runId, {
      apiCallId: callId,
      skillId: 'outline-compare',
      skillName: '大纲对比技能',
      skillVersion: isA ? '1.0.0' : '1.1.0',
      mode: 'folder',
      promptName: 'template.md',
      variables: [{ name: 'outline', value: isA ? 'A 模板变量' : 'B 模板变量' }],
      contextBlocks: [{ name: 'outline', text: isA ? 'A 上下文块' : 'B 上下文块' }],
      folderFingerprint: [{ file: 'template.md', hash: isA ? 'hash-a' : 'hash-b' }],
      systemPrompt: isA ? '模板 A system prompt 全文。' : '模板 B system prompt 全文。',
      userPrompt: `第 ${round} 轮对比请求${isA ? '（A）' : '（B）'}`,
      finalMessages: [
        { role: 'system', content: isA ? '模板 A system prompt 全文。' : '模板 B system prompt 全文。' },
        { role: 'user', content: `第 ${round} 轮对比请求${isA ? '（A）' : '（B）'}` },
      ],
    })
    runTrace.finishApiCall(runId, callId, {
      status: 'success',
      responseText: isA ? 'A 完整返回全文。' : 'B 完整返回全文。',
      reasoningText: isA ? 'A 思考过程。' : 'B 思考过程。',
      finishReason: 'stop',
      durationMs: 48,
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    })
    runTrace.finishRun(runId, 'success')
    return { runId, callId, variant }
  }, { variant, round })
}

async function main() {
  assertFreshRendererBuild()
  removeDir(PROFILE)
  removeDir(RESULT_DIR)
  fs.mkdirSync(EXPORT_DIR, { recursive: true })

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
      pageErrors.push(`${message.type()}: ${message.text()}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await page.waitForTimeout(2000)
    await closeVisibleModals(page)

    for (let round = 1; round <= ROUNDS; round++) {
      const runA = await createRunInPage(page, 'A', round)
      const runB = await createRunInPage(page, 'B', round)

      await page.click('#btn-outline-workspace')
      await page.waitForSelector('.ow-textarea', { timeout: 10000 })
      await page.waitForTimeout(300)
      await page.click('#btn-ow-run-trace')
      await page.waitForSelector('#run-trace-panel', { timeout: 10000 })
      assert.equal(pageErrors.length, 0, `round ${round} before compare: ${pageErrors.join(' | ')}`)
      await page.click('#run-trace-panel .rt-header-actions button:has-text("对比运行")')
      await page.waitForSelector('#run-trace-panel .rt-run-compare', { timeout: 10000 })

      await page.locator(`#run-trace-panel .rt-run[data-run-id="${runB.runId}"] .rt-run-compare button:has-text("选 A")`).click()
      await page.locator(`#run-trace-panel .rt-run[data-run-id="${runA.runId}"] .rt-run-compare button:has-text("选 B")`).click()
      assert.equal(pageErrors.length, 0, `round ${round} after selecting compare runs: ${pageErrors.join(' | ')}`)
      if (!(await page.locator('#run-trace-panel .rtd-body').count())) {
        const state = await page.evaluate(({ runA, runB }) => {
          const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
          const runTrace = pinia?._s.get('runTrace')
          const panel = document.querySelector('#run-trace-panel')
          return {
            runA,
            runB,
            storeRuns: runTrace?.runs?.map(run => ({ id: run.id, source: run.source, status: run.status, apiCalls: run.apiCalls?.length })) || [],
            panelText: panel?.textContent?.slice(0, 1000) || '',
            compareButtons: panel ? [...panel.querySelectorAll('.rt-run-compare button')].map(button => ({
              text: button.textContent.trim(),
              active: button.classList.contains('active'),
            })) : [],
          }
        }, { runA: runA.runId, runB: runB.runId })
        console.error('RUN TRACE DIFF PANEL MISSING')
        console.error(JSON.stringify(state, null, 2))
      }
      await page.waitForSelector('#run-trace-panel .rtd-body', { timeout: 10000 })

      await page.click('#run-trace-panel .rtd-tabs button:has-text("工具与处理")')
      await page.waitForTimeout(80)
      const diffState = await page.evaluate(() => {
        const panel = document.querySelector('#run-trace-panel')
        return {
          tabs: [...panel.querySelectorAll('.rtd-tabs button')].map(button => button.textContent.trim()),
          templateVersionText: panel.querySelector('.rtd-subtitle + .rtd-grid')?.textContent || '',
          hasFirstDivergence: Boolean(panel.querySelector('.rtd-warning')),
          firstDivergenceText: panel.querySelector('.rtd-warning')?.textContent || '',
          hasOverflow: [...panel.querySelectorAll('.rtd-tabs button, .rtd-field, .rtd-item')].some(element =>
            element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
          ),
        }
      })
      assert.equal(diffState.tabs.length, 6, `round ${round}: diff panel exposes six tabs`)
      assert(diffState.templateVersionText.includes('1.0.0'), `round ${round}: template A version rendered`)
      assert(diffState.templateVersionText.includes('1.1.0'), `round ${round}: template B version rendered`)
      assert(diffState.hasFirstDivergence, `round ${round}: tool sequence first divergence rendered`)
      assert(!diffState.hasOverflow, `round ${round}: no diff panel overflow`)

      for (const tab of ['概览', 'API', '提示词', '输出', '工具与处理', '事件与状态']) {
        await page.click(`#run-trace-panel .rtd-tabs button:has-text("${tab}")`)
        await page.waitForTimeout(80)
        const activeText = await page.locator('#run-trace-panel .rtd-section').textContent()
        assert(activeText.trim().length > 0, `round ${round}: tab ${tab} renders content`)
      }

      await page.click('#run-trace-panel .rtd-tabs button:has-text("工具与处理")')
      const toolsText = await page.locator('#run-trace-panel .rtd-section').textContent()
      assert(toolsText.includes('模板版本差异数'), `round ${round}: skill debug summary rendered`)
      assert(toolsText.includes('首个不同 API 调用'), `round ${round}: first different API call rendered`)
      assert(toolsText.includes('工具序列首次分叉'), `round ${round}: tool sequence divergence rendered`)

      await page.click('#run-trace-panel .rt-compare-actions button:has-text("导出对比 JSON（全文）")')
      await page.waitForSelector('#run-trace-panel .rt-compare-result', { timeout: 10000 })
      const exportText = await page.locator('#run-trace-panel .rt-compare-result').textContent()
      assert(exportText.includes('已导出'), `round ${round}: export result visible`)
      const exportedFiles = fs.readdirSync(EXPORT_DIR)
        .filter(name => name.endsWith('.json'))
        .map(name => {
          const file = path.join(EXPORT_DIR, name)
          return { name, file, mtime: fs.statSync(file).mtimeMs }
        })
        .sort((x, y) => x.mtime - y.mtime)
      assert.equal(exportedFiles.length, round, `round ${round}: one cumulative export file`)
      const latestExport = exportedFiles.at(-1)
      const exported = JSON.parse(fs.readFileSync(latestExport.file, 'utf8'))
      assert.equal(exported.schema, 'shenyi.run-trace-diff', `round ${round}: export schema`)
      assert.equal(exported.diff.runs.a.id, runB.runId, `round ${round}: export compare side A contains selected run`)
      assert.equal(exported.diff.runs.b.id, runA.runId, `round ${round}: export compare side B contains selected run`)
      assert(exported.diff.runs.a.promptSnapshots[0].skillVersion === '1.1.0', `round ${round}: export compare side A skill version`)
      assert(exported.diff.runs.b.promptSnapshots[0].skillVersion === '1.0.0', `round ${round}: export compare side B skill version`)
      assert.equal(exported.diff.templateVersions.length, 1, `round ${round}: export template version entry`)
      assert(exported.diff.templateVersions[0].changed, `round ${round}: export template changed flag`)
      assert.equal(exported.diff.toolSequence.firstDivergence.index, 1, `round ${round}: export tool divergence index`)
      assert(exported.diff.skillDebugSummary.firstDifferentApiCall.seqA >= 1, `round ${round}: export first different API call`)

      await page.click('#run-trace-panel .modal-close')
      await page.waitForSelector('#run-trace-panel', { state: 'detached', timeout: 10000 })
      await page.click('#btn-close-outline-workspace')
      await page.waitForSelector('#outline-workspace', { state: 'detached', timeout: 10000 })

      rounds.push({
        round,
        runA: runA.runId,
        runB: runB.runId,
        sixTabs: diffState.tabs,
        templateVersionDiffRendered: true,
        toolSequenceDivergenceRendered: true,
        firstDifferentApiCallRendered: true,
        exportContainsFullRuns: true,
        exportPath: latestExport.file,
      })
    }

    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.run-trace-diff.electron',
      version: 1,
      rounds,
      assertions: '10 rounds: real RunTracePanel compare flow, six tabs, template version diff, tool sequence first divergence, first different API call, export JSON with both full runs, no overflow, no page errors',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: ${ROUNDS}/${ROUNDS} run trace diff rounds; report=${RESULT_FILE}`)
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
