const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('usage: node scan.cjs <file> <pattern> [pattern...]')
  process.exit(1)
}

const file = path.resolve(args[0])
const patterns = args.slice(1)
const text = fs.readFileSync(file, 'utf8')
const lines = text.split(/\r?\n/)

let hit = 0
lines.forEach((line, i) => {
  const num = i + 1
  const found = patterns.filter((p) => line.includes(p))
  if (found.length > 0) {
    hit += 1
    console.log(`${num}: [${found.join(',')}] ${line.trim()}`)
  }
})

console.log(`--- total ${hit} matching lines ---`)
