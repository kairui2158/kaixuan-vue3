import { describe, expect, it } from 'vitest'
import { applyAcceptedItems, planEditorEditBatch } from './editorEditBatch'
import { parseEditorEditBatch } from './editorEditProtocol'
import { createEditorTargetSnapshot } from './editorTarget'

const content = '第一段：男主出发。\n第二段：进入遗迹。\n第三段：拿到线索。'

function createTarget() {
  return createEditorTargetSnapshot({
    workspace: 'main',
    targetId: 'tab-1',
    label: '第一章',
    chapterId: 'chapter-1',
    mode: 'ch-body',
    content,
  })
}

describe('parseEditorEditBatch', () => {
  it('parses a valid fenced batch and preserves command order', () => {
    const batch = parseEditorEditBatch('```json\n{"type":"editor_edit_batch","version":1,"commands":[{"operation":"replace_match","content":"禁地","target":"遗迹"},{"operation":"append","content":"尾声"}],"reason":"强化悬念"}\n```')
    expect(batch?.commands).toHaveLength(2)
    expect(batch?.commands[0]).toMatchObject({ operation: 'replace_match', content: '禁地', target: '遗迹' })
    expect(batch?.commands[1]).toMatchObject({ operation: 'append', content: '尾声' })
  })

  it('rejects empty, oversized, and partially invalid batches', () => {
    expect(parseEditorEditBatch('{"type":"editor_edit_batch","commands":[]}')).toBeNull()
    expect(parseEditorEditBatch(`{"type":"editor_edit_batch","commands":[${Array.from({ length: 11 }, () => '{"operation":"append","content":"x"}').join(',')}]}`)).toBeNull()
    expect(parseEditorEditBatch('{"type":"editor_edit_batch","commands":[{"operation":"append","content":"x"},{"operation":"delete"}]}')).toBeNull()
    expect(parseEditorEditBatch('{"type":"editor_edit","operation":"append","content":"x"}')).toBeNull()
  })

  it('rejects over-limit command and batch sizes', () => {
    const long = 'x'.repeat(20001)
    expect(parseEditorEditBatch(`{"type":"editor_edit_batch","commands":[{"operation":"append","content":"${long}"}]}`)).toBeNull()
    const many = Array.from({ length: 10 }, () => '{"operation":"append","content":"' + 'x'.repeat(6500) + '"}').join(',')
    expect(parseEditorEditBatch(`{"type":"editor_edit_batch","commands":[${many}]}`)).toBeNull()
  })
})

describe('planEditorEditBatch', () => {
  it('serially applies commands from the original snapshot', () => {
    const target = createTarget()
    const plan = planEditorEditBatch({
      type: 'editor_edit_batch',
      version: 1,
      target: { workspace: 'main', targetId: 'tab-1', contentVersion: target.contentVersion },
      commands: [
        { type: 'editor_edit', version: 1, operation: 'replace_match', content: '禁地', target: '遗迹' },
        { type: 'editor_edit', version: 1, operation: 'append', content: '尾声' },
      ],
    }, target, { content })
    expect(plan.ok).toBe(true)
    expect(plan.next).toBe('第一段：男主出发。\n第二段：进入禁地。\n第三段：拿到线索。\n尾声')
    expect(plan.items).toHaveLength(2)
  })

  it('rejects the whole batch when a later command fails', () => {
    const target = createTarget()
    const plan = planEditorEditBatch({
      type: 'editor_edit_batch',
      version: 1,
      commands: [
        { type: 'editor_edit', version: 1, operation: 'replace_match', content: '禁地', target: '遗迹' },
        { type: 'editor_edit', version: 1, operation: 'delete', target: '不存在片段' },
      ],
    }, target, { content })
    expect(plan.ok).toBe(false)
    expect(plan.failureReason).toBe('target_not_found')
    expect(plan.items).toHaveLength(0)
    expect(plan.next).toBe(content)
  })

  it('protects target identity and snapshot version', () => {
    const target = createTarget()
    const wrongTarget = planEditorEditBatch({
      type: 'editor_edit_batch',
      version: 1,
      target: { workspace: 'outline', targetId: 'other', contentVersion: target.contentVersion },
      commands: [{ type: 'editor_edit', version: 1, operation: 'append', content: 'x' }],
    }, target, { content })
    expect(wrongTarget.failureReason).toBe('invalid_command')

    const stale = planEditorEditBatch({
      type: 'editor_edit_batch',
      version: 1,
      target: { workspace: 'main', targetId: 'tab-1', contentVersion: target.contentVersion + 1 },
      commands: [{ type: 'editor_edit', version: 1, operation: 'append', content: 'x' }],
    }, target, { content })
    expect(stale.failureReason).toBe('version_changed')
  })

  it('replans accepted commands from the original snapshot', () => {
    const target = createTarget()
    const plan = planEditorEditBatch({
      type: 'editor_edit_batch',
      version: 1,
      commands: [
        { type: 'editor_edit', version: 1, operation: 'replace_match', content: '禁地', target: '遗迹' },
        { type: 'editor_edit', version: 1, operation: 'append', content: '尾声' },
      ],
    }, target, { content })
    expect(plan.ok).toBe(true)

    const accepted = applyAcceptedItems(plan, [1])
    expect(accepted.ok).toBe(true)
    expect(accepted.next).toBe(`${content}\n尾声`)
    expect(accepted.items).toHaveLength(1)
  })
})
