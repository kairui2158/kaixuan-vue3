const http = require('http');
const fs = require('fs');
const path = require('path');

// Read all .vue files recursively
function findVueFiles(dir, base) {
  const results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory() && item.name !== 'node_modules' && item.name !== '.git') {
      results.push(...findVueFiles(full, base));
    } else if (item.name.endsWith('.vue')) {
      results.push(full.replace(/\\/g, '/').replace(base + '/', ''));
    }
  }
  return results;
}

const srcDir = path.join(process.cwd(), 'src');
const files = findVueFiles(srcDir, 'src');
console.log('Found ' + files.length + ' .vue files');

let checked = 0;
let failed = 0;

function checkFile(file) {
  return new Promise((resolve) => {
    const url = 'http://localhost:5173/' + file.replace(/\\/g, '/');
    http.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log('[FAIL ' + res.statusCode + '] ' + file);
          // Extract error message
          const match = body.match(/"message":"([^"]+)"/);
          if (match) console.log('  Error: ' + match[1]);
          failed++;
        }
        checked++;
        resolve();
      });
    }).on('error', e => {
      console.log('[ERR] ' + file + ': ' + e.message);
      checked++;
      resolve();
    });
  });
}

// Also check main.js and App.vue
async function main() {
  // Check main entry first
  await checkFile('src/main.js');
  await checkFile('src/App.vue');
  
  // Check all vue files in parallel batches of 5
  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5);
    await Promise.all(batch.map(checkFile));
  }
  
  console.log('\nChecked: ' + checked + ' | Failed: ' + failed);
  if (failed === 0) console.log('All files compile OK');
}

main();
