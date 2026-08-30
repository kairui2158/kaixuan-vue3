const http = require('http');

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9227, path: pathname }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  const pages = await getJson('/json');
  const page = pages.find((item) => item.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const resolve = pending.get(message.id);
      pending.delete(message.id);
      resolve(message.result);
    }
  });
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  const expression = `(() => {
    const out = [];
    let el = document.querySelector('#messages-list');
    while (el) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      out.push({
        selector: el.id ? '#' + el.id : (el.className || el.tagName).toString().split(' ')[0],
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        display: style.display,
        overflow: style.overflow,
        minHeight: style.minHeight,
        flex: style.flex
      });
      el = el.parentElement;
    }
    return out;
  })()`;
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  console.log(JSON.stringify(result.result.value, null, 2));
  ws.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
