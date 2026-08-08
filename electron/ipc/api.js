const { ipcMain } = require('electron')
const https = require('https')
const http = require('http')

function registerApiHandlers() {
  ipcMain.handle('api:fetchModels', async function(event, baseUrl, apiKey) {
    return await new Promise(function(resolve, reject) {
      var url = baseUrl.replace(/\/+$/, '') + '/v1/models'
      var parsed = new URL(url)
      var isHttps = parsed.protocol === 'https:'
      var options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + apiKey },
        timeout: 30000
      }
      var mod = isHttps ? https : http
      var req = mod.request(options, function(res) {
        var body = ''
        res.on('data', function(chunk) { body += chunk })
        res.on('end', function() {
          try {
            var data = JSON.parse(body)
            if (data.data && Array.isArray(data.data)) {
              resolve(data.data.map(function(m) { return m.id }))
            } else {
              resolve([])
            }
          } catch (e) {
            resolve([])
          }
        })
      })
      req.on('error', function(e) { resolve([]) })
      req.on('timeout', function() { req.destroy(); resolve([]) })
      req.end()
    })
  })
}

module.exports = { registerApiHandlers }
