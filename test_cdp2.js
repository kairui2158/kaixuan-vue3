const http = require('http');
const fs = require('fs');

function httpGet(url) {
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
  console.log('Found', targets.length, 'targets');
  targets.forEach(t => {
    console.log('  -', t.title, '|', t.url.slice(0, 80));
  });
  
  // 找到目标页面
  const page = targets.find(t => t.url && t.url.includes('index.html'));
  if (!page) {
    console.log('No target page found, using first available');
    // 用第一个
    if (targets.length > 0) {
      const first = targets[0];
      console.log('Using:', first.title, first.webSocketDebuggerUrl.slice(0, 60));
    }
    return;
  }
  console.log('Using page:', page.title);
}

main().catch(e => { console.error(e); process.exit(1); });
