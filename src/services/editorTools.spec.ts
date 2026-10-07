import { describe, expect, it } from 'vitest'
import {
  createEditorTools,
  resolveEditorToolProtocolVersion,
  ToolGateway,
  type ToolCallEvent,
} from './editorTools'
import { createEditorTargetSnapshot } from './editorTarget'
import { buildLongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import type { ToolEventSink } from './editorTools'

const snapshot = createEditorTargetSnapshot({
  workspace: 'main',
  targetId: 'chapter-1',
  label: '第一章',
  content: '第一段落提到主角。第二段落提到主角。第三段提到伏笔。',
  selectionStart: 0,
  selectionEnd: 3,
})

function makeContext(abortSignal?: AbortSignal) {
  return {
    projectId: 'p1',
    workspace: 'main' as const,
    targetId: 'chapter-1',
    sessionId: 's1',
    iteration: 1,
    abortSignal,
  }
}

describe('editorTools', () => {
  it('resolves editor tool protocol versions with a v1 default', () => {
    expect(resolveEditorToolProtocolVersion({ commands: [] })).toEqual({ version: 1, defaulted: true })
    expect(resolveEditorToolProtocolVersion({ protocolVersion: 1, commands: [] })).toEqual({ version: 1, defaulted: false })
  })

  it('get_state returns a summary instead of full content', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => snapshot }))
    const result = await gateway.execute('editor.get_state', {}, makeContext())
    expect(result.ok).toBe(true)
    expect((result.data as any).contentLength).toBe(snapshot.content.length)
    expect((result.data as any).contentPreview.length).toBeLessThanOrEqual(240)
  })

  it('search caps results and returns context windows', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => snapshot }))
    const result = await gateway.execute('editor.search', { query: '主角' }, makeContext())
    expect(result.ok).toBe(true)
    expect((result.data as any).total).toBe(2)
    expect((result.data as any).matches[0].context.length).toBeLessThanOrEqual(300)
  })

  it('locate rejects ambiguous fragments with a structured error', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => snapshot }))
    const result = await gateway.execute('editor.locate', { fragment: '主角' }, makeContext())
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('ambiguous_target')

    expect(gateway.has('editor.propose_edits')).toBe(false)
  })

  it('locate returns structural anchors when a fragment is ambiguous', async () => {
    const structuredSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲',
      content: '# 第一卷\n\n## 第1节 主角出发\n沈萤停下。\n\n## 第2节 旧信\n沈萤停下。\n',
    })
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => structuredSnapshot }))

    const result = await gateway.execute('editor.locate', {
      fragment: '沈萤停下。',
    }, { ...makeContext(), workspace: 'outline', targetId: 'outline' })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('ambiguous_target')
    expect(result.error?.message).toContain('第1节 主角出发')
    expect(result.error?.message).toContain('第2节 旧信')
    expect(result.error?.message).toContain('优先使用结构锚点')
  })

  it('locate returns structural anchors when a fragment is not found', async () => {
    const structuredSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲',
      content: '# 第一卷\n\n## 第1节 主角出发\n她在灯塔下看旧信。\n\n## 第2节 渡口\n潮水退去。\n',
    })
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => structuredSnapshot }))

    const result = await gateway.execute('editor.locate', {
      fragment: '沈萤停下。',
    }, { ...makeContext(), workspace: 'outline', targetId: 'outline' })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('target_not_found')
    expect(result.error?.message).toContain('第1节 主角出发')
    expect(result.error?.message).toContain('第2节 渡口')
    expect(result.error?.message).toContain('优先使用结构锚点')
  })

  it('direct mode exposes the unified direct write tool', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))
    expect(gateway.has('editor.write')).toBe(true)
    expect(gateway.has('editor.propose_edits')).toBe(false)
  })

  it('returns a correction hint when editor.write is called without commands', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))
    const result = await gateway.execute('editor.write', {}, makeContext())
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('missing_field')
    expect(result.error?.message).toContain('commands')
    expect(result.error?.message).toContain('replace_match')
  })

  it('editor.write applies a validated batch immediately', async () => {
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))
    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_match', content: '新主角', target: '第一段落提到主角。' }],
      reveal: { mode: 'instant', firstChange: false },
    }, makeContext())

    expect(result.ok).toBe(true)
    expect((result.data as any)).toMatchObject({
      status: 'written',
      commandCount: 1,
      rollbackAvailable: true,
      reveal: { mode: 'instant', firstChange: false },
    })
    expect((result.data as any).repairPolicy).toContain('禁止重复提交本 batchId')
    expect((result.data as any).repairPolicy).toContain('文档版本已变化')
    expect(appliedBatches).toHaveLength(1)
    expect(appliedBatches[0].next).toBe('新主角第二段落提到主角。第三段提到伏笔。')
    expect(appliedBatches[0].original).toBe(snapshot.content)
  })

  it('locate normalizes escaped whitespace without exposing a write path', async () => {
    const escapedSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲',
      content: '第一段 沈萤停下。\n\t她在灯塔下看旧信。',
    })
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => escapedSnapshot }))

    const result = await gateway.execute('editor.locate', {
      fragment: '沈萤停下。\\n\\t她在灯塔下看旧信。',
    }, { ...makeContext(), workspace: 'outline', targetId: 'outline' })

    expect(result.ok).toBe(true)
    expect((result.data as any)).toMatchObject({
      unique: true,
      fuzzy: false,
      normalized: true,
      start: escapedSnapshot.content.indexOf('沈萤停下'),
      end: escapedSnapshot.content.length,
    })
  })

  it('does not relax exact write matching through locate normalization', async () => {
    const escapedSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲',
      content: '第一段 沈萤停下。\n\t她在灯塔下看旧信。',
    })
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => escapedSnapshot,
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{
        operation: 'replace_match',
        target: '沈萤停下。\\n\\t她在灯塔下看旧信。',
        content: '新主角',
      }],
    }, { ...makeContext(), workspace: 'outline', targetId: 'outline' })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('target_not_found')
  })

  it('editor.write returns the document version from the workspace applier', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async () => ({
        ok: true,
        rollbackAvailable: true,
        documentVersion: 7,
        contentHash: 'hash-after-write',
      }),
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'append', content: '新增段。' }],
    }, makeContext())

    expect(result.ok).toBe(true)
    expect((result.data as any).documentVersion).toBe(7)
    expect((result.data as any).contentHash).toBe('hash-after-write')
  })

  it('rejects an entire contaminated write batch without calling applyWrite and emits a trace event', async () => {
    const appliedWrites: any[] = []
    const events: any[] = []
    const decisions: any[] = []
    const onEvent: ToolEventSink = event => events.push(event)
    const gateway = new ToolGateway()
    gateway.onEvent(onEvent)
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedWrites.push(input)
        return { ok: true, rollbackAvailable: true }
      },
      conversationMarkers: [
        { role: 'assistant', content: '我已经完成了灯塔回收和风暴伏笔的统一整理。' },
      ],
      onContaminationDecision: decision => decisions.push(decision),
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'append', content: '我已经完成了灯塔回收和风暴伏笔的统一整理。' }],
    }, makeContext())

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('conversation_contamination')
    expect(result.error?.retryable).toBe(true)
    expect((result.data as any).guard).toMatchObject({ decision: 'rejected' })
    expect(appliedWrites).toHaveLength(0)
    expect(decisions.at(-1)).toMatchObject({
      type: 'write-contamination-rejected',
      payload: { decision: 'rejected' },
    })
  })

  it('allows a conversation fragment when the current user request explicitly provided it', async () => {
    const appliedWrites: any[] = []
    const events: any[] = []
    const decisions: any[] = []
    const gateway = new ToolGateway()
    gateway.onEvent(event => events.push(event))
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedWrites.push(input)
        return { ok: true, rollbackAvailable: true }
      },
      conversationMarkers: [
        { role: 'assistant', content: '我已经完成了灯塔回收和风暴伏笔的统一整理。' },
      ],
      userRequestText: '请把这句话写入正文：我已经完成了灯塔回收和风暴伏笔的统一整理。',
      onContaminationDecision: decision => decisions.push(decision),
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'append', content: '我已经完成了灯塔回收和风暴伏笔的统一整理。' }],
    }, makeContext())

    expect(result.ok).toBe(true)
    expect(appliedWrites).toHaveLength(1)
    expect(decisions.at(-1)).toMatchObject({
      type: 'write-contamination-bypassed',
      payload: { decision: 'user_provided' },
    })
  })

  it('editor.write rejects validation failures without calling applyWrite', async () => {
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))
    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_match', content: '新主角', target: '主角' }],
    }, makeContext())

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('ambiguous_target')
    expect(result.error?.retryable).toBe(true)
    expect(appliedBatches).toHaveLength(0)
    expect((result.data as any).failedItems[0]).toMatchObject({
      reason: 'ambiguous_target',
      suggestion: 'extend_fragment',
    })
    expect((result.data as any).repairPolicy).toContain('完整批次')
  })

  it('editor.write rejects invalid operation and unknown fields before planning', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))

    const invalidOperation = await gateway.execute('editor.write', {
      commands: [{ operation: 'insertAfter', content: '新主角' }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(invalidOperation.ok).toBe(false)
    expect(invalidOperation.error?.code).toBe('invalid_input')
    expect(invalidOperation.error?.message).toContain('operation 不在 enum 范围内')
    expect((invalidOperation.data as any).validValues).toEqual([
      'insert',
      'replace_selection',
      'replace_match',
      'append',
      'delete',
      'move',
      'reorder_sections',
      'rewrite',
      'replace_document',
    ])
    expect((invalidOperation.data as any).repairPolicy).toContain('完整批次')

    const unknownField = await gateway.execute('editor.write', {
      commands: [{ operation: 'insert', content: '新主角' }],
      insertAfter: true,
    }, { ...makeContext(), workspace: 'outline' })
    expect(unknownField.ok).toBe(false)
    expect(unknownField.error?.code).toBe('invalid_input')
    expect(unknownField.error?.message).toContain('insertAfter 不是允许的字段')
  })

  it('editor.write applies replace_document as a single-command atomic replacement', async () => {
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const replacement = '整理后的完整正文。'
    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_document', content: replacement, reason: '整理整篇文档' }],
      reveal: { mode: 'instant' },
    }, makeContext())

    expect(result.ok).toBe(true)
    expect(appliedBatches).toHaveLength(1)
    expect(appliedBatches[0].original).toBe(snapshot.content)
    expect(appliedBatches[0].next).toBe(replacement)
    expect((result.data as any)).toMatchObject({
      status: 'written',
      commandCount: 1,
      writtenLength: replacement.length,
    })
  })

  it('editor.write rejects replace_document mixed with other commands or missing content', async () => {
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const mixed = await gateway.execute('editor.write', {
      commands: [
        { operation: 'replace_document', content: '新全文' },
        { operation: 'append', content: '追加' },
      ],
    }, makeContext())
    expect(mixed.ok).toBe(false)
    expect(mixed.error?.code).toBe('invalid_input')
    expect(mixed.error?.message).toContain('replace_document 必须单独成批')

    const missingContent = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_document' }],
    }, makeContext())
    expect(missingContent.ok).toBe(false)
    expect(missingContent.error?.code).toBe('invalid_input')
    expect(missingContent.error?.message).toContain('replace_document 必须携带完整整理后的全文 content')

    const withTarget = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_document', content: '新全文', target: '第一段' }],
    }, makeContext())
    expect(withTarget.ok).toBe(false)
    expect(withTarget.error?.code).toBe('invalid_input')
    expect(withTarget.error?.message).toContain('replace_document 不允许携带 target')

    expect(appliedBatches).toHaveLength(0)
  })

  it('editor.write blocks all commands in final-draft mode', async () => {
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '全文重写整篇大纲',
        content: `# 第一卷\n\n${'雨'.repeat(12_000)}\n\n# 第二卷\n\n${'雨'.repeat(12_000)}`,
        contextWindowTokens: 128_000,
        maxOutputTokens: 8_192,
      }),
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_document', content: '整篇替换内容' }],
    }, makeContext())
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('final_draft_mode_active')
    expect(result.error?.message).toContain('终稿生成模式')
    expect(appliedBatches).toHaveLength(0)

    const rewrite = await gateway.execute('editor.write', {
      commands: [{ operation: 'rewrite', target: '第一段落提到主角。', content: '改写' }],
    }, makeContext())
    expect(rewrite.ok).toBe(false)
    expect(rewrite.error?.code).toBe('final_draft_mode_active')
    expect(appliedBatches).toHaveLength(0)
  })

  it('editor.write allows only normalize operations under an explicit EditTask normalize plan', async () => {
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '整理整篇大纲的标点符号和格式',
        content: Array.from({ length: 12 }, (_, index) => `# 第${index + 1}卷\n\n${'雨'.repeat(2_000)}\n\n`).join(''),
        contextWindowTokens: 12_000,
        maxOutputTokens: 4_096,
      }),
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const move = await gateway.execute('editor.write', {
      commands: [{
        operation: 'move',
        target: '第一段落提到主角。',
        destination: '第三段提到伏笔。',
        destinationPosition: 'after',
      }],
    }, makeContext())
    expect(move.ok).toBe(false)
    expect(move.error?.code).toBe('operation_not_allowed_by_execution_plan')

    const rewrite = await gateway.execute('editor.write', {
      commands: [{ operation: 'rewrite', target: '第一段落提到主角。', content: '第一段落提到主角，' }],
    }, makeContext())
    expect(rewrite.ok).toBe(true)
    expect(appliedBatches).toHaveLength(1)
  })

  it('editor.write keeps the dedicated protocol rejection for whole-document replacement under an edit task', async () => {
    const longContent = [
      '第1节',
      '',
      '甲'.repeat(5200),
      '',
      '第2节',
      '',
      '乙'.repeat(5200),
      '',
    ].join('\n')
    const longDocumentSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'million-outline',
      label: '百万字大纲',
      content: longContent,
    })
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => longDocumentSnapshot,
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '把整篇大纲重新整理排序',
        content: longContent,
        contextWindowTokens: 12_000,
        maxOutputTokens: 2_048,
      }),
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{
        operation: 'replace_document',
        content: '整篇替换在长文档计划下必须被拒绝。',
        reason: '长文档整篇替换负向测试',
      }],
    }, {
      ...makeContext(),
      workspace: 'outline',
      targetId: 'million-outline',
      writableTarget: 'million-outline',
    })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('document_too_large_for_whole_replacement')
    expect(result.error?.message).toContain('禁止整篇 replace_document')
    expect(result.error?.retryable).toBe(true)
    expect(appliedBatches).toHaveLength(0)
  })

  it('editor.write applies deduplicate deletions in sequential batches and blocks collateral rewrites', async () => {
    const longContent = [
      '## 第1节',
      '船工喊号的声音被雨压低。',
      '',
      '## 第2节',
      '同一句重复内容。',
      '',
      '## 第3节',
      '同一句重复内容。',
      '',
      '## 第4节',
      '未重复的游离段落。',
      '',
    ].join('\n')
    const deduplicateSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'chapter-1',
      label: '去重测试',
      content: longContent,
    })
    const appliedBatches: any[] = []
    let currentContent = longContent
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => ({ ...deduplicateSnapshot, content: currentContent }),
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '删除大纲里的重复项，未重复的游离段落不动',
        content: longContent,
        contextWindowTokens: 12_000,
        maxOutputTokens: 2_048,
      }),
      applyWrite: async input => {
        currentContent = input.next
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const collateralRewrite = await gateway.execute('editor.write', {
      commands: [{ operation: 'rewrite', target: '未重复的游离段落。', content: '顺手改写未重复段落。' }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(collateralRewrite.ok).toBe(false)
    expect(collateralRewrite.error?.code).toBe('operation_not_allowed_by_execution_plan')
    expect(appliedBatches).toHaveLength(0)

    const firstBatch = await gateway.execute('editor.write', {
      commands: [{ operation: 'delete', target: '## 第2节\n同一句重复内容。', reason: '删除第2节重复项' }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(firstBatch.ok).toBe(true)

    const secondBatch = await gateway.execute('editor.write', {
      commands: [{ operation: 'delete', target: '## 第3节\n同一句重复内容。', reason: '删除第3节重复项' }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(secondBatch.ok).toBe(true)

    expect(appliedBatches).toHaveLength(2)
    expect(appliedBatches[0].next).not.toContain('第2节')
    expect(appliedBatches[0].next).toContain('第3节')
    expect(appliedBatches[1].next).not.toContain('第3节')
    expect(currentContent).toContain('未重复的游离段落。')
    expect(currentContent).not.toContain('同一句重复内容。')
  })

  it('editor.write applies normalize replacements across multiple EditTask batches', async () => {
    let content = ''
    const duplicateSnapshot = () => {
      const next = createEditorTargetSnapshot({
        workspace: 'outline',
        targetId: 'chapter-1',
        label: '格式整理',
        content,
      })
      return next
    }
    const longContent = [
      '## 第1节',
      '第一段文字,需要整理标点。',
      '',
      '## 第2节',
      '第二段文字,需要整理标点。',
      '',
    ].join('\n')
    content = longContent
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => duplicateSnapshot(),
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '整理整篇大纲的标点符号，未重复的游离段落保持不动',
        content: longContent,
        contextWindowTokens: 12_000,
        maxOutputTokens: 2_048,
      }),
      applyWrite: async input => {
        content = input.next
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const firstBatch = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_match', target: '第一段文字,需要整理标点。', content: '第一段文字，需要整理标点。', reason: '整理第1节标点' }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(firstBatch.ok).toBe(true)

    const secondBatch = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_match', target: '第二段文字,需要整理标点。', content: '第二段文字，需要整理标点。', reason: '整理第2节标点' }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(secondBatch.ok).toBe(true)

    expect(appliedBatches).toHaveLength(2)
    expect(appliedBatches[0].next).toContain('第一段文字，需要整理标点。')
    expect(appliedBatches[0].next).toContain('第二段文字,需要整理标点。')
    expect(content).toContain('第二段文字，需要整理标点。')
    expect(content).not.toContain('第二段文字,需要整理标点。')
  })

  it('editor.write maps compound batches to their matching planner segments and invariants', async () => {
    const longContent = [
      '## 第1节',
      '同一句重复内容,标点待整理。',
      '',
      '## 第2节',
      '同一句重复内容,标点待整理。',
      '',
      '## 第3节',
      '未重复的游离段落,标点待整理。',
      '',
    ].join('\n')
    let content = longContent
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => createEditorTargetSnapshot({
        workspace: 'outline',
        targetId: 'chapter-1',
        label: '复合整理',
        content,
      }),
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '重复项删除，同时统一标题层级、编号和标点',
        content: longContent,
        contextWindowTokens: 128_000,
        maxOutputTokens: 8_192,
      }),
      applyWrite: async input => {
        content = input.next
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const deletion = await gateway.execute('editor.write', {
      commands: [{ operation: 'delete', target: '## 第2节\n同一句重复内容,标点待整理。', reason: '删除第2节重复项' }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(deletion.ok).toBe(true)
    expect(appliedBatches[0].batchDetail).toMatchObject({
      segmentId: 'structure-plan',
      writeStrategy: 'delete',
      invariantResult: 'planned-deletion-only',
    })
    expect(appliedBatches[0].coverage).toMatchObject({
      segmentId: 'structure-plan',
      reason: 'declared_segment',
      coverageTrusted: true,
      commands: [expect.objectContaining({ operation: 'delete', segmentId: 'structure-plan' })],
    })

    const normalize = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_match', target: '未重复的游离段落,标点待整理。', content: '未重复的游离段落，标点已整理。' }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(normalize.ok).toBe(true)
    expect(appliedBatches[1].batchDetail).toMatchObject({
      segmentId: 'normalize-segment-1',
      writeStrategy: 'replace_match',
      invariantResult: 'normalize-changes-punctuation-whitespace-format-only',
    })
    expect(appliedBatches[1].coverage).toMatchObject({
      segmentId: 'normalize-segment-1',
      reason: 'declared_segment',
      coverageTrusted: true,
      commands: [expect.objectContaining({
        operation: 'replace_match',
        segmentId: 'normalize-segment-1',
      })],
    })
    expect(content).not.toContain('## 第2节')
    expect(content).toContain('未重复的游离段落，标点已整理。')

    const coverageRecords = (deletion.data as any).coverage && (normalize.data as any).coverage
      ? [deletion.data, normalize.data]
      : []
    expect(coverageRecords).toHaveLength(2)
  })

  it('editor.write rejects replacement commands that omit content', async () => {
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const missingContent = await gateway.execute('editor.write', {
      commands: [{
        operation: 'replace_match',
        target: '第一段落提到主角。',
        reason: '模型只提交 target、未提交新文',
      }],
    }, makeContext())
    expect(missingContent.ok).toBe(false)
    expect(missingContent.error?.code).toBe('invalid_input')
    expect(missingContent.error?.message).toContain('replace_match 必须同时携带 target（原文）与 content（新文）')
    expect(missingContent.error?.message).toContain('若目的是删除原文，请使用 delete 操作')
    expect(appliedBatches).toHaveLength(0)

    const blankContent = await gateway.execute('editor.write', {
      commands: [{ operation: 'rewrite', target: '主角', content: '   ' }],
    }, makeContext())
    expect(blankContent.ok).toBe(false)
    expect(blankContent.error?.code).toBe('invalid_input')
    expect(blankContent.error?.message).toContain('rewrite 必须同时携带 target（原文）与 content（新文）')

    const emptyMoveContent = await gateway.execute('editor.write', {
      commands: [{
        operation: 'move',
        target: '第一段落提到主角。',
        destination: '第三段提到伏笔。',
        destinationPosition: 'after',
        content: '  ',
      }],
    }, makeContext())
    expect(emptyMoveContent.ok).toBe(false)
    expect(emptyMoveContent.error?.code).toBe('invalid_input')
    expect(emptyMoveContent.error?.message).toContain('move 的 content 可选，但提交时必须是非空追加文本')
    expect(appliedBatches).toHaveLength(0)
  })

  it('editor.write lists section candidates when delete target is ambiguous', async () => {
    const duplicatedContent = '## 第1节 出发\n船工喊号的声音被雨压低。\n\n## 第11节 渡口\n船工喊号的声音被雨压低。\n'
    const duplicatedSnapshot = {
      ...snapshot,
      content: duplicatedContent,
    }
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => duplicatedSnapshot,
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'delete', target: '船工喊号的声音被雨压低' }],
    }, makeContext())

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('ambiguous_target')
    expect(result.error?.message).toContain('删除目标出现多次')
    expect(result.error?.message).toContain('第1节')
    expect(result.error?.message).toContain('第11节')
  })

  it('editor.write rejects unsupported protocol versions before execution', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))

    const unsupported = await gateway.execute('editor.write', {
      protocolVersion: 2,
      commands: [{ operation: 'append', content: '新段落' }],
    }, makeContext())
    expect(unsupported.ok).toBe(false)
    expect(unsupported.error?.code).toBe('unsupported_protocol_version')
    expect(unsupported.error?.message).toContain('当前支持 1')

    const explicitV1 = await gateway.execute('editor.write', {
      protocolVersion: 1,
      commands: [{ operation: 'append', content: '新段落' }],
    }, makeContext())
    expect(explicitV1.ok).toBe(true)
  })

  it('editor.write rejects semantically invalid operation combinations', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))

    const insertWithTarget = await gateway.execute('editor.write', {
      commands: [{ operation: 'insert', content: '新主角', target: '主角' }],
    }, makeContext())
    expect(insertWithTarget.ok).toBe(false)
    expect(insertWithTarget.error?.code).toBe('invalid_input')
    expect(insertWithTarget.error?.message).toContain('不允许携带 target')

    const replaceSelectionAtCursor = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_selection', content: '新主角', position: 'cursor' }],
    }, makeContext())
    expect(replaceSelectionAtCursor.ok).toBe(false)
    expect(replaceSelectionAtCursor.error?.code).toBe('invalid_input')
    expect(replaceSelectionAtCursor.error?.message).toContain('不允许 position=cursor')
  })

  it('editor.write keeps failed batches atomic and requires a full retry', async () => {
    let failedBatch: any = null
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
      onFailedBatch: batch => { failedBatch = batch },
      takeFailedBatch: () => failedBatch,
    }))

    const failed = await gateway.execute('editor.write', {
      commands: [
        { operation: 'replace_match', content: '新主角', target: '第一段落提到主角。' },
        { operation: 'replace_match', content: '新伏笔', target: '主角' },
      ],
    }, makeContext())
    expect(failed.ok).toBe(false)
    expect(failedBatch).toBeNull()
    expect((failed.data as any).repairPolicy).toContain('完整批次')
    expect((failed.data as any).repairPolicy).toContain('move')
    expect((failed.data as any).summary).toContain('原文保持不变')

    const retried = await gateway.execute('editor.write', {
      commands: [
        { operation: 'replace_match', content: '新主角', target: '第一段落提到主角。' },
        { operation: 'replace_match', content: '新伏笔', target: '第三段提到伏笔。' },
      ],
      reason: '整批重提',
    }, makeContext())

    expect(retried.ok).toBe(true)
    expect((retried.data as any).commandCount).toBe(2)
    expect(appliedBatches).toHaveLength(1)
    expect(appliedBatches[0].next).toBe('新主角第二段落提到主角。新伏笔')
    expect(failedBatch).toBeNull()
  })

  it('editor.write moves a unique fragment atomically', async () => {
    const moveSnapshot = createEditorTargetSnapshot({
      workspace: 'main',
      targetId: 'move-tab',
      label: '移动测试',
      content: '第一段。\n第二段。\n第三段。',
    })
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => moveSnapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{
        operation: 'move',
        target: '第二段。',
        destination: '第一段。',
        destinationPosition: 'after',
        reason: '保持原位验证',
      }],
    }, { ...makeContext(), targetId: 'move-tab' })

    expect(result.ok).toBe(true)
    expect(appliedBatches).toHaveLength(1)
    expect(appliedBatches[0].commands).toHaveLength(1)

    const moved = await gateway.execute('editor.write', {
      commands: [{
        operation: 'move',
        target: '第三段。',
        destination: '第一段。',
        destinationPosition: 'before',
        reason: '把第三段移动到第一段之前',
      }],
    }, { ...makeContext(), targetId: 'move-tab' })

    expect(moved.ok).toBe(true)
    expect(appliedBatches[1].next).toBe('第三段。\n第一段。\n第二段。')
  })

  it('editor.write moves a whole heading section without an execution plan', async () => {
    const longContent = [
      '第1节',
      '',
      '甲'.repeat(5200),
      '',
      '第2节',
      '',
      '乙'.repeat(5200),
      '',
      '第3节',
      '',
      '丙'.repeat(1000),
      '',
    ].join('\n')
    const restructureSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'chapter-1',
      label: '长文档',
      content: longContent,
    })
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => restructureSnapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{
        operation: 'move',
        target: '第2节',
        destination: '第3节',
        destinationPosition: 'after',
        reason: '整节重排',
      }],
    }, { ...makeContext(), workspace: 'outline' })

    expect(result.ok).toBe(true)
    expect(appliedBatches).toHaveLength(1)
    expect(appliedBatches[0].next.indexOf('第3节')).toBeLessThan(
      appliedBatches[0].next.indexOf('第2节')
    )
    expect(appliedBatches[0].next).toContain('乙'.repeat(5200))
  })

  it('editor.write rejects move under a restructure plan so reorder stays atomic', async () => {
    const longContent = [
      '第1节',
      '',
      '甲'.repeat(5200),
      '',
      '第2节',
      '',
      '乙'.repeat(5200),
      '',
    ].join('\n')
    const restructureSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'chapter-1',
      label: '长文档',
      content: longContent,
    })
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => restructureSnapshot,
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '把整篇大纲重新整理排序',
        content: longContent,
        contextWindowTokens: 12_000,
        maxOutputTokens: 2_048,
      }),
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{
        operation: 'move',
        target: '第2节',
        destination: '第1节',
        destinationPosition: 'before',
        reason: '旧协议试图用 move 拼接整篇重排',
      }],
    }, { ...makeContext(), workspace: 'outline' })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('operation_not_allowed_by_execution_plan')
    expect(result.error?.message).toContain('reorder_sections')
    expect(result.error?.retryable).toBe(true)
    expect(appliedBatches).toHaveLength(0)
  })

  it('editor.write atomically reorders all sections by structure id under a restructure plan', async () => {
    const longContent = [
      '第1节',
      '',
      '甲'.repeat(5200),
      '',
      '第2节',
      '',
      '乙'.repeat(5200),
      '',
      '第3节',
      '',
      '丙'.repeat(1000),
      '',
    ].join('\n')
    const restructureSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'chapter-1',
      label: '长文档',
      content: longContent,
    })
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => restructureSnapshot,
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '把整篇大纲重新整理排序',
        content: longContent,
        contextWindowTokens: 12_000,
        maxOutputTokens: 2_048,
      }),
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{
        operation: 'reorder_sections',
        order: ['section-3', 'section-1', 'section-2'],
        reason: '整篇原子重排',
      }],
    }, { ...makeContext(), workspace: 'outline' })

    expect(result.ok).toBe(true)
    expect(appliedBatches).toHaveLength(1)
    expect(appliedBatches[0].next.indexOf('第3节')).toBeLessThan(appliedBatches[0].next.indexOf('第1节'))
    expect(appliedBatches[0].next.indexOf('第1节')).toBeLessThan(appliedBatches[0].next.indexOf('第2节'))
    expect(appliedBatches[0].next).toContain('乙'.repeat(5200))
    expect((result.data as any).structureIdentity).toMatchObject({
      stableIds: ['section-1', 'section-2', 'section-3'],
      migratedIds: [],
      addedIds: [],
      removedIds: [],
    })
    expect(appliedBatches[0].coverage).toMatchObject({
      coverageTrusted: true,
      reason: 'single_segment_plan',
      commands: [expect.objectContaining({
        operation: 'reorder_sections',
        reorderedRanges: [
          expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }),
          expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }),
          expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }),
        ],
      })],
    })
  })

  it('editor.write keeps structure-repair coverage aligned with the staged plan', async () => {
    const longContent = [
      '# 第一卷',
      '',
      '## 第1节 主角出发',
      '她在灯塔下看旧信。',
      '',
      '## 第2节 渡口',
      '潮水退去。',
      '',
      '## 第3节 旧信',
      '同一句重复内容。',
      '',
    ].join('\n')
    let content = longContent
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => createEditorTargetSnapshot({
        workspace: 'outline',
        targetId: 'chapter-1',
        label: '结构修复',
        content,
      }),
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '重排全文结构并清理重复内容',
        content: longContent,
        contextWindowTokens: 12_000,
        maxOutputTokens: 2_048,
        intent: 'edit',
      }),
      applyWrite: async input => {
        content = input.next
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const structureRepair = await gateway.execute('editor.write', {
      commands: [{
        operation: 'move',
        target: '## 第1节 主角出发',
        destination: '## 第3节 旧信',
        destinationPosition: 'after',
      }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(structureRepair.ok).toBe(true)
    expect(appliedBatches[0].coverage).toMatchObject({
      coverageTrusted: true,
      commands: [expect.objectContaining({
        operation: 'move',
        segmentId: 'structure-repair',
      })],
    })

    const normalize = await gateway.execute('editor.write', {
      commands: [{
        operation: 'replace_match',
        target: '同一句重复内容。',
        content: '同一句重复内容，已整理。',
      }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(normalize.ok).toBe(true)
    expect(appliedBatches[1].coverage).toMatchObject({
      coverageTrusted: true,
      commands: [expect.objectContaining({
        operation: 'replace_match',
        segmentId: 'normalize-segment-1',
      })],
    })

    const coverageRecords = [
      structureRepair.data as { coverage?: { segmentId?: string } },
      normalize.data as { coverage?: { segmentId?: string } },
    ]
    expect(coverageRecords.map(record => record.coverage?.segmentId)).toEqual([
      'structure-repair',
      'normalize-segment-1',
    ])
  })

  it('maps heading-level replacements to structure repair without misclassifying normalize commands', async () => {
    const longContent = [
      '# 第一卷',
      '',
      '第1节 主角出发',
      '她在灯塔下看旧信。',
      '',
      '第2节 渡口',
      '潮水退去。',
    ].join('\n')
    let content = longContent
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => createEditorTargetSnapshot({
        workspace: 'outline',
        targetId: 'chapter-1',
        label: '复合重构',
        content,
      }),
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '重排全文结构并清理重复内容，同时统一标题层级和标点',
        content: longContent,
        contextWindowTokens: 12_000,
        maxOutputTokens: 2_048,
        intent: 'edit',
      }),
      applyWrite: async input => {
        content = input.next
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const result = await gateway.execute('editor.write', {
      commands: [
        {
          operation: 'replace_match',
          target: '第1节 主角出发',
          content: '## 第1节 主角出发',
          reason: '为裸标题补层级',
        },
        {
          operation: 'replace_match',
          target: '她在灯塔下看旧信。',
          content: '她在灯塔下看旧信！',
          reason: '统一标点',
        },
      ],
    }, { ...makeContext(), workspace: 'outline' })

    expect(result.ok).toBe(true)
    expect(appliedBatches).toHaveLength(1)
    expect(appliedBatches[0].batchDetail).toMatchObject({
      segmentId: 'structure-repair',
      writeStrategy: 'structure_repair',
    })
    expect(appliedBatches[0].coverage).toMatchObject({
      coverageTrusted: true,
      commands: [
        expect.objectContaining({
          operation: 'replace_match',
          segmentId: 'structure-repair',
        }),
        expect.objectContaining({
          operation: 'replace_match',
          segmentId: 'normalize-segment-1',
        }),
      ],
    })
    expect(content).toContain('## 第1节 主角出发')
    expect(content).toContain('她在灯塔下看旧信！')
  })

  it('maps same-text heading level upgrades with surrounding body to structure repair', async () => {
    const longContent = [
      '# 第一卷',
      '',
      '### 六大势力总览',
      '',
      '潮水退去。',
    ].join('\n')
    let content = longContent
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => createEditorTargetSnapshot({
        workspace: 'outline',
        targetId: 'chapter-1',
        label: '标题升级',
        content,
      }),
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '重排全文结构并清理重复内容，同时统一标题层级和标点',
        content: longContent,
        contextWindowTokens: 12_000,
        maxOutputTokens: 2_048,
        intent: 'edit',
      }),
      applyWrite: async input => {
        content = input.next
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{
        operation: 'replace_match',
        target: '### 六大势力总览\n\n潮水退去。',
        content: '## 六大势力总览\n\n潮水退去。',
        reason: 'structure-repair：板块应提升为二级章节',
      }],
    }, { ...makeContext(), workspace: 'outline' })

    expect(result.ok).toBe(true)
    expect(appliedBatches[0].batchDetail).toMatchObject({
      segmentId: 'structure-repair',
      writeStrategy: 'structure_repair',
    })
    expect(appliedBatches[0].coverage).toMatchObject({
      coverageTrusted: true,
      commands: [expect.objectContaining({
        operation: 'replace_match',
        segmentId: 'structure-repair',
      })],
    })
    expect(content).toContain('## 六大势力总览')
  })

  it('editor.write builds trusted direct coverage for authorized targeted edits without a batch declaration', async () => {
    const directContent = '第一段：旧句。\n第二段：验证正文。'
    const directSnapshot = createEditorTargetSnapshot({
      workspace: 'main',
      targetId: 'chapter-1',
      label: '主页直写',
      content: directContent,
    })
    const plan = buildLongDocumentExecutionPlan({
      requestText: '把第一段的旧句改成新句',
      content: directContent,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })
    expect(plan.mode).toBe('direct')
    expect(plan.segments).toHaveLength(1)

    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => directSnapshot,
      mode: 'direct',
      executionPlan: plan,
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: plan.operation,
        mode: plan.mode,
        reason: 'test-direct-write',
      },
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{
        operation: 'replace_match',
        target: '第一段：旧句。',
        content: '第一段：新句。',
        reason: '授权 direct 写入',
      }],
    }, makeContext())

    expect(result.ok).toBe(true)
    expect((result.data as any).coverage).toMatchObject({
      coverageTrusted: true,
      reason: 'single_segment_plan',
      commands: [expect.objectContaining({
        operation: 'replace_match',
        segmentId: plan.segments[0].segmentId,
      })],
    })
    expect(appliedBatches).toHaveLength(1)
  })

  it('editor.write keeps direct coverage semantics independent of write authorization', async () => {
    const directContent = '第一段：旧句。\n第二段：验证正文。'
    const plan = buildLongDocumentExecutionPlan({
      requestText: '把第一段的旧句改成新句',
      content: directContent,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })
    expect(plan.mode).toBe('direct')
    expect(plan.segments).toHaveLength(1)

    const coverageByAuthorization = new Map<string, unknown>()
    for (const withAuthorization of [true, false]) {
      const directSnapshot = createEditorTargetSnapshot({
        workspace: 'main',
        targetId: 'chapter-1',
        label: '主页直写',
        content: directContent,
      })
      const gateway = new ToolGateway()
      gateway.registerAll(createEditorTools({
        getSnapshot: () => directSnapshot,
        mode: 'direct',
        executionPlan: plan,
        ...(withAuthorization ? {
          writeAuthorization: {
            source: 'long-document-workflow',
            intent: 'edit',
            operation: plan.operation,
            mode: plan.mode,
            reason: 'test-direct-write',
          },
        } : {}),
        applyWrite: async input => {
          if (withAuthorization) coverageByAuthorization.set('authorized', input.coverage)
          else coverageByAuthorization.set('unauthorized', input.coverage)
          return { ok: true, rollbackAvailable: true }
        },
      }))

      const result = await gateway.execute('editor.write', {
        commands: [{
          operation: 'replace_match',
          target: '第一段：旧句。',
          content: '第一段：新句。',
          reason: 'direct 写入',
        }],
      }, makeContext())

      expect(result.ok).toBe(true)
      expect((result.data as any).coverage).toMatchObject({
        coverageTrusted: true,
        reason: 'single_segment_plan',
        commands: [expect.objectContaining({
          operation: 'replace_match',
          segmentId: plan.segments[0].segmentId,
        })],
      })
    }

    const normalizeCoverage = (coverage: any) => ({ ...coverage, batchId: undefined })
    expect(normalizeCoverage(coverageByAuthorization.get('unauthorized')))
      .toEqual(normalizeCoverage(coverageByAuthorization.get('authorized')))
  })

  it('editor.write does not trust a partial direct write in a multi-segment plan', async () => {
    const longContent = [
      '第1节',
      '',
      '甲'.repeat(5200),
      '',
      '第2节',
      '',
      '乙'.repeat(5200),
      '',
      '第3节',
      '',
      '丙'.repeat(1000),
      '',
    ].join('\n')
    const plan = buildLongDocumentExecutionPlan({
      requestText: '整理整篇大纲',
      content: longContent,
      contextWindowTokens: 12_000,
      maxOutputTokens: 2_048,
      intent: 'edit',
    })
    expect(plan.mode).toBe('direct')
    expect(plan.segments.length).toBe(1)
    const firstSectionRange = plan.segments[0].range
    const directMultiSegmentPlan: typeof plan = {
      ...plan,
      mode: 'direct',
      segments: [
        plan.segments[0],
        {
          ...plan.segments[0],
          segmentId: 'segment-second-half',
          range: {
            startLine: Math.max(firstSectionRange.startLine + 1, 1),
            endLine: firstSectionRange.endLine,
          },
        },
      ],
    }
    const longSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'chapter-1',
      label: '长文档',
      content: longContent,
    })
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => longSnapshot,
      mode: 'direct',
      executionPlan: directMultiSegmentPlan,
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))

    const result = await gateway.execute('editor.write', {
      commands: [{
        operation: 'insert',
        position: 'cursor',
        content: '第二节新增说明。',
        reason: '只写入第一节',
      }],
    }, { ...makeContext(), workspace: 'outline' })

    expect(result.ok).toBe(true)
    expect((result.data as any).coverage).toMatchObject({
      coverageTrusted: false,
      reason: 'undeclared_segment',
    })
    expect(longContent.indexOf('第1节')).toBeGreaterThanOrEqual(0)
  })

  it('editor.write rejects reorder sections when ids are missing, duplicated, or content changes', async () => {
    const longContent = [
      '第1节',
      '',
      '甲'.repeat(5200),
      '',
      '第2节',
      '',
      '乙'.repeat(5200),
      '',
    ].join('\n')
    const restructureSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'chapter-1',
      label: '长文档',
      content: longContent,
    })
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => restructureSnapshot,
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '把整篇大纲重新整理排序',
        content: longContent,
        contextWindowTokens: 12_000,
        maxOutputTokens: 2_048,
      }),
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))

    const missing = await gateway.execute('editor.write', {
      commands: [{ operation: 'reorder_sections', order: ['section-2'] }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(missing.ok).toBe(false)
    expect(missing.error?.code).toBe('reorder_id_set_mismatch')
    expect((missing.data as any).expectedTopLevelIds).toEqual(['section-1', 'section-2'])
    expect((missing.data as any).repairPolicy).toContain('不要混入子节点 ID')

    const duplicated = await gateway.execute('editor.write', {
      commands: [{ operation: 'reorder_sections', order: ['section-1', 'section-1', 'section-2'] }],
    }, { ...makeContext(), workspace: 'outline' })
    expect(duplicated.ok).toBe(false)
    expect(duplicated.error?.code).toBe('reorder_id_set_mismatch')

    expect(appliedBatches).toHaveLength(0)
  })

  it('editor.write points large restructures to the atomic reorder command', async () => {
    const longContent = Array.from({ length: 12 }, (_, index) =>
      `# 第${index + 1}节\n\n${'雨'.repeat(1_000)}\n\n`).join('')
    const restructureSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'chapter-1',
      label: '长文档',
      content: longContent,
    })
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => restructureSnapshot,
      mode: 'direct',
      executionPlan: buildLongDocumentExecutionPlan({
        requestText: '把整篇大纲重新整理排序',
        content: longContent,
        contextWindowTokens: 12_000,
        maxOutputTokens: 2_048,
      }),
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))

    const result = await gateway.execute('editor.write', {
      commands: [
        { operation: 'move', target: '# 第1节', destination: '# 第2节', destinationPosition: 'after' },
      ],
    }, { ...makeContext(), workspace: 'outline' })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('reorder_requires_atomic_command')
    expect(result.error?.message).toContain('reorder_sections')
  })

  it('editor.write rejects move with missing or ambiguous destination', async () => {
    const moveSnapshot = createEditorTargetSnapshot({
      workspace: 'main',
      targetId: 'move-tab',
      label: '移动测试',
      content: '第一段。\n重复。\n重复。',
    })
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => moveSnapshot,
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))

    const missing = await gateway.execute('editor.write', {
      commands: [{ operation: 'move', target: '第一段。', destinationPosition: 'after' }],
    }, { ...makeContext(), targetId: 'move-tab' })
    expect(missing.ok).toBe(false)
    expect(missing.error?.code).toBe('invalid_input')

    const ambiguous = await gateway.execute('editor.write', {
      commands: [{ operation: 'move', target: '第一段。', destination: '重复。', destinationPosition: 'after' }],
    }, { ...makeContext(), targetId: 'move-tab' })
    expect(ambiguous.ok).toBe(false)
    expect(ambiguous.error?.code).toBe('ambiguous_target')
    expect((ambiguous.data as any).repairPolicy).toContain('完整批次')
  })

  it('editor.write allows insert and append on an empty editor', async () => {
    const emptySnapshot = createEditorTargetSnapshot({
      workspace: 'main',
      targetId: 'empty-tab',
      label: '新章节',
      content: '',
    })
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => emptySnapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))
    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'insert', content: '新开篇' }],
    }, { ...makeContext(), targetId: 'empty-tab' })

    expect(result.ok).toBe(true)
    expect(appliedBatches[0].next).toBe('新开篇')
  })

  it('editor.write rejects more than ten commands', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))
    const result = await gateway.execute('editor.write', {
      commands: Array.from({ length: 11 }, () => ({ operation: 'append', content: 'x' })),
    }, makeContext())
    expect(result.error?.code).toBe('too_many_commands')
  })

  it('editor.reveal highlights a unique fragment without modifying content', async () => {
    const revealed: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      revealTarget: async request => { revealed.push(request) },
    }))
    const result = await gateway.execute('editor.reveal', {
      target: { fragment: '第三段提到伏笔。' },
      focus: 'center',
    }, makeContext())

    expect(result.ok).toBe(true)
    expect((result.data as any)).toMatchObject({ status: 'revealed', degraded: true })
    expect(revealed).toHaveLength(1)
    expect(revealed[0]).toMatchObject({
      targetId: 'chapter-1',
      focus: 'center',
      highlightMs: 3000,
    })
  })

  it('editor.reveal rejects ambiguous fragments', async () => {
    const revealed: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      revealTarget: async request => { revealed.push(request) },
    }))
    const result = await gateway.execute('editor.reveal', {
      target: { fragment: '主角' },
    }, makeContext())

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('ambiguous_target')
    expect(revealed).toHaveLength(0)
  })

  it('editor.reveal supports paragraph index', async () => {
    const revealed: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      revealTarget: async request => { revealed.push(request) },
    }))
    const result = await gateway.execute('editor.reveal', {
      target: { paragraphIndex: 0 },
    }, makeContext())

    expect(result.ok).toBe(true)
    expect((result.data as any).start).toBe(0)
    expect((result.data as any).degraded).toBe(true)
    expect(revealed[0].end).toBe(snapshot.content.length)
  })

  it('editor.reveal supports structure anchors', async () => {
    const content = '第一卷 北境\n少年出发。\n第二章 灯塔\n风暴逼近。'
    const anchorSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲',
      content,
    })
    const revealed: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => anchorSnapshot,
      revealTarget: async request => { revealed.push(request) },
      workspace: 'outline',
    }))
    const result = await gateway.execute('editor.reveal', {
      target: { anchor: { chapterTitle: '第二章 灯塔' } },
    }, { ...makeContext(), workspace: 'outline' as const, targetId: 'outline' })

    expect(result.ok).toBe(true)
    expect((result.data as any).structurePath).toContain('第二章 灯塔')
    expect(revealed[0].start).toBe(content.indexOf('第二章 灯塔'))
  })

  it('returns structured errors for missing tools and invalid inputs', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => snapshot }))
    const missing = await gateway.execute('not.exists', {}, makeContext())
    expect(missing.error?.code).toBe('tool_not_found')

    const invalid = await gateway.execute('editor.search', { caseSensitive: true }, makeContext())
    expect(invalid.error?.code).toBe('invalid_input')
    expect(invalid.error?.message).toContain('query 缺少必填字段')
  })

  it('supports abort before execution and emits every call event', async () => {
    const events: ToolCallEvent[] = []
    const controller = new AbortController()
    controller.abort()
    const gateway = new ToolGateway()
    gateway.onEvent(event => events.push(event))
    gateway.registerAll(createEditorTools({ getSnapshot: () => snapshot }))
    const result = await gateway.execute('editor.get_state', {}, makeContext(controller.signal))
    expect(result.error?.code).toBe('canceled')
    expect(events).toHaveLength(1)
    expect(events[0].toolName).toBe('editor.get_state')
  })

  it('does not expose the retired task.update_plan tool', () => {
    const tools = createEditorTools({
      getSnapshot: () => snapshot,
    })
    const result = tools.some(tool => tool.name === 'task.update_plan')

    expect(result).toBe(false)
  })
})
