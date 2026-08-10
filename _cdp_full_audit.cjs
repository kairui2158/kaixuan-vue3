const WebSocket=require('C:/Users/凯瑞/Documents/New project 2/node_modules/ws');
const fs=require('fs');
const path=require('path');
const http=require('http');
const PORT=9224,OUT='D:/codex/novel-workshop-vue3/_audit';
let id=1,ws;
const R={ts:new Date().toISOString(),shots:[],scans:[],errs:[]};
function send(m,p={}){return new Promise((res,rej)=>{const i=id++;ws.send(JSON.stringify({id:i,method:m,params:p}),e=>{if(e)return rej(e);const h=d=>{const msg=JSON.parse(d);if(msg.id===i){ws.removeListener('message',h);res(msg.result||msg.error);}};ws.on('message',h);});});}
function ev(e){return send('Runtime.evaluate',{expression:e,returnByValue:true}).then(r=>r.result?r.result.value:null).catch(()=>null);}
async function shot(n){try{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,n+'.png'),Buffer.from(r.data,'base64'));R.shots.push({n});console.log('[OK] '+n);}catch(e){R.errs.push({n,e:e.message});}}
async function click(x,y){await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});}
async function scan(l){const s=await ev(`(()=>{const b=Array.from(document.querySelectorAll('button')).map(b=>({t:b.textContent.trim().substring(0,40),c:b.className.substring(0,50),v:b.offsetParent!==null,d:b.disabled}));const s=Array.from(document.querySelectorAll('select')).map(s=>({c:s.className.substring(0,50),n:s.options.length,o:Array.from(s.options).map(o=>o.text).join('|'),v:s.offsetParent!==null}));const i=Array.from(document.querySelectorAll('input,textarea')).map(i=>({t:i.type||i.tagName.toLowerCase(),c:i.className.substring(0,50),p:i.placeholder,v:i.offsetParent!==null}));const p=Array.from(document.querySelectorAll('[class*=panel],[class*=modal],[class*=sidebar],[class*=editor],[class*=chat],[class*=pipeline],[class*=settings],[class*=deai]')).map(p=>({c:p.className.substring(0,60),v:p.offsetParent!==null,n:p.children.length}));return{label:l,title:document.title,buttons:b,selects:s,inputs:i,panels:p,body:document.body?document.body.innerText.substring(0,300):''};})()`);R.scans.push(s);console.log('[OK] scan '+l);return s;}
async function cs(sel,l,i=0){const c=await ev(`(()=>{const e=document.querySelectorAll('${sel}');if(e.length<=${i})return null;const r=e[${i}].getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);if(!c){R.errs.push({s:l,e:'nf'});console.log('[ERR] '+l);return;}await click(c.x,c.y);await new Promise(r=>setTimeout(r,1500));await shot(l);await scan(l);}
async function main(){
console.log('=== CDP Audit ===');
const t=await new Promise((res,rej)=>{http.get('http://127.0.0.1:'+PORT+'/json',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d).find(t=>t.type==='page')));}).on('error',rej);});
if(!t){console.log('[ERR] No target');process.exit(1);}
ws=new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r,e)=>{ws.on('open',r);ws.on('error',e);});
console.log('[OK] Connected');
await send('Page.enable');await send('Runtime.enable');
await new Promise(r=>setTimeout(r,1000));
await shot('01_main');await scan('01_main');
const navN=await ev(`document.querySelectorAll('.sidebar-btn,nav button,[class*=sidebar-nav] button').length`);
console.log('[INFO] nav:'+navN);
for(let i=0;i<Math.min(navN,8);i++){await cs('.sidebar-btn,nav button,[class*=sidebar-nav] button','02_nav'+i,i);}
await cs('button[class*=setting],[class*=settings] button,#btn-settings','03_settings');
const tabN=await ev(`document.querySelectorAll('[class*=tab],[role=tab]').length`);
console.log('[INFO] tabs:'+tabN);
for(let i=0;i<Math.min(tabN,8);i++){await cs('[class*=tab],[role=tab]','04_tab'+i,i);}
await ev(`document.querySelector('[class*=modal] [class*=close],[class*=modal] button[class*=close]')?.click()`);
await new Promise(r=>setTimeout(r,1000));
await cs('button[class*=pipeline],[class*=pipeline] button,#btn-pipeline','05_pipeline');
const ci=await ev(`(()=>{const t=document.querySelector('textarea,.chat-input textarea,.chat-input input');if(!t)return{found:false};return{found:true,tag:t.tagName,c:t.className,p:t.placeholder,v:t.offsetParent!==null};})()`);
R.scans.push({label:'chat_input',...ci});
console.log('[OK] chat:'+ci.found);
await cs('button[class*=deai],button[class*=de-ai],#btn-deai','06_deai');
const as=await ev(`Array.from(document.querySelectorAll('select')).map((s,i)=>({i,c:s.className.substring(0,50),n:s.options.length,o:Array.from(s.options).map(o=>o.text).join('|'),v:s.value}))`);
R.scans.push({label:'all_selects',selects:as});
fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(R,null,2));
console.log('Done: shots='+R.shots.length+' scans='+R.scans.length+' errs='+R.errs.length);
ws.close();process.exit(0);}
main().catch(e=>{console.error('[FATAL]',e);process.exit(1);});
