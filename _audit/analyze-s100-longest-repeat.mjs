import { readFileSync } from 'node:fs'

const completed = readFileSync('_audit/verification-final-draft-electron/S100-live-completed.txt', 'utf8')
const source = readFileSync('_audit/verification-final-draft-electron/S100-live-source.txt', 'utf8')

const normalize = text => text.replace(/\s+/g, ' ').trim()
const a = normalize(completed)
const b = normalize(source)

function longestCommonSubstring(left, right) {
  const dp = new Uint32Array(right.length + 1)
  let best = 0
  let bestI = 0
  let bestJ = 0
  for (let i = 1; i <= left.length; i += 1) {
    let prev = 0
    for (let j = 1; j <= right.length; j += 1) {
      const temp = dp[j]
      if (left[i - 1] === right[j - 1]) {
        dp[j] = prev + 1
        if (dp[j] > best) {
          best = dp[j]
          bestI = i - dp[j]
          bestJ = j - dp[j]
        }
      } else {
        dp[j] = 0
      }
      prev = temp
    }
  }
  return { length: best, leftStart: bestI, rightStart: bestJ }
}

const result = longestCommonSubstring(a, b)
console.log(JSON.stringify(result, null, 2))
console.log('\ncompleted excerpt:', JSON.stringify(a.slice(result.leftStart, result.leftStart + Math.min(result.length, 500))))
console.log('\nsource excerpt:', JSON.stringify(b.slice(result.rightStart, result.rightStart + Math.min(result.length, 500))))
