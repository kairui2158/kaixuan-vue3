import { describe, expect, it } from 'vitest'
import { createEditorTargetSnapshot } from './editorTarget'

const source = {
  targetId: 'outline',
  label: '大纲',
  content: '第一段内容\n第二段内容',
}

describe('createEditorTargetSnapshot', () => {
  it('returns the same version for repeated snapshots of identical content', () => {
    const first = createEditorTargetSnapshot(source)
    const second = createEditorTargetSnapshot(source)
    const third = createEditorTargetSnapshot(source)

    expect(first.contentVersion).toBe(second.contentVersion)
    expect(second.contentVersion).toBe(third.contentVersion)
  })

  it('returns a different version when content changes', () => {
    const before = createEditorTargetSnapshot(source)
    const after = createEditorTargetSnapshot({
      ...source,
      content: source.content + '\n第三段内容',
    })

    expect(after.contentVersion).not.toBe(before.contentVersion)
  })

  it('keeps the version stable when only the selection changes', () => {
    const first = createEditorTargetSnapshot({
      ...source,
      selectionStart: 0,
      selectionEnd: 3,
    })
    const second = createEditorTargetSnapshot({
      ...source,
      selectionStart: 4,
      selectionEnd: 8,
    })

    expect(first.contentVersion).toBe(second.contentVersion)
    expect(first.selectedText).not.toBe(second.selectedText)
  })

  it('separates versions by workspace and target', () => {
    const outline = createEditorTargetSnapshot({ ...source, workspace: 'outline' })
    const main = createEditorTargetSnapshot({ ...source, workspace: 'main' })
    const otherTarget = createEditorTargetSnapshot({ ...source, targetId: 'other' })

    expect(main.contentVersion).not.toBe(outline.contentVersion)
    expect(otherTarget.contentVersion).not.toBe(outline.contentVersion)
  })

  it('preserves a real selection and clamps out-of-range selections', () => {
    const selected = createEditorTargetSnapshot({
      ...source,
      workspace: 'main',
      selectionStart: 2,
      selectionEnd: 5,
    })
    const overflow = createEditorTargetSnapshot({
      ...source,
      workspace: 'main',
      selectionStart: 999,
      selectionEnd: 1_000,
    })

    expect(selected.selectedText).toBe(source.content.slice(2, 5))
    expect(overflow.selectionStart).toBe(source.content.length)
    expect(overflow.selectionEnd).toBe(source.content.length)
    expect(overflow.selectedText).toBe('')
  })
})
