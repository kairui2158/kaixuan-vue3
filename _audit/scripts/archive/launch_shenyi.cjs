const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const root = 'D:\\codex\\novel-workshop-vue3';
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const port = 9227;

if (!fs.existsSync(electron)) {
  console.error('[LAUNCH] electron.exe not found: ' + electron);
  process.exit(1);
}

const child = spawn(electron, [
  '--remote-debugging-port=' + port,
  '--remote-allow-origins=*',
  root
], {
  cwd: root,
  detached: true,
  windowsHide: false,
  stdio: 'ignore'
});

child.unref();
console.log('[LAUNCH] spawn ok pid=' + child.pid);

function checkCdp() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json', timeout: 1000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const list = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve({ ok: true, pages: list.length });
        } catch (e) {
          resolve({ ok: false, pages: 0 });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, pages: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, pages: 0 }); });
  });
}

const started = Date.now();
const timer = setInterval(async () => {
  const state = await checkCdp();
  if (state.ok) {
    clearInterval(timer);
    console.log('[LAUNCH] cdp ready pages=' + state.pages + ' afterMs=' + (Date.now() - started));
    process.exit(0);
  }
  if (Date.now() - started > 30000) {
    clearInterval(timer);
    console.error('[LAUNCH] cdp not ready after 30s');
    process.exit(2);
  }
}, 1000);
