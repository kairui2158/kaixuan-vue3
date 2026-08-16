const WebSocket = require('ws');

const targetUrl = 'ws://localhost:9223/devtools/page/10F1EF589CD777E375496D64EDADCAD8';

const ws = new WebSocket(targetUrl);
let msgId = 1;
const results = {};

function send(method, params) {
  return new Promise((resolve) => {
    const id = msgId++;
    ws.send(JSON.stringify({ id, method, params }));
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === id) {
        ws.removeListener('message', handler);
        resolve(msg.result || msg.error);
      }
    };
    ws.on('message', handler);
  });
}

ws.on('open', async () => {
  console.log('CDP connected for IndexedDB dump');

  // Get all IndexedDB databases
  const dbs = await send('Storage.getStorageKeyForFrame', { frameId: '' });

  // Use Runtime.evaluate to query IndexedDB
  const idbResult = await send('Runtime.evaluate', {
    expression: `(async function() {
      var dbs = await indexedDB.databases();
      var output = { databases: [] };
      for (var db of dbs) {
        var dbInfo = { name: db.name, version: db.version, stores: [] };
        try {
          var handle = await new Promise((res, rej) => {
            var req = indexedDB.open(db.name);
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
          var stores = Array.from(handle.objectStoreNames);
          for (var s of stores) {
            var tx = handle.transaction(s, 'readonly');
            var store = tx.objectStore(s);
            var count = await new Promise((res) => {
              var r = store.count();
              r.onsuccess = () => res(r.result);
              r.onerror = () => res(0);
            });
            var allKeys = await new Promise((res) => {
              var r = store.getAllKeys();
              r.onsuccess = () => res(r.result);
              r.onerror = () => res([]);
            });
            var sampleData = [];
            if (count > 0) {
              sampleData = await new Promise((res) => {
                var r = store.getAll();
                r.onsuccess = () => res(r.result.slice(0, 5));
                r.onerror = () => res([]);
              });
            }
            dbInfo.stores.push({
              name: s,
              count: count,
              keys: allKeys.slice(0, 10),
              sample: sampleData.map(function(item) {
                var s2 = JSON.stringify(item);
                return s2 ? s2.substring(0, 200) : null;
              })
            });
          }
          handle.close();
        } catch(e) {
          dbInfo.error = e.message;
        }
        output.databases.push(dbInfo);
      }
      return JSON.stringify(output);
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('=== IndexedDB Data ===');
  if (idbResult.result && idbResult.result.value) {
    var data = JSON.parse(idbResult.result.value);
    data.databases.forEach(function(db) {
      console.log('DB: ' + db.name + ' v' + db.version);
      db.stores.forEach(function(s) {
        console.log('  Store: ' + s.name + ' count=' + s.count);
        s.keys.forEach(function(k, i) {
          console.log('    Key[' + i + ']: ' + JSON.stringify(k));
        });
        s.sample.forEach(function(item, i) {
          console.log('    Sample[' + i + ']: ' + item);
        });
      });
    });
  } else {
    console.log('No IndexedDB data or error: ' + JSON.stringify(idbResult));
  }

  // Also get localStorage data
  const lsResult = await send('Runtime.evaluate', {
    expression: `JSON.stringify(Object.keys(localStorage).map(function(k) { return { key: k, value: localStorage.getItem(k).substring(0, 200) } }))`,
    returnByValue: true
  });
  console.log('=== localStorage Keys ===');
  if (lsResult.result && lsResult.result.value) {
    var lsData = JSON.parse(lsResult.result.value);
    lsData.forEach(function(item) {
      console.log('  ' + item.key + ': ' + item.value);
    });
  }

  // Get DOM structure summary
  const domResult = await send('Runtime.evaluate', {
    expression: `(function() {
      var app = document.querySelector('#app');
      if (!app) return 'No #app found';
      var children = app.children;
      var summary = [];
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        summary.push(c.tagName + (c.className ? '.' + c.className.split(' ').join('.') : '') + (c.id ? '#' + c.id : ''));
      }
      var allInputs = document.querySelectorAll('input, textarea, button, [contenteditable]');
      var inputSummary = [];
      for (var j = 0; j < allInputs.length && j < 30; j++) {
        var el = allInputs[j];
        inputSummary.push(el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ').join('.') : ''));
      }
      return JSON.stringify({ appChildren: summary, inputs: inputSummary, inputCount: allInputs.length });
    })()`,
    returnByValue: true
  });
  console.log('=== DOM Structure ===');
  if (domResult.result && domResult.result.value) {
    var domData = JSON.parse(domResult.result.value);
    console.log('App children: ' + JSON.stringify(domData.appChildren));
    console.log('Input count: ' + domData.inputCount);
    domData.inputs.forEach(function(s) { console.log('  ' + s); });
  }

  ws.close();
  process.exit(0);
});

ws.on('error', (e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});

setTimeout(() => { console.log('Timeout'); process.exit(1); }, 15000);
