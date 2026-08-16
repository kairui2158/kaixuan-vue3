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
      setTimeout(() => reject(new Error('Timeout for ' + method)), 15000);
    });
  }
  
  await new Promise((resolve) => socket.on('open', resolve));
  console.log('Connected');
  
  await send('Page.enable');
  await send('Runtime.enable');
  
  // 获取大纲工作台按钮
  const r1 = await send('Runtime.evaluate', {
    expression: 'document.querySelector("button") ? document.querySelector("button").outerHTML : "no button"',
    returnByValue: true,
    awaitPromise: false
  });
  console.log('First button:', r1.result.value);
  
  // 获取所有 visible button 的文本
  const r2 = await send('Runtime.evaluate', {
    expression: 'Array.from(document.querySelectorAll("button")).filter(b=>b.offsetParent!==null).map(b=>b.innerText).join(",")',
    returnByValue: true,
    awaitPromise: false
  });
  console.log('Visible buttons:', r2.result.value);
  
  // 侧边栏 nav
  const r3 = await send('Runtime.evaluate', {
    expression: 'document.querySelector("nav") ? document.querySelector("nav").innerText.slice(0,500) : "no nav"',
    returnByValue: true,
    awaitPromise: false
  });
  console.log('Nav text:', r3.result.value);
  
  // 检查 Pinia 状态
  const r4 = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({outlineLocked: document.querySelector("textarea")?.readonly, textareaCount: document.querySelectorAll("textarea").length})',
    returnByValue: true,
    awaitPromise: false
  });
  console.log('State:', r4.result.value);
  
  // 截图
  const ss = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\codex\\novel-workshop-vue3\\test_ss.png', Buffer.from(ss.result.data, 'base64'));
  console.log('Screenshot saved to test_ss.png');
  
  socket.close();
  console.log('Done');
}

main().catch(e => { console.error(e); process.exit(1); });
