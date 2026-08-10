const { ipcMain } = require('electron')
const https = require('https')
const http = require('http')

function registerApiHandlers() {
  ipcMain.handle('api:fetchModels', async function(event, baseUrl, apiKey) {
    return await new Promise(function(resolve, reject) {
      // baseUrl may already include /v1 suffix; avoid duplicating it
      var trimmed = baseUrl.replace(/\/+$/, '')
      var url = trimmed.match(/\/v\d+$/) ? trimmed + '/models' : trimmed + '/v1/models'
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
        var statusCode = res.statusCode
        res.on('data', function(chunk) { body += chunk })
        res.on('end', function() {
          try {
            var data = JSON.parse(body)
            if (data.data && Array.isArray(data.data)) {
              resolve(data.data.map(function(m) { return m.id }))
            } else if (data.models && Array.isArray(data.models)) {
              resolve(data.models.map(function(m) { return typeof m === 'string' ? m : m.id }))
            } else {
              reject(new Error('API returned no models (HTTP ' + statusCode + '). Response: ' + body.slice(0, 200)))
            }
          } catch (e) {
            reject(new Error('Failed to parse response (HTTP ' + statusCode + '). Body: ' + body.slice(0, 200)))
          }
        })
      })
      req.on('error', function(e) { reject(new Error('Network error: ' + e.message)) })
      req.on('timeout', function() { req.destroy(); reject(new Error('Request timeout after 30s')) })
      req.end()
    })
  })
}

module.exports = { registerApiHandlers }
