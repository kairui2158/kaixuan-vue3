const { ipcMain, app } = require('electron')
var isQuitting = false
var registered = false
var closeChoiceHandlers = new Map() // webContents.id -> handler

function registerLifecycleHandlers() {
  if (registered) return
  registered = true
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.on('app:quit', () => {
    isQuitting = true
    app.quit()
  })
}

function registerWindowCloseHandler(win) {
  win.on('close', function(e) {
    if (isQuitting) return
    e.preventDefault()
    win.webContents.send('app:requestClose')
    var webContentsId = win.webContents.id
    var previous = closeChoiceHandlers.get(webContentsId)
    if (previous) ipcMain.removeListener('app:closeChoice', previous)

    function onChoice(event, choice) {
      if (!event.sender.isDestroyed() && event.sender.id !== webContentsId) return
      ipcMain.removeListener('app:closeChoice', onChoice)
      closeChoiceHandlers.delete(webContentsId)
      if (choice === 'quit') {
        win.webContents.send('app:finalSave')
        isQuitting = true
        var finished = false
        var finish = function() {
          if (finished) return
          finished = true
          clearTimeout(timeout)
          ipcMain.removeListener('app:saveComplete', finish)
          win.close()
        }
        var timeout = setTimeout(finish, 15000)
        ipcMain.once('app:saveComplete', finish)
      } else if (choice === 'force-quit') {
        isQuitting = true
        win.close()
      }
    }

    closeChoiceHandlers.set(webContentsId, onChoice)
    ipcMain.on('app:closeChoice', onChoice)
  })
}

module.exports = { registerLifecycleHandlers, registerWindowCloseHandler }
