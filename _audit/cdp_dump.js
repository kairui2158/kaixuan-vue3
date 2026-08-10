const http = require('http');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && t.url.includes('localhost'));
  if (!page) { console.log('NO PAGE'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  function evalJS(expr) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    });
  }

  ws.addEventListener('open', async () => {
    // Get body innerHTML length and first 2000 chars
    const r1 = await evalJS('document.body.innerHTML.length');
    console.log('Body HTML length: ' + (r1.result?.result?.value || 'ERR'));

    const r2 = await evalJS('document.body.innerHTML.substring(0, 2000)');
    console.log('Body HTML preview:\n' + (r2.result?.result?.value || 'ERR'));

    const r3 = await evalJS('document.querySelectorAll("#app").length + " app divs: " + document.querySelectorAll("#app > *").length');
    console.log('App info: ' + (r3.result?.result?.value || 'ERR'));

    const r4 = await evalJS('document.title');
    console.log('Title: ' + (r4.result?.result?.value || 'ERR'));

    const r5 = await evalJS('Array.from(document.querySelectorAll("button")).map(b=>b.textContent.trim()).filter(t=>t).join(" | ")');
    console.log('Buttons: ' + (r5.result?.result?.value || 'NONE'));

    const r6 = await evalJS('Array.from(document.querySelectorAll("select")).map(s=>s.id+":"+s.className).join(" | ")');
    console.log('Selects: ' + (r6.result?.result?.value || 'NONE'));

    const r7 = await evalJS('Array.from(document.querySelectorAll("[class*=tab],[class*=nav],[role=tab]")).map(e=>e.textContent.trim()).join(" | ")');
    console.log('Tabs/Nav: ' + (r7.result?.result?.value || 'NONE'));

    ws.close();
    process.exit(0);
  });

  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);
}
main().catch(e => { console.log('ERR: ' + e.message); process.exit(1); });
