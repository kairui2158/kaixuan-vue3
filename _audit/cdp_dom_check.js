const WebSocket = require('C:/Users/凯瑞/Documents/New project 2/node_modules/ws');
const fs = require('fs');

const ws = new WebSocket('ws://127.0.0.1:9224/devtools/page/4C7D90C93B35FE0426204C9E1226257D');
let msgId = 1;

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (data) => {
      const str = data.toString();
      try { 
        const j = JSON.parse(str); 
        if (j.id === id) { 
          ws.off('message', handler); 
          resolve(j); 
        } 
      } catch(e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({id, method, params}));
    setTimeout(() => { ws.off('message', handler); reject(new Error('timeout ' + method)); }, 15000);
  });
}

ws.on('open', async () => {
  try {
    const expr = `JSON.stringify({
      selectCount: document.querySelectorAll('select').length,
      btnCount: document.querySelectorAll('button').length,
      selects: Array.from(document.querySelectorAll('select')).map(s => ({
        cls: s.className,
        opts: s.options.length,
        val: s.value,
        firstOpt: s.options[0] ? s.options[0].text : ''
      })),
      btns: Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent.trim().slice(0,30),
        cls: b.className.slice(0,30),
        disabled: b.disabled
      })).filter(b => b.text || b.cls),
      title: document.title,
      bodyText: document.body.innerText.slice(0,800),
      hasElectronAPI: typeof window.electronAPI !== 'undefined',
      storageData: typeof window.electronAPI !== 'undefined' ? {
        providers: window.electronAPI.storageRead('providers'),
        agents: window.electronAPI.storageRead('agents'),
        skills: window.electronAPI.storageRead('skills')
      } : null
    })`;
    
    const r = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true
    });
    
    if (r.result && r.result.result) {
      const data = JSON.parse(r.result.result.value);
      console.log('=== DOM STATE ===');
      console.log('Title:', data.title);
      console.log('electronAPI:', data.hasElectronAPI);
      console.log('Selects:', data.selectCount, 'Buttons:', data.btnCount);
      console.log('--- Selects ---');
      data.selects.forEach((s, i) => console.log(`  [${i}] opts=${s.opts} val=${s.val} first=${s.firstOpt} cls=${s.cls}`));
      console.log('--- Buttons ---');
      data.btns.forEach((b, i) => console.log(`  [${i}] text=${b.text} cls=${b.cls} disabled=${b.disabled}`));
      console.log('--- Storage Data ---');
      if (data.storageData) {
        console.log('providers:', JSON.stringify(data.storageData.providers));
        console.log('agents:', JSON.stringify(data.storageData.agents));
        console.log('skills:', JSON.stringify(data.storageData.skills));
      }
      console.log('--- Body Text (first 800) ---');
      console.log(data.bodyText);
      
      fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/dom_state.json', JSON.stringify(data, null, 2));
      console.log('\nSAVED to dom_state.json');
    } else {
      console.log('RAW:', JSON.stringify(r).slice(0, 1000));
    }
    ws.close();
    process.exit(0);
  } catch(e) { 
    console.error('ERROR:', e.message); 
    process.exit(1); 
  }
});

ws.on('error', (e) => { console.error('WS_ERROR:', e.message); process.exit(1); });
setTimeout(() => { console.error('GLOBAL_TIMEOUT'); process.exit(1); }, 20000);
