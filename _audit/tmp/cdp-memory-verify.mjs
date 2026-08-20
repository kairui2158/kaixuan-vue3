import { WebSocket } from 'ws'
import { writeFileSync } from 'fs'

const pages = await fetch('http://127.0.0.1:9227/json').then(r => r.json())
const page = pages.find(item => item.type === 'page')
if (!page?.webSocketDebuggerUrl) throw new Error('no CDP page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.on('message', data => {
  const message = JSON.parse(data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(message.error) : resolve(message.result)
  }
})
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
const visibleButtons = () => evaluate(`JSON.stringify([...document.querySelectorAll('button')].filter(el => el.offsetWidth > 0 && el.offsetHeight > 0).map((el, i) => { const r=el.getBoundingClientRect(); return {i,id:el.id,text:(el.innerText||'').trim().replace(/\\s+/g,' ').slice(0,80),x:r.x,y:r.y,w:r.width,h:r.height,disabled:el.disabled}; }))`)
const selectorBox = async selector => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||!el.offsetWidth)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`)
const clickSelector = async selector => {
  const box = await selectorBox(selector)
  if (!box) throw new Error(`not visible: ${selector}`)
  const x = box.x + box.w / 2
  const y = box.y + box.h / 2
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

await new Promise(resolve => ws.once('open', resolve))
await call('Runtime.enable')
await call('Page.enable')
console.log('PAGE:', JSON.stringify({ title: page.title, url: page.url }))
console.log('BUTTONS_BEFORE:', await visibleButtons())

const memoryButton = await evaluate(`JSON.stringify([...document.querySelectorAll('button')].filter(el => /记忆|memory/i.test(el.innerText+' '+el.id)).map(el => ({id:el.id,text:(el.innerText||'').trim(),title:el.title})))`)
console.log('MEMORY_BUTTON_CANDIDATES:', memoryButton)

 // Only click the memory button if the panel is NOT already open.
 const panelStateBefore = await evaluate(`JSON.stringify((()=>{const p=document.querySelector('#memory-panel');if(!p)return {visible:false};const r=p.getBoundingClientRect();return {visible:r.width>0&&r.height>0}})())`)
 const panelBefore = JSON.parse(panelStateBefore || '{}')
 if (!panelBefore.visible) {
   const candidate = JSON.parse(memoryButton || '[]')[0]
   if (candidate?.id) {
     await clickSelector('#' + candidate.id)
     await new Promise(r => setTimeout(r, 250))
   }
 } else {
   console.log('PANEL_ALREADY_OPEN: skipping toggle click')
 }

console.log('MEMORY_PANEL:', await evaluate(`JSON.stringify((()=>{const p=document.querySelector('#memory-panel');if(!p)return {visible:false};const r=p.getBoundingClientRect();return {visible:r.width>0&&r.height>0,rect:{x:r.x,y:r.y,w:r.width,h:r.height},text:(p.innerText||'').trim().slice(0,500),buttons:[...p.querySelectorAll('button')].filter(el=>el.offsetWidth>0).map(el=>({id:el.id,text:(el.innerText||'').trim(),disabled:el.disabled}))}})()`))
console.log('BUTTONS_AFTER:', await visibleButtons())

// Cycle the view button with real mouse clicks and record the active view text.
const viewButton = await selectorBox('#btn-memory-relation-graph')
if (viewButton) {
  for (let i = 0; i < 4; i++) {
    await clickSelector('#btn-memory-relation-graph')
    await new Promise(r => setTimeout(r, 100))
     console.log('VIEW_' + (i + 1) + ':', await evaluate(`JSON.stringify({button:document.querySelector('#btn-memory-relation-graph')?.innerText,graph:!!document.querySelector('.memory-relation-graph'),analysis:!!document.querySelector('.memory-graph-analysis'),mind:!!document.querySelector('.memory-mind-map'),timeline:!!document.querySelector('.memory-timeline')})`))
  }
}

console.log('EVIDENCE_DOM:', await evaluate(`JSON.stringify({memoryPanel:!!document.querySelector('#memory-panel'),exportVisible:!!document.querySelector('#btn-export-memory')&&document.querySelector('#btn-export-memory').offsetWidth>0,importVisible:!!document.querySelector('#btn-import-memory')&&document.querySelector('#btn-import-memory').offsetWidth>0,characterCardExport:!!document.querySelector('#btn-export-character-card')})`))
await call('Page.captureScreenshot', { format: 'png' }).then(result => {
  writeFileSync('_audit/tmp/p15-memory-panel.png', Buffer.from(result.data, 'base64'))
})
ws.close()
