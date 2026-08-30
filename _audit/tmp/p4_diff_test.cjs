const http = require('http');
function getJson(path){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:9227,path},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
(async()=>{const pages=await getJson('/json');const page=pages.find(p=>p.type==='page');const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false});let id=0;const pending=new Map();
function send(method,params){return new Promise(res=>{const mid=++id;pending.set(mid,res);ws.send(JSON.stringify({id:mid,method,params}));});}
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}});
await new Promise(r=>ws.addEventListener('open',r));
const evalJs=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)return{__err:r.exceptionDetails.exception?.description||r.exceptionDetails.text};return r.result&&r.result.value;};
const key='wa_project_scan_p4_diff_test';
const script=`(async()=>{
  const KEY='${key}';
  const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
  const base={
    projectName:'P4差异测试', outlineText:'第一卷\\n第一章', bookWordCount:100000,
    volumes:[{id:'volD',name:'第一卷',summary:'',outline:'',isBound:true,boundTo:['chapter-layer']}],
    chapters:{volD:[{id:'chD',title:'第一章',body:'旧正文',plot:'旧剧情'}]},
    memories:{version:1,entities:[{id:'old1',name:'旧角色',type:'character'}],relations:[],events:[],world:[],foreshadowing:[],meta:{},history:[],categories:['情节'],items:[]},
    memoryBlacklist:[], aiNaming:{version:1,favorites:[],history:[]}, outlineChat:[]
  };
  await window.electronAPI.storageWrite(KEY,base);
  await s.loadProject('scan_p4_diff_test'); await s.saveProject();
  const snap=async()=>await window.electronAPI.storageRead(KEY);
  const diff=(a,b)=>Object.keys({...a,...b}).filter(k=>JSON.stringify(a?.[k])!==JSON.stringify(b?.[k]));
  const before1=await snap();
  const merged=JSON.parse(JSON.stringify(before1.memories));
  merged.entities.push({id:'new1',name:'新角色',type:'character'});
  merged.meta.totals={entities:merged.entities.length,relations:0,events:0,world:0,foreshadowing:0};
  await s.recordMemoryChange(merged,{chapterId:'memory-import-merge',reason:'测试合并导入'});
  const after1=await snap();
  const mergeDiff=diff(before1,after1);
  const before2=await snap();
  await s.recordMemoryChange({version:1,entities:[{id:'only1',name:'覆盖角色',type:'character'}],relations:[],events:[],world:[],foreshadowing:[],meta:{},history:[],categories:['情节'],items:[]},{chapterId:'memory-import-replace',reason:'测试覆盖导入'});
  const after2=await snap();
  const replaceDiff=diff(before2,after2);
  const before3=await snap();
  s.chapters.volD[0].body='新正文';
  await s.saveProject();
  const after3=await snap();
  const bodyDiff=diff(before3,after3);
  const before4=await snap();
  s.outlineText='退出保存后的最新大纲';
  await s.saveProject();
  const after4=await snap();
  const exitDiff=diff(before4,after4);
  return {setup:{projectName:s.projectName,chapters:s.chapters.volD.length,memoryEntities:s.memories.entities.length},
    merge:{addedEntity:after1.memories.entities.length,changedKeys:mergeDiff,historyReason:after1.memories.history.at(-1)?.reason,nonMemoryUntouched:mergeDiff.every(k=>k.startsWith('memories'))},
    replace:{entities:after2.memories.entities.length,changedKeys:replaceDiff,historyReason:after2.memories.history.at(-1)?.reason,nonMemoryUntouched:replaceDiff.every(k=>k.startsWith('memories'))},
    body:{changedKeys:bodyDiff,newBody:after3.chapters.volD[0].body,nonChapterUntouched:bodyDiff.every(k=>k==='chapters')},
    exit:{changedKeys:exitDiff,newOutline:after4.outlineText,nonOutlineUntouched:exitDiff.every(k=>k==='outlineText')},
    before1, after1, after2, after3, after4};
})()`;
const result=await evalJs(script);
const cleanup=await evalJs(`(async()=>{await window.electronAPI.storageRemove('${key}');const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');s.clearCurrent();s.aiNaming={version:1,favorites:[],history:[]};const keys=await window.electronAPI.storageList();return{removed:!keys.includes('${key}')};})()`);
console.log(JSON.stringify({result,cleanup},null,2)); ws.close(); process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});


