var fs = require('fs');
var WebSocket = require('C:/Users/凯瑞/Documents/New project 2/node_modules/ws');
var OUT = 'D:/codex/novel-workshop-vue3/_audit';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
var ws = new WebSocket('ws://localhost:9224/devtools/page/CB7B5B4DE2C26FCFBDE62096307CE3C0');
var msgId = 0;
var commands = [];
var results = [];
ws.on('open', function() {
  console.log('[OK] WS open');
  msgId = 1;
  ws.send(JSON.stringify({ id: 1, method: 'Page.enable', params: {} }));
  msgId = 2;
  ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable', params: {} }));
  msgId = 3;
  ws.send(JSON.stringify({ id: 3, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  var expr = '(function(){var r={buttons:[],selects:[],inputs:[],panels:[],errors:[]};';
  expr += 'document.querySelectorAll("button").forEach(function(b){var rect=b.getBoundingClientRect();r.buttons.push({text:b.textContent.trim().substring(0,80),id:b.id,cls:b.className,title:b.title,vis:rect.width>0,x:Math.round(rect.x),y:Math.round(rect.y),dis:b.disabled});});';
  expr += 'document.querySelectorAll("select").forEach(function(s){var rect=s.getBoundingClientRect();var o=[];for(var i=0;i<Math.min(s.options.length,10);i++)o.push(s.options[i].textContent.trim());r.selects.push({id:s.id,cls:s.className,vis:rect.width>0,opts:s.options.length,sample:o,x:Math.round(rect.x),y:Math.round(rect.y)});});';
  expr += 'document.querySelectorAll("input").forEach(function(inp){var rect=inp.getBoundingClientRect();r.inputs.push({type:inp.type,id:inp.id,cls:inp.className,vis:rect.width>0,placeholder:inp.placeholder});});';
  expr += 'document.querySelectorAll("[class*=panel],[class*=modal],[class*=sidebar],[class*=settings],[class*=pipeline],[class*=editor],[class*=chat]").forEach(function(p){var rect=p.getBoundingClientRect();if(rect.width>50||rect.height>50){r.panels.push({tag:p.tagName,cls:p.className.substring(0,80),vis:rect.width>0,x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height),txt:p.textContent.trim().substring(0,100)});}});';
  expr += 'var ee=document.querySelectorAll("[class*=error],[class*=err],[class*=warn]");ee.forEach(function(e){if(e.textContent.trim())r.errors.push({cls:e.className,txt:e.textContent.trim().substring(0,100)});});';
  expr += 'r.body=document.body?document.body.textContent.substring(0,500):"empty";r.url=window.location.href;r.title=document.title;r.vw=window.innerWidth;r.vh=window.innerHeight;';
  expr += 'return JSON.stringify(r);})()';
  msgId = 4;
  ws.send(JSON.stringify({ id: 4, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
});
ws.on('message', function(data, isBinary) {
  var msg = JSON.parse(data.toString());
  console.log('[MSG] id=' + msg.id);
  if (msg.id === 3 && msg.result && msg.result.data) {
    fs.writeFileSync(OUT + '/shot_01_main.png', Buffer.from(msg.result.data, 'base64'));
    console.log('[OK] Screenshot saved');
  }
  if (msg.id === 4 && msg.result && msg.result.result && msg.result.result.value) {
    var scan = JSON.parse(msg.result.result.value);
    console.log('[OK] Buttons: ' + scan.buttons.length + ' Selects: ' + scan.selects.length + ' Inputs: ' + scan.inputs.length + ' Panels: ' + scan.panels.length + ' Errors: ' + scan.errors.length);
    console.log('[OK] Viewport: ' + scan.vw + 'x' + scan.vh + ' URL: ' + scan.url + ' Title: ' + scan.title);
    fs.writeFileSync(OUT + '/scan_01_main.json', JSON.stringify(scan, null, 2));
    scan.buttons.forEach(function(b,i){console.log('  btn['+i+'] text="'+b.text+'" vis='+b.vis+' dis='+b.dis+' pos=('+b.x+','+b.y+')');});
    scan.selects.forEach(function(s,i){console.log('  sel['+i+'] opts='+s.opts+' vis='+s.vis+' sample='+JSON.stringify(s.sample));});
    scan.panels.forEach(function(p,i){console.log('  pnl['+i+'] cls='+p.cls.substring(0,50)+' vis='+p.vis+' '+p.w+'x'+p.h);});
    scan.errors.forEach(function(e,i){console.log('  ERR['+i+'] '+e.txt);});
    console.log('[DONE]');
    ws.close();
    process.exit(0);
  }
});
ws.on('error', function(e) { console.log('[ERR] ' + e.message); process.exit(1); });
setTimeout(function() { console.log('[ERR] Timeout'); process.exit(1); }, 20000);
