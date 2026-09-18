import { describe, expect, it } from 'vitest'
import { buildEditorEditPrompt, parseEditorEditCommand } from './editorEditProtocol'
import { createEditorTargetSnapshot, validateEditorTarget } from './editorTarget'
import { buildEditPlan } from './editorEditService'

const content = '第一段：男主出发。\n第二段：进入遗迹。\n第三段：拿到线索。'

function createTarget(selectionStart = 0, selectionEnd = selectionStart) {
  return createEditorTargetSnapshot({
    workspace: 'main',
    targetId: 'tab-1',
    label: '第一章',
    chapterId: 'chapter-1',
    mode: 'ch-body',
    content,
    selectionStart,
    selectionEnd
  })
}

describe('parseEditorEditCommand', () => {
  it('parses fenced JSON and rejects invalid model output without throwing', () => {
    const command = parseEditorEditCommand('```json\n{"type":"editor_edit","version":1,"operation":"replace_match","content":"新文","target":"遗迹"}\n```')
    expect(command?.operation).toBe('replace_match')
    expect(parseEditorEditCommand('不是 JSON')).toBeNull()
    expect(parseEditorEditCommand('{"type":"editor_edit","operation":"delete"}')).toBeNull()
  })

  it('maps the legacy outline protocol without changing stored legacy data', () => {
    const command = parseEditorEditCommand('{"type":"outline_edit","operation":"replace_section","content":"新段落","target":"第二段"}')
    expect(command).toMatchObject({ type: 'editor_edit', operation: 'replace_match' })
  })

  it('parses optional structure anchors for long-document two-layer locating', () => {
    const command = parseEditorEditCommand('{"type":"editor_edit","version":1,"operation":"replace_match","content":"新文","target":"第二章","chapterTitle":"第二章 风暴"}')
    expect(command).toMatchObject({
      chapterTitle: '第二章 风暴'
    })
  })
})

describe('editor target', () => {
  it('detects content version drift and locked targets before planning', () => {
    const target = createTarget()
    expect(validateEditorTarget(target, { content: target.content })).toEqual({ valid: true })
    expect(validateEditorTarget(target, { content: target.content + 'x' })).toEqual({ valid: false, reason: 'version_changed' })
    expect(validateEditorTarget(target, { content: target.content, locked: true })).toEqual({ valid: false, reason: 'locked' })
  })
})

describe('buildEditPlan', () => {
  it('replaces an exact match and reports failure when the match is missing', () => {
    const target = createTarget()
    const ok = buildEditPlan(target, {
      type: 'editor_edit',
      version: 1,
      operation: 'replace_match',
      content: '进入禁地',
      target: '进入遗迹'
    }, { content })
    expect(ok.ok).toBe(true)
    expect(ok.next).toContain('进入禁地')

    const failed = buildEditPlan(target, {
      type: 'editor_edit',
      version: 1,
      operation: 'replace_match',
      content: 'x',
      target: '不存在片段'
    }, { content })
    expect(failed.ok).toBe(false)
    expect(failed.failureReason).toBe('target_not_found')
    expect(failed.next).toBe(content)
  })

  it('requires a selection for replace_selection and preserves content on failure', () => {
    const noSelection = createTarget()
    const plan = buildEditPlan(noSelection, {
      type: 'editor_edit',
      version: 1,
      operation: 'replace_selection',
      content: '新文'
    }, { content })
    expect(plan.ok).toBe(false)
    expect(plan.failureReason).toBe('selection_missing')
    expect(plan.next).toBe(content)
  })

  it('rejects repeated target fragments instead of using the first hit', () => {
    const target = createTarget()
    const repeated = buildEditPlan(target, {
      type: 'editor_edit',
      version: 1,
      operation: 'replace_match',
      content: '新文',
      target: '段'
    }, { content })
    expect(repeated.ok).toBe(false)
    expect(repeated.failureReason).toBe('ambiguous_target')
    expect(repeated.next).toBe(content)
  })

  it('supports insert positions, append, delete, and rewrite without whole-file replacement', () => {
    const target = createTarget(4, 4)
    const insert = buildEditPlan(target, {
      type: 'editor_edit', version: 1, operation: 'insert', content: '夜色，', position: 'cursor'
    }, { content })
    expect(insert.ok).toBe(true)
    expect(insert.next.slice(0, 9)).toBe('第一段：夜色，男主')

    const append = buildEditPlan(createTarget(), {
      type: 'editor_edit', version: 1, operation: 'append', content: '尾声'
    }, { content })
    expect(append.next.endsWith('\n尾声')).toBe(true)

    const del = buildEditPlan(createTarget(), {
      type: 'editor_edit', version: 1, operation: 'delete', target: '第二段：进入遗迹。\n'
    }, { content })
    expect(del.ok).toBe(true)
    expect(del.next).not.toContain('遗迹')

    const rewrite = buildEditPlan(createTarget(), {
      type: 'editor_edit', version: 1, operation: 'rewrite', content: '拿到钥匙', target: '拿到线索'
    }, { content })
    expect(rewrite.operation).toBe('rewrite')
    expect(rewrite.next).toContain('拿到钥匙')
  })
})

describe('buildEditorEditPrompt', () => {
  it('makes the selection boundary explicit to the model', () => {
    const withSelection = buildEditorEditPrompt({ workspace: 'main', label: '第一章', content: '正文', selectedText: '选区' })
    const withoutSelection = buildEditorEditPrompt({ workspace: 'main', label: '第一章', content: '正文' })
    expect(withSelection).toContain('replace_selection 可直接替换')
    expect(withoutSelection).toContain('禁止 replace_selection')
  })

  it('injects the structure map and focused content for long documents instead of the full text', () => {
    const content = 'x'.repeat(13000)
    const prompt = buildEditorEditPrompt({
      workspace: 'outline',
      label: '大纲编辑器',
      content,
      structureMap: '大纲结构地图：卷 1，章 0，节 0',
      focusContent: '第一卷 风暴起点',
      focusLabel: '（第一卷）'
    })
    expect(prompt).toContain('当前编辑内容为长文档')
    expect(prompt).toContain('大纲结构地图：卷 1')
    expect(prompt).toContain('第一卷 风暴起点')
    expect(prompt).not.toContain(content)
  })

  it('keeps full content for short documents and remains compatible', () => {
    const prompt = buildEditorEditPrompt({ workspace: 'main', label: '第一章', content: '正文全文' })
    expect(prompt).toContain('当前编辑内容：\n正文全文')
  })

  it('uses a chapter anchor to disambiguate repeated targets', () => {
    const repeatedContent = '第一卷\n第二章\n目标片段\n第二卷\n第二章\n目标片段'
    const target = createEditorTargetSnapshot({
      workspace: 'main',
      targetId: 'long-target',
      label: '长文档',
      content: repeatedContent
    })
    const plan = buildEditPlan(target, {
      type: 'editor_edit',
      version: 1,
      operation: 'replace_match',
      content: '新文',
      target: '目标片段',
      chapterTitle: '第二卷'
    }, { content: repeatedContent })
    expect(plan.ok).toBe(true)
    expect(plan.range.start).toBe('第一卷\n第二章\n目标片段\n第二卷\n第二章\n'.length)
    expect(plan.next.slice(plan.range.start, plan.range.end)).toBe('新文')
    expect(plan.next.slice(0, plan.range.start)).toBe('第一卷\n第二章\n目标片段\n第二卷\n第二章\n')
  })
})
