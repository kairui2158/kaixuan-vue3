import { CONTEXT_BUDGET_DEFAULTS } from './contextBudget'

export const EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS = 12_000
export const EDITOR_CONTEXT_EDGE_CHARS = 600

export interface EditorContextSelection {
  selectionStart: number
  selectionEnd: number
  selectedText: string
}

export function shouldInjectFullEditorContent(length: number): boolean {
  return length <= EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS
}

export function editorContextInjectionMode(length: number): 'full' | 'packed' {
  return shouldInjectFullEditorContent(length) ? 'full' : 'packed'
}

export function buildMainEditorContextPack(input: {
  label: string
  content: string
  selection: EditorContextSelection
}): string {
  if (shouldInjectFullEditorContent(input.content.length)) return input.content
  return buildPackedMainEditorContextPack(input)
}

export function buildPackedMainEditorContextPack(input: {
  label: string
  content: string
  selection: EditorContextSelection
}): string {
  const content = input.content
  const head = content.slice(0, EDITOR_CONTEXT_EDGE_CHARS)
  const tail = content.slice(Math.max(0, content.length - EDITOR_CONTEXT_EDGE_CHARS))
  return [
    `目标：${input.label}`,
    `长文档目标总长度：${content.length} 字符`,
    `当前选区：${input.selection.selectionStart}-${input.selection.selectionEnd}${
      input.selection.selectedText ? `：${input.selection.selectedText}` : '（无选区）'
    }`,
    `开头片段：\n${head}`,
    `结尾片段：\n${tail}`,
    '长文档已启用分段模式：如需修改焦点外内容，必须先调用 editor.document_map，再用 editor.read_range 读取对应范围。',
  ].join('\n')
}


export function resolveEditorReadCapChars(input: {
  providerContextWindowTokens?: number | string | null
  modelContextWindow?: number
}): number {
  const knownWindow = Number.isFinite(input.modelContextWindow) && Number(input.modelContextWindow) > 0
  const providerWindow = Number(input.providerContextWindowTokens)
  const contextWindow = Number.isFinite(providerWindow) && providerWindow > 0
    ? Math.floor(providerWindow)
    : knownWindow
      ? Math.floor(Number(input.modelContextWindow))
      : CONTEXT_BUDGET_DEFAULTS.unknownWindowTokens
  // Keep the minimum aligned with editorDocumentMap's default read page.
  // A pure percentage would make 32k models fall below the 1000-char floor.
  return Math.max(EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS, Math.floor(contextWindow * 0.02))
}
