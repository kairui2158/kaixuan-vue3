import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getLockedSettingsForLayer } from './settingsProjection'
import {
  arbitratePipelineStyle,
  buildStyleSemanticsTraceEvent,
  settingsStyleLines,
  withoutSettingsStyleText
} from './pipelineStyleArbiter'

const collection = {
  categories: ['人物', '风格'],
  items: {
    人物: [{ id: 'p1', name: '王芳', category: '人物', content: '幽默，风趣，话痨', status: 'locked' }],
    风格: [{ id: 's1', name: '主题基调', category: '风格', content: '都市夜感，信息密度高', status: 'locked' }]
  }
}

describe('pipeline style arbiter wiring', () => {
  it('moves style lines out of settings projection and into one arbitrated block', () => {
    const projection = getLockedSettingsForLayer('body', collection)
    const settingsText = withoutSettingsStyleText(projection)

    expect(settingsText).toContain('人物 - 王芳 - 幽默，风趣，话痨')
    expect(settingsText).not.toContain('[表达风格]')
    expect(settingsText).not.toContain('主题基调')

    const result = arbitratePipelineStyle({
      layer: 'body',
      profileStyleText: '风格标签：冷峻，克制\n节奏参数：中速',
      settingsStyleLines: settingsStyleLines(projection),
      profile: {}
    })
    expect(result.text).toContain('风格 - 主题基调 - 都市夜感，信息密度高')
    expect(result.text).toContain('优先级：风格档案指令优先')
    expect(result.duplicateLineCount).toBe(0)
    expect(result.conflictLineCount).toBe(0)

    const event = buildStyleSemanticsTraceEvent('body', result, projection)
    expect(event.type).toBe('style-semantics-merged')
    expect(event.level).toBe('info')
    expect(JSON.parse(event.detail)).toMatchObject({
      layer: 'body',
      sources: { profileStyle: true, settingsStyle: true },
      duplicateLineCount: 0,
      conflictLineCount: 0
    })
  })

  it('keeps the three pipeline consumers wired to the arbiter and stripped projection text', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/pipeline/PipelinePanel.vue'), 'utf8')
    for (const layer of ['Volume', 'Chapter', 'Body']) {
      expect(source).toContain(`function get${layer}StyleContext()`)
    }
    expect(source).toContain('compileArbitratedStyleContext')
    expect(source).toContain('withoutSettingsStyleText(settingsProjection)')
    expect(source).toContain('withoutSettingsStyleText(settingsProjectionForChapters)')
    expect(source).toContain('buildStyleSemanticsTraceEvent(layer, result, projection)')
  })

  it('keeps settings generation on the profile-only style path', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/pipeline/PipelinePanel.vue'), 'utf8')
    expect(source).toContain('function getSettingsGenerationStyleContext()')
    expect(source).toContain('getSettingsGenerationStyleContext()')
    expect(source).not.toContain('function getStyleContext()')
  })
})
