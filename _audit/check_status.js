const http = require('http');
http.get('http://127.0.0.1:9223/json', (res) => {
  let data=''; res.on('data', c=>data+=c); res.on('end',()=>{
    const targets=JSON.parse(data);
    const page=targets.find(t=>t.type==='page');
    if(!page){console.log('[ERR] no page target');process.exit(1);}
    const ws=new WebSocket(page.webSocketDebuggerUrl);
    let id=1; const pending=new Map();
    ws.addEventListener('message',(e)=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
    function ev(expr){return new Promise(r=>{const i=id++;pending.set(i,r);ws.send(JSON.stringify({id:i,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true,awaitPromise:true}}));});}
    ws.addEventListener('open',async()=>{
      const r=await ev(`JSON.stringify({
        hasVue: !!document.querySelector('#app'),
        appHasVue: !!(document.querySelector('#app') && document.querySelector('#app').__vue_app__),
        title: document.title,
        bodyLen: document.body.innerText.length,
        modalOpen: !!document.querySelector('.modal-overlay'),
        settingsOpen: !!document.querySelector('.settings-modal'),
        btnCount: document.querySelectorAll('button').length,
        selectCount: document.querySelectorAll('select').length,
        bodySnippet: document.body.innerText.slice(0,500)
      })`);
      console.log(r.result && r.result.result ? r.result.result.value : JSON.stringify(r).slice(0,500));
      ws.close(); process.exit(0);
    });
  });
});
