const http = require('http');
const fs = require('fs');
const ws = require('ws');

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  const targets = await httpGet('http://127.0.0.1:9227/json');
  const page = targets[0];
  const wsUrl = page.webSocketDebuggerUrl;
  console.log('Connecting to:', wsUrl);
  
  const socket = new ws(wsUrl);
  let msgId = 1;
  
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const msg = JSON.stringify({ id, method, params });
      socket.send(msg);
      const handler = (data) => {
        const resp = JSON.parse(data.toString());
        if (resp.id === id) {
          socket.removeListener('message', handler);
          resolve(resp);
        }
      };
      socket.on('message', handler);
      setTimeout(() => reject(new Error('Timeout for ' + method)), 10000);
    });
  }
  
  await new Promise((resolve) => socket.on('open', resolve));
  console.log('Connected');
  
  // 启用 Runtime
  await send('Runtime.enable');
  
  // 检查 PipelinePanel 是否加载
  const panelCheck = await send('Runtime.evaluate', {
    expression: "document.querySelector('#pipeline-panel') !== null",
    returnByValue: true,
    awaitPromise: false
  });
  console.log('PipelinePanel present:', JSON.stringify(panelCheck.result));
  
  // 检查 outlineLocked 状态
  const outlineCheck = await send('Runtime.evaluate', {
    expression: "(window.__vue_app__ && window.__vue_app__.config.globalProperties.) ? window.__vue_app__.config.globalProperties..state.value.project.outlineLocked : 'no pinia'",
    returnByValue: true,
    awaitPromise: false
  });
  console.log('outlineLocked:', JSON.stringify(outlineCheck.result));
  
  // 检查 currentStep
  const stepCheck = await send('Runtime.evaluate', {
    expression: "(window.__vue_app__ && window.__vue_app__.config.globalProperties.) ? window.__vue_app__.config.globalProperties..state.value.pipeline.currentStep : 'no pinia'",
    returnByValue: true,
    awaitPromise: false
  });
  console.log('currentStep:', JSON.stringify(stepCheck.result));
  
  // 截图
  const ss = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\codex\\novel-workshop-vue3\\test_ss.png', Buffer.from(ss.result.data, 'base64'));
  console.log('Screenshot saved');
  
  // 尝试点击侧边栏的大纲按钮
  const sidebarBtns = await send('Runtime.evaluate', {
    expression: "Array.from(document.querySelectorAll('.sidebar-nav-btn')).map(b => ({ text: b.innerText.slice(0, 20), title: b.title, visible: b.offsetParent !== null }))",
    returnByValue: true,
    awaitPromise: false
  });
  console.log('Sidebar buttons:', JSON.stringify(sidebarBtns.result));
  
  socket.close();
  console.log('\\nDone');
}

main().catch(e => { console.error(e); process.exit(1); });
