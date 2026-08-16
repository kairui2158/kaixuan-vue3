const http = require('http');

const files = [
  '/src/styles/global.css',
  '/src/components/settings-collection/ScPanel.vue',
  '/src/components/common/MemoryPanel.vue'
];

async function check(url) {
  return new Promise((resolve) => {
    http.get('http://localhost:5173' + url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        console.log('\n=== ' + url + ' ===');
        console.log('Status: ' + res.statusCode);
        if (res.statusCode !== 200) {
          // Extract error message from HTML
          const msgMatch = body.match(/"message":"([^"]+)"/);
          const fileMatch = body.match(/"file":"([^"]+)"/);
          const locMatch = body.match(/"loc":\{"line":(\d+),"column":(\d+)\}/);
          const stackMatch = body.match(/"stack":"([^"]+)"/);
          if (msgMatch) console.log('Message: ' + msgMatch[1]);
          if (fileMatch) console.log('File: ' + fileMatch[1]);
          if (locMatch) console.log('Location: line ' + locMatch[1] + ', col ' + locMatch[2]);
          if (stackMatch) console.log('Stack: ' + stackMatch[1].substring(0, 300));
          // Also print raw first 800 chars for context
          console.log('Raw (first 800): ' + body.substring(0, 800));
        } else {
          console.log('OK, length: ' + body.length);
        }
        resolve();
      });
    }).on('error', e => {
      console.log('\n=== ' + url + ' ===');
      console.log('Error: ' + e.message);
      resolve();
    });
  });
}

async function main() {
  for (const f of files) {
    await check(f);
  }
}

main();
