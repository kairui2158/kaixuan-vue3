import fs from 'node:fs'

const text = fs.readFileSync('_audit/verification-final-draft-electron/S100-live-completed.txt', 'utf8').replace(/\s+/g, ' ').trim()
const blockChars = 320
const base = 131n
const mod = 1_000_000_007n
const highestWeight = base ** BigInt(blockChars) % mod
let hash = 0n
for (let index = 0; index < blockChars; index += 1) hash = (hash * base + BigInt(text.charCodeAt(index))) % mod
const firstByHash = new Map([[hash.toString(), 0]])
const matches = []
for (let index = blockChars; index < text.length; index += 1) {
  const outgoing = BigInt(text.charCodeAt(index - blockChars)) * highestWeight % mod
  const incoming = BigInt(text.charCodeAt(index))
  hash = (hash * base + incoming + mod - outgoing) % mod
  const first = firstByHash.get(hash.toString())
  if (first !== undefined && index - first >= blockChars * 2
    && text.slice(first, first + blockChars) === text.slice(index, index + blockChars)) {
    matches.push({ first, second: index, gap: index - first, sample: text.slice(first, first + 80) })
  }
  if (first === undefined) firstByHash.set(hash.toString(), index)
}
console.log(JSON.stringify({ length: text.length, matches: matches.slice(0, 20), matchCount: matches.length }, null, 2))
