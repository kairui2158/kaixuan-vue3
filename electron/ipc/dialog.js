const { ipcMain, dialog, BrowserWindow } = require('electron')
const fs = require('fs')

function logDialog(message, payload) {
  const line = `${new Date().toISOString()} ${message} ${JSON.stringify(payload || {})}\n`
  try { fs.appendFileSync('C:/Users/凯瑞/Documents/神意助手数据/dialog-diagnostics.log', line, 'utf8') } catch (_) {}
  console.log(message, payload || {})
}

function registerDialogHandlers() {
  ipcMain.handle('dialog:saveFileAsync', async function(event, defaultName) {
    try {
      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      if (parentWindow && !parentWindow.isVisible()) parentWindow.show()
      if (parentWindow) parentWindow.focus()
      logDialog('[dialog:saveFileAsync] request', { defaultName, hasParent: Boolean(parentWindow) })
      const result = await dialog.showSaveDialog({
        title: '导出配置',
        defaultPath: defaultName || 'export.txt',
        filters: [
          { name: 'Text', extensions: ['txt'] },
          { name: 'Markdown', extensions: ['md'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      logDialog('[dialog:saveFileAsync] result', result)
      return result.canceled ? null : result.filePath || null
    } catch (e) { console.error('[dialog:saveFileAsync]', e); return null }
  })
  ipcMain.handle('dialog:openFileAsync', async function(event) {
    try {
      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      if (parentWindow && !parentWindow.isVisible()) parentWindow.show()
      if (parentWindow) parentWindow.focus()
      logDialog('[dialog:openFileAsync] request', { hasParent: Boolean(parentWindow) })
      const result = await dialog.showOpenDialog({
        ...(parentWindow ? { parent: parentWindow } : {}),
        title: '导入配置', properties: ['openFile'],
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      logDialog('[dialog:openFileAsync] result', result)
      return result.canceled || !result.filePaths.length ? null : result.filePaths[0]
    } catch (e) { logDialog('[dialog:openFileAsync] error', { message: e?.message || String(e) }); return null }
  })
 ipcMain.handle('dialog:readFileAsync', async function(event, filePath) {
   try { return filePath ? { path: filePath, content: await fs.promises.readFile(filePath, 'utf8') } : null }
   catch (e) { return null }
 })
 ipcMain.handle('dialog:writeFile', async function(event, filePath, content) {
    try {
      if (!filePath) {
        return false;
      }
      await fs.promises.writeFile(filePath, content, 'utf8');
      return true;
    } catch (e) {
      return false;
    }
  })
}

module.exports = { registerDialogHandlers }

