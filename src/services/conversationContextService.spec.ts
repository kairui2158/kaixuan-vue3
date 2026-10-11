import { describe, expect, it } from 'vitest'
import {
  ConversationContextService,
  conversationContextService,
  resolveEffectiveModelContextWindow,
  resolveModelContextWindow,
} from './conversationContextService'
import { buildCrossTurnToolAudit } from './crossTurnToolAudit'
import type { ContextMessage, ContextPolicy, StoredContextState } from '../types/context'

function createStorage(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    async read(key: string) {
      return values.get(key) ?? null
    },
    async write(key: string, value: unknown) {
      values.set(key, value)
      return true
    },
    async remove(key: string) {
      values.delete(key)
      return true
    },
    values
  }
}

function messages(...contents: string[]): ContextMessage[] {
  return contents.map((content, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content,
    ts: index + 1
  }))
}

const baseMessages: ContextMessage[] = [
  { role: 'system', content: '技能指令' },
  { role: 'user', content: '本轮请求' }
]

describe('ConversationContextService', () => {
  it('供应商声明窗口优先于模型名推断，未声明时才回退模型名', () => {
    expect(resolveEffectiveModelContextWindow({
      model: 'unknown-gateway-model',
      providerContextWindowTokens: 1_000_000,
    })).toBe(1_000_000)
    expect(resolveEffectiveModelContextWindow({
      model: 'gpt-4o',
      providerContextWindowTokens: 0,
    })).toBe(128_000)
    expect(resolveEffectiveModelContextWindow({
      model: 'unknown-gateway-model',
      providerContextWindowTokens: 0,
    })).toBeUndefined()
  })

  it('预算超过时非破坏性压缩历史，原文保留且组装请求不再携带已折叠消息', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
      compaction: { budget: { modelContextWindow: 200, reservedOutputTokens: 20 } },
    })
    const ref = { projectId: 'p-compaction', workspace: 'outline' as const, purpose: 'generate' as const, skillId: 's1' }
    await service.recordTurn(ref, { user: '第一轮用户输入，内容比较长。'.repeat(20), assistant: '第一轮回答，内容比较长。'.repeat(20) })
    await service.recordTurn(ref, { user: '第二轮用户输入，内容比较长。'.repeat(20), assistant: '第二轮回答，内容比较长。'.repeat(20) })
    await service.recordTurn(ref, { user: '第三轮用户输入，内容比较长。'.repeat(20), assistant: '第三轮回答，内容比较长。'.repeat(20) })

    const bundle = await service.buildContextBundle(ref)
    const stored = bundle.session.recentMessages
    expect(stored.some(message => message.meta?.compaction)).toBe(true)
    expect(stored.length).toBe(7)

    const assembled = service.assembleMessages(
      bundle,
      { ...service.getPolicy('generate'), chatHistory: 'full', includeOutline: false, includeSettings: false, includeMemory: false },
      baseMessages,
    )
    expect(assembled.filter(message => message.role === 'user' && message.content.includes('第一轮用户输入'))).toEqual([])
    expect(assembled.some(message => message.content.includes('第二轮用户输入'))).toBe(true)
    expect(assembled.some(message => message.content.includes('[上下文压缩标记]'))).toBe(true)
  })

  it('未知模型窗口时不压缩；摘要失败降级为标记截断', () => {
    const service = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    const history = messages(
      '这是一段足够长的第一轮历史，用于验证极端预算下的非破坏性压缩。'.repeat(20),
      '这是一段足够长的第一轮回答，用于验证极端预算下的非破坏性压缩。'.repeat(20),
      '这是一段足够长的第二轮历史，用于验证极端预算下的非破坏性压缩。'.repeat(20),
      '这是一段足够长的第二轮回答，用于验证极端预算下的非破坏性压缩。'.repeat(20),
      '这是一段足够长的第三轮历史，用于验证极端预算下的非破坏性压缩。'.repeat(20),
      '这是一段足够长的第三轮回答，用于验证极端预算下的非破坏性压缩。'.repeat(20),
      '这是一段足够长的第四轮历史，用于验证极端预算下的非破坏性压缩。',
      '这是一段足够长的第四轮回答，用于验证极端预算下的非破坏性压缩。',
      '这是一段足够长的第五轮历史，用于验证极端预算下的非破坏性压缩。',
      '这是一段足够长的第五轮回答，用于验证极端预算下的非破坏性压缩。',
      `这是最近一轮用户目标，必须被完整保留。${'当前要求包含足够长的事实细节，验证保护尾部不会被压缩。'.repeat(40)}`,
      '这是最近一轮助手回答，必须被完整保留。'
    )
    const unknown = service.compactContext(history)
    expect(unknown.performed).toBe(false)
    expect(unknown.reason).toBe('unknown-window')

    const serviceWithBudget = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
      compaction: { budget: { modelContextWindow: 1, reservedOutputTokens: 0 } },
    })
    const compacted = serviceWithBudget.compactContext(history)
    expect(compacted.performed).toBe(true)
    expect(['summary', 'marker-truncation']).toContain(compacted.strategy)
    expect(compacted.compactedMessageCount).toBeGreaterThan(0)
    expect(compacted.retainedMessageCount).toBeGreaterThan(0)
    expect(compacted.estimatedAfterTokens).toBeLessThanOrEqual(compacted.estimatedBeforeTokens)
    expect(compacted.retainedMessages?.some(message => message.content.includes('这是最近一轮用户目标'))).toBe(true)
    expect(compacted.retainedMessages?.some(message => message.content.includes('这是最近一轮助手回答'))).toBe(true)
    expect(compacted.markerMessage?.content).toContain('[上下文压缩标记]')
  })

  it('recordTurn 按 retained 身份折叠，二次压缩不错位且 marker 不被截断', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
      compaction: { budget: { modelContextWindow: 250, reservedOutputTokens: 20 } },
    })
    const ref = { projectId: 'p-compaction-twice', workspace: 'outline' as const, purpose: 'generate' as const, skillId: 's1' }
    for (let index = 1; index <= 6; index += 1) {
      await service.recordTurn(ref, {
        user: `第${index}轮用户输入，必须按身份折叠。${'内容长度。'.repeat(30)}`,
        assistant: `第${index}轮助手回答，必须按身份折叠。${'内容长度。'.repeat(30)}`,
      })
    }

    const stored = (storage.values.get('wa_ctx_p-compaction-twice') as any)
      ?.sessions.find((session: any) => session.id === 'outline__generate__s1')
      ?.messages as ContextMessage[]
    const markers = stored.filter(message => message.meta?.compactionMarker)
    expect(markers.length).toBeGreaterThan(1)
    expect(stored.filter(message => message.meta?.compaction).length).toBeGreaterThan(0)
    // The retained tail must never be accidentally folded by a stale count.
    expect(stored.slice(-4).every(message => !message.meta?.compaction)).toBe(true)
  })

  it('recent 策略不会把已折叠历史重新注入请求', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
      compaction: { budget: { modelContextWindow: 250, reservedOutputTokens: 20 } },
    })
    const ref = { projectId: 'p-recent-compacted', workspace: 'outline' as const, purpose: 'generate' as const, skillId: 's1' }
    for (let index = 1; index <= 6; index += 1) {
      await service.recordTurn(ref, {
        user: `第${index}轮用户输入，验证 recent 不回放折叠历史。${'内容长度。'.repeat(30)}`,
        assistant: `第${index}轮助手回答，验证 recent 不回放折叠历史。${'内容长度。'.repeat(30)}`,
      })
    }
    const bundle = await service.buildContextBundle(ref)
    const assembled = service.assembleMessages(
      bundle,
      { ...service.getPolicy('generate'), chatHistory: 'recent', recentTurns: 10, includeOutline: false, includeSettings: false, includeMemory: false },
      baseMessages,
    )

    expect(assembled.some(message => message.content.includes('[上下文压缩标记]'))).toBe(true)
    expect(assembled.filter(message => message.content.includes('第1轮用户输入'))).toHaveLength(0)
    expect(assembled.filter(message => message.content.includes('第2轮用户输入'))).toHaveLength(0)
    expect(assembled.some(message => message.content.includes('第6轮用户输入'))).toBe(true)
  })

  it('并发 recordTurn 全部落盘，不用旧快照覆盖新会话', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    const ref = { projectId: 'p-concurrent-turns', workspace: 'outline' as const, purpose: 'generate' as const, skillId: 's1' }
    await Promise.all(Array.from({ length: 12 }, (_, index) =>
      service.recordTurn(ref, {
        user: `并发用户${index + 1}`,
        assistant: `并发回答${index + 1}`,
      })
    ))

    const bundle = await service.buildContextBundle(ref)
    expect(bundle.session.recentMessages).toHaveLength(24)
    for (let index = 1; index <= 12; index += 1) {
      expect(bundle.session.recentMessages.some(message => message.content === `并发用户${index}`)).toBe(true)
      expect(bundle.session.recentMessages.some(message => message.content === `并发回答${index}`)).toBe(true)
    }
  })

  it('按 workspace 设置压缩预算与观察器，未知窗口可见且互不覆盖', async () => {
    const compactedEvents: string[] = []
    const skippedEvents: string[] = []
    const service = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    service.setCompactionRouting({
      workspace: 'outline',
      budget: { modelContextWindow: 200, reservedOutputTokens: 20 },
      observer: {
        onContextCompacted: () => compactedEvents.push('outline'),
        onContextCompactionSkipped: () => skippedEvents.push('outline'),
      },
    })
    service.setCompactionRouting({
      workspace: 'main',
      observer: {
        onContextCompacted: () => compactedEvents.push('main'),
        onContextCompactionSkipped: () => skippedEvents.push('main'),
      },
    })

    const long = '这是一段足够长的上下文，用于验证压缩触发。'.repeat(20)
    const outlineRef = { projectId: 'p-routed-outline', workspace: 'outline' as const, purpose: 'generate' as const }
    const mainRef = { projectId: 'p-routed-main', workspace: 'main' as const, purpose: 'generate' as const }
    await service.recordTurn(outlineRef, { user: long, assistant: long })
    await service.recordTurn(outlineRef, { user: long, assistant: long })
    await service.recordTurn(outlineRef, { user: long, assistant: long })
    await service.recordTurn(mainRef, { user: long, assistant: long })
    await service.recordTurn(mainRef, { user: long, assistant: long })
    await service.recordTurn(mainRef, { user: long, assistant: long })

    expect(compactedEvents).toEqual(['outline'])
    expect(skippedEvents).toEqual(['main', 'main', 'main'])
  })

  it('recordTurn 的本轮输出预算优先于 workspace 路由预算', async () => {
    const compacted: number[] = []
    const service = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    service.setCompactionRouting({
      workspace: 'outline',
      budget: { modelContextWindow: 250, reservedOutputTokens: 20 },
      observer: {
        onContextCompacted: result => compacted.push(result.allowedInputTokens ?? -1),
      },
    })

    const long = '这是一段足够长的上下文，用于验证压缩触发。'.repeat(40)
    const ref = { projectId: 'p-request-budget', workspace: 'outline' as const, purpose: 'generate' as const }
    await service.recordTurn(ref, { user: long, assistant: long, reservedOutputTokens: 100 })
    await service.recordTurn(ref, { user: long, assistant: long, reservedOutputTokens: 100 })
    await service.recordTurn(ref, { user: long, assistant: long, reservedOutputTokens: 100 })

    expect(compacted).toEqual([125])
    const after = await service.buildContextBundle(ref)
    expect(after.session.recentMessages.some(message => message.meta?.compactionMarker)).toBe(true)
  })

  it('recordTurn 无本轮输出预算时回落 workspace 路由预算', async () => {
    const compacted: number[] = []
    const service = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    service.setCompactionRouting({
      workspace: 'outline',
      budget: { modelContextWindow: 250, reservedOutputTokens: 20 },
      observer: {
        onContextCompacted: result => compacted.push(result.allowedInputTokens ?? -1),
      },
    })

    const long = '这是一段足够长的上下文，用于验证压缩触发。'.repeat(40)
    const ref = { projectId: 'p-request-budget-fallback', workspace: 'outline' as const, purpose: 'generate' as const }
    for (let index = 0; index < 3; index += 1) {
      await service.recordTurn(ref, { user: long, assistant: long })
    }

    expect(compacted).toEqual([205])
  })

  it('模型输入窗口只从明确声明解析，未知模型返回 undefined', () => {
    expect(resolveModelContextWindow('claude-sonnet-4-5')).toBe(200_000)
    expect(resolveModelContextWindow('gpt-4o')).toBe(128_000)
    expect(resolveModelContextWindow('model-1m')).toBe(1_000_000)
    expect(resolveModelContextWindow('qwen-128k')).toBe(128_000)
    expect(resolveModelContextWindow('deepseek-reasoner')).toBe(128_000)
    expect(resolveModelContextWindow('deepseek-chat')).toBeUndefined()
    expect(resolveModelContextWindow('deepseek-v3.1')).toBeUndefined()
    expect(resolveModelContextWindow('custom-private-model')).toBeUndefined()
  })

  it('构建可校验的统一 ContextPack blocks，并标明截断', async () => {
    const longSelection = '选'.repeat(MAX_SELECTED_TEXT_CHARS + 10)
    const service = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({
        outline: '第一卷 大纲',
        settings: { items: { core: '设定' } },
        memories: null
      })
    })
    const bundle = await service.buildContextBundle({
      projectId: 'p-blocks',
      workspace: 'main',
      purpose: 'generate',
      workspaceState: {
        outline: '参考大纲',
        editorContent: '编辑器完整内容',
        referenceOutline: '参考资料大纲',
        selectedText: longSelection,
        activeTab: '第一章'
      }
    })
    const blocks = service.buildDialogueContextBlocks(bundle, service.getPolicy('generate'))

    expect(blocks.map(block => block.source)).toEqual([
      'outline', 'editorContent', 'referenceOutline', 'settings', 'selection', 'activeTab'
    ])
    expect(blocks.find(block => block.source === 'outline')?.coverage).toBe('structure_map')
    expect(blocks.find(block => block.source === 'editorContent')?.coverage).toBe('full')
    expect(blocks.find(block => block.source === 'referenceOutline')?.coverage).toBe('reference')
    expect(blocks.find(block => block.source === 'selection')?.truncated).toBe(true)
    expect(validateDialogueContextBlocks(blocks).valid).toBe(true)
  })

  it('主页 blocks 必须以 editorContent 为 full，referenceOutline 只作参考', async () => {
    const service = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({ outline: '大纲参考', settings: {}, memories: null })
    })
    const bundle = await service.buildContextBundle({
      projectId: 'p-main-priority',
      workspace: 'main',
      purpose: 'generate',
      workspaceState: {
        editorContent: '当前编辑目标完整内容',
        referenceOutline: '大纲参考'
      }
    })
    const blocks = service.buildDialogueContextBlocks(
      bundle,
      { ...service.getPolicy('generate'), includeSettings: false, includeMemory: false }
    )

    expect(blocks.find(block => block.source === 'editorContent')?.content).toBe('当前编辑目标完整内容')
    expect(blocks.find(block => block.source === 'referenceOutline')?.coverage).toBe('reference')
  })

  it('主页长文 blocks 使用 packed 口径，不再把全文标成 full', async () => {
    const service = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({ outline: '大纲参考', settings: {}, memories: null })
    })
    const bundle = await service.buildContextBundle({
      projectId: 'p-main-packed-blocks',
      workspace: 'main',
      purpose: 'generate',
      workspaceState: {
        editorContent: '长'.repeat(12001)
      }
    })
    const blocks = service.buildDialogueContextBlocks(
      bundle,
      { ...service.getPolicy('generate'), includeSettings: false, includeMemory: false }
    )
    const editorBlock = blocks.find(block => block.source === 'editorContent')

    expect(editorBlock?.coverage).toBe('packed')
    expect(editorBlock?.truncated).toBe(true)
    expect(editorBlock?.content).toContain('长文档目标总长度：12001 字符')
    expect(editorBlock?.content).toContain('editor.document_map')
    expect(editorBlock?.content?.length).toBeLessThan(12001)
    expect(validateDialogueContextBlocks(blocks).valid).toBe(true)
  })

  it('按 none/recent/summary/full 裁剪会话，而不改写当前请求', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '大纲', settings: {}, memories: null })
    })
    const ref = { projectId: 'p1', workspace: 'outline' as const, purpose: 'generate' as const, skillId: 's1' }
    await service.recordTurn(ref, { user: '旧用户1', assistant: '旧助手1' })
    await service.recordTurn(ref, { user: '旧用户2', assistant: '旧助手2' })
    await service.recordTurn(ref, { user: '旧用户3', assistant: '旧助手3' })

    const bundle = await service.buildContextBundle(ref)
    const policies: Array<[ContextPolicy['chatHistory'], number]> = [
      ['none', 0],
      ['recent', 2],
      ['summary', 0],
      ['full', 6]
    ]

    for (const [mode, expectedHistoryLength] of policies) {
      const policy = { ...service.getPolicy('generate', 's1'), chatHistory: mode, recentTurns: 1 }
      const assembled = service.assembleMessages(bundle, policy, baseMessages)
      const historical = assembled.filter(message => message.content.startsWith('旧'))
      expect(historical).toHaveLength(expectedHistoryLength)
      expect(assembled.at(-1)?.content).toBe('本轮请求')
    }
  })

  it('summary 策略只注入摘要，chain 上一步输出独立于聊天历史保留', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null })
    })
    const ref = {
      projectId: 'p-chain',
      workspace: 'pipeline' as const,
      purpose: 'generate' as const,
      skillId: 's2',
      previousSkillOutput: '上一步完整输出，不得截断'
    }
    await service.recordTurn(ref, { user: '历史请求', assistant: '历史回答', meta: { step: 1 } })
    const bundle = await service.buildContextBundle(ref)
    bundle.session.summary = '历史摘要'
    const assembled = service.assembleMessages(bundle, { ...service.getPolicy('generate'), chatHistory: 'summary' }, [
      { role: 'system', content: '技能指令' },
      { role: 'user', content: '下一步请求' }
    ])

    expect(assembled.some(message => message.content.includes('历史摘要'))).toBe(true)
    expect(assembled.some(message => message.content.includes('上一步完整输出，不得截断'))).toBe(true)
    expect(assembled.some(message => message.content === '历史回答')).toBe(false)
  })

  it('AI 编辑事件进入同范围上下文，并保留批次元数据', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null })
    })
    const ref = { projectId: 'p-editor-event', workspace: 'outline' as const, purpose: 'generate' as const }

    await service.recordTurn(ref, { user: '请修改第二幕', assistant: '已生成编辑批次' })
    await service.recordEditorEvent(ref, '已应用大纲 AI 编辑批次', {
      batchId: 'batch-1',
      commandCount: 2,
      rejectedIndexes: [1]
    })

    const bundle = await service.buildContextBundle(ref)
    const event = bundle.session.recentMessages.at(-1)
    expect(event?.role).toBe('assistant')
    expect(event?.content).toBe('[AI 编辑] 已应用大纲 AI 编辑批次')
    expect(event?.meta).toEqual({ batchId: 'batch-1', commandCount: 2, rejectedIndexes: [1] })
    expect(bundle.session.recentMessages).toHaveLength(3)
  })

  it('当前请求只进入消息一次，旧聊天中的同文请求不会重复注入', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null })
    })
    const ref = { projectId: 'p-dedup', workspace: 'outline' as const, purpose: 'generate' as const, skillId: 's1' }
    await service.recordTurn(ref, { user: '历史请求', assistant: '旧回答' })
    const bundle = await service.buildContextBundle(ref)
    const assembled = service.assembleMessages(bundle, { ...service.getPolicy('generate'), includeOutline: false, includeSettings: false, includeMemory: false }, [
      { role: 'system', content: '技能指令' },
      { role: 'user', content: '当前请求' }
    ])

    expect(assembled.filter(message => message.role === 'user' && message.content === '当前请求')).toHaveLength(1)
    expect(assembled.some(message => message.content === '历史请求')).toBe(true)
    expect(assembled.at(-1)?.content).toBe('当前请求')
  })

  it('chain 后续步骤只保留完整上一步输出，不注入聊天历史和工作区大纲', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '不应注入的大纲', settings: {}, memories: null })
    })
    const ref = {
      projectId: 'p-chain-isolated',
      workspace: 'outline' as const,
      purpose: 'generate' as const,
      skillId: 's2',
      previousSkillOutput: '完整上一步输出：第一段\n第二段\n第三段'
    }
    await service.recordTurn(ref, { user: '历史请求', assistant: '历史回答' })
    const bundle = await service.buildContextBundle({
      ...ref,
      workspaceState: { outline: '不应注入的大纲' }
    })
    const assembled = service.assembleMessages(bundle, {
      ...service.getPolicy('generate'),
      chatHistory: 'none',
      includeOutline: false,
      includeSettings: false,
      includeMemory: false
    }, [
      { role: 'system', content: '技能指令' },
      { role: 'user', content: '原始用户请求' }
    ])
    const previousBlocks = assembled.filter(message => message.content.includes('[上一步 SKILL 完整输出]'))

    expect(previousBlocks).toHaveLength(1)
    expect(previousBlocks[0].content).toContain('完整上一步输出：第一段\n第二段\n第三段')
    expect(assembled.some(message => message.content === '历史回答')).toBe(false)
    expect(assembled.some(message => message.content.includes('不应注入的大纲'))).toBe(false)
  })

  it('只组装上下文不会写入 assistant 轮次，失败路径必须由调用方显式 recordTurn', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null })
    })
    const ref = { projectId: 'p-failure', workspace: 'outline' as const, purpose: 'generate' as const, skillId: 's1' }
    const bundle = await service.buildContextBundle(ref)
    service.assembleMessages(bundle, service.getPolicy('generate'), [
      { role: 'system', content: '技能指令' },
      { role: 'user', content: '会失败的请求' }
    ])

    const after = await service.buildContextBundle(ref)
    expect(after.session.recentMessages).toEqual([])
  })

  it('按项目和工作区隔离会话，写回后能从 wa_ctx 键读回', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async projectId => ({ outline: `outline-${projectId}`, settings: {}, memories: null })
    })
    await service.recordTurn(
      { projectId: 'p1', workspace: 'main', purpose: 'generate' },
      { user: '主页问题', assistant: '主页回答' }
    )
    await service.recordTurn(
      { projectId: 'p1', workspace: 'outline', purpose: 'generate' },
      { user: '大纲问题', assistant: '大纲回答' }
    )
    await service.recordTurn(
      { projectId: 'p2', workspace: 'main', purpose: 'generate' },
      { user: '另一个项目问题', assistant: '另一个项目回答' }
    )

    const main = await service.buildContextBundle({ projectId: 'p1', workspace: 'main', purpose: 'generate' })
    const outline = await service.buildContextBundle({ projectId: 'p1', workspace: 'outline', purpose: 'generate' })
    const otherProject = await service.buildContextBundle({ projectId: 'p2', workspace: 'main', purpose: 'generate' })

    expect(main.session.recentMessages.map(message => message.content)).toEqual(['主页问题', '主页回答'])
    expect(outline.session.recentMessages.map(message => message.content)).toEqual(['大纲问题', '大纲回答'])
    expect(otherProject.session.recentMessages.map(message => message.content)).toEqual(['另一个项目问题', '另一个项目回答'])
    expect([...storage.values.keys()].sort()).toEqual(['wa_ctx_p1', 'wa_ctx_p2'])
    expect((storage.values.get('wa_ctx_p1') as StoredContextState).sessions).toHaveLength(2)
  })

  it('失败请求不由服务伪造 assistant 轮次，clearSession 只清空目标 scope', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null })
    })
    const target = { projectId: 'p1', workspace: 'outline' as const, purpose: 'generate' as const, skillId: 's1' }
    const keep = { projectId: 'p1', workspace: 'outline' as const, purpose: 'generate' as const, skillId: 's2' }
    await service.recordTurn(target, { user: '成功请求', assistant: '成功回答' })
    await service.recordTurn(keep, { user: '保留请求', assistant: '保留回答' })
    await service.clearSession(target)

    const cleared = await service.buildContextBundle(target)
    const retained = await service.buildContextBundle(keep)
    expect(cleared.session.recentMessages).toEqual([])
    expect(retained.session.recentMessages.map(message => message.content)).toEqual(['保留请求', '保留回答'])
  })

  it('注入上一轮工具审计为 system context，且不污染聊天历史', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null })
    })
    const ref = { projectId: 'audit-project', workspace: 'main' as const, purpose: 'generate' as const }
    await service.recordTurn(ref, { user: '请插入一段设定', assistant: '已插入' })
    const audit = buildCrossTurnToolAudit({
      toolResults: [{
        call: { id: 'call_1', name: 'editor.write', input: { operation: 'append', content: '新设定' } },
        result: { ok: true, data: { batchId: 'batch_1' } },
      }],
    })

    const bundle = await service.buildContextBundle({
      ...ref,
      toolAudit: audit,
      workspaceState: { editorContent: '正文' },
    })
    const messages = service.assembleMessages(bundle, service.getPolicy('generate'), [
      { role: 'system', content: '系统提示' },
      { role: 'user', content: '继续写' },
    ])

    const auditMessage = messages.find(message =>
      message.role === 'system' && message.content.includes('[上一轮工具审计]')
    )
    expect(auditMessage).toBeTruthy()
    expect(auditMessage?.content).toContain('call_1 editor.write success')
    expect(auditMessage?.content).toContain('batch_1')
    expect(auditMessage?.content).toContain('protocolVersion=1')
    expect(bundle.session.recentMessages.some(message => message.content.includes('[上一轮工具审计]'))).toBe(false)
  })

  it('切换同一 SKILL 的 Agent 不会切断既有会话', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null })
    })
    await service.recordTurn(
      { projectId: 'p-agent', workspace: 'outline', purpose: 'generate', skillId: 's1', agentId: 'agent-a' },
      { user: '第一轮', assistant: '第一轮回答' }
    )

    const bundle = await service.buildContextBundle({
      projectId: 'p-agent', workspace: 'outline', purpose: 'generate', skillId: 's1', agentId: 'agent-b'
    })

    expect(bundle.session.recentMessages.map(message => message.content)).toEqual(['第一轮', '第一轮回答'])
  })

  it('压缩触发时输出完整生命周期事件并保存可校验 checkpoint', async () => {
    const storage = createStorage()
    const stages: Array<{ stage: string; status: string; checkpointId?: string }> = []
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    const ref = { projectId: 'p-lifecycle', workspace: 'outline' as const, purpose: 'generate' as const }
    const checkpointWrites: unknown[] = []
    service.setCompactionRouting({
      workspace: 'outline',
      budget: { modelContextWindow: 250, reservedOutputTokens: 20 },
      observer: {
        onContextCompactionLifecycle: event => stages.push({
          stage: event.stage,
          status: event.status,
          checkpointId: event.checkpointId,
        }),
      },
    })
    const baseStorage = (service as any).storage
    ;(service as any).storage = {
      ...baseStorage,
      async write(key: string, value: unknown) {
        if (key.startsWith('wa_ctxcp_')) checkpointWrites.push(value)
        return baseStorage.write(key, value)
      },
    }
    const long = '这是一段足够长的上下文，用于验证压缩生命周期。'.repeat(40)
    await service.recordTurn(ref, {
      user: long,
      assistant: long,
      meta: {
        goal: '整理第两卷卷纲',
        keyFacts: ['第一卷主线已经确定'],
        hardConstraints: ['不得改写锁定设定'],
        openQuestions: ['第三卷反派动机'],
        necessaryFragments: ['第一卷结尾伏笔'],
        toolState: { editor: { targetId: 'outline' } },
      },
    })
    await service.recordTurn(ref, { user: long, assistant: long, meta: { goal: '整理第两卷卷纲' } })
    await service.recordTurn(ref, { user: long, assistant: long })

    expect(stages.map(event => event.stage)).toEqual([
      'pre_compact',
      'summarizing',
      'checkpoint',
      'post_compact',
      'window_switch',
    ])
    expect(stages.every(event => event.status === 'success')).toBe(true)
    const checkpoint = await service.loadCompactionCheckpoint(ref)
    expect(checkpoint?.status).toBe('saved')
    expect(checkpoint?.goal).toBe('整理第两卷卷纲')
    expect(checkpoint?.keyFacts).toEqual(['第一卷主线已经确定'])
    expect(checkpoint?.hardConstraints).toEqual(['不得改写锁定设定'])
    expect(checkpoint?.openQuestions).toEqual(['第三卷反派动机'])
    expect(checkpoint?.necessaryFragments).toEqual(['第一卷结尾伏笔'])
    expect(checkpoint?.toolState).toEqual({ editor: { targetId: 'outline' } })
    const verified = await service.verifyCompactionCheckpoint(ref, checkpoint!)
    expect(verified.status).toBe('restored')
    expect(checkpointWrites.length).toBeGreaterThan(0)
    expect((checkpointWrites.at(-1) as any)?.goal).toBe('整理第两卷卷纲')
  })

  it('checkpoint 写盘失败时不压缩，历史保持原样并输出失败事件', async () => {
    const storage = createStorage()
    const failedStorage = {
      ...storage,
      async write(key: string, value: unknown) {
        if (key.startsWith('wa_ctxcp_')) return false
        return storage.write(key, value)
      },
    }
    const stages: string[] = []
    const service = new ConversationContextService({
      storage: failedStorage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    service.setCompactionRouting({
      workspace: 'outline',
      budget: { modelContextWindow: 250, reservedOutputTokens: 20 },
      observer: {
        onContextCompactionLifecycle: event => stages.push(`${event.stage}:${event.status}`),
      },
    })
    const ref = { projectId: 'p-checkpoint-fail', workspace: 'outline' as const, purpose: 'generate' as const }
    const long = '这是一段足够长的上下文，用于验证压缩失败回退。'.repeat(40)
    await service.recordTurn(ref, { user: long, assistant: long })
    await service.recordTurn(ref, { user: long, assistant: long })
    await service.recordTurn(ref, { user: long, assistant: long })

    expect(stages).toContain('checkpoint:failed')
    expect(stages).toContain('checkpoint_failed:failed')
    const bundle = await service.buildContextBundle(ref)
    expect(bundle.session.recentMessages.some(message => message.meta?.compaction)).toBe(false)
    expect(await service.loadCompactionCheckpoint(ref)).toBeNull()
  })

  it('checkpoint hash 不匹配时标记 needs_user，不把恢复当成功', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
      compaction: { budget: { modelContextWindow: 250, reservedOutputTokens: 20 } },
    })
    const ref = { projectId: 'p-hash-mismatch', workspace: 'outline' as const, purpose: 'generate' as const, skillId: 's1' }
    await service.saveCompactionCheckpoint(ref, {})
    await service.recordTurn(ref, { user: '新的一轮', assistant: '新的回答' })
    const checkpoint = await service.loadCompactionCheckpoint(ref)
    const verified = await service.verifyCompactionCheckpoint(ref, checkpoint!)

    expect(verified.status).toBe('hash_mismatch')
    const stored = await service.loadCompactionCheckpoint(ref)
    expect(stored?.status).toBe('hash_mismatch')
  })

  it('压缩在 checkpoint 后被中断时，重启后原始历史可恢复', async () => {
    const storage = createStorage()
    const writes = {
      contextWrites: 0,
      blockedContextWrite: false,
    }
    const interruptedStorage = {
      ...storage,
      async write(key: string, value: unknown) {
        if (key.startsWith('wa_ctx_') && !key.startsWith('wa_ctxcp_')) {
          writes.contextWrites += 1
          if (writes.blockedContextWrite) return false
        }
        return storage.write(key, value)
      },
    }
    const service = new ConversationContextService({
      storage: interruptedStorage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    service.setCompactionRouting({
      workspace: 'outline',
      budget: { modelContextWindow: 250, reservedOutputTokens: 20 },
    })
    const ref = { projectId: 'p-interrupted-compaction', workspace: 'outline' as const, purpose: 'generate' as const }
    const long = '这是一段足够长的上下文，用于模拟压缩中断恢复。'.repeat(40)
    await service.recordTurn(ref, { user: long, assistant: long, meta: { goal: '整理第二卷卷纲' } })
    await service.recordTurn(ref, { user: long, assistant: long })
    writes.blockedContextWrite = true
    await expect(service.recordTurn(ref, { user: long, assistant: long })).rejects.toThrow('上下文写盘失败')
    const checkpoint = await service.getActiveCompactionCheckpoint()

    expect(checkpoint?.status).toBe('saved')
    expect(checkpoint?.postCompactionHash).toBeUndefined()

    const restarted = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    const loaded = await restarted.loadCompactionCheckpoint(ref)
    const verified = await restarted.verifyCompactionCheckpoint(ref, loaded!)
    expect(verified.status).toBe('restored')
    expect(verified.goal).toBe('整理第二卷卷纲')
    const bundle = await restarted.buildContextBundle(ref)
    expect(bundle.session.recentMessages.length).toBeGreaterThan(0)
  })

  it('恢复校验不允许不同长度的会话冒充 checkpoint 原始历史', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    const ref = { projectId: 'p-length-mismatch', workspace: 'outline' as const, purpose: 'generate' as const }
    await service.recordTurn(ref, { user: '原始第一轮', assistant: '原始回答' })
    await service.saveCompactionCheckpoint(ref, {})
    const rawCheckpoint = await storage.read(`wa_ctxcp_${ref.projectId}_outline__generate__default`)
    await storage.write(`wa_ctxcp_${ref.projectId}_outline__generate__default`, {
      ...rawCheckpoint,
      messageCount: 4,
    })
    const restarted = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    const loaded = await restarted.loadCompactionCheckpoint(ref)
    const verified = await restarted.verifyCompactionCheckpoint(ref, loaded!)
    expect(verified.status).toBe('hash_mismatch')
  })

  it('发送前中和旧预览话术，用户可见历史保持不变', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    const ref = { projectId: 'p-neutralize-legacy-preview', workspace: 'outline' as const, purpose: 'generate' as const }
    await service.recordTurn(ref, {
      user: '重构整篇大纲',
      assistant: '【修改预览】\n这是旧版预览内容。\n【批准写回】请等待确认后再写入。\n【写入未执行】本轮未执行写入。',
    })
    await service.recordTurn(ref, { user: '符合我的要求，分叉一允许去重', assistant: '已按当前协议处理。' })
    const bundle = await service.buildContextBundle(ref)

    const assembled = service.assembleMessages(
      bundle,
      { ...service.getPolicy('generate'), chatHistory: 'full', includeOutline: false, includeSettings: false, includeMemory: false },
      baseMessages,
    )

    const neutralized = assembled.filter(message => message.role === 'assistant' && message.content.includes('[旧交互模式已中和]'))
    expect(neutralized).toHaveLength(1)
    expect(neutralized[0].content).toContain('模型自述不是当前工具面的权限事实')
    expect(neutralized[0].content).toContain('当前写入权限、工具面与执行协议一律以本轮系统提示和执行计划为准')
    expect(neutralized[0].content).toContain('禁止继续等待用户确认')
    expect(neutralized[0].meta?.neutralizedMarkers).toEqual(['修改预览', '批准写回', '写入未执行', '等待确认'])

    const stored = bundle.session.recentMessages
    expect(stored.some(message => message.content.includes('【修改预览】'))).toBe(true)
    expect(stored.some(message => message.content.includes('请等待确认后再写入'))).toBe(true)
    expect(bundle.execution.historyNeutralization).toEqual({
      neutralizedMessageCount: 1,
      markers: { '修改预览': 1, '批准写回': 1, '写入未执行': 1, '等待确认': 1 },
    })
    expect(assembled.some(message => message.content.includes('【修改预览】'))).toBe(false)
  })

  it('发送前中和历史写入权限自述，当前权限仍由本轮系统提示决定', async () => {
    const storage = createStorage()
    const service = new ConversationContextService({
      storage,
      projectReader: async () => ({ outline: '', settings: {}, memories: null }),
    })
    const ref = { projectId: 'p-neutralize-permission-hallucination', workspace: 'outline' as const, purpose: 'generate' as const }
    await service.recordTurn(ref, {
      user: '你按照方案写入',
      assistant: '当前会话工具面不包含 `editor.write`，我没有写入权限，无法实际执行移动、删除和合并。',
    })
    await service.recordTurn(ref, { user: '继续执行写入', assistant: '已按当前协议处理。' })
    const bundle = await service.buildContextBundle(ref)

    const assembled = service.assembleMessages(
      bundle,
      { ...service.getPolicy('generate'), chatHistory: 'full', includeOutline: false, includeSettings: false, includeMemory: false },
      baseMessages,
    )

    const neutralized = assembled.filter(message => message.role === 'assistant' && message.content.includes('[旧交互模式已中和]'))
    expect(neutralized).toHaveLength(1)
    expect(neutralized[0].content).toContain('[历史写入权限自述已中和]')
    expect(neutralized[0].content).not.toContain('工具面不包含 `editor.write`')
    expect(neutralized[0].content).toContain('模型自述不是当前工具面的权限事实')
    expect(neutralized[0].meta?.neutralizedMarkers).toEqual(['写入权限自述'])

    const stored = bundle.session.recentMessages
    expect(stored.some(message => message.content.includes('当前会话工具面不包含 `editor.write`'))).toBe(true)
    expect(bundle.execution.historyNeutralization).toEqual({
      neutralizedMessageCount: 1,
      markers: { '写入权限自述': 3 },
    })
    expect(assembled.some(message => message.content.includes('当前会话工具面不包含 `editor.write`'))).toBe(false)
  })

  it('单例代理调用实例方法时保持服务上下文', () => {
    const service = new ConversationContextService({ storage: createStorage() })
    const previous = (globalThis as any).__conversationContextService
    ;(globalThis as any).__conversationContextService = service
    try {
      expect(typeof conversationContextService.getPolicy('generate')).toBe('object')
      expect(conversationContextService.getPolicy('generate').chatHistory).toBe('recent')
    } finally {
      if (previous) (globalThis as any).__conversationContextService = previous
      else delete (globalThis as any).__conversationContextService
    }
  })

  it('大纲 ContextPack 注入结构地图、当前焦点全文与事实优先级，不再使用 12000 字截断', async () => {
    const chapterBody = '第101章正文。'.repeat(40)
    const outline = [
      '第一卷 风暴起点',
      '第一卷主线围绕北方风暴展开。',
      '第1章 夜行',
      '第一章内容。男主在夜路中遇到风暴。',
      '第2章 灯塔',
      '第二章内容。男主在灯塔下发现旧信。',
      '第二卷 潮汐',
      '第二卷内容。商队南下，风暴记忆成为伏笔。'
    ].join('\n') + '\n' + chapterBody
    const service = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({ outline, settings: {}, memories: null })
    })
    const bundle = await service.buildContextBundle({
      projectId: 'p-long-outline',
      workspace: 'outline',
      purpose: 'generate',
      workspaceState: {
        outline,
        selectedText: '当前选中的第三章设定，必须完整保留。'
      }
    })
    const assembled = service.assembleMessages(bundle, service.getPolicy('generate'), [
      { role: 'system', content: '技能指令' },
      { role: 'user', content: '请基于当前大纲回答' }
    ])
    const context = assembled.find(message => message.content.includes('当前大纲 ContextPack'))

    expect(context?.content).toContain('[事实优先级]')
    expect(context?.content).toContain('来源=outline，版本=v-')
    expect(context?.content).toContain('[大纲结构地图]')
    expect(context?.content).toContain('第1章 夜行')
    expect(context?.content).toContain('[当前焦点全文]')
    expect(context?.content).toContain('当前选中的第三章设定，必须完整保留。')
    expect(context?.content).not.toContain('12000')
    expect(bundle.workspace.outline).toBe(outline)
  })

  it('无选中文本时大纲 ContextPack 的焦点全文保留完整大纲，不产生截断省略号', async () => {
    const outline = Array.from({ length: 600 }, (item, index) => `第${index + 1}行 大纲内容，用于验证不再截断。`).join('\n')
    const service = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({ outline, settings: {}, memories: null })
    })
    const bundle = await service.buildContextBundle({
      projectId: 'p-long-outline-no-selection',
      workspace: 'outline',
      purpose: 'generate'
    })
    const assembled = service.assembleMessages(bundle, service.getPolicy('generate'), [])
    const context = assembled.find(message => message.content.includes('当前大纲 ContextPack'))

    expect(context?.content).toContain(outline)
    expect(context?.content.endsWith('…')).toBe(false)
  })

  it('全文已注入时移除旧读取引导并将 outline 覆盖度标记为 full', async () => {
    const outline = '第一卷 风暴起点\n第一卷主线围绕北方风暴展开。'
    const service = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({ outline, settings: {}, memories: null })
    })
    const bundle = await service.buildContextBundle({
      projectId: 'p-full-outline-injected',
      workspace: 'outline',
      purpose: 'generate',
      workspaceState: {
        outline,
        outlineContextPack: `[当前全文已注入]\n${outline}`,
      },
    })
    const assembled = service.assembleMessages(bundle, service.getPolicy('generate'), [])
    const context = assembled.find(message => message.content.includes('当前大纲 ContextPack'))

    expect(context?.content).toContain('[当前全文已注入]')
    expect(context?.content).toContain(outline)
    expect(context?.content).not.toContain('需要细节时必须先读取节点内容')
    expect(context?.content).not.toContain('需要读取其他区域时请使用只读工具')

    const blocks = service.buildDialogueContextBlocks(bundle, service.getPolicy('generate'))
    const outlineBlock = blocks.find(block => block.source === 'outline')
    expect(outlineBlock?.coverage).toBe('full')
    expect(outlineBlock?.truncated).toBeUndefined()
  })

  it('设定作为稳定事实完整注入，不使用 5000 字截断', async () => {
    const detail = '这是必须完整保留的锁定设定细节。'.repeat(400)
    const settings = { categories: [], items: { core: detail } }
    const service = new ConversationContextService({
      storage: createStorage(),
      projectReader: async () => ({ outline: '第一卷 大纲', settings, memories: null })
    })
    const bundle = await service.buildContextBundle({
      projectId: 'p-full-settings',
      workspace: 'outline',
      purpose: 'generate'
    })
    const assembled = service.assembleMessages(bundle, service.getPolicy('generate'), [])
    const context = assembled.find(message => message.content.includes('当前设定'))

    expect(context?.content).toContain('来源=settings，版本=v-')
    expect(context?.content).toContain(detail)
  })
})
import { validateDialogueContextBlocks } from './dialogueFoundation'
import { MAX_SELECTED_TEXT_CHARS, MAX_MEMORY_CHARS } from './conversationContextService'
