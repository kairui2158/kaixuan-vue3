const { ipcMain, dialog } = require('electron')
const fs = require('fs')

function registerDialogHandlers() {
  ipcMain.on('dialog:saveFile', function(event, defaultName) {
    try {
     var result = dialog.showSaveDialogSync({
        title: '导出配置',
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
        title: '导入配置',
       properties: ['openFile'],
        filters: [
          { name: 'Text', extensions: ['txt', 'md', 'json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      event.returnValue = result && result.length > 0 ? result[0] : null
    } catch (e) {
      event.returnValue = null
    }
  })
  ipcMain.on('dialog:readFile', function(event, filePath) {
    try {
      if (!filePath) {
        event.returnValue = null;
        return;
      }
      var content = fs.readFileSync(filePath, 'utf8');
      event.returnValue = { path: filePath, content: content };
    } catch (e) {
      event.returnValue = null;
    }
  })

  ipcMain.on('dialog:writeFile', function(event, filePath, content) {
    try {
      if (!filePath) {
        event.returnValue = false;
        return;
      }
      fs.writeFileSync(filePath, content, 'utf8');
      event.returnValue = true;
    } catch (e) {
      event.returnValue = false;
    }
  })
}

module.exports = { registerDialogHandlers }
