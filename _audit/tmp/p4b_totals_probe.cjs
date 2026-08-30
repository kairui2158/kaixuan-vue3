const http = require('http');
function getJson(path){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:9227,path},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
(async()=>{
const pages=await getJson('/json');const page=pages.find(p=>p.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false});let id=0;const pend=new Map();
function send(m,p){return new Promise(r=>{const mid=++id;pend.set(mid,r);ws.send(JSON.stringify({id:mid,method:m,params:p}));});}
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener('open',r));
const ev=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.value;};
// minimal fixture with memories + aiNaming
const ok = await ev(`(async () => {
  const proj = { projectName: 'P4B', outlineText: '', outlineLocked: false, outlineLockedText: '', bookWordCount: 0,
    volumesConfirmed: false, chaptersConfirmed: false, settingsGenerated: false, settings: [], volumes: [], chapters: {},
    settingBindings: {}, settingsCollection: { categories: [], items: {} },
    memories: { entities: [{ id: 'e1', name: '林舟' }], relations: [], events: [{ id: 'v1', title: 't', chapterId: 'c' }], world: [], foreshadowing: [], meta: {}, history: [] },
    memoryBlacklist: [], aiNaming: { results: [{ id: 'r1', name: '云澜城' }], favorites: [{ id: 'f1', name: '玄冰剑' }] }, outlineChat: [] };
  await window.electronAPI.storageWrite('wa_project_scan_p4b_test', proj);
  const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
  await store.loadProject('scan_p4b_test');
  const m = store.memories;
  return {
    totalsIsPlain: JSON.stringify(m.meta.totals),
    totalsKeys: m.meta.totals ? Object.keys(m.meta.totals) : null,
    totalsJson: JSON.stringify(m.meta.totals || null),
    entitiesLen: m.entities.length,
    namingRaw: JSON.stringify(store.aiNaming),
    namingKeys: Object.keys(store.aiNaming || {}),
    namingResultsLen: (store.aiNaming && store.aiNaming.results) ? store.aiNaming.results.length : 'NO_RESULTS_KEY',
    normalizeDirect: JSON.stringify((() => { const { normalizeAiNaming } = { }; return 'inline-skip'; })())
  };
})()`);
console.log(JSON.stringify(ok, null, 2));
// check normalizeAiNaming source
await ev(`(async () => {
  await window.electronAPI.storageRemove('wa_project_scan_p4b_test');
  const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
  store.currentProjectId='default'; store.projectName=''; store.volumes=[]; store.chapters=[]; store.memories=null;
  return true;
})()`);
ws.close();process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
