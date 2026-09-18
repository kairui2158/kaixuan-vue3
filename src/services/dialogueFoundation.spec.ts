import { describe, expect, it, vi } from 'vitest'
import type { AgentToolDefinition } from './editorTools'
import { createEditorTools } from './editorTools'
import { createEditorTargetSnapshot } from './editorTarget'
import {
  executeDialogueFoundation,
  normalizeDialogueBatchEvent,
  resolveDialoguePermission,
  resolveDialogueToolSurface,
  validateDialogueContextBlocks,
  validateDialogueToolSet,
  type DialogueContextBlock,
  type DialogueToolSet,
} from './dialogueFoundation'

function makeTool(
  name: string,
  policy: 'read' | 'write',
  execute = async () => ({ ok: true }),
): AgentToolDefinition {
  return {
    name,
    description: name,
    policy,
    inputSchema: { type: 'object', properties: {} },
    execute,
  }
}

function makeToolSet(overrides: Partial<DialogueToolSet> = {}): DialogueToolSet {
  return {
    version: 1,
    workspace: 'main',
    tools: [
      makeTool('editor.get_state', 'read'),
      makeTool('editor.write', 'write'),
    ],
    readableTargets: ['tab-1'],
    writableTarget: 'tab-1',
    ...overrides,
  }
}

function makeContextBlocks(
  overrides: DialogueContextBlock[] = [],
): DialogueContextBlock[] {
  return [
    {
      source: 'editorContent',
      version: 'v-editor-1',
      coverage: 'full',
      content: '正文内容',
    },
    {
      source: 'referenceOutline',
      version: 'v-outline-1',
      coverage: 'reference',
      content: '参考大纲',
      truncated: true,
    },
    ...overrides,
  ]
}

describe('dialogueFoundation permissions', () => {
  it('keeps discuss and analyze read-only', () => {
    expect(resolveDialoguePermission('discuss')).toMatchObject({
      intent: 'discuss',
      readTarget: true,
      writeEditor: false,
    })
    expect(resolveDialoguePermission('analyze')).toMatchObject({
      intent: 'analyze',
      readTarget: true,
      writeEditor: false,
    })
  })

  it('allows direct writes only for edit and generate', () => {
    expect(resolveDialoguePermission('edit').writeEditor).toBe(true)
    expect(resolveDialoguePermission('generate').writeEditor).toBe(true)
  })

  it('treats auto as conservative discuss', () => {
    expect(resolveDialoguePermission('auto')).toMatchObject({
      intent: 'discuss',
      writeEditor: false,
    })
  })

  it('keeps direct write scoped to edit and generate intents', () => {
    expect(resolveDialoguePermission('discuss', 'direct').writeEditor).toBe(false)
    expect(resolveDialoguePermission('analyze', 'direct').writeEditor).toBe(false)
    expect(resolveDialoguePermission('auto', 'direct').writeEditor).toBe(false)
    expect(resolveDialoguePermission('edit', 'direct').writeEditor).toBe(true)
    expect(resolveDialoguePermission('generate', 'direct').writeEditor).toBe(true)
  })
})

describe('dialogueFoundation tool contracts', () => {
  it('rejects read tools without readable targets', () => {
    const result = validateDialogueToolSet(makeToolSet({ readableTargets: [] }))
    expect(result.valid).toBe(false)
    expect(result.errors.join('\n')).toContain('editor.get_state')
    expect(result.errors.join('\n')).toContain('readableTargets')
  })

  it('rejects write tools without a writable target', () => {
    const result = validateDialogueToolSet(makeToolSet({ writableTarget: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors.join('\n')).toContain('editor.write')
    expect(result.errors.join('\n')).toContain('writableTarget')
  })

  it('rejects interactive tools on pipeline workspace', () => {
    const result = validateDialogueToolSet(
      makeToolSet({ workspace: 'pipeline' }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join('\n')).toContain('生成流水线禁止注册交互式对话工具')
  })

  it('keeps discuss intent read-only', () => {
    const tools = resolveDialogueToolSurface(makeToolSet(), 'discuss')
    expect(tools.map(tool => tool.name)).toEqual(['editor.get_state'])
  })

  it('keeps direct write tools under edit intent', () => {
    const tools = resolveDialogueToolSurface(makeToolSet(), 'edit')
    expect(tools.map(tool => tool.name)).toEqual([
      'editor.get_state',
      'editor.write',
    ])
  })

  it('keeps direct mode write tools intent-scoped', () => {
    expect(resolveDialogueToolSurface(makeToolSet(), 'discuss', 'direct').map(tool => tool.name)).toEqual(['editor.get_state'])
    expect(resolveDialogueToolSurface(makeToolSet(), 'analyze', 'direct').map(tool => tool.name)).toEqual(['editor.get_state'])
    expect(resolveDialogueToolSurface(makeToolSet(), 'auto', 'direct').map(tool => tool.name)).toEqual(['editor.get_state'])
    expect(resolveDialogueToolSurface(makeToolSet(), 'edit', 'direct').map(tool => tool.name)).toEqual([
      'editor.get_state',
      'editor.write',
    ])
    expect(resolveDialogueToolSurface(makeToolSet(), 'generate', 'direct').map(tool => tool.name)).toEqual([
      'editor.get_state',
      'editor.write',
    ])
  })
})

describe('dialogueFoundation context contracts', () => {
  it('accepts a valid mixed context pack', () => {
    const result = validateDialogueContextBlocks(makeContextBlocks())
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('rejects full coverage with truncation', () => {
    const result = validateDialogueContextBlocks([
      {
        source: 'editorContent',
        version: 'v-1',
        coverage: 'full',
        content: 'x',
        truncated: true,
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('truncated')
  })

  it('rejects missing version or content', () => {
    const result = validateDialogueContextBlocks([
      { source: 'editorContent', coverage: 'full' },
    ])
    expect(result.valid).toBe(false)
    expect(result.errors.join('\n')).toContain('version')
    expect(result.errors.join('\n')).toContain('content')
  })

  it('rejects duplicate sources', () => {
    const result = validateDialogueContextBlocks([
      { source: 'outline', version: 'v1', coverage: 'full', content: 'a' },
      { source: 'outline', version: 'v2', coverage: 'partial', content: 'b' },
    ])
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('重复')
  })
})

describe('dialogueFoundation batch events', () => {
  it('normalizes valid legacy-shaped batch events', () => {
    const event = normalizeDialogueBatchEvent({
      version: 1,
      batchId: 'batch-1',
      workspace: 'main',
      targetId: 'tab-1',
      status: 'applied',
      commandCount: 2,
      occurredAt: 123,
    })
    expect(event).toMatchObject({ batchId: 'batch-1', status: 'applied' })
  })

  it('rejects invalid status and malformed batch ids', () => {
    expect(
      normalizeDialogueBatchEvent({
        version: 1,
        batchId: 'batch-1',
        workspace: 'main',
        targetId: 'tab-1',
        status: 'unknown',
        commandCount: 1,
      }),
    ).toBeNull()
    expect(normalizeDialogueBatchEvent({})).toBeNull()
  })
})

describe('executeDialogueFoundation', () => {
  it('does not execute write tools under discuss intent', async () => {
    const execute = vi.fn()
    await executeDialogueFoundation({
      intent: 'discuss',
      toolSet: makeToolSet({
        tools: [
          makeTool('editor.get_state', 'read'),
          makeTool('editor.write', 'write'),
        ],
      }),
      contextBlocks: makeContextBlocks(),
      baseMessages: [],
      executeTool: execute,
      toolCalls: [
      { name: 'editor.write', input: {} },
      ],
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('executes only authorized tools under edit intent', async () => {
    const execute = vi.fn()
    await executeDialogueFoundation({
      intent: 'edit',
      toolSet: makeToolSet(),
      contextBlocks: makeContextBlocks(),
      baseMessages: [],
      executeTool: execute,
      toolCalls: [
        { name: 'editor.get_state', input: {} },
        { name: 'editor.write', input: {} },
      ],
    })
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('does not execute removed proposal tools under discuss intent in direct mode', async () => {
    const execute = vi.fn()
    await executeDialogueFoundation({
      intent: 'discuss',
      writeMode: 'direct',
      toolSet: makeToolSet(),
      contextBlocks: makeContextBlocks(),
      baseMessages: [],
      executeTool: execute,
      toolCalls: [{ name: 'editor.write', input: {} }],
    })
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('dialogueFoundation editor registration', () => {
  it('creates a main workspace tool set with explicit target contracts', () => {
    const snapshot = createEditorTargetSnapshot({
      workspace: 'main',
      targetId: 'tab-1',
      label: '第一章',
      content: '正文内容',
      selectionStart: 0,
      selectionEnd: 0,
    })
    const tools = createEditorTools({
      workspace: 'main',
      getSnapshot: () => snapshot,
      getAllSnapshots: () => [snapshot],
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    })
    expect(tools.map(tool => tool.name)).toContain('editor.get_state')
    expect(tools.map(tool => tool.name)).toContain('editor.write')
    expect(tools.map(tool => tool.name)).not.toContain('outline.get_structure')
  })

  it('creates an outline workspace set without changing tool names', () => {
    const snapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲编辑器',
      content: '大纲内容',
      selectionStart: 0,
      selectionEnd: 0,
    })
    const tools = createEditorTools({
      workspace: 'outline',
      getSnapshot: () => snapshot,
      getAllSnapshots: () => [snapshot],
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    })
    expect(tools.map(tool => tool.name)).toContain('editor.multi_get_state')
    expect(tools.map(tool => tool.name)).toContain('editor.global_search')
  })

  it('rejects an editor tool set without a writable target', () => {
    const snapshot = createEditorTargetSnapshot({
      workspace: 'main',
      targetId: '',
      label: '',
      content: '',
      selectionStart: 0,
      selectionEnd: 0,
    })
    expect(() => createEditorTools({ getSnapshot: () => snapshot })).toThrow(
      /编辑器工具集契约校验失败/,
    )
  })
})
