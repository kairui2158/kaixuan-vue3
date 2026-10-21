import fs from 'node:fs'
import path from 'node:path'

const distDir = path.resolve(process.cwd(), 'dist')
const keep = new Set([
  'win-unpacked',
  'builder-debug.yml',
  'builder-effective-config.yaml',
  'latest.yml',
  '神意助手-Setup-3.102.0.exe',
  '神意助手-Setup-3.102.0.exe.blockmap',
])

if (!fs.existsSync(distDir)) {
  throw new Error(`dist directory does not exist: ${distDir}`)
}

for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  if (keep.has(entry.name)) continue
  const target = path.resolve(distDir, entry.name)
  if (!target.startsWith(`${distDir}${path.sep}`)) {
    throw new Error(`Refusing path outside dist: ${target}`)
  }
  fs.rmSync(target, { recursive: true, force: true })
  console.log(`removed ${path.relative(process.cwd(), target)}`)
}

for (const entry of fs.readdirSync(distDir)) {
  const stat = fs.statSync(path.join(distDir, entry))
  console.log(`${entry}\t${stat.size}`)
}
