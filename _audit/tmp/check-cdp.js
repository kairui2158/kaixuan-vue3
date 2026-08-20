const http = require('http');
const req = http.get('http://127.0.0.1:9227/json', r => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    console.log('CDP_OK:' + d.substring(0, 300));
    process.exit(0);
  });
});
req.on('error', e => {
  console.log('CDP_ERR:' + e.message);
  process.exit(1);
});
req.setTimeout(3000);
