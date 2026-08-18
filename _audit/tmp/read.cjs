const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('usage: node read.cjs <file> <fromLine> [toLine]')
  process.exit(1)
}

const file = path.resolve(args[0])
const from = parseInt(args[1], 10)
const to = args[2] ? parseInt(args[2], 10) : from + 200
const text = fs.readFileSync(file, 'utf8')
const lines = text.split(/\r?\n/)
for (let i = from - 1; i < Math.min(to, lines.length); i++) {
  console.log(`${i + 1}: ${lines[i]}`)
}
