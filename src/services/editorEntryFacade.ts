import type { EditorTargetLike, EditorTargetSnapshot } from './editorTarget'
import { createEditorTargetSnapshot } from './editorTarget'
import {
  editorContextInjectionMode,
  resolveEditorReadCapChars,
} from './editorContextPolicy'
import { resolveModelContextWindow } from './conversationContextService'
import { buildEditorContextPipeline } from './editorContextPipeline'

export type EditorEntryContextMode = 'full' | 'packed'

export interface EditorEntryProviderWindow {
  providerContextWindowTokens?: number | string | null
  modelContextWindow?: number
}

export interface EditorEntryTarget {
  workspace: 'main' | 'outline'
  targetId: string
  label: string
  chapterId?: string
  mode?: string
  content?: string
  selectionStart?: number
  selectionEnd?: number
}

export interface EditorEntryContextPack {
  workspace: 'main' | 'outline'
  mode: EditorEntryContextMode
  content: string
  pipeline: {
    stages: string[]
    estimatedInputTokens: number
    availableContextTokens: number | null
    windowDeclared: boolean
    downgradeReason?: 'full-context-exceeds-available-window'
    validationReason: string
    validationValid: boolean
  }
}

export function getReadCapChars(
  provider: { contextWindowTokens?: number | string | null } | null | undefined,
  model: string,
): number {
  return resolveEditorReadCapChars({
    providerContextWindowTokens: provider?.contextWindowTokens,
    modelContextWindow: resolveModelContextWindow(model),
  })
}

export function buildSnapshot(target: EditorEntryTarget): EditorTargetSnapshot
export function buildSnapshot(target: null | undefined): null
export function buildSnapshot(
  target: EditorEntryTarget | null | undefined,
): EditorTargetSnapshot | null
export function buildSnapshot(
  target: EditorEntryTarget | null | undefined,
): EditorTargetSnapshot | null {
  if (!target?.targetId) return null
  const source: EditorTargetLike = {
    ...target,
    content: target.content || '',
  }
  return createEditorTargetSnapshot(source)
}

export function buildMainSnapshot(
  tab: EditorEntryTarget | null | undefined,
  fallbackTargetId: string,
  selection?: { selectionStart: number; selectionEnd: number },
): EditorTargetSnapshot {
  if (!tab) {
    return createEditorTargetSnapshot({
      workspace: 'main',
      targetId: fallbackTargetId,
      label: '主页编辑器',
      content: '',
      selectionStart: 0,
      selectionEnd: 0,
    })
  }
  const source: EditorTargetLike = {
    ...tab,
    content: tab.content || '',
    selectionStart: selection?.selectionStart ?? 0,
    selectionEnd: selection?.selectionEnd ?? 0,
  }
  return createEditorTargetSnapshot(source)
}

/**
 * mode omitted: follow the shared context-injection policy (main) or the
 * outline structure pack. `full` forces raw document content for callers that
 * already know the document must not be packed.
 */
export function buildContextPack(
  target: EditorTargetSnapshot,
  mode?: EditorEntryContextMode,
  options?: {
    provider?: { contextWindowTokens?: number | string | null } | null
    model?: string
    maxOutputTokens?: number | null
  },
): EditorEntryContextPack | null {
  if (!target.content) return null
  if (mode === 'full') {
    return {
      workspace: target.workspace,
      mode: 'full',
      content: target.content,
      pipeline: {
        stages: ['retrieve', 'filter', 'rank', 'assemble', 'validate'],
        estimatedInputTokens: 0,
        availableContextTokens: null,
        windowDeclared: false,
        validationReason: 'explicit-full-contract',
        validationValid: true,
      },
    }
  }
  if (target.workspace === 'outline') {
    const outlineResult = buildEditorContextPipeline({
      target,
      provider: options?.provider,
      model: options?.model,
      maxOutputTokens: options?.maxOutputTokens,
    })
    return {
      workspace: outlineResult.workspace,
      mode: outlineResult.mode,
      content: outlineResult.content,
      pipeline: {
        stages: outlineResult.stages,
        estimatedInputTokens: outlineResult.estimatedInputTokens,
        availableContextTokens: outlineResult.availableContextTokens,
        windowDeclared: outlineResult.windowDeclared,
        downgradeReason: outlineResult.downgradeReason,
        validationReason: outlineResult.validation.reason,
        validationValid: outlineResult.validation.valid,
      },
    }
  }
  const mainResult = buildEditorContextPipeline({
    target,
    provider: options?.provider,
    model: options?.model,
    maxOutputTokens: options?.maxOutputTokens,
  })
  return {
    workspace: mainResult.workspace,
    mode: mainResult.mode,
    content: mainResult.content,
    pipeline: {
      stages: mainResult.stages,
      estimatedInputTokens: mainResult.estimatedInputTokens,
      availableContextTokens: mainResult.availableContextTokens,
      windowDeclared: mainResult.windowDeclared,
      downgradeReason: mainResult.downgradeReason,
      validationReason: mainResult.validation.reason,
      validationValid: mainResult.validation.valid,
    },
  }
}

export { editorContextInjectionMode }
