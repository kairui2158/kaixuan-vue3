const { ipcMain, app } = require('electron')
var isQuitting = false

function registerLifecycleHandlers(mainWindow) {
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.on('app:quit', () => {
    isQuitting = true
    app.quit()
  })

  mainWindow.on('close', function(e) {
    if (isQuitting) return
    e.preventDefault()
    mainWindow.webContents.send('app:requestClose')
    ipcMain.removeAllListeners('app:closeChoice')
    ipcMain.once('app:closeChoice', function(event, choice) {
      if (choice === 'quit') {
        mainWindow.webContents.send('app:finalSave')
        isQuitting = true
        setTimeout(function() { mainWindow.close() }, 500)
      }
      // cancel: stay open
    })
  })
}

module.exports = { registerLifecycleHandlers }
