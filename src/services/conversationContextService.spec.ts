import { describe, expect, it } from 'vitest'
import { ConversationContextService, conversationContextService } from './conversationContextService'
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
})
