const http=require('http');
http.get({host:'127.0.0.1',port:9227,path:'/json'},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{
  const pages=JSON.parse(d); const page=pages.find(p=>p.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data); if(m.id===1){
    console.log(JSON.stringify(m.result&&m.result.result&&m.result.result.value,null,1));
    ws.close(); process.exit(0);
  }});
  ws.addEventListener('open',()=>{
    ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{
      expression:"(async()=>{ let modal=document.querySelector('.project-modal-content'); if(!modal){document.getElementById('btn-open-project')?.click(); await new Promise(r=>setTimeout(r,600));} modal=document.querySelector('.project-modal-content'); if(!modal) return {error:'modal missing'}; return [...modal.querySelectorAll('.project-item')].map(el=>({name:el.querySelector('.project-item-name')?.textContent.trim(), hasLoad:!!el.querySelector('.btn-primary'), hasDel:!!el.querySelector('.btn-danger')})); })()",
      returnByValue:true, awaitPromise:true}}));
  });
  setTimeout(()=>{console.error('timeout');process.exit(1);},10000);
});});
