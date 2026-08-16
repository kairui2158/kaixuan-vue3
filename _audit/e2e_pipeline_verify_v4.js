const http = require('http');
const WebSocket = require('ws');

const PORT = 9227;
const results = [];

function log(name, detail) {
  const line = `[${new Date().toISOString()}] ${name}: ${JSON.stringify(detail)}`;
  results.push(line);
  console.log(line);
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
  }
  open() {
    return new Promise((resolve) => this.ws.once('open', resolve));
  }
  send(method, params = {}) {
    const reqId = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }
  listen() {
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      return { exception: res.exceptionDetails.text, detail: res.exceptionDetails.exception };
    }
    return res.result;
  }
  async getBox(selector) {
    const res = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, text: el.textContent.slice(0, 80) };
    })()`);
    return res.value || null;
  }
  async clickSelector(selector, label) {
    const box = await this.getBox(selector);
    if (!box) throw new Error('No box for ' + selector);
    await this.clickBox(box, label + ':' + selector);
    return box;
  }
  async clickBox(box, label) {
    log('click', { label, cx: Math.round(box.cx), cy: Math.round(box.cy) });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.cx, y: box.cy });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.cx, y: box.cy, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.cx, y: box.cy, button: 'left', clickCount: 1 });
  }
  async setInput(selector, value, label) {
    const box = await this.getBox(selector);
    if (!box) throw new Error('No input box for ' + selector);
    log('input-set', { label, selector, value });
    await this.clickBox(box, label + ':focus');
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await this.send('Input.insertText', { text: String(value) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  }
}

async function main() {
  const targets = await getJson(`http://localhost:${PORT}/json`);
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('no page target');
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  cdp.listen();
  log('cdp-connected', { url: page.url });

  const root = await cdp.evaluate(`(() => ({
    title: document.title,
    bodyText: document.body ? document.body.innerText.slice(0, 500) : '',
    appLoaded: !!(document.querySelector('#app') && document.querySelector('#app').children.length > 0),
    pipelineRendered: !!document.querySelector('#pipeline-panel'),
    buttons: [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => ({
      id: b.id,
      text: (b.textContent || '').trim().slice(0, 40),
      disabled: b.disabled
    })).slice(0, 80)
  }))()`);
  log('app-snapshot', root.value);

  if (!root.value.pipelineRendered) {
    log('open-pipeline-attempt', { found: true });
    const openBtn = await cdp.getBox('#btn-open-pipeline, [onclick*="pipeline"], .sidebar-btn:has-text("pipeline")');
    if (openBtn) {
      await cdp.clickBox(openBtn, 'open-pipeline');
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  // Look for any visible interactive path that switches activePanel to 'pipeline'.
  const navProbe = await cdp.evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button, [data-panel], [data-view]')]
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        tag: el.tagName,
        id: el.getAttribute('id') || '',
        cls: (el.className && String(el.className)) || '',
        text: (el.textContent || '').trim().slice(0, 30),
        attrs: [...el.attributes].filter(a => /panel|pipeline|view|nav/i.test(a.name)).map(a => a.name + '=' + a.value)
      }))
      .filter(x => /pipeline|流水线|panel|view|nav/i.test(JSON.stringify(x)));
    return buttons.slice(0, 60);
  })()`);
  log('pipeline-nav-probes', navProbe.value);

  await cdp.send('Page.captureScreenshot', { format: 'png' });
  log('screenshot-done', {});
  process.stdout.write(JSON.stringify({ results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
