const WebSocket = require('ws');
const http = require('http');

http.get('http://localhost:9227/json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const page = JSON.parse(data)[0];
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const pending = {};
    let msgId = 1;
    
    ws.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    });
    
    function send(cmd) {
      return new Promise((resolve, reject) => {
        cmd.id = msgId++;
        const timeout = setTimeout(() => reject(new Error('timeout')), 8000);
        pending[cmd.id] = (r) => { clearTimeout(timeout); resolve(r); };
        ws.send(JSON.stringify(cmd));
      });
    }
    
    ws.on('open', async () => {
      try {
        // 当前在步骤3（卷纲 currentStep=2），需要添加卷纲
        // 检查卷纲的按钮
        var btn = await send({method: 'Runtime.evaluate', params: {
          expression: "(function() { var els = {}; ['btn-pl-confirm-volumes','btn-pl-confirm-chapters','btn-pl-confirm-body'].forEach(function(id) { var el = document.getElementById(id); if (el) { els[id] = {tag: el.tagName, disabled: el.disabled, visible: el.offsetParent !== null, text: (el.textContent || '').substring(0, 30)}; } }); return JSON.stringify(els); })()"
        }});
        console.log('BTNS:', btn.result.result.value);
        
        // 检查卷纲的容器
        var vol = await send({method: 'Runtime.evaluate', params: {
          expression: "(function() { var el = document.getElementById('pl-volume-cards'); return JSON.stringify({exists: !!el, visible: el ? el.offsetParent !== null : false, innerHTML: el ? el.innerHTML.substring(0, 100) : 'no'}); })()"
        }});
        console.log('VOL_CARDS:', vol.result.result.value);
        
        // 添加卷纲数据
        var addVol = await send({method: 'Runtime.evaluate', params: {
          expression: "(function() { try { var pinia = document.querySelector('#app').__vue_app__.config.globalProperties['$pinia']; pinia.state.value.project.volumes = [{id: 'vol_1', name: '第一卷：初入修仙', outline: '主角出生在一个普通村庄，意外获得修仙机缘。', summary: '入门篇', confirmed: true}]; return 'added'; } catch(e) { return 'ERR:' + e.message; } })()"
        }});
        console.log('ADD_VOL:', addVol.result.result.value);
        await new Promise(r => setTimeout(r, 500));
        
        // 再次检查按钮
        var btn2 = await send({method: 'Runtime.evaluate', params: {
          expression: "(function() { var el = document.getElementById('btn-pl-confirm-volumes'); return JSON.stringify({disabled: el ? el.disabled : 'no-el', visible: el ? el.offsetParent !== null : 'no-el'}); })()"
        }});
        console.log('BTN_VOL:', btn2.result.result.value);
        
        // 点击卷纲确认
        var click = await send({method: 'Runtime.evaluate', params: {
          expression: "(function() { var el = document.getElementById('btn-pl-confirm-volumes'); if (el && !el.disabled) { el.click(); return 'clicked'; } return 'disabled:' + (el ? el.disabled : 'no-el'); })()"
        }});
        console.log('CLICK_VOL:', click.result.result.value);
        await new Promise(r => setTimeout(r, 500));
        
        // 检查步骤变化
        var state = await send({method: 'Runtime.evaluate', params: {
          expression: "(function() { try { var pinia = document.querySelector('#app').__vue_app__.config.globalProperties['$pinia']; return JSON.stringify({currentStep: pinia.state.value.pipeline.currentStep}); } catch(e) { return 'ERR:' + e.message; } })()"
        }});
        console.log('STATE:', state.result.result.value);
        
        var dom = await send({method: 'Runtime.evaluate', params: {
          expression: "(function() { var els = {}; ['pl-step-1-content','pl-step-2-content','pl-step-3-content','pl-step-4-content','pl-step-5-content'].forEach(function(id) { var el = document.getElementById(id); if (el) { els[id] = {display: window.getComputedStyle(el).display, visible: el.offsetParent !== null}; } }); return JSON.stringify(els); })()"
        }});
        console.log('DOM:', dom.result.result.value);
        
      } catch(e) { console.log('ERROR:', e.message); }
      ws.close();
    });
  });
}).on('error', (e) => { console.log('HTTP_ERROR:', e.message); });
