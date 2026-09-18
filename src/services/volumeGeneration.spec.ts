import { describe, expect, it } from 'vitest'
import {
  buildVolumeOutlineScaffold,
  buildVolumePrompt,
  clampGeneratedVolumes,
  hasVolumeContent
} from './volumeGeneration'

const base = {
  outlineText: 'OUTLINE',
  settingsText: 'SETTINGS',
  boundText: 'BOUND',
  effectiveVolumes: 5,
  totalWords: 5_000_000,
  allocatedSum: 1_000_000,
  existingVolumes: [] as Array<{ name?: string; outline?: string; summary?: string }>
}

describe('buildVolumePrompt', () => {
  it('single mode with no volumes asks for exactly volume 1', () => {
    const prompt = buildVolumePrompt({ ...base, mode: 'single' })
    expect(prompt).toContain('请只生成第1卷的卷纲')
    expect(prompt).toContain('正好1项')
    expect(prompt).not.toContain('请生成5卷')
  })

  it('single mode anchors memory to the previous volume', () => {
    const prompt = buildVolumePrompt({
      ...base,
      mode: 'single',
      existingVolumes: [{ name: '第一卷', outline: '开局' }, { name: '第二卷', outline: '扩张' }]
    })
    expect(prompt).toContain('已生成2卷')
    expect(prompt).toContain('上一卷为：第二卷 - 扩张')
    expect(prompt).toContain('请只生成第3卷的卷纲')
  })

  it('continue mode asks for exactly the next volume', () => {
    const prompt = buildVolumePrompt({
      ...base,
      mode: 'continue',
      existingVolumes: [{ name: '第一卷' }]
    })
    expect(prompt).toContain('请只生成第2卷的卷纲')
    expect(prompt).toContain('正好1项')
    expect(prompt).not.toContain('第2卷到第5卷')
  })

  it('continue mode asks for volume 1 when the list is empty', () => {
    const prompt = buildVolumePrompt({ ...base, mode: 'continue' })
    expect(prompt).toContain('请只生成第1卷的卷纲')
    expect(prompt).toContain('正好1项')
  })

  it('auto mode keeps full-volume semantics', () => {
    const prompt = buildVolumePrompt({ ...base, mode: 'auto' })
    expect(prompt).toContain('请生成5卷的卷纲')
    expect(prompt).toContain('各卷allocatedWords之和应等于全书总字数')
  })

  it('describes one coherent plan state instead of conflicting volume facts', () => {
    const prompt = buildVolumePrompt({
      ...base,
      mode: 'continue',
      existingVolumes: [{ outline: '第一卷', allocatedWords: 1_000_000 }]
    })
    expect(prompt).toContain('[已生成卷数]\n1')
    expect(prompt).toContain('[剩余待分配字数]\n4000000字')
    expect(prompt).toContain('已生成1卷，上一卷为')
    expect(prompt).not.toContain('[卷纲计划冲突]')
  })
})

describe('buildVolumeOutlineScaffold', () => {
  it('keeps outline headings and declares the omitted original size', () => {
    const scaffold = buildVolumeOutlineScaffold('第一卷 起点\n详细剧情A\n第一章 旧案\n详细剧情B')
    expect(scaffold).toContain('[大纲结构地图（S2+默认精简视图）]')
    expect(scaffold).toContain('- 第一卷 起点')
    expect(scaffold).toContain('- 第一章 旧案')
    expect(scaffold).not.toContain('详细剧情A')
    expect(scaffold).toContain('原文长度：')
  })

  it('uses a bounded first-paragraph probe when no heading exists', () => {
    const scaffold = buildVolumeOutlineScaffold('一段没有任何标题的剧情说明。' + '内容'.repeat(200))
    expect(scaffold).toContain('- 一段没有任何标题的剧情说明。')
    expect(scaffold.length).toBeLessThan(300)
  })
})

describe('clampGeneratedVolumes', () => {
  const three = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]

  it('single mode keeps exactly one item even when the model returns more', () => {
    const r = clampGeneratedVolumes('single', three, 0, 5)
    expect(r.volumes).toHaveLength(1)
    expect(r.volumes[0].name).toBe('A')
    expect(r.truncated).toBe(true)
  })

  it('continue mode keeps exactly one item even when the model returns more', () => {
    const r = clampGeneratedVolumes('continue', three, 4, 5)
    expect(r.volumes).toHaveLength(1)
    expect(r.volumes[0].name).toBe('A')
    expect(r.truncated).toBe(true)
  })

  it('continue mode keeps exactly one item even when no volume exists yet', () => {
    const r = clampGeneratedVolumes('continue', three, 0, 5)
    expect(r.volumes).toHaveLength(1)
    expect(r.volumes[0].name).toBe('A')
    expect(r.truncated).toBe(true)
  })

  it('auto mode passes everything through', () => {
    const r = clampGeneratedVolumes('auto', three, 0, 5)
    expect(r.volumes).toHaveLength(3)
    expect(r.truncated).toBe(false)
  })

  it('empty input is reported without truncation', () => {
    const r = clampGeneratedVolumes('single', [], 0, 5)
    expect(r.volumes).toHaveLength(0)
    expect(r.truncated).toBe(false)
  })
})

describe('hasVolumeContent', () => {
  it('treats outline scaffold volumes as placeholders', () => {
    expect(hasVolumeContent({ name: '第一卷' })).toBe(false)
    expect(hasVolumeContent({ name: '第一卷', outline: '  ' })).toBe(false)
  })

  it('treats generated or edited volumes as memory anchors', () => {
    expect(hasVolumeContent({ name: '第一卷', outline: '开局' })).toBe(true)
    expect(hasVolumeContent({ name: '第一卷', summary: '开局' })).toBe(true)
  })
})
