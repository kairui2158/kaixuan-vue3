const { spawn } = require('child_process')
const path = require('path')

const cwd = process.cwd()
const bat = path.join(cwd, 'start-electron.bat')
const child = spawn('cmd.exe', ['/c', 'start', '', '/min', bat], {
  cwd,
  detached: true,
  stdio: 'ignore',
  windowsHide: true
})
child.unref()
console.log('LAUNCHER_STARTED')
