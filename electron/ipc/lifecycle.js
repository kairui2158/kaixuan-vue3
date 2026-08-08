const { ipcMain, app } = require('electron')

function registerLifecycleHandlers(mainWindow) {
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.on('app:quit', () => app.quit())

  mainWindow.on('close', function(e) {
    e.preventDefault()
    mainWindow.webContents.send('app:requestClose')
    ipcMain.removeAllListeners('app:closeChoice')
    ipcMain.once('app:closeChoice', function(event, choice) {
      if (choice === 'quit') {
        mainWindow.webContents.send('app:finalSave')
        setTimeout(function() { mainWindow.close() }, 500)
      } else if (choice === 'cancel') {
        // do nothing, stay open
      }
    })
  })
}

module.exports = { registerLifecycleHandlers }
