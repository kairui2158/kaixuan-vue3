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
  
  const socket = new ws(page.webSocketDebuggerUrl);
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
  
  await send('Page.enable');
  await send('Runtime.enable');
  
  // 获取完整 DOM - 侧边栏区域
  const dom = await send('Runtime.evaluate', {
    expression: 'document.querySelector("nav") ? document.querySelector("nav").outerHTML.slice(0, 3000) : document.body.innerHTML.slice(0, 3000)',
    returnByValue: true,
    awaitPromise: false
  });
  console.log('DOM snippet:', dom.result.value);
  
  // 获取所有按钮
  const btns = await send('Runtime.evaluate', {
    expression: 'Array.from(document.querySelectorAll("button")).map(b => b.id + "|" + b.innerText.slice(0,30) + "|" + (b.offsetParent!==null)).join("\\n")',
    returnByValue: true,
    awaitPromise: false
  });
  console.log('\\nAll buttons:', btns.result.value);
  
  socket.close();
}

main().catch(e => { console.error(e); process.exit(1); });
