import { describe, expect, it } from 'vitest'
import { parseEditorEditBatch } from '../../src/services/editorEditProtocol'
import { planEditorEditBatch } from '../../src/services/editorEditBatch'
import { createEditorTargetSnapshot } from '../../src/services/editorTarget'

function buildContent(lineCount: number, charsPerLine: number): string {
  const lines: string[] = []
  const filler = '性能验证测试内容'
  for (let index = 0; index < lineCount; index++) {
    const text = `${index + 1}：${filler.repeat(Math.ceil(charsPerLine / filler.length))}`
    lines.push(text.slice(0, charsPerLine))
  }
  for (let index = 0; index < 10; index++) {
    lines[(index + 1) * Math.floor(lineCount / 12)] += ` 性能标记第${index + 1}段`
  }
  return lines.join('\n')
}

function buildRawBatch(): string {
  return JSON.stringify({
    type: 'editor_edit_batch',
    version: 1,
    commands: Array.from({ length: 10 }, (_, index) => index === 9
      ? { operation: 'append', content: '\n[性能] 第十条追加内容。' }
      : {
          operation: 'replace_match',
          target: `性能标记第${index + 1}段`,
          content: `性能标记第${index + 1}段（已更新）`,
          reason: `第${index + 1}条性能修改`,
        }),
    reason: '性能实测批次',
  })
}

describe('L3 P8 performance service timing', () => {
  it('parses and plans 10 commands on a 500k character document three times', () => {
    const content = buildContent(10000, 50)
    const raw = buildRawBatch()
    expect(content.length).toBeGreaterThan(500000)

    const measurements = [0, 1, 2].map(() => {
      const started = performance.now()
      const batch = parseEditorEditBatch(raw)
      expect(batch).not.toBeNull()
      const target = createEditorTargetSnapshot({
        workspace: 'main',
        targetId: 'perf-tab',
        label: '性能实测',
        chapterId: '',
        content,
      })
      const plan = planEditorEditBatch(batch!, target, { content })
      expect(plan.ok).toBe(true)
      expect(plan.items).toHaveLength(10)
      return {
        parseAndPlanMs: performance.now() - started,
        originalLength: plan.original.length,
        nextLength: plan.next.length,
      }
    })

    const timings = measurements.map(item => item.parseAndPlanMs).sort((a, b) => a - b)
    const report = {
      documentChars: content.length,
      documentLines: 10000,
      commandCount: 10,
      runs: measurements,
      medianMs: timings[1],
      thresholdMs: 500,
      withinThreshold: timings[1] <= 500,
    }
    console.info('[L3_PERF_SERVICE] ' + JSON.stringify(report))
  })
})
