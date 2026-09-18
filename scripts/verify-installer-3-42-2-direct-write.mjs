import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const ROOT = process.cwd()
const INSTALLER = path.join(ROOT, 'dist', '神意助手-Setup-3.42.2.exe')
const INSTALL_ROOT = path.join(ROOT, '_data', 'installer-3-42-2-direct-write-install')
const INSTALLED_EXE = path.join(INSTALL_ROOT, '神意助手.exe')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-api-direct-write-v2')

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

async function waitForFile(file, timeout = 90000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (fs.existsSync(file)) return true
    await sleep(500)
  }
  return false
}

function findUninstaller() {
  if (!fs.existsSync(INSTALL_ROOT)) return null
  return fs.readdirSync(INSTALL_ROOT)
    .find(file => /^uninstall.*\.exe$/i.test(file) || /^unins\d{3}\.exe$/i.test(file)) || null
}

function runE2e() {
  const result = spawnSync(process.execPath, ['scripts/verify-api-direct-write-v2-e2e.mjs'], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 15 * 60 * 1000,
    env: {
      ...process.env,
      SHENYI_DIRECT_WRITE_ELECTRON: INSTALLED_EXE,
      SHENYI_DIRECT_WRITE_INSTALLED: '1',
      NODE_ENV: 'production',
    },
  })
  return { status: result.status, error: result.error }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

try {
  console.log('[STEP] silent install 3.42.2 direct-write fixture')
  removeDir(INSTALL_ROOT)
  assert(fs.existsSync(INSTALLER), 'installer exists')
  const install = spawnSync(INSTALLER, ['/S', `/D=${INSTALL_ROOT}`], { stdio: 'ignore', timeout: 120000 })
  assert.equal(install.status, 0, `installer exits 0, actual ${install.status}`)
  assert(await waitForFile(INSTALLED_EXE), 'installed executable exists after silent install')
  console.log('[PASS] installed executable exists')

  console.log('[STEP] run 15 direct-write E2E scenarios against installed exe')
  const e2e = runE2e()
  assert.equal(e2e.status, 0, `installed direct-write E2E exits 0, actual ${e2e.status}`)
  const e2eResult = readJson(path.join(EVIDENCE_DIR, 'e2e-result.json'))
  assert.equal(e2eResult.passed, true, 'installed E2E result is passed')
  assert.equal(e2eResult.mode, 'installer', 'E2E result records installer mode')
  assert.equal(e2eResult.scenarios, 15, 'installed E2E covers all 15 scenarios')
  assert(Array.isArray(e2eResult.screenshots) && e2eResult.screenshots.length === 15, 'installed E2E has 15 screenshots')
  const screenshotDir = path.join(EVIDENCE_DIR, 'screenshots-installer')
  const screenshotFiles = fs.readdirSync(screenshotDir).filter(file => file.endsWith('.png'))
  const hashes = screenshotFiles.map(file => {
    const content = fs.readFileSync(path.join(screenshotDir, file))
    return { file, hash: crypto.createHash('sha256').update(content).digest('hex') }
  })
  assert.equal(screenshotFiles.length, 15, 'installed E2E writes 15 screenshots')
  assert.equal(new Set(hashes.map(item => item.hash)).size, hashes.length, 'installer direct-write screenshots must be distinct')
  assert.equal(e2eResult.screenshots.length, 15, 'installed E2E records 15 screenshots')
  assert.deepEqual(e2eResult.screenshots, screenshotFiles, 'installed E2E screenshot evidence matches disk')
  writeEvidenceHashes(hashes)
  console.log('[PASS] installed 3.42.2 direct-write E2E passed')
  const diagCoverage = readJson(path.join(EVIDENCE_DIR, 'diag-coverage.json'))
  assert.equal(diagCoverage.passed, true, 'installed diagnostic coverage result is passed')
  assert.equal(diagCoverage.missingInMain.length, 0, 'installed diagnostic coverage has no renderer-only entries')
  for (const category of Object.keys(diagCoverage.rendererCategories)) {
    assert(diagCoverage.rendererCategories[category] > 0, `installed diagnostics cover ${category}`)
    assert(diagCoverage.mainCategories[category] > 0, `installed main-process diagnostics cover ${category}`)
  }
  console.log('[PASS] installed diagnostic coverage passed')
  console.log('===== INSTALLED 3.42.2 DIRECT WRITE PASSED =====')
} catch (error) {
  console.error('===== INSTALLED 3.42.2 DIRECT WRITE FAILED =====')
  console.error(error)
  process.exitCode = 1
} finally {
  const uninstaller = findUninstaller()
  if (uninstaller) {
    try {
      spawnSync(path.join(INSTALL_ROOT, uninstaller), ['/S', `_?=${INSTALL_ROOT}`], { stdio: 'ignore', timeout: 60000 })
    } catch {}
    await sleep(2000)
  }
  const installRemoved = await removeDir(INSTALL_ROOT)
  console.log(`[CLEANUP] install dir removed: ${installRemoved}`)
}

function writeEvidenceHashes(hashes) {
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, 'installer-direct-write-screenshots.json'),
    JSON.stringify({ passed: true, screenshots: hashes }, null, 2),
    'utf8',
  )
}
