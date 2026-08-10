const WebSocket = require('C:/Users/凯瑞/Documents/New project 2/node_modules/ws');
const fs = require('fs');
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
let mid = 1;
function send(method, params={}) {
  return new Promise((resolve,reject)=>{
    const id = mid++;
    ws.send(JSON.stringify({id,method,params}));
    const h = (data)=>{
      const msg = JSON.parse(data);
      if(msg.id===id){ws.removeListener('message',h);resolve(msg.result||{});}
    };
    ws.on('message',h);
  });
}
function evalJS(expr){return send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r.result?r.result.value:null);}
ws.on('open', async ()=>{
  try{
    await send('Page.enable');
    await send('Runtime.enable');
    await new Promise(r=>setTimeout(r,800));
    // screenshot
    const shot = await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/01_main.png', Buffer.from(shot.data,'base64'));
    console.log('[OK] screenshot saved');
    // DOM scan
    const scan = await evalJS(`(()=>{
      const buttons = Array.from(document.querySelectorAll('button')).map(b=>({t:(b.textContent||'').trim().substring(0,50),c:(b.className||'').substring(0,60),v:b.offsetParent!==null,d:b.disabled,id:b.id}));
      const selects = Array.from(document.querySelectorAll('select')).map(s=>({c:(s.className||'').substring(0,50),n:s.options.length,o:Array.from(s.options).map(o=>o.text).join('|'),v:s.value,id:s.id}));
      const inputs = Array.from(document.querySelectorAll('input,textarea')).map(i=>({t:i.tagName.toLowerCase(),c:(i.className||'').substring(0,50),p:i.placeholder,v:i.offsetParent!==null,id:i.id}));
      const panels = Array.from(document.querySelectorAll('[class*=panel],[class*=modal],[class*=sidebar],[class*=editor],[class*=chat]')).map(p=>({c:(p.className||'').substring(0,80),v:p.offsetParent!==null,ch:p.children.length}));
      const title = document.title;
      const bodyText = document.body ? document.body.innerText.substring(0,500) : '';
      return JSON.stringify({title,buttons,selects,inputs,panels,bodyText});
    })()`);
    const parsed = JSON.parse(scan);
    fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/scan_01.json', JSON.stringify(parsed,null,2));
    console.log('[OK] scan saved');
    console.log('Buttons: ' + parsed.buttons.length);
    console.log('Selects: ' + parsed.selects.length);
    console.log('Inputs: ' + parsed.inputs.length);
    console.log('Panels: ' + parsed.panels.length);
    console.log('Title: ' + parsed.title);
    console.log('BodyText: ' + parsed.bodyText.substring(0,200));
    ws.close();
    process.exit(0);
  }catch(e){console.error('[ERR]',e.message);ws.close();process.exit(1);}
});
ws.on('error',(e)=>{console.error('[WS_ERR]',e.message);process.exit(1);});