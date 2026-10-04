import { describe, expect, it } from 'vitest'
import { locateEditorFragment } from './editorEditLocator'
import type { EditorLocateDiagnostic } from './editorEditLocator'

const content = [
  '第一卷 风暴起点',
  '男主在夜路中发现旧信。',
  '第1章 夜行',
  '男主穿过风暴，遇到持灯人。',
  '第2章 灯塔',
  '男主在灯塔下解读旧信。'
].join('\n')

describe('locateEditorFragment', () => {
  function failure(result: ReturnType<typeof locateEditorFragment>): EditorLocateDiagnostic {
    expect(result.ok).toBe(false)
    return result as EditorLocateDiagnostic
  }

  it('accepts only an exact unique match', () => {
    const result = locateEditorFragment({ content, fragment: '男主穿过风暴' })
    expect(result).toMatchObject({ ok: true, unique: true, fuzzy: false })
  })

  it('returns diagnostics and Top-3 candidates when there is no exact hit', () => {
    const result = locateEditorFragment({ content, fragment: '男主穿过风基，遇到持灯人。' })
    const failed = failure(result)
    expect(failed.unique).toBe(false)
    expect(failed.fuzzy).toBe(true)
    expect(failed.reason).toBe('target_not_found')
    expect(failed.candidates?.length).toBeGreaterThan(0)
    expect(failed.candidates?.length).toBeLessThanOrEqual(3)
  })

  it('rejects multiple matches with every match range', () => {
    const repeated = '旧信出现了。\n这里也旧信出现了。\n旧信出现了第三次。'
    const result = locateEditorFragment({ content: repeated, fragment: '旧信出现了' })
    const failed = failure(result)
    expect(failed.reason).toBe('ambiguous_target')
    expect(failed.matches).toHaveLength(3)
  })

  it('uses structure anchors to disambiguate repeated fragments', () => {
    const result = locateEditorFragment({
      content,
      fragment: '旧信',
      anchor: { chapterTitle: '第2章 灯塔' }
    })
    expect(result.ok).toBe(true)
    expect((result as any).start).toBeGreaterThan(content.indexOf('第2章 灯塔'))
  })

  it('returns structure candidates when the anchor itself is wrong', () => {
    const result = locateEditorFragment({
      content,
      fragment: '男主穿过风暴，遇到持灯人。',
      anchor: { chapterTitle: '第3章 不存在' }
    })
    const failed = failure(result)
    expect(failed.reason).toBe('target_not_found')
    expect(failed.message).toContain('结构锚点不存在')
    expect(failed.anchorCandidates?.map(candidate => candidate.title)).toContain('第1章 夜行')
  })

  it('rejects empty input without fuzzy work', () => {
    const result = locateEditorFragment({ content: '', fragment: 'x' })
    expect(failure(result).reason).toBe('invalid_input')
  })

  it('locates a fragment that only differs from the source by escaped whitespace', () => {
    const source = '第一卷 北境\n\n少年穿过风暴。\n\t他在灯塔下停下。'
    const result = locateEditorFragment({
      content: source,
      fragment: '少年穿过风暴。\\n\t他在灯塔下停下。',
    })

    expect(result).toMatchObject({ ok: true, unique: true, fuzzy: false, normalized: true })
    expect(result.ok && result.start).toBe(source.indexOf('少年穿过风暴'))
    expect(result.ok && result.end).toBe(source.length)
  })

  it('maps normalized matching back to exact source offsets for every normalized difference', () => {
    const source = '甲　段  内容\n\n\n乙　段  内容'
    const result = locateEditorFragment({ content: source, fragment: '甲段 内容\\n\\n乙段 内容' })
    console.log('DEBUG normalized result', JSON.stringify(result))

    expect(result).toMatchObject({ ok: true, unique: true, normalized: true })
    expect(result.ok && result.start).toBe(0)
    expect(result.ok && result.end).toBe(source.length)
  })

  it('keeps normalized matching unique and does not relax an ambiguous target', () => {
    const source = '重复目标。\\n重复目标。'
    const result = locateEditorFragment({ content: source, fragment: '重复目标。' })
    const failed = failure(result)

    expect(failed.reason).toBe('ambiguous_target')
    expect(failed.matches).toHaveLength(2)
  })
})
