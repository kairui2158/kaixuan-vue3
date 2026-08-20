 import { WebSocket } from 'ws';
 const ws = new WebSocket('ws://127.0.0.1:9227/devtools/page/3C0C2720FB9BCD69C084B280A6FF3282');
 ws.on('open', () => {
   let seq = 0, pending = new Map();
   ws.on('message', d => {
     const m = JSON.parse(d);
     if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
   });
   const call = (method, params) => new Promise((resolve, reject) => {
     const id = ++seq;
     pending.set(id, m => m.error ? reject(JSON.stringify(m.error)) : resolve(m.result));
     ws.send(JSON.stringify({ id, method, params }));
   });
   (async () => {
     await call('Runtime.enable');
     // 1. Read current project state
     const r1 = await call('Runtime.evaluate', {
       expression: `JSON.stringify({currentProjectId:window.__pinia?.state?.value?.project?.currentProjectId,projectName:window.__pinia?.state?.value?.project?.projectName,memories:window.__pinia?.state?.value?.project?.memories})`,
       returnByValue: true, awaitPromise: true
     });
     console.log('=== PROJECT STATE ===');
     console.log(JSON.stringify(r1.result?.value || r1, null, 2));
     // 2. Click the real pipeline sidebar entry
     const r2 = await call('Runtime.evaluate', {
       expression: `(function(){var btn=document.querySelector('#btn-pipeline');if(btn){btn.click();return 'CLICKED_PIPELINE'}return 'NOT_FOUND'})()`,
       returnByValue: true, awaitPromise: true
     });
     console.log('=== CLICK RESULT ===');
     console.log(JSON.stringify(r2.result?.value || r2, null, 2));
     await new Promise(r => setTimeout(r, 2000));
     // 3. Read pipeline panel state
     const r3 = await call('Runtime.evaluate', {
       expression: `JSON.stringify({
         panels: [...document.querySelectorAll('[class*=pipeline], [id*=pipeline]')].slice(0,30).map(x => ({tag:x.tagName,id:x.id,cls:String(x.className),text:(x.innerText||'').slice(0,120),visible:x.offsetWidth>0})),
         buttons: [...document.querySelectorAll('button')].filter(x => x.offsetWidth>0).map(x => ({id:x.id,text:(x.innerText||'').trim().slice(0,80),title:x.title})).slice(-80)
       })`,
       returnByValue: true, awaitPromise: true
     });
     console.log('=== PIPELINE STATE ===');
     console.log(JSON.stringify(r3.result?.value || r3, null, 2));
     ws.close();
   })().catch(e => { console.error(e); ws.close(); });
 });
 ws.on('error', e => console.error('WS error:', e.message));
 setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);
