const { ipcMain, safeStorage } = require('electron')

function registerCryptoHandlers() {
  ipcMain.handle('safe:encrypt', function(event, text) {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return text
      }
      var buf = safeStorage.encryptString(String(text))
      return 'enc:' + buf.toString('base64')
    } catch (e) {
      return text
    }
  })

  ipcMain.handle('safe:decrypt', function(event, val) {
    try {
      if (!val || typeof val !== 'string' || val.indexOf('enc:') !== 0) {
        return val
      }
      if (!safeStorage.isEncryptionAvailable()) {
        return val.substring(4)
      }
      var buf = Buffer.from(val.substring(4), 'base64')
      return safeStorage.decryptString(buf)
    } catch (e) {
      return val
    }
  })
}

module.exports = { registerCryptoHandlers }
