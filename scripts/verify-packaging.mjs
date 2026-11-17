import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { _electron } from 'playwright'
import asar from '@electron/asar'

const ROOT = path.resolve(process.cwd())
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
const APP_DIR = path.join(ROOT, 'dist', 'win-unpacked')
const APP_EXE = path.join(APP_DIR, '神意助手.exe')
const ASAR_FILE = path.join(APP_DIR, 'resources', 'app.asar')
const INSTALLER_FILE = path.join(ROOT, 'dist', `神意助手-Setup-${VERSION}.exe`)
const RENDERER_DIR = path.join(ROOT, 'dist-renderer')
const OUTPUT_DIR = path.join(ROOT, '_audit', `verification-packaging-${VERSION}`)
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'packaging-evidence.json')
const SOURCE_ROOTS = ['src', 'electron', 'public', 'build', 'resources']
const CONFIG_FILES = ['package.json', 'package-lock.json', 'vite.config.mts', 'vite.protocols.config.mts']
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

assert(fs.existsSync(APP_EXE), 'packaged app executable exists')
assert(fs.existsSync(ASAR_FILE), 'app.asar exists')
assert(fs.existsSync(INSTALLER_FILE), 'installer exists')

const packageJson = JSON.parse(asar.extractFile(ASAR_FILE, 'package.json').toString('utf8'))
const rootPackageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
assert.equal(packageJson.version, VERSION, 'asar package version')
assert.equal(packageJson.name, 'shenyi-assistant', 'asar package name')
assert.equal(packageJson.main, 'electron/main.js', 'asar package main entry')
assert.equal(rootPackageJson.version, VERSION, 'root package version')
assert.equal(rootPackageJson.build?.nsis?.oneClick, false, 'NSIS installer is not one-click')
assert.equal(
  rootPackageJson.build?.nsis?.allowToChangeInstallationDirectory,
  true,
  'NSIS installer allows changing installation directory',
)
assert(asar.extractFile(ASAR_FILE, 'electron/main.js').length > 0, 'asar main process entry is non-empty')
assert(asar.extractFile(ASAR_FILE, 'electron/preload.js').length > 0, 'asar preload entry is non-empty')

const rendererFiles = asar.listPackage(ASAR_FILE).filter(file => file.includes('dist-renderer'))
assert(rendererFiles.some(file => path.basename(file) === 'index.html'), 'asar contains renderer index.html')
assert(
  rendererFiles.some(file => path.basename(file) === 'skillDeaiContractValidation.cjs'),
  'asar contains the folder SKILL deai contract validator',
)

const sourceFiles = collectSourceTimestamps()
const latestSource = sourceFiles.reduce((latest, item) => Math.max(latest, item.mtime), 0)
const asarMtime = fs.statSync(ASAR_FILE).mtimeMs
assert(asarMtime > latestSource, 'asar is newer than every source and build config file')
for (const file of fs.readdirSync(path.join(RENDERER_DIR, 'assets'), { recursive: true })) {
  const absolute = path.join(RENDERER_DIR, 'assets', file)
  if (!fs.statSync(absolute).isFile()) continue
  assert(fs.statSync(absolute).mtimeMs > latestSource, `renderer output is stale: ${file}`)
}

const installerHash = crypto.createHash('sha256').update(fs.readFileSync(INSTALLER_FILE)).digest('hex')
assert(/^[a-f0-9]{64}$/.test(installerHash), 'installer SHA256 is computed')

console.log('[stage] launching packaged app')
const electronApp = await _electron.launch({
  executablePath: APP_EXE,
  args: [
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--no-sandbox',
    `--user-data-dir=${path.join(path.dirname(INSTALLER_FILE), 'verify-user-data')}`,
  ],
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

  const evidence = {
    schemaVersion: `packaging-${VERSION}-v1`,
    generatedAt: new Date().toISOString(),
    version: packageJson.version,
    productName: packageJson.build?.productName,
    main: packageJson.main,
    installer: path.relative(ROOT, INSTALLER_FILE),
    installerBytes: fs.statSync(INSTALLER_FILE).size,
    installerSha256: installerHash,
    nsis: {
      source: 'package.json',
      oneClick: rootPackageJson.build?.nsis?.oneClick,
      allowToChangeInstallationDirectory: rootPackageJson.build?.nsis?.allowToChangeInstallationDirectory,
    },
    asarFile: path.relative(ROOT, ASAR_FILE),
    asarMtime: new Date(asarMtime).toISOString(),
    latestSourceFile: sourceFiles.reduce((latest, item) => (item.mtime > latest.mtime ? item : latest), sourceFiles[0]),
    latestSourceMtime: new Date(latestSource).toISOString(),
    rendererFileCount: rendererFiles.length,
    deaiContractValidationPackaged: true,
    electronApiKeyCount: apiKeys.length,
    electronApiKeys: apiKeys,
    bodyTextLength: bodyText.length,
    verdict: 'pass'
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  verificationPassed = true
  console.log(`===== PACKAGING ${VERSION} VERIFICATION PASSED =====`)
  console.log(`installer=${evidence.installer}; sha256=${installerHash}; rendererFiles=${evidence.rendererFileCount}; electronAPI methods=${evidence.electronApiKeyCount}; evidence=${path.relative(ROOT, OUTPUT_FILE)}`)
} catch (error) {
  console.error(`===== PACKAGING ${VERSION} VERIFICATION FAILED =====`)
  console.error(error)
} finally {
  let closed = false
  try {
    await withTimeout(electronApp.close(), 'electronApp.close', 15_000)
    closed = true
  } catch (closeError) {
    console.warn(`[PACKAGING EVIDENCE] electronApp.close failed: ${String(closeError?.message || closeError)}`)
  }
  if (!closed && electronProcess?.pid) {
    spawnSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' })
  }
  process.exit(verificationPassed ? 0 : 1)
}
