const http = require('http');

function getPage() {
  return new Promise(function(resolve, reject) {
    var req = http.request({hostname:'127.0.0.1', port:9227, path:'/json', method:'GET'}, function(res){
      var d='';
      res.on('data', function(c){ d+=c; });
      res.on('end', function(){ try { resolve(JSON.parse(d)[0]); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(5000, function(){ req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

getPage().then(function(page) {
  console.log('Page URL:', page.url);
  console.log('Page Title:', page.title);
  console.log('WS URL:', page.webSocketDebuggerUrl);
}).catch(function(e) {
  console.error('Failed to get page:', e.message);
  process.exit(1);
});
