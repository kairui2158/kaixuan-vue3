const fs = require('fs')
const path = require('path')

const root = path.resolve(process.argv[2] || '.')
const patterns = process.argv.slice(3)
if (patterns.length === 0) {
  console.error('usage: node scan_dir.cjs <root> <pattern> [pattern...]')
  process.exit(1)
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === 'dist-renderer' || ent.name === '.vite') continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (/\.(vue|ts|js|cjs|html|css)$/.test(ent.name)) out.push(p)
  }
  return out
}

for (const file of walk(root, [])) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    const found = patterns.filter((p) => line.includes(p))
    if (found.length > 0) {
      console.log(`${path.relative(root, file)}:${i + 1}: [${found.join(',')}] ${line.trim()}`)
    }
  })
}
