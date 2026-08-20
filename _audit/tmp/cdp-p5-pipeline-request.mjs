import { WebSocket } from 'ws';
const ws = new WebSocket('ws://127.0.0.1:9227/devtools/page/3C0C2720FB9BCD69C084B280A6FF3282');
let seq = 0; const pending = new Map(); const requests = [];
ws.on('message', d => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Network.requestWillBeSent' && m.params?.request?.method === 'POST') requests.push({url:m.params.request.url,postData:m.params.request.postData || ''}); });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, m => m.error ? reject(m.error) : resolve(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalExpr = async expression => { const r = await call('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true}); return r.result?.value; };
ws.on('open', async () => {
  try {
    await call('Runtime.enable'); await call('Network.enable');
    const opened = await evalExpr(`(function(){var s=[...document.querySelectorAll('.pl-step')][4];if(!s)return 'NO_STEP5';s.click();return 'CLICKED_STEP5'})()`);
    console.log('STEP5=' + opened);
    await new Promise(r => setTimeout(r, 1200));
    console.log('VISIBLE=' + await evalExpr(`JSON.stringify([...document.querySelectorAll('#pipeline-panel button')].filter(x=>x.offsetWidth>0).map(x=>({id:x.id,text:(x.innerText||'').trim(),disabled:x.disabled})))`));
    const clicked = await evalExpr(`(function(){var b=document.querySelector('#btn-pl-gen-body');if(!b||b.offsetWidth===0)return 'NO_GENERATE_BUTTON';if(b.disabled)return 'DISABLED';b.click();return 'CLICKED_GENERATE_BODY'})()`);
    console.log('GENERATE=' + clicked);
    await new Promise(r => setTimeout(r, 3000));
    const compact = requests.map(x => { let body=x.postData; let hasMemory=body.includes('相关记忆') || body.includes('[相关记忆]'); let names=['角色','未命名角色','线索'].filter(n=>body.includes(n)); return {url:x.url,hasMemory,names,bodyLength:body.length,memoryIndex:body.indexOf('相关记忆'),body:body.slice(Math.max(0,body.indexOf('相关记忆')-80),body.indexOf('相关记忆')+700)}; });
    console.log('REQUESTS=' + JSON.stringify(compact,null,2));
    console.log('RESULT=' + JSON.stringify(await evalExpr(`JSON.stringify({body:(document.querySelector('#pl-body-result')?.innerText||'').slice(0,300),logs:(document.querySelector('#pipeline-panel')?.innerText||'').slice(-500)})`)));
  } catch (e) { console.error('ERROR',e); process.exitCode=1; } finally { ws.close(); }
});
setTimeout(() => { console.error('TIMEOUT'); process.exitCode=1; }, 20000);
