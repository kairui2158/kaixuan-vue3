import { WebSocket } from 'ws';
const ws = new WebSocket('ws://127.0.0.1:9227/devtools/page/3C0C2720FB9BCD69C084B280A6FF3282');
let seq = 0; const pending = new Map();
ws.on('message', d => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, m => m.error ? reject(m.error) : resolve(m.result)); ws.send(JSON.stringify({ id, method, params })); });
ws.on('open', async () => {
  try {
    await call('Runtime.enable');
    const r = await call('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify((function(){const p=document.querySelector('#pipeline-panel');if(!p)return {found:false};return {found:true,ids:[...p.querySelectorAll('[id]')].map(x=>({tag:x.tagName,id:x.id,text:(x.innerText||'').trim().slice(0,100),disabled:x.disabled,visible:x.offsetWidth>0})),inputs:[...p.querySelectorAll('input,textarea,select')].map(x=>({tag:x.tagName,id:x.id,name:x.name,value:x.value,placeholder:x.placeholder,visible:x.offsetWidth>0})),steps:[...p.querySelectorAll('[class*=step], [data-step]')].map(x=>({tag:x.tagName,id:x.id,cls:String(x.className),text:(x.innerText||'').trim().slice(0,100),visible:x.offsetWidth>0}))};})())` });
    console.log(JSON.stringify(r.result?.value || r, null, 2));
  } catch (e) { console.error(e); process.exitCode = 1; } finally { ws.close(); }
});
setTimeout(() => { console.error('TIMEOUT'); process.exitCode = 1; }, 8000);
