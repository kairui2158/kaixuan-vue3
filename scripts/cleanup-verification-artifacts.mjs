import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const ALLOWED_ROOTS = [path.join(ROOT, '_data'), path.join(ROOT, 'dist'), path.join(ROOT, '_audit')]
const TARGETS = [
  '_data/api-live-status-screenshots',
  '_data/api-live-status-profile',
  '_data/intent-routing-electron-exports',
  '_data/api-direct-write-live-v3-profile',
  'dist/神意助手-Setup-3.61.0.exe',
  'dist/神意助手-Setup-3.61.0.exe.blockmap',
  'dist/editorEntryFacade.js',
  '_audit/verification-packaging-3-61-0',
]

for (const relative of TARGETS) {
  const absolute = path.resolve(ROOT, relative)
  const allowed = ALLOWED_ROOTS.some(root => absolute === root || absolute.startsWith(`${root}${path.sep}`))
  if (!allowed || !TARGETS.includes(relative)) {
    throw new Error(`refusing to delete unlisted path: ${absolute}`)
  }
  if (!fs.existsSync(absolute)) continue
  fs.rmSync(absolute, { recursive: true, force: true })
  if (fs.existsSync(absolute)) throw new Error(`cleanup failed: ${absolute}`)
  console.log(`removed=${relative}`)
}

console.log('===== VERIFICATION ARTIFACT CLEANUP PASSED =====')
