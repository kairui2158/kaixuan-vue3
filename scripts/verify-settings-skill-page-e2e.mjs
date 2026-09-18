import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shenyi-settings-skill-'))

const child = spawn(electronExe, [
  root,
  '--remote-debugging-port=0',
  '--remote-allow-origins=*',
  `--user-data-dir=${userDataDir}`
], {
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  cwd: root,
  windowsHide: true
})

let output = ''
child.stdout.on('data', chunk => { output += String(chunk) })
child.stderr.on('data', chunk => { output += String(chunk) })

async function waitForCdpPort(timeoutMs = 30000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const match = output.match(/(?:Remote debugging|DevTools) listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
    if (match) return Number(match[1])
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`CDP port not found\n${output.slice(-2000)}`)
}

const port = await waitForCdpPort()
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
const page = browser.contexts()[0]?.pages()[0]
assert(page, 'renderer page should be reachable')

const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => {
  if (message.type() === 'error') pageErrors.push(message.text())
})
await page.waitForSelector('#app', { timeout: 20000 })
await page.waitForTimeout(1500)

await page.evaluate(() => {
  document.querySelector('.project-modal-content .btn-close')?.click()
})
await page.waitForTimeout(300)

await page.locator('#btn-settings').click()
await page.waitForSelector('#tab-skill', { timeout: 10000 })
await page.locator('#tab-skill').click()
const importButton = page.locator('#btn-import-folder-skill')
try {
  await importButton.waitFor({ state: 'visible', timeout: 10000 })
} catch (error) {
  const panelHtml = await page.locator('.settings-panel').evaluate(element => element.innerHTML).catch(() => '')
  console.error('[DEBUG] pageErrors=' + JSON.stringify(pageErrors))
  console.error('[DEBUG] settingsPanel=' + panelHtml.slice(0, 3000))
  throw error
}

const skillPageErrors = pageErrors.filter(error => !error.includes('检测到存储损坏并已从备份恢复'))
assert(skillPageErrors.length === 0, `renderer errors: ${skillPageErrors.join('\n')}`)
assert(await page.locator('#btn-add-skill').isVisible(), 'add-skill button should be visible')
assert(await page.locator('#btn-import-folder-skill').isVisible(), 'folder import button should be visible')

console.log('[PASS] settings skill page opens without renderer errors')

await browser.close()
try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
fs.rmSync(userDataDir, { recursive: true, force: true })
