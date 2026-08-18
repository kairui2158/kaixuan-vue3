const { chromium } = require('playwright')
;(async () => {
 const b=await chromium.connectOverCDP('http://127.0.0.1:9227'); const p=b.contexts()[0].pages()[0]
 await p.reload(); await p.waitForTimeout(1000)
 await p.locator('#btn-outline-workspace').click(); await p.waitForTimeout(250)
 const input=p.locator('#outline-workspace input[type="file"]'); await input.setInputFiles('D:/codex/novel-workshop-vue3/测试样本.txt'); await p.waitForTimeout(1500)
 console.log(await p.evaluate(() => {
  const text=document.querySelector('#outline-editor')?.value || ''
  const keys=window.electronAPI.storageList().filter(k=>/^wa_project[-_]/.test(k))
  const norm=s=>String(s||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n')
  return { textLen:text.length, textHead:text.slice(0,40), rows:keys.map(k=>{const d=window.electronAPI.storageRead(k);return {key:k,len:d?.outlineText?.length||0,exact:d?.outlineText===text,normalized:norm(d?.outlineText)===norm(text),head:(d?.outlineText||'').slice(0,40)}}) }
 }))
 await b.close()
})().catch(e=>{console.error(e);process.exit(1)})
