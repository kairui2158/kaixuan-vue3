import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist-renderer')
const OUT_DIR = path.join(ROOT, '_audit', 'verification-design-fusion-responsive-overflow')
const PORT = 4174
const TOLERANCE = 1

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`)
}

function collectFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, files)
    else files.push(full)
  }
  return files
}

function collectVueFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      collectVueFiles(full, files)
    } else if (entry.isFile() && entry.name.endsWith('.vue')) {
      files.push(full)
    }
  }
  return files
}

function collectSourceModalIds() {
  const directIds = new Set()
  const topsheetIds = new Set()
  const dataPanelIds = new Set()
  for (const file of collectVueFiles(path.join(ROOT, 'src'))) {
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(/(?<![:\w-])(?:data-)?modal-id="([^"]+)"/g)) {
      directIds.add(match[1])
    }
    for (const match of source.matchAll(/<TopSheet[^>]*\bmodal-id="([^"]+)"/gs)) {
      topsheetIds.add(match[1])
    }
    for (const match of source.matchAll(/:data-panel="([^"]+)"/g)) {
      if (match[1] === 'item.id') dataPanelIds.add('outline-workspace')
      else dataPanelIds.add(match[1])
    }
  }
  for (const id of topsheetIds) directIds.add(id)
  return { modalIds: directIds, panelIds: dataPanelIds }
}

function assertViewCoverage() {
  const { modalIds, panelIds } = collectSourceModalIds()
  const covered = new Map(views.map(view => [view.modalId ?? view.id, view]))
  const missing = [...modalIds].filter(id => !covered.has(id)).sort()
  const obsolete = [...covered.keys()].filter(id => id !== 'main' && !modalIds.has(id)).sort()
  const missingPanels = [...panelIds].filter(id => !covered.has(id)).sort()
  assert(missing.length === 0, `unregistered modal surfaces: ${missing.join(', ')}`)
  assert(obsolete.length === 0, `probe views no longer exist in source: ${obsolete.join(', ')}`)
  assert(missingPanels.length === 0, `unregistered sidebar panels: ${missingPanels.join(', ')}`)
  // Some views intentionally probe different tabs of the same modal.
  const sharedModalMappings = new Set([
    'settings-modal:settings',
    'settings-modal:skill-settings'
  ])
  const duplicates = views
    .map(view => view.modalId ?? view.id)
    .filter((id, index, all) => all.indexOf(id) !== index)
    .filter(id => {
      const viewIds = views.filter(view => (view.modalId ?? view.id) === id).map(view => view.id)
      return !viewIds.every(viewId => sharedModalMappings.has(`${id}:${viewId}`))
    })
  assert(duplicates.length === 0, `unexpected duplicate probe modal mappings: ${[...new Set(duplicates)].join(', ')}`)
}

function assertFreshBuild() {
  const bundles = collectFiles(DIST).filter(file => /\.(?:js|css)$/.test(file))
  assert(bundles.length > 0, 'dist-renderer has no JS bundle')
  const bundleTime = Math.max(...bundles.map(file => fs.statSync(file).mtimeMs))
  for (const dir of ['src', 'public']) {
    const full = path.join(ROOT, dir)
    if (!fs.existsSync(full)) continue
    const newer = collectFiles(full).filter(file => fs.statSync(file).mtimeMs > bundleTime)
    assert(newer.length === 0, `stale build: ${path.relative(ROOT, newer[0] ?? '')} is newer than dist-renderer`)
  }
}

function isPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

function waitForServer(url) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    function tryOnce() {
      fetch(url).then(response => {
        if (response.ok) resolve()
        else retry()
      }).catch(retry)
    }
    function retry() {
      if (Date.now() - started > 15000) {
        reject(new Error(`server did not start: ${url}`))
        return
      }
      setTimeout(tryOnce, 200)
    }
    tryOnce()
  })
}

async function startPreview() {
  assert(await isPortFree(PORT), `port ${PORT} must be free; stop the existing preview process first`)
  const viteCli = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const child = spawn(process.execPath, [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore'
  })
  child.once('error', error => {
    throw new Error(`failed to start vite preview: ${error.message}`)
  })
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`)
  } catch (error) {
    child.kill()
    throw error
  }
  return child
}

const widths = [320, 375, 480, 600, 601, 760, 761, 800, 1024, 1440, 1920, 2560]
const views = [
  { id: 'main' },
  { id: 'settings', modalId: 'settings-modal' },
  { id: 'pipeline', modalId: 'pipeline-panel' },
  { id: 'outline', modalId: 'outline-workspace' },
  { id: 'memory', modalId: 'memory-panel' },
  { id: 'memory-history', modalId: 'memory-history' },
  { id: 'memory-blacklist', modalId: 'memory-blacklist' },
  { id: 'memory-merge', modalId: 'memory-merge' },
  { id: 'memory-conflict', modalId: 'memory-conflict' },
  { id: 'memory-category', modalId: 'memory-category' },
  { id: 'memory-edit', modalId: 'memory-edit' },
  { id: 'memory-profile-export', modalId: 'memory-profile-export' },
  { id: 'skill-settings', modalId: 'settings-modal' },
  { id: 'skill-health', modalId: 'skill-health-report' },
  { id: 'skill-version', modalId: 'skill-version-rollback' },
  { id: 'skill-test', modalId: 'skill-test' },
  { id: 'skill-edit', modalId: 'skill-edit' },
  { id: 'skill-import', modalId: 'skill-import-preview' },
  { id: 'skill-folder-batch', modalId: 'skill-folder-batch-preview' },
  { id: 'skill-folder-import', modalId: 'skill-folder-import-preview' },
  { id: 'skill-package', modalId: 'skill-package-preview' },
  { id: 'dashboard', modalId: 'dashboard-modal' },
  { id: 'plugin-market', modalId: 'plugin-market' },
  { id: 'project', modalId: 'project-modal', minWidth: 800 },
  { id: 'naming', modalId: 'ai-naming' },
  { id: 'skill-bind', modalId: 'skill-bind-modal' },
  { id: 'diff', modalId: 'diff-modal' },
  { id: 'help', modalId: 'help-guide' },
  { id: 'run-trace', modalId: 'run-trace-panel' },
  { id: 'agent-import-preview', modalId: 'agent-import-preview' },
  { id: 'editor-memory-preview', modalId: 'editor-memory-preview' },
  { id: 'pipeline-flow-save', modalId: 'pipeline-flow-save' },
  { id: 'pipeline-flow-load', modalId: 'pipeline-flow-load' },
  { id: 'pl-binding-import-preview', modalId: 'pl-binding-import-preview' },
  { id: 'pl-add-setting', modalId: 'pl-add-setting' },
  { id: 'pl-setting-detail', modalId: 'pl-setting-detail' },
  { id: 'pl-memory-preview', modalId: 'pl-memory-preview' },
  { id: 'pl-chapter-detail', modalId: 'pl-chapter-detail' },
  { id: 'chapter-tree-context', modalId: 'chapter-tree-context' },
  { id: 'exit-confirm', modalId: 'exit-confirm-modal' },
  { id: 'app-confirm', modalId: 'app-confirm' },
  { id: 'deai-progress', modalId: 'deai-progress' }
]
const NESTED_SKILL_VIEWS = new Set([
  'skill-health',
  'skill-version',
  'skill-test',
  'skill-edit',
  'skill-import',
  'skill-folder-batch',
  'skill-folder-import',
  'skill-package'
])
const NESTED_SKILL_MODAL_IDS = {
  'skill-health': 'skill-health-report',
  'skill-version': 'skill-version-rollback',
  'skill-test': 'skill-test',
  'skill-edit': 'skill-edit',
  'skill-import': 'skill-import-preview',
  'skill-folder-batch': 'skill-folder-batch-preview',
  'skill-folder-import': 'skill-folder-import-preview',
  'skill-package': 'skill-package-preview'
}

function caseName(item) {
  return `${item.theme}-${item.density}-${item.width}-${item.view}`
}

function buildCases() {
  const cases = []
  widths.forEach((width, widthIndex) => {
    views.forEach(view => {
      if (view.minWidth && width < view.minWidth) return
      const theme = widthIndex % 2 === 0 ? 'light' : 'dark'
      const density = ['default', 'comfortable', 'compact'][widthIndex % 3]
      cases.push({
        name: caseName({ theme, density, width, view: view.id }),
        theme,
        density,
        width,
        view: view.id
      })
    })
  })
  for (const width of [320, 375, 601, 760, 1024, 1440]) {
  for (const view of ['main', 'naming', 'dashboard', 'plugin-market', 'memory', 'memory-edit', 'help', 'skill-health', 'skill-test', 'skill-edit', 'skill-import', 'skill-package', 'agent-import-preview', 'pipeline-flow-load', 'pl-chapter-detail', 'chapter-tree-context', 'exit-confirm', 'app-confirm']) {
      cases.push({
        name: `stress-${width}-${view}`,
        theme: 'dark',
        density: 'default',
        width,
        view,
        stress: true
      })
    }
  }
  return cases
}

const LONG_TEXT = '这是一个专门用于压力验证的超长中文文本，需要覆盖弹窗标题、列表内容、按钮和元信息，确保所有宽度下都可读且不越界。'

async function openSettingsTab(page, tab) {
  await page.click('#btn-settings')
  await page.waitForSelector('[data-modal-id="settings-modal"]', { state: 'visible' })
  await page.click(`#tab-${tab}`)
  await page.waitForTimeout(80)
}

async function prepareMemoryData(page) {
  await page.evaluate(longText => {
    const state = globalThis.__memoryPanelState
    if (!state) throw new Error('MemoryPanel state bridge not found')
    state.projectStore.memories.entities = Array.from({ length: 8 }, (_, index) => ({
      id: `entity-${index}`,
      name: `${longText.slice(0, 18)}-${index}`,
      aliases: [`alias-${longText.slice(0, 12)}`],
      type: 'character',
      description: longText,
      fields: {}
    }))
  }, LONG_TEXT)
}

async function preparePipelineData(page) {
  await page.evaluate(longText => {
    const state = globalThis.__pipelinePanelState
    if (!state) throw new Error('PipelinePanel state bridge not found')
    const store = state.projectStore
    store.setOutline(`# 第一卷\n## 第1章\n## 第2章\n## 第3章\n## 第4章`)
    store.lockOutline()
    const volumeId = store.volumes[0]?.id || 'vol-test'
    if (store.volumes[0]) store.volumes[0].isBound = true
    store.chapters[volumeId] = Array.from({ length: 6 }, (_, index) => ({
      id: `chapter-${index}`,
      title: `${longText.slice(0, 16)}-${index + 1}`,
      plot: longText,
      summary: longText,
      confirmed: index % 2 === 0,
      pipelineGenerated: true
    }))
    const collection = store.getSettingsCollection()
    collection.categories.push('压力验证设定')
    collection.items['压力验证设定'] = Array.from({ length: 6 }, (_, index) => ({
      id: `setting-${index}`,
      name: `${longText.slice(0, 16)}-${index}`,
      content: longText,
      category: '压力验证设定',
      isBound: index % 2 === 0
    }))
  }, LONG_TEXT)
}

async function openView(page, view) {
  if (view === 'main') return
  if (view === 'settings') {
    await page.click('#btn-settings')
    await page.waitForSelector('[data-modal-id="settings-modal"]', { state: 'visible' })
    return
  }
  if (view === 'pipeline') {
    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { state: 'visible' })
    return
  }
  if (view === 'outline') {
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-workspace', { state: 'visible' })
    return
  }
  if (view === 'memory') {
    await page.click('#btn-memory')
    await page.waitForSelector('#memory-panel', { state: 'visible' })
    await prepareMemoryData(page)
    return
  }
  if (view.startsWith('memory-')) {
    await page.click('#btn-memory')
    await page.waitForSelector('#memory-panel', { state: 'visible' })
    await prepareMemoryData(page)
    if (view === 'memory-history') {
      await page.click('.mem-more-btn')
      await page.waitForSelector('#btn-memory-history', { state: 'visible' })
      await page.click('#btn-memory-history')
      await page.waitForSelector('[data-modal-id="memory-history"]', { state: 'visible' })
    } else if (view === 'memory-blacklist') {
      await page.click('.mem-more-btn')
      await page.waitForSelector('#btn-memory-blacklist', { state: 'visible' })
      await page.click('#btn-memory-blacklist')
      await page.waitForSelector('[data-modal-id="memory-blacklist"]', { state: 'visible' })
    } else if (view === 'memory-merge') {
      await page.click('.mem-more-btn')
      await page.waitForSelector('#btn-memory-merge', { state: 'visible' })
      await page.click('#btn-memory-merge')
      await page.waitForSelector('[data-modal-id="memory-merge"]', { state: 'visible' })
    } else if (view === 'memory-conflict') {
      await page.evaluate(longText => {
        const state = globalThis.__memoryPanelState
        state.conflictItem = {
          key: longText.slice(0, 20),
          category: 'character',
          content: longText,
          source: 'entity',
          entity: state.projectStore.memories.entities[0],
          legacyIndex: -1,
          record: {
            conflictsData: {
              values: [
                { field: longText.slice(0, 14), oldValue: longText, newValue: `${longText}（新）` },
                { field: '身份', oldValue: '旧身份', newValue: longText }
              ]
            }
          }
        }
      }, LONG_TEXT)
      await page.waitForSelector('[data-modal-id="memory-conflict"]', { state: 'visible' })
    } else if (view === 'memory-category') {
      await page.click('#btn-add-mem-cat')
      await page.waitForSelector('[data-modal-id="memory-category"]', { state: 'visible' })
    } else if (view === 'memory-edit') {
      await page.evaluate(longText => {
        const state = globalThis.__memoryPanelState
        state.editDialog = {
          kind: 'entity',
          id: 'entity-0',
          title: longText.slice(0, 24),
          fields: [
            { name: 'name', label: '名称' },
            { name: 'description', label: '描述', multiline: true },
            { name: 'type', label: '类型', options: [{ label: '角色', value: 'character' }] }
          ],
          values: {
            name: longText,
            description: longText,
            type: 'character'
          }
        }
        state.editDialogVisible = true
      }, LONG_TEXT)
      await page.waitForSelector('[data-modal-id="memory-edit"]', { state: 'visible' })
    } else if (view === 'memory-profile-export') {
      await page.evaluate(() => {
        globalThis.__memoryPanelState.profileExportVisible = true
      })
      await page.waitForSelector('[data-modal-id="memory-profile-export"]', { state: 'visible' })
    }
    return
  }
  if (view.startsWith('skill-') && view !== 'skill-bind') {
    await page.click('#btn-settings')
    await page.waitForSelector('[data-modal-id="settings-modal"]', { state: 'visible' })
    await page.click('#tab-skill')
    await page.waitForSelector('#btn-add-skill', { state: 'visible' })
      if (view !== 'skill-settings') {
      const viewId = view
      await page.evaluate(({ viewId }) => {
        const state = globalThis.__skillSettingsState
        if (!state) throw new Error('SkillSettings state bridge not found')
        const longText = '这是一条专门用于技能旁支弹窗压力验证的超长文本，需要检查滚动、换行、按钮与边界表现。'.repeat(4)
        const skillId = state.skills?.[0]?.id ?? 'stress-skill'
          if (viewId === 'skill-health') {
            state.healthReportSkillId = skillId
          state.healthReport = {
            issues: Array.from({ length: 12 }, (_, index) => ({
              level: index % 3 === 0 ? 'warning' : 'error',
              field: `${longText.slice(0, 18)}-${index}`,
              message: longText
            }))
          }
        } else if (viewId === 'skill-version') {
          state.versionRollbackSkillId = skillId
          state.versionRollbackLoading = false
          state.versionRollbackCurrent = '2026.09.21-120000'
          state.versionRollbackVersions = Array.from({ length: 16 }, (_, index) => `2026.09.21-${String(120000 - index * 100).padStart(6, '0')}`)
        } else if (viewId === 'skill-test') {
          state.testSkillId = skillId
          state.testText = longText
          state.testError = ''
          state.testResult = longText
          state.evalError = ''
          state.evalReport = {
            skillName: longText.slice(0, 24),
            benchmark: { withPassed: 3, baselinePassed: 1, total: 4, withPassRate: 75, baselinePassRate: 25, improved: 2, same: 1, degraded: 1 },
            grading: Array.from({ length: 6 }, (_, index) => ({
              caseId: `case-${index}`,
              caseName: `${longText.slice(0, 18)}-${index}`,
              skillEffect: index % 2 === 0 ? 'improved' : 'degraded',
              withSkill: { passed: index % 2 === 0, output: longText, assertions: [{ pass: index % 2 === 0, type: 'contains', message: longText }] },
              baseline: { passed: false, output: longText, assertions: [{ pass: false, type: 'contains', message: longText }] }
            }))
          }
        } else if (viewId === 'skill-edit') {
          const editState = globalThis.__skillEditState
          if (!editState) throw new Error('SkillSettings edit state bridge not found')
          editState.editingSkillId = skillId
          editState.editingName = longText
        } else if (viewId === 'skill-import') {
          state.importSource = longText
          state.importSourceInfo = { source: 'file', protocol: 1 }
          state.importFieldTrace = Array.from({ length: 8 }, (_, index) => ({ field: `field-${index}`, origin: 'root', sourceField: `source-${index}` }))
          state.importDiagnostics = Array.from({ length: 8 }, (_, index) => ({ level: index % 2 === 0 ? 'warning' : 'info', code: `code-${index}`, message: longText }))
          state.importUnknownFields = Array.from({ length: 6 }, (_, index) => `unknown-${index}`)
          state.importIssues = Array.from({ length: 8 }, (_, index) => ({ field: `issue-${index}`, message: longText }))
          state.importPlan = Array.from({ length: 14 }, (_, index) => ({ id: `import-${index}`, name: `${longText.slice(0, 20)}-${index}`, action: index % 2 === 0 ? 'add' : 'skip', reason: longText }))
          state.importPreviewVisible = true
        } else if (viewId === 'skill-folder-batch') {
          state.folderBatchRoot = longText
          state.folderBatchItems = Array.from({ length: 16 }, (_, index) => ({
            name: `${longText.slice(0, 20)}-${index}`,
            folderPath: `${longText}-${index}`,
            folderName: `folder-${index}`,
            id: `folder-${index}`,
            valid: true,
            resourceCount: index,
            warnings: Array.from({ length: index }, (_, warningIndex) => `warning-${warningIndex}`),
            action: index % 2 === 0 ? 'add' : 'skip'
          }))
          state.folderBatchPreviewVisible = true
        } else if (viewId === 'skill-folder-import') {
          state.folderImportPreview = {
            name: longText.slice(0, 28),
            folderPath: longText,
            id: `folder-${longText.slice(0, 12)}`,
            action: 'add',
            message: longText,
            resourceCount: 8,
            warnings: [longText, longText]
          }
          state.folderImportPreviewVisible = true
        } else if (viewId === 'skill-package') {
          state.packagePreview = {
            zipPath: longText,
            compatible: true,
            manifest: null,
            totalBytes: 123456789,
            entries: Array.from({ length: 18 }, (_, index) => ({ path: `${longText.slice(0, 28)}/file-${index}.md`, size: 1024 * (index + 1) }))
          }
        }
      }, { viewId })
      if (NESTED_SKILL_VIEWS.has(viewId)) {
        await page.waitForSelector(`[data-modal-id="${NESTED_SKILL_MODAL_IDS[viewId]}"]`, { state: 'visible' })
      }
    }
    return
  }
  if (view === 'agent-import-preview') {
    await openSettingsTab(page, 'agent')
    await page.evaluate(longText => {
      const state = globalThis.__agentSettingsState
      if (!state) throw new Error('AgentSettings state bridge not found')
      state.importSource = longText
      state.importSourceInfo = { source: 'file', protocol: 1 }
      state.importFieldTrace = Array.from({ length: 8 }, (_, index) => ({ field: `field-${index}`, origin: 'root', sourceField: `source-${index}` }))
      state.importDiagnostics = Array.from({ length: 6 }, (_, index) => ({ level: index % 2 === 0 ? 'warning' : 'info', code: `code-${index}`, message: longText }))
      state.importUnknownFields = Array.from({ length: 4 }, (_, index) => `unknown-${index}`)
      state.importIssues = Array.from({ length: 6 }, (_, index) => ({ field: `issue-${index}`, message: longText }))
      state.importPlan = Array.from({ length: 12 }, (_, index) => ({
        id: `agent-${index}`,
        name: `${longText.slice(0, 20)}-${index}`,
        action: index % 3 === 0 ? 'skip' : 'add',
        reason: longText
      }))
      state.importPreviewVisible = true
    }, LONG_TEXT)
    await page.waitForSelector('[data-modal-id="agent-import-preview"]', { state: 'visible' })
    return
  }
  if (view === 'dashboard') {
    await page.click('#btn-dashboard')
    await page.waitForSelector('#dashboard-modal', { state: 'visible' })
    return
  }
  if (view === 'plugin-market') {
    await page.click('#btn-plugin-market')
    await page.waitForSelector('#plugin-market-modal', { state: 'visible' })
    return
  }
  if (view === 'project') {
    await page.click('#btn-open-project')
    await page.waitForSelector('[data-modal-id="project-modal"]:not(.modal-hidden)', { state: 'visible' })
    return
  }
  if (view === 'naming') {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-ai-naming')))
    await page.waitForSelector('.naming-modal', { state: 'visible' })
    return
  }
  if (view === 'skill-bind') {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('show-skill-binding', {
      detail: { type: 'chapter', id: 'stress' }
    })))
    await page.waitForSelector('.skill-bind-content', { state: 'visible' })
    return
  }
  if (view === 'diff') {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('show-diff', {
      detail: {
        original: '这是用于响应式验证的原始文本。',
        modified: '这是用于响应式验证的修改后文本，长度更长一些，用来检查换行与边界。'
      }
    })))
    await page.waitForSelector('.diff-modal-content', { state: 'visible' })
    return
  }
  if (view === 'help') {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-help-guide')))
    await page.waitForSelector('[data-modal-id="help-guide"]', { state: 'visible' })
    return
  }
  if (view === 'run-trace') {
    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { state: 'visible' })
    await page.click('#btn-run-trace')
    await page.waitForSelector('#run-trace-overlay', { state: 'visible' })
    return
  }
  if (view === 'editor-memory-preview') {
    await page.evaluate(longText => {
      const state = globalThis.__editorMemoryState
      if (!state) throw new Error('Editor memory state bridge not found')
      state.loading = false
      state.error = ''
      state.changes = Array.from({ length: 10 }, (_, index) => ({
        kind: index % 2 === 0 ? 'entity' : 'relation',
        name: `${longText.slice(0, 18)}-${index}`,
        id: `change-${index}`,
        action: index % 3 === 0 ? 'updated' : 'added',
        review: index % 4 === 0 ? 'locked' : 'pending',
        value: { name: longText }
      }))
      state.previewVisible = true
    }, LONG_TEXT)
    await page.waitForSelector('[data-modal-id="editor-memory-preview"]', { state: 'visible' })
    return
  }
  if (view === 'pipeline-flow-save' || view === 'pipeline-flow-load') {
    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { state: 'visible' })
    await page.click('#btn-flow-toggle')
    await page.waitForSelector('#btn-pf-save', { state: 'visible' })
    if (view === 'pipeline-flow-save') {
      await page.click('#btn-pf-save')
      await page.waitForSelector('[data-modal-id="pipeline-flow-save"]', { state: 'visible' })
    } else {
      await page.evaluate(longText => {
        const state = globalThis.__pipelineFlowState
        if (!state) throw new Error('PipelineFlow state bridge not found')
        state.versions = Array.from({ length: 12 }, (_, index) => ({
          name: `${longText.slice(0, 20)}-${index}`,
          savedAt: `2026-09-25 12:${String(index).padStart(2, '0')}:00`,
          config: {}
        }))
      }, LONG_TEXT)
      await page.click('#btn-pf-load')
      await page.waitForSelector('[data-modal-id="pipeline-flow-load"]', { state: 'visible' })
    }
    return
  }
  if (view.startsWith('pl-')) {
    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { state: 'visible' })
    await preparePipelineData(page)
    if (view === 'pl-binding-import-preview') {
      await page.evaluate(longText => {
        const state = globalThis.__pipelinePanelState
        state.bindingImportPreview = {
          ok: true,
          source: longText,
          issues: [{ message: longText }, { message: '结构提示' }],
          bindings: {
            agents: { 0: 'agent-a', 1: 'agent-b' },
            skills: { 0: ['skill-a', 'skill-b'], 1: ['skill-c'] },
            skillAgents: { 'skill-a': 'agent-a' },
            modes: { 0: 'chain', 1: 'compose' }
          }
        }
      }, LONG_TEXT)
      await page.waitForSelector('[data-modal-id="pl-binding-import-preview"]', { state: 'visible' })
    } else if (view === 'pl-add-setting') {
      await page.evaluate(() => {
        globalThis.__pipelinePanelState.showAddSettingModal = true
      })
      await page.waitForSelector('[data-modal-id="pl-add-setting"]', { state: 'visible' })
    } else if (view === 'pl-setting-detail') {
      await page.evaluate(longText => {
        const state = globalThis.__pipelinePanelState
        state.selectedSettingCategory = '压力验证设定'
        state.editingSettingId = 'setting-0'
        state.showSettingDetailModal = true
      }, LONG_TEXT)
      await page.waitForSelector('[data-modal-id="pl-setting-detail"]', { state: 'visible' })
    } else if (view === 'pl-memory-preview') {
      await page.evaluate(longText => {
        const state = globalThis.__pipelinePanelState
        state.memoryPreviewChanges = Array.from({ length: 10 }, (_, index) => ({
          kind: index % 2 === 0 ? 'entity' : 'relation',
          name: `${longText.slice(0, 18)}-${index}`,
          id: `preview-${index}`,
          action: index % 3 === 0 ? 'updated' : 'added',
          review: index % 4 === 0 ? 'locked' : 'pending',
          reason: longText
        }))
        state.memoryPreviewVisible = true
      }, LONG_TEXT)
      await page.waitForSelector('[data-modal-id="pl-memory-preview"]', { state: 'visible' })
    } else if (view === 'pl-chapter-detail') {
      await page.evaluate(() => {
        const state = globalThis.__pipelinePanelState
        if (!state) throw new Error('PipelinePanel state bridge not found')
        state.pipelineStore.setStep(3)
        state.currentVolumeChapters.forEach((chapter, index) => {
          if (index === 0) {
            state.chapterDetailEditTitle = chapter.title || ''
            state.chapterDetailEditPlot = chapter.plot || ''
            state.chapterDetailVisible = true
          }
        })
      })
      await page.waitForSelector('[data-modal-id="pl-chapter-detail"]', { state: 'visible' })
      await page.evaluate(longText => {
        const state = globalThis.__pipelinePanelState
        state.chapterDetailEditTitle = `${longText.slice(0, 20)}-1`
        state.chapterDetailEditPlot = longText
      }, LONG_TEXT)
    }
    return
  }
  if (view === 'chapter-tree-context') {
    await page.evaluate(longText => {
      const state = globalThis.__chapterTreeState
      if (!state) throw new Error('ChapterTree state bridge not found')
      state.ctxMenu = {
        visible: true,
        x: 48,
        y: 96,
        type: 'volume',
        vol: { id: 'vol-context', name: longText.slice(0, 18) },
        ch: null
      }
    }, LONG_TEXT)
      await page.waitForSelector('[data-modal-id="chapter-tree-context"]', { state: 'attached' })
      await page.waitForTimeout(400)
      return
  }
  if (view === 'exit-confirm') {
    await page.evaluate(() => {
      const state = globalThis.__exitConfirmState
      if (!state) throw new Error('ExitConfirm state bridge not found')
      state.saveFailed = true
      state.visible = true
    })
    await page.waitForSelector('[data-modal-id="exit-confirm-modal"]', { state: 'visible' })
    return
  }
  if (view === 'app-confirm') {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('show-app-confirm')))
    await page.waitForSelector('[data-modal-id="app-confirm"]', { state: 'visible' })
    return
  }
  if (view === 'deai-progress') {
    await page.evaluate(longText => {
      const store = globalThis.__deAiStore
      if (!store) throw new Error('DeAi store bridge not found')
      store.startProcessing()
      store.updateProgress(45, longText.slice(0, 24))
    }, LONG_TEXT)
    await page.waitForSelector('[data-modal-id="deai-progress"]', { state: 'visible' })
    return
  }
  throw new Error(`unknown view: ${view}`)
}

const scannerSource = () => {
  const tolerance = 1
  const findings = []
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    if (rect.bottom < -tolerance || rect.top > viewportHeight + tolerance) return false
    const style = getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
  }

  function clippingAncestor(element) {
    let current = element.parentElement
    while (current) {
      const style = getComputedStyle(current)
      const clipsX = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)
      const clipsY = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)
      if (clipsX || clipsY) return { element: current, style, clipsX, clipsY }
      current = current.parentElement
    }
    return null
  }

  function insideHorizontalScroller(element) {
    let current = element.parentElement
    while (current) {
      const style = getComputedStyle(current)
      if (['auto', 'scroll'].includes(style.overflowX)) return true
      if (['hidden', 'clip'].includes(style.overflowX)) return false
      current = current.parentElement
    }
    return false
  }

  function add(kind, element, detail) {
    findings.push({
      kind,
      detail,
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      className: String(element.className || ''),
      text: (element.textContent || '').trim().slice(0, 60),
      rect: element.getBoundingClientRect().toJSON()
    })
  }

  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + tolerance) {
    findings.push({
      kind: 'document-horizontal-overflow',
      detail: `document scrollWidth ${document.documentElement.scrollWidth} > clientWidth ${document.documentElement.clientWidth}`,
      tag: 'html',
      id: null,
      className: '',
      text: '',
      rect: null
    })
  }

  for (const element of document.querySelectorAll('.modal-overlay, .panel-overlay')) {
    if (!isVisible(element)) continue
    for (const child of element.children) {
      if (!isVisible(child)) continue
      const rect = child.getBoundingClientRect()
      if (rect.left < -tolerance || rect.right > viewportWidth + tolerance || rect.top < -tolerance || rect.bottom > viewportHeight + tolerance) {
        add('modal-outside-viewport', child, `modal rect ${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.right)},${Math.round(rect.bottom)}; viewport ${viewportWidth}x${viewportHeight}`)
      }
    }
  }

  const buttons = [...document.querySelectorAll('button, [role="button"], .btn, input[type="button"], input[type="submit"]')]
    .filter(isVisible)
  for (const button of buttons) {
    const style = getComputedStyle(button)
    const textWidth = renderedTextWidth(button)
    const availableWidth = button.clientWidth
      - Number.parseFloat(style.paddingLeft)
      - Number.parseFloat(style.paddingRight)
    const intentionalEllipsis = style.textOverflow === 'ellipsis'
      && style.overflowX === 'hidden'
      && style.whiteSpace === 'nowrap'
    if (!intentionalEllipsis && textWidth > availableWidth + tolerance) {
      add('button-text-overflow', button, `text width ${textWidth} > content width ${availableWidth}`)
    }
    const rect = button.getBoundingClientRect()
    if ((rect.left < -tolerance || rect.right > viewportWidth + tolerance) && !insideHorizontalScroller(button)) {
      add('button-outside-viewport', button, `rect ${Math.round(rect.left)},${Math.round(rect.right)}; viewport ${viewportWidth}`)
    }
    if (button.classList.contains('btn') && !button.classList.contains('btn-icon')) {
      const size = button.classList.contains('btn-lg') ? 'lg'
        : button.classList.contains('btn-sm') ? 'sm'
          : button.classList.contains('btn-xs') ? 'xs' : 'md'
      const expectedFont = {
        xs: 11,
        sm: 12,
        md: 13,
        lg: 15
      }[size]
      const fontSize = Number.parseFloat(style.fontSize)
      const radius = Number.parseFloat(style.borderTopLeftRadius)
      if (Math.abs(fontSize - expectedFont) > 0.1) {
        add('button-font-spec', button, `font-size ${fontSize}px, expected ${expectedFont}px for ${size}`)
      }
      if (Math.abs(radius - 6) > 0.1) {
        add('button-radius-spec', button, `radius ${style.borderTopLeftRadius}, expected 6px`)
      }
    }
  }

  function renderedTextWidth(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT
        return node.parentElement && isVisible(node.parentElement)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
      }
    })
    let width = 0
    let node
    while ((node = walker.nextNode())) {
      const range = document.createRange()
      range.selectNodeContents(node)
      width = Math.max(width, range.getBoundingClientRect().width)
    }
    return width
  }

  const textElements = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,label,a,dt,dd,td,th,li,strong,em')]
    .filter(isVisible)
  for (const element of textElements) {
    const hasDirectText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
    if (!hasDirectText) continue
    const style = getComputedStyle(element)
    const clipped = element.scrollWidth > element.clientWidth + tolerance
    if (!clipped) continue
    const intentionalEllipsis = style.textOverflow === 'ellipsis' && style.overflowX === 'hidden' && style.whiteSpace === 'nowrap'
    if (intentionalEllipsis) continue
    if (insideHorizontalScroller(element)) continue
    const clipper = clippingAncestor(element)
    const clippedByAncestor = clipper && clipper.clipsX && element.getBoundingClientRect().right > clipper.element.getBoundingClientRect().right + tolerance
    if (!clippedByAncestor && style.overflowX === 'visible') {
      add('text-horizontal-overflow', element, `scrollWidth ${element.scrollWidth} > clientWidth ${element.clientWidth}`)
    }
  }

  for (const element of document.body.querySelectorAll('*')) {
    if (!isVisible(element)) continue
    const style = getComputedStyle(element)
    if (style.position === 'fixed' || insideHorizontalScroller(element)) continue
    const rect = element.getBoundingClientRect()
    if (rect.right > viewportWidth + tolerance || rect.left < -tolerance) {
      const clipper = clippingAncestor(element)
      if (!clipper || !clipper.clipsX) {
        add('element-outside-viewport', element, `rect ${Math.round(rect.left)},${Math.round(rect.right)}; viewport ${viewportWidth}`)
      }
    }
  }

  return findings.slice(0, 200)
}

async function measureTooltip(host) {
  const style = getComputedStyle(host, '::after')
  const clampY = Number.parseFloat(host.style.getPropertyValue('--tooltip-clamp-y'))
  return {
    width: Number.parseFloat(style.width),
    height: Number.parseFloat(style.height),
    flipped: host.classList.contains('tooltip-flipped'),
    clampY: Number.isFinite(clampY) ? clampY : 0,
    inlineStyles: `${host.style.getPropertyValue('--tooltip-max-width')}|${host.style.getPropertyValue('--tooltip-clamp-y')}`
  }
}

async function tooltipRect(host, tooltip) {
  const hostRect = await host.boundingBox()
  if (!hostRect) return null
  const gap = 8
  const left = tooltip.flipped
    ? hostRect.left - gap - tooltip.width
    : hostRect.right + gap
  const top = hostRect.top + hostRect.height / 2 - tooltip.height / 2 + tooltip.clampY
  return {
    left,
    right: left + tooltip.width,
    top,
    bottom: top + tooltip.height
  }
}

async function verifySidebarTooltips(page) {
  const failures = []
  const sidebar = page.locator('#app-sidebar')
  const buttons = await sidebar.locator('.sidebar-btn[data-tooltip]').all()
  for (const button of buttons) {
    const id = await button.getAttribute('id')
    const text = await button.getAttribute('data-tooltip')
    const restState = await button.evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      hasInlineTooltipStyles: element.style.getPropertyValue('--tooltip-max-width') !== ''
        || element.style.getPropertyValue('--tooltip-clamp-y') !== ''
    }))
    if (restState.scrollWidth > restState.clientWidth + 1 || restState.hasInlineTooltipStyles) {
      failures.push({
        id,
        text,
        findings: [{
          kind: 'tooltip-pollutes-default-layout',
          detail: `default scrollWidth ${restState.scrollWidth} > clientWidth ${restState.clientWidth}; inline clamp=${restState.hasInlineTooltipStyles}`,
          tag: 'button',
          id,
          className: 'sidebar-btn',
          text,
          rect: null
        }]
      })
      continue
    }
    await button.hover()
    await page.waitForTimeout(80)
    const tooltip = await button.evaluate(measureTooltip)
    const absolute = await tooltipRect(button, tooltip)
    const viewport = page.viewportSize()
    const failed = []
    if (absolute.left < -1) failed.push(`left ${absolute.left}`)
    if (absolute.top < -1) failed.push(`top ${absolute.top}`)
    if (absolute.right > viewport.width + 1) failed.push(`right ${absolute.right} > ${viewport.width}`)
    if (absolute.bottom > viewport.height + 1) failed.push(`bottom ${absolute.bottom} > ${viewport.height}`)
    if (!Number.isFinite(tooltip.width) || tooltip.width <= 0) failed.push(`invalid width ${tooltip.width}`)
    if (failed.length > 0) {
      failures.push({
        id,
        text,
        findings: [{
          kind: 'tooltip-outside-viewport',
          detail: `${text} rect ${Math.round(absolute.left)},${Math.round(absolute.top)},${Math.round(absolute.right)},${Math.round(absolute.bottom)}; viewport ${viewport.width}x${viewport.height}; inline ${tooltip.inlineStyles}`,
          tag: 'button',
          id,
          className: 'sidebar-btn',
          text,
          rect: absolute
        }]
      })
    }
  }
  return failures
}

async function verifyTooltipEdgePlacement(page) {
  const failures = []
  const tooltipText = '这是一个用于四缘Tooltip压力验证的超长提示文本，需要保持完整可读且不越出视口'
  const edgeHostIds = await page.evaluate(tooltipText => {
    const style = document.createElement('style')
    style.textContent = `
      .tooltip-edge-host {
        position: fixed;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.35);
        cursor: pointer;
        z-index: 2147483647;
      }
      #tooltip-edge-left { left: 0; top: 120px; }
      #tooltip-edge-right { right: 0; top: 180px; }
      #tooltip-edge-top { left: 120px; top: 0; }
      #tooltip-edge-bottom { left: 180px; bottom: 0; }
    `
    document.head.append(style)
    const positions = {
      'tooltip-edge-left': 'left: 0; top: 120px;',
      'tooltip-edge-right': 'right: 0; top: 180px;',
      'tooltip-edge-top': 'left: 120px; top: 0;',
      'tooltip-edge-bottom': 'left: 180px; bottom: 0;'
    }
    return Object.entries(positions).map(([id, position]) => {
      const host = document.createElement('button')
      host.type = 'button'
      host.id = id
      host.className = 'tooltip-edge-host'
      host.dataset.tooltip = tooltipText
      host.style.cssText = position
      document.body.append(host)
      return id
    })
  }, tooltipText)
  await page.waitForTimeout(50)

  for (const id of edgeHostIds) {
    const host = page.locator(`#${id}`)
    const hostRect = await host.boundingBox()
    if (!hostRect) {
      failures.push({
        id,
        text: tooltipText,
        findings: [{
          kind: 'tooltip-edge-placement',
          detail: `${id} synthetic host was not rendered`,
          tag: 'button',
          id,
          className: 'tooltip-edge-host',
          text: tooltipText,
          rect: null
        }]
      })
      continue
    }
    await host.hover()
    await page.waitForTimeout(90)
    const tooltip = await host.evaluate(measureTooltip)
    const absolute = await tooltipRect(host, tooltip)
    const viewport = page.viewportSize()
    const failed = []
    if (!absolute) failed.push('tooltip host rect was unavailable')
    if (!Number.isFinite(tooltip.width) || tooltip.width <= 0) failed.push(`invalid width ${tooltip.width}`)
    if (!Number.isFinite(tooltip.height) || tooltip.height <= 0) failed.push(`invalid height ${tooltip.height}`)
    if (absolute) {
      if (absolute.left < -1) failed.push(`left ${absolute.left}`)
      if (absolute.top < -1) failed.push(`top ${absolute.top}`)
      if (absolute.right > viewport.width + 1) failed.push(`right ${absolute.right} > ${viewport.width}`)
      if (absolute.bottom > viewport.height + 1) failed.push(`bottom ${absolute.bottom} > ${viewport.height}`)
    }
    if (Number.isFinite(tooltip.width) && tooltip.width < 64) failed.push(`collapsed width ${tooltip.width}`)
    if (id === 'tooltip-edge-right' && !tooltip.flipped) failed.push('right-edge host did not select the wider side')
    if (failed.length > 0) {
      failures.push({
        id,
        text: tooltipText,
        findings: [{
          kind: 'tooltip-edge-placement',
          detail: `${id} rect ${absolute ? `${Math.round(absolute.left)},${Math.round(absolute.top)},${Math.round(absolute.right)},${Math.round(absolute.bottom)}` : 'null'}; viewport ${viewport.width}x${viewport.height}; flipped=${tooltip.flipped}; inline ${tooltip.inlineStyles}; ${failed.join('; ')}`,
          tag: 'button',
          id,
          className: 'tooltip-edge-host',
          text: tooltipText,
          rect: absolute
        }]
      })
    }
  }
  return failures
}

async function applyStress(page) {
  await page.evaluate(() => {
    const longText = '这是一个专门用于压力验证的超长中文文本场景需要验证界面是否仍能保持边界与可读性'.repeat(2)
    const selectors = [
      '#current-project-name .project-name',
      '#status-chapter',
      '.dash-bar-label',
      '.market-item-name',
      '.mem-item-key',
      '.help-nav button',
      '.naming-results-title'
    ]
    for (const selector of selectors) {
      const element = document.querySelector(selector)
      if (element) element.textContent = longText
    }
  })
  await page.waitForTimeout(50)
}

async function capture(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`)
  const buffer = await page.screenshot({ path: file, fullPage: true })
  return { name, bytes: fs.statSync(file).size, hash: createHash('sha256').update(buffer).digest('hex') }
}

assertFreshBuild()
assertViewCoverage()
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const cases = buildCases()
const server = await startPreview()
const browser = await chromium.launch()
const allFindings = []
const shots = []
  try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: item.width, height: item.width <= 480 ? 720 : 900 } })
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })
    await page.evaluate(({ theme, density }) => {
      document.body.classList.toggle('light-theme', theme === 'light')
      document.documentElement.dataset.density = density
      localStorage.setItem('wa-theme', theme)
      localStorage.setItem('wa-density', density)
    }, item)
    await page.reload({ waitUntil: 'networkidle' })
    await page.evaluate(({ theme, density }) => {
      document.body.classList.toggle('light-theme', theme === 'light')
      document.documentElement.dataset.density = density
    }, item)
    await page.waitForTimeout(120)
    await openView(page, item.view)
    if (item.view === 'main') {
      const tooltipFailures = await verifySidebarTooltips(page)
      const edgeFailures = await verifyTooltipEdgePlacement(page)
      tooltipFailures.push(...edgeFailures)
      allFindings.push(...tooltipFailures)
      item.tooltipCaseCount = tooltipFailures.length === 0 ? 22 : 0
    }
    if (item.view.startsWith('skill-') && item.view !== 'skill-bind') {
      await page.waitForFunction(() => Boolean(globalThis.__skillSettingsState), null, { timeout: 15000 })
    }
    if (item.stress) await applyStress(page)
    await page.waitForTimeout(120)
    const findings = await page.evaluate(scannerSource)
    if (findings.length > 0) {
      allFindings.push({ case: item.name, findings })
      shots.push(await capture(page, item.name))
    }
    await page.close()
  }
  const result = {
    passed: allFindings.length === 0,
    generatedAt: new Date().toISOString(),
    server: `http://127.0.0.1:${PORT}/`,
    caseCount: cases.length,
    tooltipCaseCount: cases.reduce((total, item) => total + (item.tooltipCaseCount ?? 0), 0),
    failedCaseCount: allFindings.length,
    findings: allFindings,
    screenshots: shots
  }
  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2))
  if (allFindings.length === 0) {
    const tooltipCaseCount = cases.reduce((total, item) => total + (item.tooltipCaseCount ?? 0), 0)
    console.log(`PASS: ${cases.length} responsive overflow cases verified across ${widths.length} widths and ${views.length} views; sidebar tooltip cases=${tooltipCaseCount}`)
    process.exit(0)
  }
  console.error(`FAIL: ${allFindings.length} of ${cases.length} cases have findings`)
  for (const failure of allFindings.slice(0, 40)) {
    for (const finding of failure.findings.slice(0, 5)) {
      console.error(`${failure.case} | ${finding.kind} | ${finding.detail} | ${finding.tag}#${finding.id ?? ''}.${finding.className.slice(0, 80)}`)
    }
  }
  process.exit(1)
} finally {
  await browser.close()
  server.kill()
}
