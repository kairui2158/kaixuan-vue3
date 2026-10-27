const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--config') args.config = argv[index + 1]
    if (value === '--name') args.name = argv[index + 1]
    if (value === '--user-data') args.userData = argv[index + 1]
    if (value === '--decrypt') args.decrypt = true
    if (value === '--encrypted') args.encrypted = argv[index + 1]
  }
  return args
}

function fail(message) {
  process.stdout.write(JSON.stringify({ result: 'error', message }) + '\n')
  app.exit(1)
}

const args = parseArgs(process.argv.slice(1))
if (!args.userData || (!args.config && !args.encrypted) || (!args.name && !args.config)) {
  app.whenReady().then(() => fail('required arguments: --config/--name or --encrypted, plus --user-data'))
} else {
  const configPath = args.config ? path.resolve(args.config) : ''
  const userDataDir = path.resolve(args.userData)
  app.setPath('userData', userDataDir)

  app.whenReady().then(() => {
    try {
      let encrypted = ''
      if (args.encrypted) {
        encrypted = String(args.encrypted)
      } else {
        if (!fs.existsSync(configPath)) fail(`provider config not found: ${configPath}`)
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        const selected = (config.providers || []).find(item => item && item.name === args.name)
        if (!selected) fail(`provider not found: ${args.name}`)
        encrypted = String(selected.apiKey || '')
      }

      let apiKey = encrypted
      if (encrypted.startsWith('enc:')) {
        if (!safeStorage.isEncryptionAvailable()) fail('safeStorage is unavailable')
        apiKey = safeStorage.decryptString(Buffer.from(encrypted.slice(4), 'base64'))
      }
      if (!apiKey || apiKey.startsWith('enc:')) fail('provider key decryption failed')

      const payload = {
        result: 'ok',
        keyState: encrypted.startsWith('enc:') ? 'decrypted' : 'plaintext',
        keyLength: apiKey.length,
      }
      if (args.decrypt) payload.apiKey = apiKey
      process.stdout.write(JSON.stringify(payload) + '\n')
      app.exit(0)
    } catch (error) {
      fail(error?.message || String(error))
    }
  })
}
