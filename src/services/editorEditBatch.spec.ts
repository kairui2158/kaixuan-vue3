import { describe, expect, it } from 'vitest'
import { applyAcceptedItems, planEditorEditBatch } from './editorEditBatch'
import {
  buildEditorWriteProtocolPrompt,
  parseEditorEditBatch,
  parseEditorWriteProtocol,
  type EditorEditBatchCommand,
} from './editorEditProtocol'
import { createEditorTargetSnapshot } from './editorTarget'
import { buildLongDocumentExecutionPlan } from './longDocumentExecutionPlanner'

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

  it('accepts replace_document only as a single-command document replacement', () => {
    const single = parseEditorEditBatch([
      '{"type":"editor_edit_batch","version":1,',
      '"commands":[{"operation":"replace_document","content":"整理后的全文。"}],',
      '"reason":"整理整篇文档"}'
    ].join(''))
    expect(single?.commands).toHaveLength(1)
    expect(single?.commands[0]).toMatchObject({
      operation: 'replace_document',
      content: '整理后的全文。'
    })

    expect(parseEditorEditBatch('{"type":"editor_edit_batch","commands":[{"operation":"replace_document","content":"新全文"},{"operation":"append","content":"x"}]}')).toBeNull()
    expect(parseEditorEditBatch('{"type":"editor_edit_batch","commands":[{"operation":"replace_document","target":"第一段","content":"新全文"}]}')).toBeNull()
    expect(parseEditorEditBatch('{"type":"editor_edit_batch","commands":[{"operation":"replace_document"}]}')).toBeNull()
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

  it('prohibits preview-only replies after JSON write authorization', () => {
    const prompt = buildEditorWriteProtocolPrompt()
    expect(prompt).toContain('写入授权后禁止输出【修改预览】')
    expect(prompt).toContain('禁止再次请求用户确认')
    expect(prompt).toContain('必须调用 editor.write')
    expect(prompt).toContain('必须停止调用工具并说明')
  })

  it('binds JSON protocol guidance to the execution plan operation allowlist', () => {
    const finalDraftPrompt = buildEditorWriteProtocolPrompt(buildLongDocumentExecutionPlan({
      requestText: '全文重写整篇大纲',
      content: `# 第一卷\n\n${'雨'.repeat(12_000)}\n\n# 第二卷\n\n${'雨'.repeat(12_000)}`,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
    }))
    expect(finalDraftPrompt).toContain('当前请求处于终稿生成模式')
    expect(finalDraftPrompt).not.toContain('"tool":"editor.write"')
    expect(finalDraftPrompt).not.toContain('当前允许的写入操作：')

    const normalizePlan = {
      ...buildLongDocumentExecutionPlan({
        requestText: '整理整篇大纲的标点符号和格式',
        content: Array.from({ length: 12 }, (_, index) => `# 第${index + 1}卷\n\n${'雨'.repeat(2_000)}\n\n`).join(''),
        contextWindowTokens: 12_000,
        maxOutputTokens: 4_096,
      }),
    } as const
    const normalizePrompt = buildEditorWriteProtocolPrompt(normalizePlan)
    expect(normalizePrompt).toContain('当前允许的写入操作：replace_match|rewrite')
    expect(normalizePrompt).toContain('禁止整篇 replace_document')
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

  it('diagnoses preflight failures without weakening batch atomicity', () => {
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
      repair: '请整批重新提交修正后的命令'
    })
    expect(plan.diagnostics?.retryCommand?.reason).toContain('必须整批重提')
    expect(plan.diagnostics?.summary).toContain('原文保持不变')
    expect(plan.diagnostics?.summary).toContain('预演通过条目未写入')
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

  it('moves a unique fragment as one atomic command', () => {
    const target = createTarget()
    const plan = planEditorEditBatch({
      type: 'editor_edit_batch',
      version: 1,
      commands: [{
        type: 'editor_edit',
        version: 1,
        operation: 'move',
        target: '第三段：拿到线索。',
        destination: '第一段：男主出发。',
        destinationPosition: 'before',
        reason: '把第三段移动到开头',
      }],
    }, target, { content })
    expect(plan.ok).toBe(true)
    expect(plan.items).toHaveLength(1)
    expect(plan.next).toBe('第三段：拿到线索。\n第一段：男主出发。\n第二段：进入遗迹。')
  })

  it('plans a single replace_document as a complete document replacement', () => {
    const target = createTarget()
    const next = '整理后的第一段。\n整理后的第二段。\n整理后的第三段。'
    const plan = planEditorEditBatch({
      type: 'editor_edit_batch',
      version: 1,
      commands: [{
        type: 'editor_edit',
        version: 1,
        operation: 'replace_document',
        content: next,
        reason: '整理整篇文档',
      }],
    }, target, { content })

    expect(plan.ok).toBe(true)
    expect(plan.next).toBe(next)
    expect(plan.original).toBe(content)
    expect(plan.items).toHaveLength(1)
  })

  it('rejects a move when target or destination is ambiguous and keeps text unchanged', () => {
    const target = createTarget()
    const ambiguousContent = content + '\n重复片段\n重复片段'
    const ambiguousTarget = createEditorTargetSnapshot({
      workspace: 'main',
      targetId: 'tab-1',
      label: '第一章',
      chapterId: 'chapter-1',
      mode: 'ch-body',
      content: ambiguousContent,
    })
    const plan = planEditorEditBatch({
      type: 'editor_edit_batch',
      version: 1,
      commands: [{
        type: 'editor_edit',
        version: 1,
        operation: 'move',
        target: '男主出发',
        destination: '重复片段',
        destinationPosition: 'after',
      }],
    }, ambiguousTarget, { content: ambiguousContent })
    expect(plan.ok).toBe(false)
    expect(plan.failureReason).toBe('ambiguous_target')
    expect(plan.next).toBe(ambiguousContent)
    expect(plan.items).toHaveLength(0)
  })
})
