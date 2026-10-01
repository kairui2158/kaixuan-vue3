import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist-renderer')
const OUT_DIR = path.join(ROOT, '_audit', 'verification-design-fusion-visual-matrix')
const PORT = 4173

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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
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

async function capture(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`)
  const buffer = await page.screenshot({ path: file, fullPage: true })
  const bytes = fs.statSync(file).size
  assert(bytes > 10000, `${name}.png is blank or missing (${bytes} bytes)`)
  return { name, file, bytes, hash: sha256(buffer) }
}

const cases = [
  { name: 'dark-default-1440-main-default', theme: 'dark', density: 'default', viewport: { width: 1440, height: 900 }, layout: { chapter: 18, chat: 28 } },
  { name: 'dark-default-1440-main-chapter-min', theme: 'dark', density: 'default', viewport: { width: 1440, height: 900 }, layout: { chapter: 10, chat: 28 } },
  { name: 'dark-default-1440-main-chapter-max', theme: 'dark', density: 'default', viewport: { width: 1440, height: 900 }, layout: { chapter: 30, chat: 28 } },
  { name: 'dark-default-1440-main-chat-min', theme: 'dark', density: 'default', viewport: { width: 1440, height: 900 }, layout: { chapter: 18, chat: 15 } },
  { name: 'dark-default-1440-main-chat-max', theme: 'dark', density: 'default', viewport: { width: 1440, height: 900 }, layout: { chapter: 18, chat: 45 } },
  { name: 'dark-default-1440-main-custom-reload', theme: 'dark', density: 'default', viewport: { width: 1440, height: 900 }, layout: { chapter: 22, chat: 35 }, reload: true },
  { name: 'light-default-1440-settings', theme: 'light', density: 'default', viewport: { width: 1440, height: 900 }, open: 'settings' },
  { name: 'light-default-1440-settings-reset-layout', theme: 'light', density: 'default', viewport: { width: 1440, height: 900 }, open: 'settings', layout: { chapter: 22, chat: 35 }, reload: true, action: 'reset-layout' },
  { name: 'light-default-1023-main', theme: 'light', density: 'default', viewport: { width: 1023, height: 768 } },
  { name: 'light-default-799-main', theme: 'light', density: 'default', viewport: { width: 799, height: 900 } },
  { name: 'light-default-375-main', theme: 'light', density: 'default', viewport: { width: 375, height: 812 } },
  { name: 'light-comfortable-1440-main', theme: 'light', density: 'comfortable', viewport: { width: 1440, height: 900 } },
  { name: 'light-compact-1440-main', theme: 'light', density: 'compact', viewport: { width: 1440, height: 900 } },
  { name: 'dark-comfortable-1440-main', theme: 'dark', density: 'comfortable', viewport: { width: 1440, height: 900 } },
  { name: 'dark-compact-1440-main', theme: 'dark', density: 'compact', viewport: { width: 1440, height: 900 } },
  { name: 'dark-default-1440-outline', theme: 'dark', density: 'default', viewport: { width: 1440, height: 900 }, open: 'outline' },
  { name: 'light-default-1440-pipeline', theme: 'light', density: 'default', viewport: { width: 1440, height: 900 }, open: 'pipeline' },
  { name: 'dark-default-1440-memory', theme: 'dark', density: 'default', viewport: { width: 1440, height: 900 }, open: 'memory' },
  { name: 'dark-default-1440-run-trace', theme: 'dark', density: 'default', viewport: { width: 1440, height: 900 }, open: 'pipeline', action: 'run-trace' }
]

assertFreshBuild()
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const server = await startPreview()
const browser = await chromium.launch()
try {
  const shots = []
  for (const item of cases) {
    const page = await browser.newPage({ viewport: item.viewport })
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })
    await page.evaluate(({ theme, density, layout }) => {
      document.body.classList.toggle('light-theme', theme === 'light')
      document.documentElement.dataset.density = density
      localStorage.setItem('wa-theme', theme)
      localStorage.setItem('wa-density', density)
      if (layout) {
        localStorage.setItem('shenyi_resizer_chapter', String(layout.chapter))
        localStorage.setItem('shenyi_resizer_chat', String(layout.chat))
      }
    }, item)
    if (item.reload) {
      await page.reload({ waitUntil: 'networkidle' })
      await page.evaluate(({ theme, density }) => {
        document.body.classList.toggle('light-theme', theme === 'light')
        document.documentElement.dataset.density = density
      }, item)
    } else if (item.layout) {
      await page.reload({ waitUntil: 'networkidle' })
      await page.evaluate(({ theme, density }) => {
        document.body.classList.toggle('light-theme', theme === 'light')
        document.documentElement.dataset.density = density
      }, item)
    }
    await page.waitForTimeout(150)

    if (item.open === 'settings') {
      await page.click('#btn-settings')
      await page.waitForSelector('[data-modal-id="settings-modal"]', { state: 'visible' })
    } else if (item.open === 'outline') {
      await page.click('#btn-outline-workspace')
      await page.waitForSelector('#outline-workspace', { state: 'visible' })
    } else if (item.open === 'pipeline') {
      await page.click('#btn-pipeline')
      await page.waitForSelector('#pipeline-panel', { state: 'visible' })
    } else if (item.open === 'memory') {
      await page.click('#btn-memory')
      await page.waitForSelector('#memory-panel', { state: 'visible' })
    }

    if (item.action === 'run-trace') {
      await page.click('#btn-run-trace')
      await page.waitForSelector('#run-trace-overlay', { state: 'visible' })
    }

    const computed = await page.evaluate(() => ({
      rootDensity: document.documentElement.dataset.density,
      bodyTheme: document.body.classList.contains('light-theme') ? 'light' : 'dark',
      formHeight: getComputedStyle(document.documentElement).getPropertyValue('--density-form-height').trim(),
      buttonHeight: getComputedStyle(document.documentElement).getPropertyValue('--density-btn-md-height').trim(),
      selectHeight: document.querySelector('#co-skill-select') ? Math.round(document.querySelector('#co-skill-select').getBoundingClientRect().height) : null,
      chapterFlex: document.querySelector('.chapter-tree')?.style.flex ?? null,
      chatFlex: document.querySelector('.chat-panel')?.style.flex ?? null,
      chapterTreeDisplay: document.querySelector('.chapter-tree') ? getComputedStyle(document.querySelector('.chapter-tree')).display : null,
      chapterSplitterDisplay: document.querySelector('#resizer-chapter') ? getComputedStyle(document.querySelector('#resizer-chapter')).display : null,
      chapterSplitterHit: document.querySelector('#resizer-chapter') ? getComputedStyle(document.querySelector('#resizer-chapter')).width : null,
      sidebarWidth: document.querySelector('.sidebar-nav') ? Math.round(document.querySelector('.sidebar-nav').getBoundingClientRect().width) : null
    }))
    const expectedFormHeight = { default: '34px', comfortable: '34px', compact: '30px' }[item.density]
    const expectedButtonHeight = { default: '34px', comfortable: '32px', compact: '28px' }[item.density]
    assert(computed.rootDensity === item.density, `${item.name}: root density mismatch: ${computed.rootDensity}`)
    assert(computed.bodyTheme === item.theme, `${item.name}: body theme mismatch: ${computed.bodyTheme}`)
    assert(computed.formHeight === expectedFormHeight, `${item.name}: density form token is ${computed.formHeight}, expected ${expectedFormHeight}`)
    assert(computed.buttonHeight === expectedButtonHeight, `${item.name}: density button token is ${computed.buttonHeight}, expected ${expectedButtonHeight}`)
    if (computed.selectHeight !== null) {
      assert(computed.selectHeight === parseInt(expectedFormHeight, 10), `${item.name}: #co-skill-select height is ${computed.selectHeight}px, expected ${expectedFormHeight}`)
    }
    if (item.layout) {
      assert(computed.chapterFlex === `0 0 ${item.layout.chapter}%`, `${item.name}: chapter flex is ${computed.chapterFlex}, expected 0 0 ${item.layout.chapter}%`)
      assert(computed.chatFlex === `0 0 ${item.layout.chat}%`, `${item.name}: chat flex is ${computed.chatFlex}, expected 0 0 ${item.layout.chat}%`)
    }
    if (item.viewport.width <= 799) {
      assert(computed.chapterTreeDisplay === 'none', `${item.name}: chapter tree display is ${computed.chapterTreeDisplay}, expected none`)
      assert(computed.chapterSplitterDisplay === 'none' && computed.chapterSplitterHit === '0px', `${item.name}: chapter splitter is ${computed.chapterSplitterDisplay}/${computed.chapterSplitterHit}, expected hidden/0px`)
      assert(computed.sidebarWidth === 44, `${item.name}: compact sidebar width is ${computed.sidebarWidth}px, expected 44px`)
    }
    if (item.action === 'reset-layout') {
      await page.click('#tab-appearance')
      await page.waitForSelector('.layout-preset-actions', { state: 'visible' })
      await page.getByRole('button', { name: '恢复默认布局' }).click()
      await page.waitForTimeout(100)
      const reset = await page.evaluate(() => ({
        chapterFlex: document.querySelector('.chapter-tree')?.style.flex ?? null,
        chatFlex: document.querySelector('.chat-panel')?.style.flex ?? null,
        chapterSaved: localStorage.getItem('shenyi_resizer_chapter'),
        chatSaved: localStorage.getItem('shenyi_resizer_chat')
      }))
      assert(reset.chapterFlex === '0 0 18%', `${item.name}: reset chapter flex is ${reset.chapterFlex}, expected 0 0 18%`)
      assert(reset.chatFlex === '0 0 28%', `${item.name}: reset chat flex is ${reset.chatFlex}, expected 0 0 28%`)
      assert(reset.chapterSaved === '18' && reset.chatSaved === '28', `${item.name}: reset persisted widths are ${reset.chapterSaved}/${reset.chatSaved}, expected 18/28`)
    }

    item.computed = computed
    shots.push(await capture(page, item.name))
    await page.close()
  }

  const hashes = new Set(shots.map(shot => shot.hash))
  assert(hashes.size === shots.length, 'each matrix case must produce a distinct screenshot')
  const result = {
    passed: true,
    generatedAt: new Date().toISOString(),
    server: `http://127.0.0.1:${PORT}/`,
    cases,
    screenshots: shots.map(({ name, bytes, hash }) => ({ name, bytes, hash }))
  }
  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2))
  console.log(`PASS: ${shots.length} visual matrix screenshots are non-blank and distinct; density, layout, and responsive contracts verified`)
  for (const shot of shots) console.log(`  ${shot.name}.png | ${shot.bytes} bytes | ${shot.hash.slice(0, 12)}`)
} finally {
  await browser.close()
  server.kill()
}
