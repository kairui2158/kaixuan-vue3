const http = require('http');
function getJson(path){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:9227,path},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
(async()=>{
const pages=await getJson('/json');const page=pages.find(p=>p.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false});let id=0;const pend=new Map();
function send(m,p){return new Promise(r=>{const mid=++id;pend.set(mid,r);ws.send(JSON.stringify({id:mid,method:m,params:p}));});}
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener('open',r));
const ev=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.value;};
const keys=await ev('window.electronAPI.storageList()');
console.log(JSON.stringify(keys,null,1));
ws.close();process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
