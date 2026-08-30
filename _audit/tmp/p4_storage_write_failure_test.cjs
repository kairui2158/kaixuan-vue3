const http = require('http');
function getJson(path){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:9227,path},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
(async()=>{const pages=await getJson('/json');const page=pages.find(p=>p.type==='page');const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false});let id=0;const pending=new Map();
function send(method,params){return new Promise(res=>{const mid=++id;pending.set(mid,res);ws.send(JSON.stringify({id:mid,method,params}));});}
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}});
await new Promise(r=>ws.addEventListener('open',r));
const evalJs=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)return{__err:r.exceptionDetails.exception?.description||r.exceptionDetails.text};return r.result&&r.result.value;};
const result=await evalJs(`(async()=>{
  const api=window.electronAPI, original=api.storageWrite.bind(api);
  api.storageWrite=async()=>false;
  let thrown=null, ret=null;
  try{ ret=await document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project').saveProject(); }catch(e){thrown=e.message}
  api.storageWrite=original;
  return {returned:ret, thrown, restored:api.storageWrite===original};
})()`);
console.log(JSON.stringify(result,null,2)); ws.close(); process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
