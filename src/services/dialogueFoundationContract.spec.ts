import { describe, expect, it } from 'vitest'
import type { ContextMessage } from '../types/context'
import { createEditorTools } from './editorTools'
import { createEditorTargetSnapshot } from './editorTarget'
import {
  executeDialogueFoundation,
  normalizeDialogueBatchEvent,
  validateDialogueToolSet,
  type DialogueContextBlock,
  type DialogueIntent,
  type DialogueToolSet,
} from './dialogueFoundation'
import { ConversationContextService } from './conversationContextService'
import { toDialogueBatchEvent, createEditorBatchRecord } from './editorBatchRecord'

type Workspace = 'main' | 'outline' | 'pipeline'

const intents: Array<Exclude<DialogueIntent, 'auto'>> = ['discuss', 'analyze', 'edit', 'generate']

function makeSnapshot(workspace: 'main' | 'outline') {
  return createEditorTargetSnapshot({
    workspace,
    targetId: workspace === 'main' ? 'main-tab' : 'outline',
    label: workspace === 'main' ? '第二章' : '大纲工作台',
    content: workspace === 'main' ? '第二章内容。男主在灯塔下发现旧信。' : '第一卷 风暴起点\n第二章大纲条目。',
    selectionStart: 0,
    selectionEnd: 0,
  })
}

function makeToolSet(workspace: Workspace): DialogueToolSet {
  if (workspace === 'pipeline') {
    return { version: 1, workspace, tools: [], readableTargets: [], writableTarget: undefined }
  }
  const snapshot = makeSnapshot(workspace)
  return {
    version: 1,
    workspace,
    tools: createEditorTools({
      workspace,
      getSnapshot: () => snapshot,
      getAllSnapshots: () => [snapshot],
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }),
    readableTargets: [snapshot.targetId],
    writableTarget: snapshot.targetId,
  }
}

async function makeContextBlocks(workspace: Workspace): Promise<DialogueContextBlock[]> {
  const service = new ConversationContextService({
    storage: {
      read: async () => null,
      write: async () => undefined,
      remove: async () => undefined,
    },
    projectReader: async projectId => ({
      projectId,
      outline: '第一卷 风暴起点\n第二章大纲条目。',
      settings: { style: 'strict' },
      memories: '男主要在第二章确认寄信人身份。',
      selectedText: '',
      activeTab: 'main-tab',
    }),
  })
  const bundle = await service.buildContextBundle({
    projectId: 'contract-project',
    workspace: workspace === 'pipeline' ? 'pipeline' : workspace,
    purpose: 'generate',
    workspaceState: workspace === 'main'
      ? {
          outline: undefined,
          editorContent: '第二章内容。男主在灯塔下发现旧信。',
          referenceOutline: '第一卷 风暴起点\n第二章大纲条目。',
          selectedText: '',
          activeTab: 'main-tab',
          settings: { style: 'strict' },
          memories: '男主要在第二章确认寄信人身份。',
        }
      : {
          outline: '第一卷 风暴起点\n第二章大纲条目。',
          selectedText: '',
          activeTab: 'outline',
          settings: { style: 'strict' },
          memories: '男主要在第二章确认寄信人身份。',
        },
  })
  const policy = service.getPolicy('generate')
  const blocks = service.buildDialogueContextBlocks(bundle, policy)
  if (workspace === 'pipeline') {
    return [
      {
        source: 'pipeline',
        version: 'v-pipeline-1',
        coverage: 'full',
        content: '流水线五层生成上下文',
      },
    ]
  }
  return blocks
}

function makeBaseMessages(): ContextMessage[] {
  return [{ role: 'user', content: '契约测试' }]
}

describe('dialogue foundation contract across workspaces', () => {
  it.each(intents)('keeps the same permission matrix for intent=%s', async intent => {
    const results = await Promise.all((['main', 'outline', 'pipeline'] as Workspace[]).map(async workspace => {
      return executeDialogueFoundation({
        intent,
        toolSet: makeToolSet(workspace),
        contextBlocks: await makeContextBlocks(workspace),
        baseMessages: makeBaseMessages(),
      })
    }))
    const [main, outline, pipeline] = results
    expect(new Set(results.map(result => result.permission.writeEditor)).size).toBe(1)
    expect(results.every(result => result.permission.writeEditor)).toBe(
      intent === 'edit' || intent === 'generate',
    )
    expect(new Set(results.map(result => result.permission.readTarget)).size).toBe(1)
    expect(new Set(results.map(result => result.intent)).size).toBe(1)
    expect(main.contextValidation.valid).toBe(true)
    expect(outline.contextValidation.valid).toBe(true)
    expect(pipeline.contextValidation.valid).toBe(true)
    expect(pipeline.toolNames).toEqual([])
  })

  it.each(['edit', 'generate'] as const)('exposes direct write tools only for write intent=%s', async intent => {
    const main = await executeDialogueFoundation({
      intent,
      toolSet: makeToolSet('main'),
      contextBlocks: await makeContextBlocks('main'),
      baseMessages: makeBaseMessages(),
    })
    const outline = await executeDialogueFoundation({
      intent,
      toolSet: makeToolSet('outline'),
      contextBlocks: await makeContextBlocks('outline'),
      baseMessages: makeBaseMessages(),
    })
    expect(main.toolNames).toContain('editor.write')
    expect(outline.toolNames).toContain('editor.write')
    expect(main.permission.writeEditor).toBe(true)
    expect(outline.permission.writeEditor).toBe(true)
  })

  it.each(['discuss', 'analyze'] as const)('keeps read-only intent=%s without editor.write', async intent => {
    const main = await executeDialogueFoundation({
      intent,
      toolSet: makeToolSet('main'),
      contextBlocks: await makeContextBlocks('main'),
      baseMessages: makeBaseMessages(),
    })
    expect(main.toolNames).not.toContain('editor.write')
    expect(main.permission.writeEditor).toBe(false)
  })

  it('normalizes the same batch event contract for main and outline', () => {
    for (const workspace of ['main', 'outline'] as const) {
      const record = createEditorBatchRecord({
        workspace,
        targetId: workspace === 'main' ? 'main-tab' : 'outline',
        sourceContent: workspace === 'main' ? '正文原文' : '大纲原文',
        batch: {
          type: 'editor_edit_batch',
          version: 1,
          reason: '契约测试',
          commands: [
            {
              type: 'editor_edit',
              version: 1,
              operation: 'replace_match',
              target: '旧文本',
              content: '新文本',
            },
          ],
        },
      })
      for (const status of ['pending', 'applied', 'rejected', 'rolled_back', 'version_changed', 'expired'] as const) {
        const event = toDialogueBatchEvent(record, status, '统一契约测试')
        expect(normalizeDialogueBatchEvent(event)).toEqual(event)
      }
    }
  })

  it('rejects illegal tool declarations and context blocks', () => {
    const illegalWrite = makeToolSet('main')
    illegalWrite.tools.push({
      name: 'editor.direct_write',
      description: '非法直写',
      policy: 'write',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
        },
      },
      execute: async () => ({ ok: true }),
    })
    expect(validateDialogueToolSet(illegalWrite).valid).toBe(true)

    const illegalSchema = makeToolSet('main')
    illegalSchema.tools.push({
      name: 'broken_tool',
      description: '非法 schema',
      policy: 'read',
      inputSchema: {
        type: 'object',
        properties: null as unknown as Record<string, unknown>,
      },
      execute: async () => ({ ok: true }),
    })
    const validation = validateDialogueToolSet(illegalSchema)
    expect(validation.valid).toBe(false)
    expect(validation.errors.join('\n')).toContain('broken_tool')

    const illegalPipelineTools = makeToolSet('pipeline')
    illegalPipelineTools.tools.push({
      name: 'editor.write',
      description: '流水线交互工具',
      policy: 'write',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ ok: true }),
    })
    const pipelineValidation = validateDialogueToolSet(illegalPipelineTools)
    expect(pipelineValidation.valid).toBe(false)
    expect(pipelineValidation.errors.join('\n')).toContain('生成流水线禁止注册交互式对话工具')
  })
})
