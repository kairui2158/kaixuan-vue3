#!/usr/bin/env node
// Decrypts one production provider key in the production userData context.
// The plaintext key is emitted only on stdout for the parent verification
// process and is never written to a file or log by this helper.

import { app, safeStorage } from 'electron'
import fs from 'node:fs'

const providerFile = process.env.SHENYI_DEAI_LIVE_PROVIDER_FILE
  || 'D:/神意助手数据/wa_providers.json'
const providerId = process.env.SHENYI_DEAI_LIVE_PROVIDER_ID || 'prov-1788185503573'
const appUserDataPath = process.env.SHENYI_DEAI_LIVE_APP_USER_DATA
  || 'D:/神意助手数据/_app-user-data'

if (!fs.statSync(appUserDataPath, { throwIfNoEntry: false })?.isDirectory()) {
  fail(`app userData directory not found: ${appUserDataPath}`)
}

// Provider keys are encrypted with the production app's safeStorage context.
// This must run before app readiness so decryption uses the matching context.
app.setPath('userData', appUserDataPath)

function fail(message) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`)
  process.exitCode = 1
  app.quit()
}

function decryptProvider() {
  const parsed = JSON.parse(fs.readFileSync(providerFile, 'utf8'))
  const provider = (Array.isArray(parsed?.providers) ? parsed.providers : [])
    .find(item => item?.id === providerId)
  if (!provider) throw new Error(`provider not found: ${providerId}`)
  const baseUrl = String(provider.baseUrl || '').replace(/\/+$/, '')
  if (!/^https:\/\//.test(baseUrl)) throw new Error('provider baseUrl is not https')
  const model = String(provider.selectedModel || provider.models?.[0] || '')
  if (!model) throw new Error('provider model is missing')
  const encrypted = String(provider.apiKey || '')
  if (!encrypted.startsWith('enc:')) throw new Error('provider apiKey is not encrypted')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Electron safeStorage is unavailable')
  const apiKey = safeStorage.decryptString(Buffer.from(encrypted.slice(4), 'base64'))
  if (!apiKey) throw new Error('provider apiKey decryption returned empty key')
  return {
    providerId,
    name: String(provider.name || ''),
    baseUrl,
    model,
    apiKey,
  }
}

app.whenReady().then(() => {
  try {
    const result = decryptProvider()
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`)
  } catch (error) {
    fail(String(error?.message || error))
  } finally {
    app.quit()
  }
}).catch(error => fail(String(error?.message || error)))
