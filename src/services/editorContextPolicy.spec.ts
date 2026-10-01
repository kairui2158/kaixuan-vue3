import { describe, expect, it } from 'vitest'
import {
  EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS,
  buildMainEditorContextPack,
  resolveEditorReadCapChars,
  shouldInjectFullEditorContent,
  editorContextInjectionMode,
} from './editorContextPolicy'

describe('shouldInjectFullEditorContent', () => {
  it('injects short documents in full', () => {
    expect(shouldInjectFullEditorContent(0)).toBe(true)
    expect(shouldInjectFullEditorContent(EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS)).toBe(true)
  })

  it('switches long documents to packed context', () => {
    expect(shouldInjectFullEditorContent(EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS + 1)).toBe(false)
    expect(shouldInjectFullEditorContent(1_000_000)).toBe(false)
  })
})

describe('buildMainEditorContextPack', () => {
  const selection = { selectionStart: 12, selectionEnd: 18, selectedText: '主角' }

  it('returns full content at and below the boundary', () => {
    const content = 'a'.repeat(EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS)
    expect(buildMainEditorContextPack({ label: '第一章', content, selection })).toBe(content)
  })

  it('packs long documents with bounds, selection, edges, and read-tool guidance', () => {
    const content = `${'头'.repeat(7000)}中段${'尾'.repeat(7000)}`
    const packed = buildMainEditorContextPack({ label: '第一章', content, selection })

    expect(packed).toContain('目标：第一章')
    expect(packed).toContain(`长文档目标总长度：${content.length} 字符`)
    expect(packed).toContain('当前选区：12-18：主角')
    expect(packed).toContain('开头片段：')
    expect(packed).toContain('结尾片段：')
    expect(packed).toContain('editor.document_map')
    expect(packed).toContain('editor.read_range')
    expect(packed).toContain('头'.repeat(600))
    expect(packed).toContain('尾'.repeat(600))
    expect(packed).not.toContain('中段')
  })

  it('marks missing selection explicitly in packed mode', () => {
    const packed = buildMainEditorContextPack({
      label: '第一章',
      content: 'x'.repeat(EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS + 1),
      selection: { selectionStart: 0, selectionEnd: 0, selectedText: '' },
    })
    expect(packed).toContain('当前选区：0-0（无选区）')
  })
})

describe('editorContextInjectionMode', () => {
  it('reports the injection mode used by dialogue traces', () => {
    expect(editorContextInjectionMode(EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS)).toBe('full')
    expect(editorContextInjectionMode(EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS + 1)).toBe('packed')
  })
})

describe('resolveEditorReadCapChars', () => {
  it('prefers a finite provider window', () => {
    expect(resolveEditorReadCapChars({
      providerContextWindowTokens: 128_000,
      modelContextWindow: 32_768,
    })).toBe(12_000)
  })

  it('falls back to the model window, then to 32768', () => {
    expect(resolveEditorReadCapChars({ modelContextWindow: 200_000 })).toBe(12_000)
    expect(resolveEditorReadCapChars({ modelContextWindow: 1_000_000 })).toBe(20_000)
    expect(resolveEditorReadCapChars({})).toBe(12_000)
  })

  it('keeps the document-map read page available for narrow model windows', () => {
    expect(resolveEditorReadCapChars({ modelContextWindow: 32_768 })).toBe(12_000)
    expect(resolveEditorReadCapChars({ providerContextWindowTokens: 0 })).toBe(12_000)
    expect(resolveEditorReadCapChars({ providerContextWindowTokens: 'not-a-number' })).toBe(12_000)
    expect(resolveEditorReadCapChars({ modelContextWindow: 8_192 })).toBe(12_000)
  })
})
