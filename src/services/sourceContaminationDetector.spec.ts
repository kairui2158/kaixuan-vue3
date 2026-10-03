import { describe, expect, it } from 'vitest'
import {
  buildSourceContaminationMarkers,
  detectSourceContamination,
  SOURCE_CONTAMINATION_MARKER_MIN_CHARS,
} from './sourceContaminationDetector'

describe('sourceContaminationDetector', () => {
  it('detects a long conversation marker embedded in the source document', () => {
    const marker = '建议将下面这一段插入到第三章之后，用于补齐人物动机：'
    const source = `第一卷 钩子\n\n${marker}\n\n沈萤站在栈桥尽头。`
    const result = detectSourceContamination(source, [{ content: `我先说一下：\n${marker}` }])

    expect(result.detected).toBe(true)
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]).toMatchObject({
      markerIndex: 0,
      start: 8,
      end: 8 + marker.length,
    })
    expect(result.matches[0].excerpt).toContain(marker)
  })

  it('detects whitespace-normalized conversation text', () => {
    const marker = '这一段需要插入到第二卷结尾，同时补足沈萤的行动线。'
    const source = `第一卷\n\n这一段需要插入到第二卷结尾，  同时补足沈萤的行动线。`
    const result = detectSourceContamination(source, [{ content: marker }])

    expect(result.detected).toBe(true)
    expect(result.matches[0].matchKind).toBe('normalized')
  })

  it('does not report short conversation snippets', () => {
    const source = '确认\n\n继续\n\nA'
    const result = detectSourceContamination(source, [
      { content: '确认' },
      { content: '继续' },
      { content: 'A' },
    ])

    expect(result.detected).toBe(false)
    expect(result.matches).toHaveLength(0)
  })

  it('caps matches to keep large trace payloads bounded', () => {
    const marker = '这是一条足够长的上一轮对话说明文本，用于验证命中数量会被限制。'
    const source = Array.from({ length: 12 }, () => marker).join('\n\n')
    const result = detectSourceContamination(source, [{ content: marker }])

    expect(result.matches).toHaveLength(10)
    expect(result.truncated).toBe(true)
  })

  it('returns no detection when the source is empty', () => {
    const result = detectSourceContamination('', [{ content: '这是一条足够长的上一轮对话说明文本。' }])

    expect(result.detected).toBe(false)
    expect(result.matches).toHaveLength(0)
  })

  it('builds markers from recent conversation only', () => {
    const markers = buildSourceContaminationMarkers([
      { role: 'user', content: '第一轮短句' },
      { role: 'assistant', content: '这是一条足够长的上一轮对话说明文本。' },
    ])

    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({
      role: 'assistant',
      normalized: '这是一条足够长的上一轮对话说明文本。',
      content: '这是一条足够长的上一轮对话说明文本。',
    })
  })

  it('ignores markers below the minimum length', () => {
    expect(SOURCE_CONTAMINATION_MARKER_MIN_CHARS).toBeGreaterThan(1)
    const marker = '短'
    expect(detectSourceContamination(marker, [{ content: marker }]).detected).toBe(false)
  })
})
