import { readFileSync } from 'node:fs'

const completed = readFileSync('_audit/verification-final-draft-electron/S100-live-completed.txt', 'utf8')
const normalized = completed.replace(/\s+/g, ' ').trim()

function findDuplicate(size) {
  const seen = new Map()
  for (let i = 0; i + size <= normalized.length; i += 1) {
    const key = normalized.slice(i, i + size)
    if (seen.has(key)) return { first: seen.get(key), second: i, size }
    seen.set(key, i)
  }
  return null
}

for (const size of [320, 200, 160, 120, 80, 40]) {
  const hit = findDuplicate(size)
  console.log(`size=${size}`, hit ? `first=${hit.first} second=${hit.second} gap=${hit.second - hit.first}` : 'none')
}

const hit = findDuplicate(320)
if (hit) {
  console.log('\n--- first occurrence ---')
  console.log(normalized.slice(hit.first - 120, hit.first + 440))
  console.log('\n--- second occurrence ---')
  console.log(normalized.slice(hit.second - 120, hit.second + 440))
  console.log('\n--- between occurrences (start/end excerpts) ---')
  console.log(normalized.slice(hit.first + hit.size, hit.first + hit.size + 300))
  console.log('...')
  console.log(normalized.slice(hit.second - 300, hit.second))
}
