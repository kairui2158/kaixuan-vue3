import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { _electron } from 'playwright'
import asar from '@electron/asar'

const ROOT = path.resolve(process.cwd())
const VERSION = '3.62.0'
const APP_DIR = path.join(ROOT, 'dist', 'win-unpacked')
const APP_EXE = path.join(APP_DIR, '神意助手.exe')
const ASAR_FILE = path.join(APP_DIR, 'resources', 'app.asar')
const RENDERER_DIR = path.join(ROOT, 'dist-renderer')
const OUTPUT_FILE = path.join(ROOT, '_audit', 'verification-packaging-3-62-0', 'packaging-evidence.json')
const SOURCE_ROOTS = ['src', 'electron', 'public', 'build', 'resources']
const CONFIG_FILES = ['package.json', 'vite.config.mts', 'vite.protocols.config.mts', 'electron/preload.js']
const LAUNCH_TIMEOUT_MS = 90_000
const STEP_TIMEOUT_MS = 120_000

function withTimeout(promise, label, timeoutMs = STEP_TIMEOUT_MS) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

function collectSourceTimestamps() {
  const files = []
  for (const root of SOURCE_ROOTS) {
    const absolute = path.join(ROOT, root)
    if (!fs.existsSync(absolute)) continue
    files.push(...fs.readdirSync(absolute, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => {
        const relative = path.join(entry.parentPath ?? entry.path, entry.name)
        return { file: path.relative(ROOT, relative), mtime: fs.statSync(relative).mtimeMs }
      }))
  }
  for (const file of CONFIG_FILES) {
    const absolute = path.join(ROOT, file)
    if (fs.existsSync(absolute)) files.push({ file, mtime: fs.statSync(absolute).mtimeMs })
  }
  return files
}

async function verifySidebarTooltips(window) {
  const buttons = window.locator('.sidebar-btn[data-tooltip]')
  const count = await buttons.count()
  assert(count > 0, 'packaged app exposes sidebar tooltip hosts')
  const checks = []
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index)
    const id = await button.getAttribute('id')
    const text = await button.getAttribute('data-tooltip')
    const restState = await button.evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      inlineMaxWidth: element.style.getPropertyValue('--tooltip-max-width'),
      inlineClampY: element.style.getPropertyValue('--tooltip-clamp-y')
    }))
    assert(
      restState.scrollWidth <= restState.clientWidth + 1,
      `sidebar tooltip host ${id} stays clean in default state`,
    )
    assert(
      restState.inlineMaxWidth === '' && restState.inlineClampY === '',
      `sidebar tooltip host ${id} has no stale inline clamps`,
    )

    await button.hover()
    const buttonHandle = await button.elementHandle()
    const tooltip = await withTimeout(
      window.waitForFunction(element => {
        const style = element ? getComputedStyle(element, '::after') : null
        return Boolean(style && Number.isFinite(Number.parseFloat(style.width)) && Number.parseFloat(style.width) > 0)
      }, buttonHandle, { timeout: 10_000, polling: 50 }),
      'sidebar tooltip used geometry',
    ).then(() => button.evaluate(element => {
      const style = getComputedStyle(element, '::after')
      const clampY = Number.parseFloat(element.style.getPropertyValue('--tooltip-clamp-y'))
      const textWidth = [...element.dataset.tooltip].reduce((total, char) => {
        const codePoint = char.codePointAt(0) ?? 0
        const cjk = codePoint >= 0x2e80 && codePoint <= 0x9fff
        return total + (cjk ? 12 : 7)
      }, 0)
      return {
        width: Number.parseFloat(style.width),
        height: Number.parseFloat(style.height),
        textWidth,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        flipped: element.classList.contains('tooltip-flipped'),
        clampY: Number.isFinite(clampY) ? clampY : 0,
        inlineStyles: `${element.style.getPropertyValue('--tooltip-max-width')}|${element.style.getPropertyValue('--tooltip-clamp-y')}`
      }
    }))
    const hostRect = await button.boundingBox()
    assert(hostRect, `sidebar tooltip host ${id} has a bounding box`)
    const minimumWidth = Math.max(24, Math.round(tooltip.textWidth * 0.75))
    assert(
      Number.isFinite(tooltip.width) && tooltip.width >= minimumWidth,
      `sidebar tooltip ${id} collapsed (${tooltip.width}px < ${minimumWidth}px)`,
    )
    assert(Number.isFinite(tooltip.height) && tooltip.height > 0, `sidebar tooltip ${id} has invalid height`)

    const gap = 8
    const left = tooltip.flipped ? hostRect.x - gap - tooltip.width : hostRect.x + hostRect.width + gap
    const top = hostRect.y + hostRect.height / 2 - tooltip.height / 2 + tooltip.clampY
    const right = left + tooltip.width
    const bottom = top + tooltip.height
    const viewport = { width: tooltip.viewportWidth || 1280, height: tooltip.viewportHeight || 800 }
    assert(left >= -1, `sidebar tooltip ${id} overflows left (${left})`)
    assert(top >= -1, `sidebar tooltip ${id} overflows top (${top})`)
    assert(right <= viewport.width + 1, `sidebar tooltip ${id} overflows right (${right} > ${viewport.width})`)
    assert(bottom <= viewport.height + 1, `sidebar tooltip ${id} overflows bottom (${bottom} > ${viewport.height})`)

    checks.push({
      id,
      text,
      width: Math.round(tooltip.width),
      height: Math.round(tooltip.height),
      flipped: tooltip.flipped,
      clampY: Math.round(tooltip.clampY),
      rect: {
        left: Math.round(left),
        top: Math.round(top),
        right: Math.round(right),
        bottom: Math.round(bottom)
      },
      viewport
    })
    await button.blur()
    await window.waitForTimeout(30)
  }
  return checks
}

assert(fs.existsSync(APP_EXE), 'packaged app executable exists')
assert(fs.existsSync(ASAR_FILE), 'app.asar exists')

const packageJson = JSON.parse(asar.extractFile(ASAR_FILE, 'package.json').toString('utf8'))
assert.equal(packageJson.version, VERSION, 'asar package version')
assert.equal(packageJson.name, 'shenyi-assistant', 'asar package name')
assert.equal(packageJson.main, 'electron/main.js', 'asar main entry')
assert(asar.extractFile(ASAR_FILE, 'electron/main.js').length > 0, 'asar main process entry is non-empty')
assert(asar.extractFile(ASAR_FILE, 'electron/preload.js').length > 0, 'asar preload entry is non-empty')

const rendererFiles = asar.listPackage(ASAR_FILE).filter(file => file.includes('dist-renderer'))
assert(rendererFiles.some(file => path.basename(file) === 'index.html'), 'asar contains renderer index.html')
const sourceFiles = collectSourceTimestamps()
const latestSource = sourceFiles.reduce((latest, item) => Math.max(latest, item.mtime), 0)
const asarMtime = fs.statSync(ASAR_FILE).mtimeMs
assert(asarMtime > latestSource, 'asar is newer than every source and build config file')
for (const file of fs.readdirSync(path.join(RENDERER_DIR, 'assets'), { recursive: true })) {
  const absolute = path.join(RENDERER_DIR, 'assets', file)
  if (!fs.statSync(absolute).isFile()) continue
  assert(fs.statSync(absolute).mtimeMs > latestSource, `renderer output is stale: ${file}`)
}

console.log('[stage] launching packaged app')
const electronApp = await _electron.launch({
  executablePath: APP_EXE,
  env: { ...process.env, NODE_ENV: 'production' },
})
const electronProcess = electronApp.process()
electronProcess.stdout?.on('data', chunk => process.stdout.write(`[app:stdout] ${chunk}`))
electronProcess.stderr?.on('data', chunk => process.stderr.write(`[app:stderr] ${chunk}`))

let window
let verificationPassed = false
try {
  console.log('[stage] waiting for first window')
  window = await withTimeout(electronApp.firstWindow(), 'firstWindow', LAUNCH_TIMEOUT_MS)
  await withTimeout(window.waitForLoadState('domcontentloaded'), 'domcontentloaded', LAUNCH_TIMEOUT_MS)

  console.log('[stage] checking electronAPI')
  const apiReady = await withTimeout(
    window.waitForFunction(() => Boolean(window.electronAPI), null, { timeout: STEP_TIMEOUT_MS }),
    'electronAPI',
  )
  assert(apiReady, 'window.electronAPI is available')
  const apiKeys = await window.evaluate(() => Object.keys(window.electronAPI ?? {}).sort())
  assert(apiKeys.length > 0, 'electronAPI exposes IPC methods')

  console.log('[stage] checking rendered shell')
  await window.waitForSelector('body', { timeout: STEP_TIMEOUT_MS })
  await window.waitForTimeout(2500)
  const bodyText = (await window.locator('body').innerText()).trim()
  assert(bodyText.length > 0, 'packaged app renders visible text')
  assert(!/无法加载|白屏/.test(bodyText), 'packaged app does not show loading failure')

  console.log('[stage] checking packaged sidebar tooltips')
  const tooltipChecks = await verifySidebarTooltips(window)

  const evidence = {
    schemaVersion: 'packaging-3-62-0-v1',
    generatedAt: new Date().toISOString(),
    version: packageJson.version,
    productName: packageJson.build?.productName,
    main: packageJson.main,
    asarFile: path.relative(ROOT, ASAR_FILE),
    asarMtime: new Date(asarMtime).toISOString(),
    latestSourceFile: sourceFiles.reduce((latest, item) => (item.mtime > latest.mtime ? item : latest), sourceFiles[0]),
    latestSourceMtime: new Date(latestSource).toISOString(),
    rendererFileCount: rendererFiles.length,
    electronApiKeyCount: apiKeys.length,
    electronApiKeys: apiKeys,
    bodyTextLength: bodyText.length,
    sidebarTooltipChecks: tooltipChecks,
    verdict: 'pass'
  }
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  verificationPassed = true
  console.log('===== PACKAGING 3.62.0 VERIFICATION PASSED =====')
  console.log(`asar=${evidence.asarFile}; rendererFiles=${evidence.rendererFileCount}; electronAPI methods=${evidence.electronApiKeyCount}; sidebarTooltips=${tooltipChecks.length}; evidence=${path.relative(ROOT, OUTPUT_FILE)}`)
} catch (error) {
  console.error('===== PACKAGING 3.62.0 VERIFICATION FAILED =====')
  console.error(error)
} finally {
  let closed = false
  try {
    await withTimeout(electronApp.close(), 'electronApp.close', 15_000)
    closed = true
  } catch {}
  if (!closed && electronProcess?.pid) {
    spawnSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' })
  }
  process.exit(verificationPassed ? 0 : 1)
}
