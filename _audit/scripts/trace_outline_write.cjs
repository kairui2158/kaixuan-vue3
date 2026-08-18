const { chromium } = require('playwright')
;(async () => {
 const b=await chromium.connectOverCDP('http://127.0.0.1:9227'); const p=b.contexts()[0].pages()[0]
 const logs = await p.evaluate(() => {
   const api = window.electronAPI
   const old = api.storageWrite
   const rows = []
   api.storageWrite = function(key, data) {
     rows.push({ key, outline: data && data.outlineText ? data.outlineText.length : null, project: data && data.projectName ? data.projectName : null })
     return old.apply(this, arguments)
   }
   ;window.__writeRows = rows
   return { last: api.storageRead('wa_lastProjectId'), before: document.querySelector('#outline-editor')?.value?.length }
 })
 await p.locator('#outline-workspace input[type="file"]').setInputFiles('D:/codex/novel-workshop-vue3/测试样本.txt'); await p.waitForTimeout(1500)
 console.log(await p.evaluate(() => ({ logs: window.__writeRows, editor: document.querySelector('#outline-editor')?.value?.length, last: window.electronAPI.storageRead('wa_lastProjectId'), saved: window.electronAPI.storageList().filter(k=>/^wa_project[-_]/.test(k)).map(k=>({key:k,len:window.electronAPI.storageRead(k)?.outlineText?.length})) })))
 await b.close()
})().catch(e=>{console.error(e);process.exit(1)})
