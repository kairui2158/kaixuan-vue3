const fs = require('fs')
const path = require('path')
const { spawn, execFileSync } = require('child_process')
const crypto = require('crypto')

const root = process.cwd()
const dist = path.join(root, 'dist')
const exe = fs.readdirSync(path.join(dist, 'win-unpacked'))
  .filter((name) => name.toLowerCase().endsWith('.exe'))
  .map((name) => path.join(dist, 'win-unpacked', name))[0]
const installer = fs.readdirSync(dist)
  .filter((name) => name.endsWith('.exe') && name.includes('3.2.1'))
  .map((name) => path.join(dist, name))[0]
if (!exe || !installer) throw new Error('封装产物不存在')

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
async function getJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

async function main() {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex')
  const child = spawn(exe, ['--remote-debugging-port=9228', '--remote-allow-origins=*'], {
    cwd: path.dirname(exe),
    windowsHide: true,
    detached: false,
    stdio: 'ignore'
  })
  let version = null
  let pages = []
  let lastError = null
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(500)
    try {
      version = await getJson('http://127.0.0.1:9228/json/version')
      pages = await getJson('http://127.0.0.1:9228/json/list')
      if (pages.length) break
    } catch (error) {
      lastError = error
    }
  }
  const page = pages.find((item) => item.url && item.url.startsWith('file:')) || pages[0] || null
  const result = {
    installer: path.relative(root, installer),
    installerBytes: fs.statSync(installer).size,
    installerSha256: hash,
    unpackedExecutable: path.relative(root, exe),
    spawnedPid: child.pid,
    cdpConnected: Boolean(version),
    cdpBrowser: version?.Browser || null,
    pageUrl: page?.url || null,
    pageTitle: page?.title || null,
    error: version ? null : (lastError?.message || 'CDP未连接')
  }
  console.log(JSON.stringify(result, null, 2))
  try { execFileSync('taskkill', ['/f', '/t', '/pid', String(child.pid)], { stdio: 'ignore' }) } catch {}
  process.exit(version && page ? 0 : 1)
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exit(1)
})
