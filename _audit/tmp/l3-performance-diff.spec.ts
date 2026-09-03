import { describe, expect, it } from 'vitest'
import { lcsDiff } from '../../src/services/diff-utils'

function buildContent(lineCount: number, charsPerLine: number, suffix = ''): string {
  const lines: string[] = []
  for (let index = 0; index < lineCount; index++) {
    lines.push(`${index + 1}：${'性能验证测试内容'.repeat(7)}${suffix}`)
  }
  return lines.join('\n')
}

describe('L3 P8 DiffModal lcsDiff performance finding', () => {
  it('measures the existing line-based LCS on a large document', () => {
    const runs = [0, 1, 2].map(() => {
      const original = buildContent(10000, 50)
      const modified = buildContent(10000, 50, '（AI修改）')
      expect(original.length).toBeGreaterThan(500000)
      expect(modified.length).toBeGreaterThan(500000)
      return { original, modified }
    })

    const measurements = runs.map(({ original, modified }) => {
      const started = performance.now()
      const changes = lcsDiff(original, modified)
      return {
        elapsedMs: performance.now() - started,
        changedLines: changes.filter(change => change.type !== 'unchanged').length,
        originalChars: original.length,
        modifiedChars: modified.length,
      }
    })
    const medianMs = measurements.map(item => item.elapsedMs).sort((a, b) => a - b)[1]
    const last = measurements.at(-1)!

    console.info('[L3_PERF_DIFF] ' + JSON.stringify({
      originalChars: last.originalChars,
      modifiedChars: last.modifiedChars,
      originalLines: 10000,
      modifiedLines: 10000,
      changedLines: last.changedLines,
      runs: measurements,
      medianMs,
      thresholdMs: 1000,
      withinThreshold: medianMs <= 1000,
      algorithm: 'O(n*m) line LCS on the renderer main thread',
    }))
  }, 120000)
})
