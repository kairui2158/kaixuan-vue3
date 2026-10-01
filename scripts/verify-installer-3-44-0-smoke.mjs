import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import asar from '@electron/asar'

const ROOT = process.cwd()
const VERSION = '3.44.0'
const INSTALLER = path.join(ROOT, 'dist', `神意助手-Setup-${VERSION}.exe`)
const INSTALL_ROOT = path.join(ROOT, '_data', 'installer-3-44-0-install')
const INSTALLED_EXE = path.join(INSTALL_ROOT, '神意助手.exe')
const PROFILE = path.join(ROOT, '_data', 'installer-3-44-0-profile')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-outline-trace-recursive-repair-3-44-0')
const SCREENSHOT_DIR = path.join(EVIDENCE_DIR, 'installer-screenshots')
const CDP_PORT = 9284

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return true
    } catch {}
    await sleep(500)
  }
  return false
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true })
}

async function waitForFile(file, timeout = 90000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (fs.existsSync(file)) return true
    await sleep(500)
  }
  return false
}

async function waitForHttp(url, timeout = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url)
      if (response.ok) return true
    } catch {}
    await sleep(250)
  }
  return false
}

async function capture(page, name) {
  const file = path.join(SCREENSHOT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  console.log(`[PASS] screenshot saved: ${name}.png (${hash.slice(0, 12)})`)
  return { file, hash, bytes: fs.statSync(file).size }
}

function findUninstaller() {
  if (!fs.existsSync(INSTALL_ROOT)) return null
  return fs.readdirSync(INSTALL_ROOT)
    .find(file => /^uninstall.*\.exe$/i.test(file) || /^unins\d{3}\.exe$/i.test(file)) || null
}

let browser = null
let appProcess = null

async function main() {
  removeDir(INSTALL_ROOT)
  removeDir(PROFILE)
  ensureDir(SCREENSHOT_DIR)
  for (const file of fs.readdirSync(SCREENSHOT_DIR)) {
    if (file.endsWith('.png')) fs.rmSync(path.join(SCREENSHOT_DIR, file), { force: true })
  }

  console.log('[STEP] silent install 3.44.0 to isolated directory')
  assert(fs.existsSync(INSTALLER), 'installer exists')
  spawnSync('cmd.exe', ['/c', 'start', '/wait', '', INSTALLER, '/S', `/D=${INSTALL_ROOT}`], { stdio: 'ignore', timeout: 120000 })
  assert(await waitForFile(INSTALLED_EXE), 'installed executable exists after silent install')
  console.log('[PASS] installed executable exists')

  console.log('[STEP] start installed app with CDP')
  ensureDir(PROFILE)
  appProcess = spawn(INSTALLED_EXE, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], {
    cwd: INSTALL_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      NODE_ENV: 'production',
    },
    windowsHide: true,
  })
  appProcess.stdout.on('data', chunk => process.stdout.write(`[APP] ${chunk}`))
  appProcess.stderr.on('data', chunk => process.stderr.write(`[APP-ERR] ${chunk}`))

  assert(await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`, 30000), 'installed app exposes CDP')
  await sleep(8000)

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  const context = browser.contexts()[0]
  const page = context.pages()[0] || await context.newPage()
  const consoleErrors = []
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  console.log('[STEP] home shell renders')
  await page.waitForSelector('body', { timeout: 30000 })
  await page.waitForTimeout(3000)
  const bodyText = await page.locator('body').innerText()
  assert(bodyText.trim().length > 0, 'home page renders visible text')
  assert(!/无法加载|白屏/.test(bodyText), 'home page does not show loading failure')
  const homeShot = await capture(page, '01-installer-home')
  assert(homeShot.bytes > 10000, 'home screenshot is not blank')

  console.log('[STEP] open settings through real sidebar click')
  await page.locator('#btn-settings').click()
  await page.locator('#settings-modal-body').waitFor({ state: 'visible', timeout: 15000 })
  const settingsViews = [
    ['设置-API', '#tab-api', '#provider-card-list, .provider-card-add', 'API供应商配置'],
    ['设置-技能', '#tab-skill', '#btn-import-folder-skill, .skill-pipeline-item, .btn-add', '导入配置'],
    ['设置-智能体', '#tab-agent', '#btn-add-agent, .agent-card', '智能体'],
  ]
  for (const [name, tabSelector, contentSelector, expectedText] of settingsViews) {
    await page.locator(tabSelector).click()
    await page.locator(contentSelector).first().waitFor({ state: 'visible', timeout: 15000 })
    const text = await page.locator('#settings-modal-body').innerText()
    assert(text.includes(expectedText), `${name} renders expected content`)
    await capture(page, `${name}`)
  }

  console.log('[STEP] close settings and open outline workspace')
  await page.locator('#btn-close-settings').click()
  await page.locator('#btn-outline-workspace').click()
  await page.locator('#outline-workspace').waitFor({ state: 'visible', timeout: 15000 })
  const outlineText = await page.locator('#outline-workspace').innerText()
  assert(outlineText.trim().length > 0, 'outline workspace renders text')
  const outlineShot = await capture(page, '06-installer-outline-workspace')

  console.log('[STEP] verify installed product metadata')
  const installedPackageJson = JSON.parse(asar.extractFile(path.join(INSTALL_ROOT, 'resources', 'app.asar'), 'package.json').toString('utf8'))
  assert.equal(installedPackageJson.version, VERSION, 'installed app.asar carries 3.44.0')

  const screenshots = [
    homeShot,
    outlineShot,
  ]
  const uniqueHashes = new Set(screenshots.map(item => item.hash))
  assert.equal(uniqueHashes.size, screenshots.length, 'core view screenshots must be distinct')

  const result = {
    passed: true,
    version: VERSION,
    installer: INSTALLER,
    installedExe: INSTALLED_EXE,
    views: ['主页', '设置-API', '设置-技能', '设置-智能体', '大纲工作台'],
    screenshots: fs.readdirSync(SCREENSHOT_DIR).filter(file => file.endsWith('.png')),
    screenshotHashes: Object.fromEntries(screenshots.map(item => [path.basename(item.file), item.hash])),
    consoleErrors,
  }
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'installer-smoke-result.json'), JSON.stringify(result, null, 2), 'utf8')
  console.log('===== INSTALLED 3.44.0 SMOKE PASSED =====')
}

try {
  await main()
} catch (error) {
  console.error('===== INSTALLED 3.44.0 SMOKE FAILED =====')
  console.error(error)
  process.exitCode = 1
} finally {
  try { if (browser) await browser.close() } catch {}
  try {
    if (appProcess?.pid) {
      spawnSync('taskkill', ['/PID', String(appProcess.pid), '/T', '/F'], { stdio: 'ignore' })
    }
  } catch {}
  await sleep(1000)

  const uninstaller = findUninstaller()
  if (uninstaller) {
    console.log(`[STEP] silent uninstall: ${uninstaller}`)
    try {
      spawnSync(path.join(INSTALL_ROOT, uninstaller), ['/S', `_?=${INSTALL_ROOT}`], { stdio: 'ignore', timeout: 60000 })
    } catch {}
    await sleep(2000)
  }

  const installRemoved = await removeDir(INSTALL_ROOT)
  const profileRemoved = await removeDir(PROFILE)
  console.log(`[CLEANUP] install dir removed: ${installRemoved}; profile removed: ${profileRemoved}`)
}
