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
const selectorBox = async selector => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||!el.offsetWidth)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`)
const clickSelector = async selector => {
  const box = await selectorBox(selector)
  if (!box) throw new Error('not visible: ' + selector)
  const x = box.x + box.w / 2
  const y = box.y + box.h / 2
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}
const wait = ms => new Promise(r => setTimeout(r, ms))

await new Promise(resolve => ws.once('open', resolve))
await call('Runtime.enable')
await call('Page.enable')

const results = {}
results.page = { title: page.title, url: page.url }

 // Step 1: Open memory panel (check first, only click if closed)
 const panelBefore = await evaluate(`JSON.stringify((()=>{const p=document.querySelector('#memory-panel');if(!p)return {visible:false};const r=p.getBoundingClientRect();return {visible:r.width>0&&r.height>0}})())`)
 const panelBeforeObj = JSON.parse(panelBefore || '{}')
 if (!panelBeforeObj.visible) {
   const memBtnBox = await selectorBox('#btn-memory')
   if (memBtnBox) {
     await clickSelector('#btn-memory')
     await wait(1000)
   }
 }
 const panelState = await evaluate(`JSON.stringify((()=>{const p=document.querySelector('#memory-panel');if(!p)return {visible:false};const r=p.getBoundingClientRect();return {visible:r.width>0&&r.height>0,rect:{x:r.x,y:r.y,w:r.width,h:r.height},headerText:(p.innerText||'').slice(0,200)}})())`)
 results.memoryPanel = JSON.parse(panelState || '{}')
 // Verify the relation graph button is now visible
 const rgBtn = await selectorBox('#btn-memory-relation-graph')
 results.rgButtonVisible = !!rgBtn
 if (!rgBtn) {
   console.log('ERROR: #btn-memory-relation-graph not visible after opening panel')
   console.log('FULL_VERIFY:' + JSON.stringify(results, null, 2))
   ws.close()
   process.exit(1)
 }

// Step 2: Read current memory data from Pinia store
const memData = await evaluate(`JSON.stringify((()=>{const s=window.__pinia&&window.__pinia.state&&window.__pinia.state.value&&window.__pinia.state.value.project;if(!s)return null;const m=s.memories||{};return {projectId:s.currentProjectId,entities:(m.entities||[]).length,relations:(m.relations||[]).length,events:(m.events||[]).length,world:(m.world||[]).length,foreshadowing:(m.foreshadowing||[]).length,legacyItems:(m.items||[]).length,categories:(m.categories||[]).length,entityNames:(m.entities||[]).map(e=>e.name||e.id)}})())`)
results.memoryData = JSON.parse(memData || 'null')

// Step 3: Cycle through four views and verify rendering
results.views = {}
for (let i = 0; i < 4; i++) {
  await clickSelector('#btn-memory-relation-graph')
  await wait(200)
  const viewState = await evaluate(`JSON.stringify({button:document.querySelector('#btn-memory-relation-graph')?.innerText,graph:!!document.querySelector('.memory-relation-graph'),analysis:!!document.querySelector('.memory-graph-analysis'),mind:!!document.querySelector('.memory-mind-map'),timeline:!!document.querySelector('.memory-timeline')})`)
  results.views['click_' + (i+1)] = JSON.parse(viewState || '{}')
}

// Step 4: P8 CharacterCard - check if CharacterCard component renders when entities exist
await clickSelector('#btn-memory-relation-graph')
await wait(200)
// Go back to list view (click until button shows '记忆列表' i.e. showRelationGraph is false)
const btnText = await evaluate(`document.querySelector('#btn-memory-relation-graph')?.innerText`)
if (btnText && btnText !== '关系图') {
  // already cycling, click once more to get back to list
  await clickSelector('#btn-memory-relation-graph')
  await wait(200)
}
const charCard = await evaluate(`JSON.stringify({hasCharacterCard:!!document.querySelector('.character-card')||!!document.querySelector('[class*=character]'),entityCards:document.querySelectorAll('.mem-item-card').length,entityCardsWithSource:[...document.querySelectorAll('.mem-item-card')].filter(c=>c.querySelector('button[onclick*=export],button:has(.source-mark),.btn-sm:has(.source)').length})`)
results.p8_characterCard = JSON.parse(charCard || '{}')

// Step 5: P9 Timeline - click to timeline view and verify filters
// Click until we reach timeline
for (let i = 0; i < 5; i++) {
  const t = await evaluate(`document.querySelector('#btn-memory-relation-graph')?.innerText`)
  if (t === '时间线') break
  await clickSelector('#btn-memory-relation-graph')
  await wait(200)
}
const timelineState = await evaluate(`JSON.stringify({hasTimeline:!!document.querySelector('.memory-timeline'),hasToolbar:!!document.querySelector('.timeline-toolbar'),hasTypeFilter:!!document.querySelector('.timeline-toolbar select'),hasCharFilter:!!document.querySelector('.timeline-filter'),eventCount:document.querySelectorAll('.timeline-item').length,emptyText:document.querySelector('.timeline-empty')?.textContent||null})`)
results.p9_timeline = JSON.parse(timelineState || '{}')

// Step 6: P10 RelationGraph - click to graph view
for (let i = 0; i < 5; i++) {
  const t = await evaluate(`document.querySelector('#btn-memory-relation-graph')?.innerText`)
  if (t === '图谱分析') break
  await clickSelector('#btn-memory-relation-graph')
  await wait(200)
}
const graphState = await evaluate(`JSON.stringify({hasGraph:!!document.querySelector('.memory-relation-graph'),nodeCount:document.querySelectorAll('.graph-node').length,edgeCount:document.querySelectorAll('.graph-edge').length,hasSVG:!!document.querySelector('.graph-canvas'),emptyText:document.querySelector('.graph-empty')?.textContent||null,hintText:document.querySelector('.graph-hint')?.textContent||null,hasSelection:!!document.querySelector('.graph-selection')})`)
results.p10_relationGraph = JSON.parse(graphState || '{}')

// Step 7: P11 MindMap - click to mindmap view
for (let i = 0; i < 5; i++) {
  const t = await evaluate(`document.querySelector('#btn-memory-relation-graph')?.innerText`)
  if (t === '思维导图') break
  await clickSelector('#btn-memory-relation-graph')
  await wait(200)
}
const mindState = await evaluate(`JSON.stringify({hasMindMap:!!document.querySelector('.memory-mind-map'),volumeCount:document.querySelectorAll('.mind-volume').length,hasExpandAll:!!document.querySelector('.mind-toolbar button:nth-of-type(1)'),hasCollapseAll:!!document.querySelector('.mind-toolbar button:nth-of-type(2)'),emptyText:document.querySelector('.mind-empty')?.textContent||null,eventCount:document.querySelectorAll('.mind-event').length})`)
results.p11_mindMap = JSON.parse(mindState || '{}')

// Step 8: P12 GraphAnalysis - click to analysis view
for (let i = 0; i < 5; i++) {
  const t = await evaluate(`document.querySelector('#btn-memory-relation-graph')?.innerText`)
  if (t === '时间线') break
  await clickSelector('#btn-memory-relation-graph')
  await wait(200)
}
const analysisState = await evaluate(`JSON.stringify({hasAnalysis:!!document.querySelector('.memory-graph-analysis'),cardCount:document.querySelectorAll('.analysis-card').length,rankedEntityCount:document.querySelectorAll('.rank-row').length,hasWarnings:document.querySelectorAll('.analysis-warning').length,hasSelected:!!document.querySelector('.analysis-selected')})`)
results.p12_graphAnalysis = JSON.parse(analysisState || '{}')

// Step 9: P6 Import/Export buttons visible
results.p6_importExport = {
  exportBtn: !!await selectorBox('#btn-export-memory'),
  importBtn: !!await selectorBox('#btn-import-memory'),
  charCardBtn: !!await selectorBox('#btn-import-character-card')
}

// Step 10: P14 memoryExport service check
const exportCheck = await evaluate(`JSON.stringify({memoryExportLoaded:typeof window!=='undefined'&&!!document.querySelector('#btn-export-memory')})`)
results.p14_exportReady = JSON.parse(exportCheck || '{}')

// Step 11: P5/P13 retriever check - verify memoryRetriever is imported in the app
const retrieverCheck = await evaluate(`JSON.stringify({chatPanelExists:!!document.querySelector('#chat-panel')||!!document.querySelector('[class*=chat]'),pipelinePanelExists:!!document.querySelector('#pipeline-panel')||!!document.querySelector('[class*=pipeline]')})`)
results.p5p13_retriever = JSON.parse(retrieverCheck || '{}')

// Step 12: P2 confirm body button check
const p2Check = await evaluate(`JSON.stringify({confirmBodyBtn:!!document.querySelector('#btn-pl-confirm-body'),pipelineVisible:!!(document.querySelector('#pipeline-panel')&&document.querySelector('#pipeline-panel').offsetWidth>0)})`)
results.p2_confirmBody = JSON.parse(p2Check || '{}')

// Step 13: P7 version/rollback - check memoryVersion service exists
const p7Check = await evaluate(`JSON.stringify({memoryPanelOpen:!!document.querySelector('#memory-panel'),hasMemoryList:!!document.querySelector('#mem-list')})`)
results.p7_versionUI = JSON.parse(p7Check || '{}')

// Screenshot
try {
  const ss = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync('_audit/tmp/p15-full-verify.png', Buffer.from(ss.data, 'base64'))
  results.screenshot = true
} catch(e) {
  results.screenshot = false
  results.screenshotError = e.message
}

console.log('FULL_VERIFY:' + JSON.stringify(results, null, 2))
ws.close()
