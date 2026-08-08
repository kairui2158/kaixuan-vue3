const { ipcMain, dialog } = require('electron')

function registerDialogHandlers() {
  ipcMain.on('dialog:saveFile', function(event, defaultName) {
    try {
      var result = dialog.showSaveDialogSync({
        defaultPath: defaultName || 'export.txt',
        filters: [
          { name: 'Text', extensions: ['txt'] },
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      event.returnValue = result
    } catch (e) {
      event.returnValue = null
    }
  })

  ipcMain.on('dialog:openFile', function(event) {
    try {
      var result = dialog.showOpenDialogSync({
        properties: ['openFile'],
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      event.returnValue = result && result.length > 0 ? result[0] : null
    } catch (e) {
      event.returnValue = null
    }
  })
}

module.exports = { registerDialogHandlers }
