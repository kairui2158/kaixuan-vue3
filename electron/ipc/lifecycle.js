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
        // Save & quit: send finalSave, then close
        mainWindow.webContents.send('app:finalSave')
        isQuitting = true
        var finished = false
        var finish = function() {
          if (finished) return
          finished = true
          clearTimeout(timeout)
          ipcMain.removeListener('app:saveComplete', finish)
          mainWindow.close()
        }
        var timeout = setTimeout(finish, 5000)
        ipcMain.once('app:saveComplete', finish)
      } else if (choice === 'force-quit') {
        // Direct quit: no finalSave needed
        isQuitting = true
        mainWindow.close()
      }
      // cancel: stay open
    })
  })
}

module.exports = { registerLifecycleHandlers }
