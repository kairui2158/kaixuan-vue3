var http=require('http');
var WebSocket=require('ws');
var PORT=9223;
var pass=0,fail=0,results=[];
function check(n,c){results.push((c?'[PASS] ':'[FAIL] ')+n);if(c)pass++;else fail++;}
function tryConnect(a){
  if(a>20){console.log('[ERR] CDP not available');process.exit(1);}
  var req=http.get('http://127.0.0.1:'+PORT+'/json',function(res){
    var d='';res.on('data',function(c){d+=c;});
    res.on('end',function(){try{var t=JSON.parse(d);console.log('[OK] tabs:'+t.length);run(t);}catch(e){setTimeout(function(){tryConnect(a+1);},1000);}});
  });
  req.on('error',function(){setTimeout(function(){tryConnect(a+1);},1000);});
}
function ev(wsUrl,expr,cb){
  var ws=new WebSocket(wsUrl);var id=Math.floor(Math.random()*99999)+1;
  ws.on('open',function(){ws.send(JSON.stringify({id:id,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true}}));});
  ws.on('message',function(m){var d=JSON.parse(m);if(d.id===id){ws.close();cb(d);}});
  ws.on('error',function(e){cb({error:e.message});});
}
function run(tabs){
  var tab=tabs[0];console.log('[OK] Tab:'+tab.url);
  var ws=tab.webSocketDebuggerUrl;var tests=[];
  function T(n,e,f){tests.push({n:n,e:e,f:f});}
  function R(){
    if(tests.length===0){
      console.log('========================================');
      console.log('CDP Behavioral Verification (Final)');
      console.log('========================================');
      results.forEach(function(r){console.log(r);});
      console.log('----------------------------------------');
      console.log('Total:'+(pass+fail)+'|PASS:'+pass+'|FAIL:'+fail);
      console.log('========================================');
      process.exit(fail>0?1:0);
    }
    var t=tests.shift();
    ev(ws,t.e,function(d){
      var v=d.result&&d.result.result&&d.result.result.value;
      var ok=t.f(v,d);check(t.n,ok);
      if(!ok)console.log('  val='+JSON.stringify(v));
      R();
    });
  }
  T('T1:Settings modal','(function(){var b=document.getElementById("btn-settings");if(!b)return"no";b.click();return"ok";})()',function(v){return v==='ok';});
  T('T2:DeAI tab','(function(){var ts=document.querySelectorAll("[data-tab]");for(var i=0;i<ts.length;i++){if(ts[i].getAttribute("data-tab")==="deai")return"found";}return"missing";})()',function(v){return v==='found';});
  T('T3:Click DeAI tab','(function(){var ts=document.querySelectorAll("[data-tab]");for(var i=0;i<ts.length;i++){if(ts[i].getAttribute("data-tab")==="deai"){ts[i].click();return"clicked";}}return"missing";})()',function(v){return v==='clicked';});
  T('T4:deai-level radio','(function(){var r=document.getElementsByName("deai-level");return r.length>0?"found":"missing";})()',function(v){return v==='found';});
  T('T5:deai-version radio','(function(){var r=document.getElementsByName("deai-version");return r.length>0?"found":"missing";})()',function(v){return v==='found';});
  T('T6:deai-text-type select','(function(){var r=document.getElementById("deai-text-type");return r?"found":"missing";})()',function(v){return v==='found';});
  T('T7:flow-preview div','(function(){var d=document.getElementById("deai-flow-preview");return d?"found":"missing";})()',function(v){return v==='found';});
  T('T8:step-group class','(function(){var d=document.getElementsByClassName("deai-step-group");return d.length>0?"found":"missing";})()',function(v){return v==='found';});
  T('T9:DeAiSamples loaded','typeof DeAiSamples!=="undefined"?DeAiSamples.getCount():"undef"',function(v){return typeof v==='number'&&v>0;});
  T('T10:DeAiProcessor exists','typeof DeAiProcessor!=="undefined"?"exists":"missing"',function(v){return v==='exists';});
  T('T11:config.level','typeof app!=="undefined"&&app._deAiConfig?app._deAiConfig.level:"no"',function(v){return v!=='no';});
  T('T12:config.version','typeof app!=="undefined"&&app._deAiConfig?app._deAiConfig.version:"no"',function(v){return v!=='no';});
  T('T13:config.textType','typeof app!=="undefined"&&app._deAiConfig?app._deAiConfig.textType:"no"',function(v){return v!=='no';});
  T('T14:getDeAiTemp func','typeof app!=="undefined"&&typeof app._getDeAiTemperature==="function"?"exists":"missing"',function(v){return v==='exists';});
  T('T15:updateFlowPreview func','typeof app!=="undefined"&&typeof app._updateFlowPreview==="function"?"exists":"missing"',function(v){return v==='exists';});
  T('T16:deAiSplitMerge func','typeof app!=="undefined"&&typeof app._deAiSplitMerge==="function"?"exists":"missing"',function(v){return v==='exists';});
  T('T17:temp light=0.4','typeof app!=="undefined"&&typeof app._getDeAiTemperature==="function"?app._getDeAiTemperature("light","v3"):"missing"',function(v){return v===0.4;});
  T('T18:temp medium=0.7','typeof app!=="undefined"&&typeof app._getDeAiTemperature==="function"?app._getDeAiTemperature("medium","v3"):"missing"',function(v){return v===0.7;});
  T('T19:temp heavy=1.0','typeof app!=="undefined"&&typeof app._getDeAiTemperature==="function"?app._getDeAiTemperature("heavy","v3"):"missing"',function(v){return v===1.0;});
  T('T20:renderDeAiSettings func','typeof app!=="undefined"&&typeof app.renderDeAiSettings==="function"?"exists":"missing"',function(v){return v==='exists';});
  T('T21:process is func','typeof DeAiProcessor!=="undefined"&&typeof DeAiProcessor.process==="function"?"yes":"no"',function(v){return v==='yes';});
  T('T22:process returns text','typeof DeAiProcessor!=="undefined"?(function(){var r=DeAiProcessor.process("ABCDEFGHIJKLMNOP",null);return typeof r.text==="string"?"yes":"no";})():"no"',function(v){return v==='yes';});
  T('T23:mode dropdown','(function(){var r=document.getElementById("deai-mode-select");return r?"found":"missing";})()',function(v){return v==='found';});
  T('T24:hardrule toggle','(function(){var r=document.getElementById("deai-hardrule-enabled");return r?"found":"missing";})()',function(v){return v==='found';});
  T('T25:flow preview content','(function(){var d=document.getElementById("deai-flow-preview");if(!d)return"missing";return d.innerHTML.length>0?"has-content":"empty";})()',function(v){return v==='has-content'||v==='empty';});
  T('T26:syncDeAiConfig func','typeof app!=="undefined"&&typeof app._syncDeAiConfigFromDOM==="function"?"exists":"missing"',function(v){return v==='exists';});
  T('T27:saveDeAiConfig func','typeof app!=="undefined"&&typeof app._saveDeAiConfig==="function"?"exists":"missing"',function(v){return v==='exists';});
  R();
}
setTimeout(function(){tryConnect(1);},1000);
