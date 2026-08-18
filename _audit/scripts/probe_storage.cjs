const { chromium } = require('playwright')
;(async () => {
 const b=await chromium.connectOverCDP('http://127.0.0.1:9227'); const p=b.contexts()[0].pages()[0]
 console.log(await p.evaluate(() => ({ ret: window.electronAPI.storageWrite('wa_probe', { outlineText: 'probe' }), read: window.electronAPI.storageRead('wa_probe'), listed: window.electronAPI.storageList().includes('wa_probe') })))
 await p.evaluate(() => window.electronAPI.storageRemove('wa_probe'))
 await b.close()
})().catch(e=>{console.error(e);process.exit(1)})
