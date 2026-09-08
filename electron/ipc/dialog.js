const { ipcMain, dialog, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const electron = require('electron')

function diagnosticsLogPath() {
  return path.join(electron.app.getPath('userData'), 'dialog-diagnostics.log')
}

function logDialog(message, payload) {
  const line = `${new Date().toISOString()} ${message} ${JSON.stringify(payload || {})}\n`
  try { fs.appendFileSync(diagnosticsLogPath(), line, 'utf8') } catch (_) {}
  console.log(message, payload || {})
}

function registerDialogHandlers() {
  ipcMain.handle('dialog:saveFileAsync', async function(event, defaultName) {
    try {
      if (process.env.SHENYI_TEST_EXPORT_PATH) {
        logDialog('[dialog:saveFileAsync] test-path', { defaultName, path: process.env.SHENYI_TEST_EXPORT_PATH })
        return process.env.SHENYI_TEST_EXPORT_PATH
      }
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
      if (process.env.SHENYI_TEST_IMPORT_PATH) {
        logDialog('[dialog:openFileAsync] test-path', { path: process.env.SHENYI_TEST_IMPORT_PATH })
        return process.env.SHENYI_TEST_IMPORT_PATH
      }
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
  ipcMain.handle('dialog:openDirectoryAsync', async function(event) {
    try {
      if (process.env.SHENYI_TEST_DIRECTORY_PATH) {
        logDialog('[dialog:openDirectoryAsync] test-path', { path: process.env.SHENYI_TEST_DIRECTORY_PATH })
        return process.env.SHENYI_TEST_DIRECTORY_PATH
      }
      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      if (parentWindow && !parentWindow.isVisible()) parentWindow.show()
      if (parentWindow) parentWindow.focus()
      logDialog('[dialog:openDirectoryAsync] request', { hasParent: Boolean(parentWindow) })
      const result = await dialog.showOpenDialog({
        ...(parentWindow ? { parent: parentWindow } : {}),
        title: '选择文件夹技能根目录',
        properties: ['openDirectory']
      })
      logDialog('[dialog:openDirectoryAsync] result', result)
      return result.canceled || !result.filePaths.length ? null : result.filePaths[0]
    } catch (e) {
      logDialog('[dialog:openDirectoryAsync] error', { message: e?.message || String(e) })
      return null
    }
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
      logDialog('[dialog:writeFile] result', { ok: true, bytes: content.length })
      return true;
    } catch (e) {
      return false;
    }
  })
}

module.exports = { registerDialogHandlers }

