const { ipcMain } = require('electron')
const log = require('electron-log/main')

let jiebaInstance = null
let jiebaLoadError = null

const MAX_CUT_LENGTH = 100000

function getJiebaInstance() {
  if (jiebaInstance) return jiebaInstance
  if (jiebaLoadError) return null
  try {
    const { Jieba } = require('@node-rs/jieba')
    const { dict } = require('@node-rs/jieba/dict')
    jiebaInstance = Jieba.withDict(dict)
    return jiebaInstance
  } catch (error) {
    jiebaLoadError = error
    log.error('jieba-main-load-failed: ' + (error && error.message))
    return null
  }
}

function registerJiebaHandlers() {
  ipcMain.on('jieba:cut', function(event, text, hmm) {
    if (typeof text !== 'string' || text.length > MAX_CUT_LENGTH) {
      event.returnValue = { ok: false, error: 'invalid-input' }
      return
    }
    const instance = getJiebaInstance()
    if (!instance) {
      event.returnValue = {
        ok: false,
        error: jiebaLoadError ? 'load-failed' : 'unavailable',
      }
      return
    }
    try {
      event.returnValue = {
        ok: true,
        words: instance.cut(text, Boolean(hmm)),
      }
    } catch (error) {
      log.error('jieba-cut-failed: ' + (error && error.message))
      event.returnValue = { ok: false, error: 'cut-failed' }
    }
  })
}

module.exports = {
  registerJiebaHandlers,
  getJiebaInstance,
}
