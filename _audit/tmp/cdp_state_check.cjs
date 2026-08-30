const http=require('http');
http.get({host:'127.0.0.1',port:9227,path:'/json'},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{
  const pages=JSON.parse(d); const page=pages.find(p=>p.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  let id=0;
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data); if(m.id===1){
    console.log(JSON.stringify(m.result&&m.result.result&&m.result.result.value));
    ws.close(); process.exit(0);
  }});
  ws.addEventListener('open',()=>{
    ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{
      expression:"({projName: document.querySelector('.project-name')?.textContent.trim()||null, plVisible: !!document.getElementById('pl-steps'), outlineNav: !!document.getElementById('btn-outline-workspace'), projModal: !!document.querySelector('.project-modal-content')})",
      returnByValue:true}}));
  });
  setTimeout(()=>{console.error('timeout');process.exit(1);},10000);
});});
