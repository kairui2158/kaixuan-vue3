const fs = require('fs')
const os = require('os')
const path = require('path')

const dir = path.join(os.homedir(), 'Documents', '神意助手数据')
console.log('DATA_DIR=' + dir)
if (!fs.existsSync(dir)) {
  console.log('NO DATA DIR')
  process.exit(0)
}
const names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'))
console.log('TOTAL=' + names.length)
console.log(names.sort().join('\n'))
