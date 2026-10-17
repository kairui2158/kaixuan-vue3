#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const ELECTRON_EXE = process.env.SHENYI_BOUNDARY_ELECTRON
  ? path.resolve(process.env.SHENYI_BOUNDARY_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_BOUNDARY_CDP_PORT || 9385)
const PROFILE = path.join(ROOT, '_data', 'boundary-live-profile')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-boundary-live-provider')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const DATA_DIR = path.join(PROFILE, 'documents-data')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(300)
  }
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], {
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
  child.stdout.on('data', chunk => fs.appendFileSync(RUN_LOG_PATH, chunk, 'utf8'))
  child.stderr.on('data', chunk => fs.appendFileSync(RUN_LOG_PATH, chunk, 'utf8'))
  return child
}

async function waitForCdp() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(500)
  }
  return false
}

function closeElectron(app) {
  if (!app || app.exitCode !== null) return
  try {
    execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
}

async function main() {
  const liveProviderPath = 'C:/Users/凯瑞/Documents/神意助手数据/wa_providers.json'
  assert(fs.existsSync(liveProviderPath), 'application live provider config exists')
  const providerConfig = JSON.parse(fs.readFileSync(liveProviderPath, 'utf8'))
  const providers = Array.isArray(providerConfig) ? providerConfig : providerConfig.providers || []
  const live = providers.filter(provider => provider.apiKey && provider.baseUrl && provider.enabled !== false)
  assert(live.length >= 1, 'at least one configured live provider has credentials')
  const candidates = live.slice(0, 2)
  assert(candidates.length >= 1, 'at least one candidate provider is available')

  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })

  const electronProcess = startElectron()
  let browser = null
  let response = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
    assert(page, 'renderer page reachable')
    await page.waitForSelector('#app', { timeout: 20_000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1000)

    response = await page.evaluate(async providerSeeds => {
      const electronApi = window.electronAPI
      if (!electronApi ||
        typeof electronApi.decrypt !== 'function' ||
        typeof electronApi.providerNetRequest !== 'function') {
        throw new Error('production renderer bridges are not wired: decrypt/providerNetRequest')
      }
      const attempts = []
      for (const provider of providerSeeds) {
        const startedAt = Date.now()
        let apiKey = provider.apiKey
        if (apiKey.startsWith('enc:')) {
          try {
            apiKey = await electronApi.decrypt(apiKey)
          } catch (error) {
            attempts.push({
              providerId: provider.id,
              ok: false,
              stage: 'decrypt',
              error: String(error?.message || error),
            })
            continue
          }
        }
        const base = String(provider.baseUrl || '').replace(/\/+$/, '')
        const chatUrl = `${base}/chat/completions`
        const result = await electronApi.providerNetRequest({
          url: chatUrl,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: {
            model: provider.selectedModel,
            messages: [{ role: 'user', content: '请只回答：ok' }],
            temperature: 0,
            max_tokens: 8,
            stream: false,
          },
          signalId: `boundary-live-${provider.id}`,
        })
        let parsed = null
        try { parsed = JSON.parse(result.text || '') } catch {}
        const content = parsed?.choices?.[0]?.message?.content
          ?? parsed?.choices?.[0]?.text
          ?? null
        const attempt = {
          providerId: provider.id,
          providerName: provider.name,
          baseUrl: provider.baseUrl,
          model: provider.selectedModel,
          ok: Boolean(result.ok && content),
          durationMs: Date.now() - startedAt,
          statusCode: result.statusCode ?? null,
          textPreview: typeof content === 'string' ? content.slice(0, 80) : null,
          finishReason: parsed?.choices?.[0]?.finish_reason ?? null,
          error: result.message || null,
        }
        attempts.push(attempt)
        if (attempt.ok) break
      }
      return { attempts }
    }, candidates.map(provider => ({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      selectedModel: provider.selectedModel,
      providerType: provider.providerType || 'openai-compatible',
      apiKey: provider.apiKey,
    })))

    const successfulAttempt = response.attempts.find(attempt => attempt.ok) || null
    const successfulIndex = response.attempts.indexOf(successfulAttempt)
    const successfulProvider = candidates[successfulIndex]
    const baseReport = {
      schema: 'shenyi.boundary.live-provider',
      version: 1,
      generatedAt: new Date().toISOString(),
      status: successfulAttempt ? 'verified' : 'blocked_external_credentials',
      attempts: response.attempts.map(attempt => ({
        ...attempt,
        apiKey: '***MASKED***',
      })),
    }
    if (!successfulAttempt) {
      const blockedPath = path.join(EVIDENCE_ROOT, 'report.json')
      fs.writeFileSync(blockedPath, `${JSON.stringify({
        ...baseReport,
        coverage: {
          testedLiveProviders: response.attempts.length,
          otherConfiguredProviders: live.length - response.attempts.length,
          others: live.slice(response.attempts.length).map(provider => ({
            providerId: provider.id,
            providerName: provider.name,
            baseUrl: provider.baseUrl,
            selectedModel: provider.selectedModel || null,
            status: 'untested'
          })),
        },
      }, null, 2)}\n`, 'utf8')
      console.error(`[BLOCKED] no configured live provider could authenticate; evidence written: ${blockedPath}`)
      throw new Error(`at least one live provider succeeds: ${JSON.stringify(response)}`)
    }
    const report = {
      ...baseReport,
      live: {
        providerId: successfulProvider.id,
        providerName: successfulProvider.name,
        baseUrl: successfulProvider.baseUrl,
        selectedModel: successfulProvider.selectedModel,
        apiKey: '***MASKED***',
      },
      attempts: response.attempts.map(attempt => ({
        ...attempt,
        apiKey: '***MASKED***',
      })),
      coverage: {
        testedLiveProviders: response.attempts.length,
        otherConfiguredProviders: live.length - response.attempts.length,
        others: live.slice(response.attempts.length).map(provider => ({
          providerId: provider.id,
          providerName: provider.name,
          baseUrl: provider.baseUrl,
          selectedModel: provider.selectedModel || null,
          status: 'untested'
        })),
      },
    }
    const reportPath = path.join(EVIDENCE_ROOT, 'report.json')
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(report, null, 2))
    console.log(`[PASS] live provider evidence written: ${reportPath}`)
  } finally {
    closeElectron(electronProcess)
    try { await browser?.close() } catch {}
    await removeDir(PROFILE)
  }
}

try {
  await main()
} catch (error) {
  console.error(`[FAIL] ${error?.message || error}`)
  process.exitCode = 1
}
