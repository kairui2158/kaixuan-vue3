const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

const target = process.argv[2];
const scriptPath = process.argv[3];
const outputPath = process.argv[4] || '_audit/tmp/l3-result.json';
const url = new URL(target);

function rawSend(socket, payload) {
  const data = Buffer.from(payload);
  const length = data.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(data.map((byte, index) => byte ^ mask[index % 4]));
  const header2 = Buffer.from(header);
  header2[1] = header2[1] | 0x80;
  socket.write(Buffer.concat([header2, mask, masked]));
}

const request = http.request({
  hostname: url.hostname,
  port: url.port,
  path: url.pathname + url.search,
  headers: {
    Connection: 'Upgrade',
    Upgrade: 'websocket',
    'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
    'Sec-WebSocket-Version': '13'
  }
});

request.on('upgrade', (response, socket, head) => {
  console.log('UPGRADE', response.statusCode);
  socket.on('error', error => console.log('SOCKET_ERROR', error.message));
  let buffer = head ? Buffer.from(head) : Buffer.alloc(0);
  console.log('HEAD_BYTES', buffer.length, JSON.stringify(buffer.toString('latin1').slice(0, 100)));
  let text = '';
  let messageCallback = null;

  function parseFrames() {
    while (true) {
      if (buffer.length < 2) return;
      const second = buffer[1];
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2); offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2)); offset = 10;
      }
      const maskLength = masked ? 4 : 0;
      if (buffer.length < offset + maskLength + length) return;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      let payload = buffer.subarray(offset + maskLength, offset + maskLength + length);
      if (mask) payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      const opcode = buffer[0] & 0x0f;
      buffer = buffer.subarray(offset + maskLength + length);
      if (opcode === 1) {
        text += payload.toString('utf8');
        if (messageCallback) {
          const callback = messageCallback;
          messageCallback = null;
          callback(text);
          text = '';
        }
      }
    }
  }

  socket.on('data', data => {
    console.log('DATA_BYTES', data.length);
    buffer = Buffer.concat([buffer, data]);
    parseFrames();
  });

  function waitForMessage() {
    return new Promise(resolve => {
      if (text) {
        const value = text;
        text = '';
        resolve(value);
        return;
      }
      messageCallback = resolve;
    });
  }

  (async () => {
    try {
      console.log('SENDING_EXPRESSION', scriptPath);
      const expression = fs.readFileSync(scriptPath, 'utf8');
      rawSend(socket, JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, userGesture: true } }));
      const raw = await waitForMessage();
      const message = JSON.parse(raw);
      console.log('RESULT_BYTES', raw.length);
      fs.writeFileSync(require('path').resolve(outputPath), JSON.stringify(message, null, 2));
      console.log('CDP_OK');
    } catch (error) {
      fs.writeFileSync(require('path').resolve(outputPath), JSON.stringify({ error: String(error) }, null, 2));
      console.error('CDP_FAIL', error);
      process.exitCode = 1;
    } finally {
      socket.end();
    }
  })();
});

request.on('error', error => {
  console.error('HTTP_ERROR', error);
  process.exit(1);
});
request.end();
