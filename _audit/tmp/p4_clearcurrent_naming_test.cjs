const http = require('http');
function getJson(path) { return new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port: 9227, path }, (res) => { let d=''; res.on('data', c=>d+=c); res.on('end', ()=>resolve(JSON.parse(d))); }).on('error', reject); }); }
(async()=>{ const pages=await getJson('/json'); const page=pages.find(p=>p.type==='page'); const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false}); let id=0; const pending=new Map();
 function send(method,params){return new Promise(res=>{const mid=++id;pending.set(mid,res);ws.send(JSON.stringify({id:mid,method,params}));});}
 ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}});
 await new Promise(r=>ws.addEventListener('open',r));
 const evalJs=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails)return{__err:r.exceptionDetails.exception?.description||r.exceptionDetails.text}; return r.result&&r.result.value;};
 const result=await evalJs(`(async()=>{
   const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
   s.clearCurrent();
   s.aiNaming={version:1,favorites:[{id:'f',name:'遗留收藏',type:'item'}],history:[{id:'h',request:{type:'city',context:'x',style:'y',count:1},results:[{id:'r',name:'遗留历史',type:'city'}],createdAt:new Date().toISOString()}]};
   s.clearCurrent();
   return {afterClearFavorites:s.aiNaming.favorites.length, afterClearHistory:s.aiNaming.history.length, afterClearHistoryName:s.aiNaming.history[0]?.results?.[0]?.name||null};
 })()`);
 const cleanup=await evalJs(`(async()=>{const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project'); s.clearCurrent(); s.aiNaming={version:1,favorites:[],history:[]}; return true;})()`);
 console.log(JSON.stringify({result,cleanup},null,2)); ws.close(); process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
