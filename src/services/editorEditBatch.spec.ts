import { describe, expect, it } from 'vitest'
import { applyAcceptedItems, mergeRetriedCommands, planEditorEditBatch } from './editorEditBatch'
import {
  buildEditorWriteProtocolPrompt,
  parseEditorEditBatch,
  parseEditorWriteProtocol,
  type EditorEditBatchCommand,
} from './editorEditProtocol'
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

describe('editor.write JSON compatibility protocol', () => {
  it('parses a fenced direct-write request through balanced JSON extraction', () => {
    const raw = '```json\n{"tool":"editor.write","commands":[{"operation":"append","content":"尾声"}],"reveal":{"mode":"instant","firstChange":false},"reason":"追加尾声"}\n```'
    const request = parseEditorWriteProtocol(raw)
    expect(request).not.toBeNull()
    expect(request?.tool).toBe('editor.write')
    expect(request?.commands).toHaveLength(1)
    expect(request?.commands[0]).toMatchObject({ operation: 'append', content: '尾声' })
    expect(request?.reveal).toEqual({ mode: 'instant', firstChange: false })
    expect(request?.reason).toBe('追加尾声')
  })

  it('rejects partial or over-limit compatibility write requests', () => {
    expect(parseEditorWriteProtocol('普通回答，不写入')).toBeNull()
    expect(parseEditorWriteProtocol('{"tool":"editor.write","commands":[]}')).toBeNull()
    expect(parseEditorWriteProtocol(`{"tool":"editor.write","commands":[${Array.from({ length: 11 }, () => '{"operation":"append","content":"x"}').join(',')}]}`)).toBeNull()
    expect(parseEditorWriteProtocol('{"tool":"editor.write","commands":[{"operation":"delete"}]}')).toBeNull()
  })

  it('does not treat proposal batches or arrays as direct writes', () => {
    expect(parseEditorWriteProtocol('{"type":"editor_edit_batch","commands":[{"operation":"append","content":"x"}]}')).toBeNull()
    expect(parseEditorWriteProtocol('[{"tool":"editor.write","commands":[]}]')).toBeNull()
  })

  it('exposes the JSON protocol rules for non-native-tool providers', () => {
    const prompt = buildEditorWriteProtocolPrompt()
    expect(prompt).toContain('"tool":"editor.write"')
    expect(prompt).toContain('1-10 条')
    expect(prompt).toContain('定位可靠性较低')
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

  it('diagnoses partial failures without weakening batch atomicity', () => {
    const target = createTarget()
    const plan = planEditorEditBatch({
      type: 'editor_edit_batch',
      version: 1,
      commands: [
        { type: 'editor_edit', version: 1, operation: 'replace_match', content: '禁地', target: '遗迹' },
        { type: 'editor_edit', version: 1, operation: 'delete', target: '不存在的线索' },
      ],
    }, target, { content })

    expect(plan.ok).toBe(false)
    expect(plan.failureReason).toBe('target_not_found')
    expect(plan.items).toHaveLength(0)
    expect(plan.next).toBe(content)
    expect(plan.diagnostics?.commandCount).toBe(2)
    expect(plan.diagnostics?.succeededIndexes).toEqual([0])
    expect(plan.diagnostics?.failedItems).toHaveLength(1)
    expect(plan.diagnostics?.failedItems[0]).toMatchObject({
      index: 1,
      reason: 'target_not_found',
      suggestion: 're_read_target'
    })
    expect(JSON.parse(plan.diagnostics?.retryCommand?.content || '{}')).toMatchObject({
      failedIndexes: [1],
      keepIndexes: [0]
    })
    expect(plan.diagnostics?.retryCommand?.reason).toContain('只重提失败条目')
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

  it('merges retried commands while revalidating the whole batch', () => {
    const target = createTarget()
    const originalBatch: EditorEditBatchCommand = {
      type: 'editor_edit_batch' as const,
      version: 1,
      commands: [
        { type: 'editor_edit' as const, version: 1, operation: 'replace_match' as const, content: '禁地', target: '遗迹' },
        { type: 'editor_edit' as const, version: 1, operation: 'delete' as const, target: '不存在的线索' },
        { type: 'editor_edit' as const, version: 1, operation: 'append' as const, content: '尾声' },
      ],
    }
    const failed = planEditorEditBatch(originalBatch, target, { content })
    expect(failed.ok).toBe(false)
    expect(failed.diagnostics?.succeededIndexes).toEqual([0])

    const merged = mergeRetriedCommands(
      originalBatch,
      failed.diagnostics?.succeededIndexes || [],
      [
        { type: 'editor_edit', version: 1, operation: 'delete', target: '拿到线索' },
        { type: 'editor_edit', version: 1, operation: 'append', content: '尾声' },
      ],
      target,
      { content }
    )
    expect(merged.ok).toBe(true)
    expect(merged.next).toBe('第一段：男主出发。\n第二段：进入禁地。\n第三段：。\n尾声')
    expect(merged.items.map(item => item.index)).toEqual([0, 1, 2])
    expect(merged.reason).toContain('重新校验')
  })

  it('rejects mismatched retry counts without partial application', () => {
    const target = createTarget()
    const originalBatch: EditorEditBatchCommand = {
      type: 'editor_edit_batch' as const,
      version: 1,
      commands: [
        { type: 'editor_edit' as const, version: 1, operation: 'replace_match' as const, content: '禁地', target: '遗迹' },
        { type: 'editor_edit' as const, version: 1, operation: 'delete' as const, target: '不存在的线索' },
      ],
    }
    const failed = planEditorEditBatch(originalBatch, target, { content })

    const merged = mergeRetriedCommands(
      originalBatch,
      failed.diagnostics?.succeededIndexes || [],
      [],
      target,
      { content }
    )
    expect(merged.ok).toBe(false)
    expect(merged.failureReason).toBe('invalid_command')
    expect(merged.items).toHaveLength(0)
    expect(merged.next).toBe(content)
    expect(merged.diagnostics?.summary).toContain('重提命令数量不匹配')
  })
})
