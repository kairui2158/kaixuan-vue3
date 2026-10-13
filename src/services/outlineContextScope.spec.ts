import { describe, expect, it } from 'vitest'
import { buildOutlineUnitClosure, validateOutlineContextScope } from './outlineContextScope'

const outline = [
  '# 第一卷',
  '',
  '## 卷级常任约束',
  '> 作用域：卷级常任',
  '- 全卷不得提前揭示身世。',
  '',
  '## 剧情单元 D1-03 雨夜',
  '> 作用域：单元级 D1-03',
  '章节范围：第 12 - 14 章',
  '- 本章发现纸条。',
  '',
  '## 剧情单元 D1-04 黎明',
  '> 作用域：单元级 D1-04',
  '章节范围：第 15 - 17 章',
  '- 无关单元不应进入闭包。',
  '',
  '## 情绪弧线',
  '> 作用域：卷级常任',
  '| 第11章 | 压抑 |',
  '| 第12章 | 惊愕 |',
  '| 第13章 | 反抗 |',
  '| 第15章 | 平静 |'
].join('\n')

describe('outlineContextScope', () => {
  it('builds the permanent plus current unit closure', () => {
    const result = buildOutlineUnitClosure({ outline, unitId: 'D1-03' })
    expect(result.ok).toBe(true)
    expect(result.closure).toContain('全卷不得提前揭示身世。')
    expect(result.closure).toContain('本章发现纸条。')
    expect(result.closure).not.toContain('无关单元')
    expect(result.permanentCount).toBe(2)
    expect(result.unitCount).toBe(1)
  })

  it('slices arc tables to the current unit chapter range', () => {
    const result = buildOutlineUnitClosure({ outline, unitId: 'D1-03' })
    expect(result.closure).toContain('| 第12章 | 惊愕 |')
    expect(result.closure).toContain('| 第13章 | 反抗 |')
    expect(result.closure).not.toContain('| 第11章 | 压抑 |')
    expect(result.closure).not.toContain('| 第15章 | 平静 |')
  })

  it('keeps undeclared sections in scoped outlines and reports warnings', () => {
    const scopedWithUndeclared = '## 卷级常任约束\n> 作用域：卷级常任\n- 全卷禁令。\n\n## 旧段\n旧段内容'
    const result = buildOutlineUnitClosure({ outline: scopedWithUndeclared, unitId: 'D1-03' })
    expect(result.ok).toBe(false)
    expect(result.errors[0]?.code).toBe('unit_not_found')
  })

  it('degrades legacy outlines without any scope declaration and records the reason', () => {
    const result = buildOutlineUnitClosure({
      outline: '旧项目卷纲\n没有段位声明，也没有二级标题。',
      unitId: 'D1-03',
      volumeSummary: '旧项目第一卷概要',
      chapterDetail: '第12章 纸条\n雨夜中发现旧灯塔底层的纸条。'
    })
    expect(result.ok).toBe(true)
    expect(result.degradedReason).toBe('legacy_outline_no_scope')
    expect(result.closure).toContain('[旧卷纲显式降级：卷概要]\n旧项目第一卷概要')
    expect(result.closure).toContain('[旧卷纲显式降级：当前章细纲]')
    expect(result.closureBytes).toBeGreaterThan(0)
  })

  it('fails a legacy explicit fallback when volume summary or chapter detail is missing', () => {
    const result = buildOutlineUnitClosure({
      outline: '旧项目卷纲\n没有段位声明。',
      unitId: 'D1-03',
      volumeSummary: '',
      chapterDetail: '第12章 纸条'
    })
    expect(result.ok).toBe(false)
    expect(result.degradedReason).toBe('legacy_outline_no_scope')
    expect(result.errors[0]?.code).toBe('closure_empty')
  })

  it('fails when the unit does not exist', () => {
    const result = buildOutlineUnitClosure({ outline, unitId: 'D9-99' })
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'unit_not_found' })
    ])
  })

  it('fails for an empty outline without silent fallback', () => {
    const result = buildOutlineUnitClosure({ outline: '', unitId: 'D1-03' })
    expect(result.ok).toBe(false)
    expect(result.errors[0]?.code).toBe('outline_empty')
  })

  it('reports invalid scope declarations', () => {
    const invalid = '## 坏段\n> 作用域：奇怪的值\n内容'
    const result = validateOutlineContextScope(invalid)
    expect(result.ok).toBe(false)
    expect(result.errors[0]?.code).toBe('scope_invalid')
  })

  it('trims low priority sections only when max budget is exceeded', () => {
    const big = [
      '## 常任',
      '> 作用域：卷级常任',
      'A'.repeat(100),
      '',
      '## 剧情单元 D1-03 大段',
      '> 作用域：单元级 D1-03',
      'B'.repeat(30000)
    ].join('\n')
    const result = buildOutlineUnitClosure({ outline: big, unitId: 'D1-03', targetBytes: 200, maxBytes: 300 })
    expect(result.ok).toBe(true)
    expect(result.trimmed).toEqual(['剧情单元 D1-03 大段'])
    expect(result.closure).not.toContain('B'.repeat(30))
  })

  it('ignores headings inside fenced code blocks', () => {
    const fenced = '## 常任\n> 作用域：卷级常任\n```markdown\n## 假标题\n> 作用域：单元级 X1\n```'
    const result = validateOutlineContextScope(fenced)
    expect(result.sections.map(section => section.title)).toEqual(['常任'])
  })
})
