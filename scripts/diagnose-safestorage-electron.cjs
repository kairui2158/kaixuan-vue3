const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const defaultPaths = require('../electron/defaultPaths')

const configPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(defaultPaths.getDataRoot(app.getPath('documents')), 'wa_providers.json')

function describeValue(value) {
  if (typeof value !== 'string' || !value) return 'empty'
  if (value.startsWith('enc:')) return 'still-encrypted'
  if (/^sk-[A-Za-z0-9_-]+$/.test(value)) return 'credential-shaped'
  return 'unexpected-shape'
}

app.whenReady().then(() => {
  const result = {
    configPath,
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    providers: [],
    roundTrip: 'not-run',
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    for (const provider of config.providers || []) {
      const stored = String(provider.apiKey || '')
      if (!stored.startsWith('enc:')) {
        result.providers.push({
          name: provider.name,
          stored: 'plaintext',
          decrypt: 'not-needed',
        })
        continue
      }
      const cipher = Buffer.from(stored.slice(4), 'base64')
      let decrypt = 'threw'
      let decryptedShape = 'unknown'
      try {
        const decrypted = safeStorage.decryptString(cipher)
        decrypt = decrypted ? 'success' : 'empty'
        decryptedShape = describeValue(decrypted)
      } catch (error) {
        decrypt = `failed:${error.code || error.message.slice(0, 40)}`
      }
      result.providers.push({
        name: provider.name,
        cipherBytes: cipher.length,
        cipherPrefix: cipher.subarray(0, 3).toString('latin1'),
        decrypt,
        decryptedShape,
      })
    }
  } catch (error) {
    result.configError = String(error.message || error)
  }

  if (result.safeStorageAvailable) {
    try {
      const probe = safeStorage.encryptString('diagnostic-probe')
      const decrypted = safeStorage.decryptString(probe)
      result.roundTrip = decrypted === 'diagnostic-probe' ? 'success' : 'mismatch'
      result.roundTripCipherPrefix = probe.subarray(0, 3).toString('latin1')
    } catch (error) {
      result.roundTrip = `failed:${error.code || error.message.slice(0, 40)}`
    }
  }

  console.log(JSON.stringify(result, null, 2))
  app.exit(result.safeStorageAvailable && result.roundTrip === 'success' ? 0 : 2)
})
