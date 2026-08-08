const { ipcMain, safeStorage } = require('electron')

function registerCryptoHandlers() {
  ipcMain.on('safe:encrypt', function(event, text) {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        event.returnValue = text
        return
      }
      var buf = safeStorage.encryptString(text)
      event.returnValue = buf.toString('base64')
    } catch (e) {
      event.returnValue = text
    }
  })

  ipcMain.on('safe:decrypt', function(event, val) {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        event.returnValue = val
        return
      }
      var buf = Buffer.from(val, 'base64')
      event.returnValue = safeStorage.decryptString(buf)
    } catch (e) {
      event.returnValue = val
    }
  })
}

module.exports = { registerCryptoHandlers }
