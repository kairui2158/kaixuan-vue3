const http = require('http');
function getJson(path){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:9227,path},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
(async()=>{
const pages=await getJson('/json');const page=pages.find(p=>p.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false});let id=0;const pend=new Map();
function send(m,p){return new Promise(r=>{const mid=++id;pend.set(mid,r);ws.send(JSON.stringify({id:mid,method:m,params:p}));});}
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener('open',r));
const ev=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.value;};
const last=await ev('window.electronAPI.storageRead("wa_lastProjectId")');
console.log('lastProjectId=',JSON.stringify(last));
for (const k of ['wa_project_prj_msbtqnpe_q24wr3','wa_project-prj_msbtqnpe_q24wr3','wa_project_proj-1787080239265','wa_project-proj-1787080239265']) {
  const v = await ev('window.electronAPI.storageRead("'+k+'")');
  console.log(k, '=>', v ? ('FOUND len=' + JSON.stringify(v).length) : 'null');
}
// also probe pinia state
const st=await ev('(function(){const app=document.querySelector("#app").__vue_app__;const s=app.config.globalProperties.$pinia;const p=s._s.get("project");return p?{currentProjectId:p.currentProjectId,volCount:p.volumes.length,chKeys:Object.keys(p.chapters||{}),projectName:p.projectName}:null;})()');
console.log('pinia.project=',JSON.stringify(st));
ws.close();process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
