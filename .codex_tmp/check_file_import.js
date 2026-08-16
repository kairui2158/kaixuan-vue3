const http = require('http');
http.get('http://localhost:5173/src/services/file-import.js', (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Status: ' + res.statusCode);
    if (res.statusCode !== 200) {
      const msgMatch = body.match(/"message":"([^"]+)"/);
      const fileMatch = body.match(/"file":"([^"]+)"/);
      const locMatch = body.match(/"loc":\{"line":(\d+),"column":(\d+)\}/);
      const stackMatch = body.match(/"stack":"([^"]+)"/);
      if (msgMatch) console.log('Message: ' + msgMatch[1]);
      if (fileMatch) console.log('File: ' + fileMatch[1]);
      if (locMatch) console.log('Location: line ' + locMatch[1] + ', col ' + locMatch[2]);
      if (stackMatch) console.log('Stack: ' + stackMatch[1].substring(0, 400));
      console.log('\nRaw (first 1000):\n' + body.substring(0, 1000));
    } else {
      console.log('OK, length: ' + body.length);
    }
  });
}).on('error', e => console.log('Error: ' + e.message));
