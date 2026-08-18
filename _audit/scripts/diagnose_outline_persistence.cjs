const { chromium } = require('playwright')
;(async () => {
 const b=await chromium.connectOverCDP('http://127.0.0.1:9227'); const p=b.contexts()[0].pages()[0]
 await p.locator('#outline-workspace input[type="file"]').setInputFiles('D:/codex/novel-workshop-vue3/测试样本.txt'); await p.waitForTimeout(800)
 console.log(await p.evaluate(() => {
   const keys=window.electronAPI.storageList().filter(k=>/^wa_project[-_]/.test(k))
   return {last:window.electronAPI.storageRead('wa_lastProjectId'), editor:(document.querySelector('#outline-editor')).value.length, rows:keys.map(k=>({k,outline:window.electronAPI.storageRead(k)?.outlineText?.length}))}
 }))
 await b.close()
})().catch(e=>{console.error(e);process.exit(1)})
