const http = require('http');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9224/json', (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function run() {
  const targets = await getTargets();
  const page = targets.find(t => t.url.indexOf('5173') >= 0 || t.title === 'Novel Workshop');
  if (!page) { console.log('No page target found'); process.exit(1); }
  
  const wsUrl = page.webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const pending = new Map();
  
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  
  function send(method, params) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  
  await new Promise((resolve) => ws.onopen = resolve);
  
  // Enable Runtime
  await send('Runtime.enable');
  
  // Reload to get fresh state
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 4000));
  
  // Run comprehensive check
  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const results = {};
      
      // 1. Check resizers exist and have data-target
      const resizers = document.querySelectorAll('.resizer-v');
      results.resizers = {
        count: resizers.length,
        items: Array.from(resizers).map(r => ({
          target: r.getAttribute('data-target'),
          visible: r.offsetWidth > 0
        }))
      };
      
      // 2. Check sidebar nav exists
      results.sidebarNav = {
        exists: !!document.querySelector('.sidebar-nav'),
        buttonCount: document.querySelectorAll('.sidebar-nav button, .sidebar-nav .nav-btn').length
      };
      
      // 3. Check header height
      const header = document.querySelector('.app-header');
      results.header = header ? { height: header.offsetHeight } : null;
      
      // 4. Check horizontal overflow on body
      results.bodyOverflow = {
        scrollWidth: document.body.scrollWidth,
        clientWidth: document.body.clientWidth,
        hasHorizontalScroll: document.body.scrollWidth > document.body.clientWidth
      };
      
      // 5. Check all elements for text overflow (scrollWidth > clientWidth)
      const overflowEls = [];
      const allEls = document.querySelectorAll('*');
      for (let i = 0; i < allEls.length && i < 500; i++) {
        const el = allEls[i];
        if (el.scrollWidth > el.clientWidth + 2 && el.children.length < 3) {
          const styles = window.getComputedStyle(el);
          if (styles.whiteSpace === 'nowrap' && styles.overflow !== 'hidden') {
            overflowEls.push({
              tag: el.tagName,
              class: el.className,
              text: (el.textContent || '').substring(0, 40),
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              whiteSpace: styles.whiteSpace,
              overflow: styles.overflow
            });
          }
        }
      }
      results.textOverflow = overflowEls;
      
      // 6. Check electronAPI exists
      results.electronAPI = {
        exists: typeof window.electronAPI !== 'undefined',
        fetchModels: typeof window.electronAPI?.fetchModels,
        providerTestConnection: typeof window.electronAPI?.providerTestConnection,
        respondCloseChoice: typeof window.electronAPI?.respondCloseChoice,
        onFinalSave: typeof window.electronAPI?.onFinalSave,
        onCloseRequest: typeof window.electronAPI?.onCloseRequest
      };
      
      // 7. Check Vue app mounted
      const appContainer = document.querySelector('.app-container');
      results.vueMounted = { exists: !!appContainer };
      
      // 8. Check chapter tree, editor, chat panel exist
      results.layout = {
        chapterTree: !!document.querySelector('.chapter-tree'),
        editorPanel: !!document.querySelector('.editor-panel'),
        chatPanel: !!document.querySelector('.chat-panel'),
        breadcrumbBar: !!document.querySelector('.breadcrumb-bar')
      };
      
      // 9. Check statusbar
      results.statusbar = {
        exists: !!document.querySelector('.statusbar'),
        text: document.querySelector('.statusbar')?.textContent?.trim()?.substring(0, 80)
      };
      
      // 10. Check exit modal ref
      results.exitModal = {
        exists: !!document.querySelector('.modal-backdrop')
      };
      
      return JSON.stringify(results, null, 2);
    })()`,
    returnByValue: true
  });
  
  console.log(JSON.stringify(result.result, null, 2));
  ws.close();
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
