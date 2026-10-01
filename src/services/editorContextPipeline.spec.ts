import { describe, expect, it } from 'vitest'
import { buildMainSnapshot } from './editorEntryFacade'
import { buildEditorContextPipeline } from './editorContextPipeline'

function longTarget() {
  return buildMainSnapshot({
    workspace: 'main',
    targetId: 'tab-long',
    label: '长文测试',
    content: `${'头'.repeat(7_000)}中段${'尾'.repeat(7_000)}`,
    selectionStart: 7_000,
    selectionEnd: 7_002,
  }, 'project-1')
}

describe('buildEditorContextPipeline', () => {
  it('runs the documented pipeline stages and validates the final pack', () => {
    const result = buildEditorContextPipeline({
      target: longTarget(),
      provider: { contextWindowTokens: 128_000 },
      model: 'gpt-4o',
      maxOutputTokens: 8192,
    })

    expect(result.workspace).toBe('main')
    expect(result.mode).toBe('packed')
    expect(result.stages).toEqual(['retrieve', 'filter', 'rank', 'assemble', 'validate'])
    expect(result.content).toContain('editor.document_map')
    expect(result.content).toContain('editor.read_range')
    expect(result.validation.valid).toBe(true)
    expect(result.estimatedInputTokens).toBeGreaterThan(0)
    expect(result.availableContextTokens).toBeGreaterThan(0)
    expect(result.windowDeclared).toBe(true)
  })

  it('keeps short documents full without window validation', () => {
    const result = buildEditorContextPipeline({
      target: buildMainSnapshot({
        workspace: 'main',
        targetId: 'tab-short',
        label: '短文',
        content: '完整短文',
        selectionStart: 0,
        selectionEnd: 0,
      }, 'project-1'),
      provider: { contextWindowTokens: 128_000 },
      model: 'gpt-4o',
      maxOutputTokens: 8192,
    })

    expect(result.mode).toBe('full')
    expect(result.content).toBe('完整短文')
    expect(result.validation.valid).toBe(true)
    expect(result.validation.reason).toBe('full-mode-no-window-check')
  })

  it('records unknown windows instead of guessing a provider limit', () => {
    const result = buildEditorContextPipeline({
      target: longTarget(),
      provider: null,
      model: 'unknown-model',
      maxOutputTokens: 8192,
    })

    expect(result.windowDeclared).toBe(false)
    expect(result.availableContextTokens).toBeNull()
    expect(result.validation.valid).toBe(true)
    expect(result.validation.reason).toBe('unknown-window-skipped')
  })

  it('downgrades oversized full-context requests to packed mode with a reason', () => {
    const target = buildMainSnapshot({
      workspace: 'main',
      targetId: 'tab-window-edge',
      label: '窗口边界',
      content: '雨'.repeat(11_999),
      selectionStart: 0,
      selectionEnd: 0,
    }, 'project-1')

    const result = buildEditorContextPipeline({
      target,
      provider: { contextWindowTokens: 16_000 },
      model: 'tiny-window-model',
      maxOutputTokens: 8_000,
    })

    expect(result.mode).toBe('packed')
    expect(result.validation.valid).toBe(true)
    expect(result.downgradeReason).toBe('full-context-exceeds-available-window')
    expect(result.content).not.toContain('雨'.repeat(1_000))
    expect(result.content).toContain('editor.document_map')
  })

  it('rejects packs that omit mandatory editor guidance', () => {
    const result = buildEditorContextPipeline({
      target: longTarget(),
      provider: { contextWindowTokens: 128_000 },
      model: 'gpt-4o',
      maxOutputTokens: 8192,
      forceInvalidPackForTest: true,
    })

    expect(result.validation.valid).toBe(false)
    expect(result.validation.reason).toBe('missing-editor-read-guidance')
  })

  it('preserves the outline structure pack through the pipeline', () => {
    const result = buildEditorContextPipeline({
      target: buildMainSnapshot({
        workspace: 'outline',
        targetId: 'outline',
        label: '大纲编辑器',
        content: '第一卷 起势\n少年离开旧城。',
        selectionStart: 0,
        selectionEnd: 2,
      }, 'project-1'),
      provider: { contextWindowTokens: 128_000 },
      model: 'gpt-4o',
      maxOutputTokens: 8192,
    })

    expect(result.workspace).toBe('outline')
    expect(result.mode).toBe('packed')
    expect(result.content).toContain('[大纲结构地图]')
    expect(result.content).toContain('[当前焦点全文]')
  })
})
