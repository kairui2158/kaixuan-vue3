const http = require('http')
const WebSocket = globalThis.WebSocket

function getCDP() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9224/json', (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        const targets = JSON.parse(body)
        const page = targets.find(t => t.type === 'page')
        if (page) resolve(page.webSocketDebuggerUrl)
        else reject(new Error('No page'))
      })
    }).on('error', reject)
  })
}

let msgId = 0
const results = { pass: 0, fail: 0, fails: [] }

function log(type, name, detail) {
  if (type === 'pass') { results.pass++; console.log('[OK] ' + name + (detail ? ' - ' + detail : '')) }
  else if (type === 'fail') { results.fail++; results.fails.push(name); console.log('[ERR] ' + name + (detail ? ' - ' + detail : '')) }
  else console.log('[INFO] ' + name + (detail ? ' - ' + detail : ''))
}

function evalWS(ws, expr) {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    const handler = (ev) => {
      let raw = ev && ev.data !== undefined ? ev.data : ev
      if (typeof raw !== 'string') { try { raw = raw.toString() } catch(e) { return } }
      let msg
      try { msg = JSON.parse(raw) } catch(e) { return }
      if (msg.id === id) {
        ws.removeEventListener('message', handler)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    }
    ws.addEventListener('message', handler)
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }))
  })
}

async function main() {
  const wsUrl = await getCDP()
  console.log('Connecting to:', wsUrl)
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  console.log('CDP connected')
  ws.send(JSON.stringify({ id: ++msgId, method: 'Runtime.enable' }))
  ws.send(JSON.stringify({ id: ++msgId, method: 'Page.enable' }))
  ws.send(JSON.stringify({ id: ++msgId, method: 'Page.reload', params: { ignoreCache: true } }))
  await new Promise(r => setTimeout(r, 4000))

  // 1. Layout
  console.log('\n=== 1. Layout ===')
  let r = await evalWS(ws, `JSON.stringify({
    header: document.querySelector('.app-header')?.offsetHeight,
    sidebar: document.querySelector('.sidebar-nav')?.offsetWidth,
    chapterTree: document.querySelector('.chapter-tree')?.offsetWidth,
    resizer1: document.querySelector('.resizer-v[data-target="chapter"]')?.offsetWidth,
    editorPanel: document.querySelector('.editor-panel')?.offsetWidth,
    resizer2: document.querySelector('.resizer-v[data-target="chat"]')?.offsetWidth,
    chatPanel: document.querySelector('.chat-panel')?.offsetWidth,
    bodyScrollW: document.body.scrollWidth,
    bodyClientW: document.body.clientWidth
  })`)
  const layout = JSON.parse(r.result.value)
  console.log('Layout:', JSON.stringify(layout))
  if (layout.bodyScrollW <= layout.bodyClientW) log('pass', 'No horizontal overflow')
  else log('fail', 'Horizontal overflow', 'scrollW=' + layout.bodyScrollW + ' > clientW=' + layout.bodyClientW)
  if (layout.header === 48) log('pass', 'Header=48px')
  else log('fail', 'Header height', 'expected 48 got ' + layout.header)
  if (layout.resizer1 > 0) log('pass', 'Resizer-chapter exists')
  else log('fail', 'Resizer-chapter missing')
  if (layout.resizer2 > 0) log('pass', 'Resizer-chat exists')
  else log('fail', 'Resizer-chat missing')

  // 2. Editor always in DOM
  console.log('\n=== 2. Editor In DOM ===')
  r = await evalWS(ws, `JSON.stringify({
    editor: !!document.querySelector('.editor-panel'),
    chat: !!document.querySelector('.chat-panel'),
    chapterTree: !!document.querySelector('.chapter-tree'),
    resizers: document.querySelectorAll('.resizer-v').length
  })`)
  const dom = JSON.parse(r.result.value)
  if (dom.editor) log('pass', 'Editor in DOM')
  else log('fail', 'Editor NOT in DOM')
  if (dom.chat) log('pass', 'Chat in DOM')
  else log('fail', 'Chat NOT in DOM')
  if (dom.chapterTree) log('pass', 'ChapterTree in DOM')
  else log('fail', 'ChapterTree NOT in DOM')
  if (dom.resizers === 2) log('pass', 'Two resizers')
  else log('fail', 'Resizer count', 'expected 2 got ' + dom.resizers)

  // 3. Open settings, check editor still in DOM
  console.log('\n=== 3. Panel Open Test ===')
  await evalWS(ws, `document.querySelector('.sidebar-btn[data-tooltip="\\u8BBE\\u7F6E"]')?.click()`)
  await new Promise(r => setTimeout(r, 1500))
  r = await evalWS(ws, `JSON.stringify({
    modalVisible: !!document.querySelector('.modal-overlay'),
    editorStillExists: !!document.querySelector('.editor-panel'),
    resizersStillExist: document.querySelectorAll('.resizer-v').length
  })`)
  const ap = JSON.parse(r.result.value)
  if (ap.modalVisible) log('pass', 'Settings modal opened')
  else log('fail', 'Settings modal not visible')
  if (ap.editorStillExists) log('pass', 'Editor still in DOM when panel open')
  else log('fail', 'Editor DISAPPEARED when panel opened')
  if (ap.resizersStillExist === 2) log('pass', 'Resizers still present')
  else log('fail', 'Resizers gone', 'count=' + ap.resizersStillExist)

  // 4. API Settings dual view
  console.log('\n=== 4. API Settings ===')
  r = await evalWS(ws, `JSON.stringify({
    listView: !!document.querySelector('.provider-list-view'),
    editView: !!document.querySelector('.provider-edit-view'),
    addBtn: !!document.querySelector('.provider-card-add')
  })`)
  const av = JSON.parse(r.result.value)
  if (av.listView) log('pass', 'Provider list view visible')
  else log('fail', 'Provider list view NOT visible')
  if (av.addBtn) log('pass', 'Add provider button exists')
  else log('fail', 'Add provider button missing')

  await evalWS(ws, `document.querySelector('.provider-card-add')?.click()`)
  await new Promise(r => setTimeout(r, 500))
  r = await evalWS(ws, `JSON.stringify({
    editView: !!document.querySelector('.provider-edit-view'),
    listView: !!document.querySelector('.provider-list-view'),
    backBtn: !!document.querySelector('.btn-back'),
    nameInput: !!document.querySelector('.provider-edit-view input'),
    saveBtn: !!Array.from(document.querySelectorAll('.provider-edit-view button')).find(b => b.textContent.includes('\\u4FDD\\u5B58')),
    cancelBtn: !!Array.from(document.querySelectorAll('.provider-edit-view button')).find(b => b.textContent.includes('\\u53D6\\u6D88'))
  })`)
  const ev = JSON.parse(r.result.value)
  if (ev.editView && !ev.listView) log('pass', 'Edit view shown, list hidden')
  else log('fail', 'Edit view issue', 'edit=' + ev.editView + ' list=' + ev.listView)
  if (ev.backBtn) log('pass', 'Back button exists')
  else log('fail', 'Back button missing')
  if (ev.nameInput) log('pass', 'Name input exists')
  else log('fail', 'Name input missing')
  if (ev.saveBtn) log('pass', 'Save button exists')
  else log('fail', 'Save button missing')
  if (ev.cancelBtn) log('pass', 'Cancel button exists')
  else log('fail', 'Cancel button missing')

  // 5. electronAPI
  console.log('\n=== 5. electronAPI ===')
  r = await evalWS(ws, `JSON.stringify({
    exists: typeof window.electronAPI === 'object',
    fetchModels: typeof window.electronAPI?.fetchModels,
    providerTestConnection: typeof window.electronAPI?.providerTestConnection,
    respondCloseChoice: typeof window.electronAPI?.respondCloseChoice,
    onCloseRequest: typeof window.electronAPI?.onCloseRequest,
    onFinalSave: typeof window.electronAPI?.onFinalSave,
    forceQuit: typeof window.electronAPI?.forceQuit,
    storageRead: typeof window.electronAPI?.storageRead,
    storageWrite: typeof window.electronAPI?.storageWrite
  })`)
  const api = JSON.parse(r.result.value)
  if (api.exists) log('pass', 'electronAPI exists')
  else log('fail', 'electronAPI NOT found')
  for (const [k, v] of Object.entries(api)) {
    if (k === 'exists') continue
    if (v === 'function') log('pass', 'electronAPI.' + k)
    else log('fail', 'electronAPI.' + k, 'type=' + v)
  }

  // 6. Close settings, open outline
  console.log('\n=== 6. Outline Workspace ===')
  await evalWS(ws, `document.querySelector('.modal-close')?.click()`)
  await new Promise(r => setTimeout(r, 800))
  await evalWS(ws, `document.querySelector('.sidebar-btn[data-tooltip="\\u5927\\u7EB2\\u5DE5\\u4F5C\\u53F0"]')?.click()`)
  await new Promise(r => setTimeout(r, 1500))
  r = await evalWS(ws, `JSON.stringify({
    owVisible: !!document.querySelector('.ow-overlay'),
    saveBtn: !!Array.from(document.querySelectorAll('.ow-footer button')).find(b => b.textContent.includes('\\u4FDD\\u5B58\\u5927\\u7EB2')),
    textarea: !!document.querySelector('.ow-textarea'),
    editorStillInDom: !!document.querySelector('.editor-panel'),
    resizersStillInDom: document.querySelectorAll('.resizer-v').length
  })`)
  const ow = JSON.parse(r.result.value)
  if (ow.owVisible) log('pass', 'Outline overlay visible')
  else log('fail', 'Outline not visible')
  if (ow.saveBtn) log('pass', 'Save outline button exists')
  else log('fail', 'Save outline button missing')
  if (ow.textarea) log('pass', 'Outline textarea exists')
  else log('fail', 'Outline textarea missing')
  if (ow.editorStillInDom) log('pass', 'Editor still in DOM')
  else log('fail', 'Editor gone when outline opened')
  if (ow.resizersStillInDom === 2) log('pass', 'Resizers still in DOM')
  else log('fail', 'Resizers gone', 'count=' + ow.resizersStillInDom)

  // 7. Test outline save
  console.log('\n=== 7. Outline Save Test ===')
  await evalWS(ws, `var ta = document.querySelector('.ow-textarea'); if(ta){ ta.value = 'test outline'; ta.dispatchEvent(new Event('input',{bubbles:true})); }`)
  await new Promise(r => setTimeout(r, 300))
  r = await evalWS(ws, `(function(){
    var btn = Array.from(document.querySelectorAll('.ow-footer button')).find(function(b){ return b.textContent.includes('\\u4FDD\\u5B58\\u5927\\u7EB2') });
    if (!btn) return JSON.stringify({ error: 'btn not found' });
    btn.click();
    return JSON.stringify({ clicked: true, disabled: btn.disabled });
  })()`)
  const sr = JSON.parse(r.result.value)
  if (sr.clicked && !sr.disabled) log('pass', 'Save outline button works')
  else log('fail', 'Save outline button issue', JSON.stringify(sr))

  // 8. ScPanel
  console.log('\n=== 8. Settings Collection ===')
  await evalWS(ws, `document.querySelector('.ow-overlay .modal-close')?.click()`)
  await new Promise(r => setTimeout(r, 800))
  await evalWS(ws, `document.querySelector('.sidebar-btn[data-tooltip="\\u8BBE\\u5B9A\\u5408\\u96C6"]')?.click()`)
  await new Promise(r => setTimeout(r, 1500))
  r = await evalWS(ws, `JSON.stringify({
    scVisible: !!document.querySelector('.sc-overlay'),
    sidebar: !!document.querySelector('.sc-sidebar'),
    main: !!document.querySelector('.sc-main'),
    addBtn: !!document.querySelector('.sc-overlay .btn-add'),
    editorStillInDom: !!document.querySelector('.editor-panel')
  })`)
  const sc = JSON.parse(r.result.value)
  if (sc.scVisible) log('pass', 'SC overlay visible')
  else log('fail', 'SC not visible')
  if (sc.sidebar) log('pass', 'SC sidebar exists')
  else log('fail', 'SC sidebar missing')
  if (sc.main) log('pass', 'SC main exists')
  else log('fail', 'SC main missing')
  if (sc.addBtn) log('pass', 'SC add category button exists')
  else log('fail', 'SC add category button missing')
  if (sc.editorStillInDom) log('pass', 'Editor still in DOM')
  else log('fail', 'Editor gone when SC opened')

  // 9. Text overflow
  console.log('\n=== 9. Text Overflow ===')
  r = await evalWS(ws, `(function(){
    var els = document.querySelectorAll('*');
    var overflows = [];
    for (var i=0; i<els.length; i++) {
      var el = els[i];
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        var rect = el.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) continue;
        var style = getComputedStyle(el);
        if (style.overflow === 'hidden' && style.textOverflow === 'ellipsis') continue;
        if (style.overflowX === 'scroll' || style.overflowX === 'auto') continue;
        overflows.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,40), sw: el.scrollWidth, cw: el.clientWidth, text: (el.textContent||'').slice(0,30) });
      }
    }
    return JSON.stringify(overflows.slice(0,15));
  })()`)
  const ov = JSON.parse(r.result.value)
  if (ov.length === 0) log('pass', 'No text overflow')
  else { log('fail', 'Text overflow found', ov.length + ' elements'); ov.forEach(function(o){ log('info', '  ', o.tag + '.' + o.cls + ' sw=' + o.sw + ' cw=' + o.cw + ' ' + o.text) }) }

  // 10. Exit modal
  console.log('\n=== 10. Exit Modal ===')
  await evalWS(ws, `document.querySelector('.sc-overlay .modal-close')?.click()`)
  await new Promise(r => setTimeout(r, 500))
  r = await evalWS(ws, `JSON.stringify({
    exitModalInDom: !!document.querySelector('.modal-backdrop'),
    exitModalRef: !!document.querySelector('#exit-confirm-modal')
  })`)
  log('info', 'Exit modal', JSON.stringify(JSON.parse(r.result.value)))

  // Summary
  console.log('\n========== SUMMARY ==========')
  console.log('PASS: ' + results.pass)
  console.log('FAIL: ' + results.fail)
  if (results.fail > 0) { console.log('FAILED: ' + results.fails.join(', ')) }
  console.log('============================')

  ws.close()
  process.exit(results.fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e); process.exit(2) })
