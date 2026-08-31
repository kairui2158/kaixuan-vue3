import { describe, expect, it } from 'vitest'
import { buildVolumePrompt, clampGeneratedVolumes } from './volumeGeneration'

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

  it('continue mode generates the remaining range only', () => {
    const prompt = buildVolumePrompt({
      ...base,
      mode: 'continue',
      existingVolumes: [{ name: '第一卷' }]
    })
    expect(prompt).toContain('请继续生成第2卷到第5卷的卷纲')
  })

  it('auto mode keeps full-volume semantics', () => {
    const prompt = buildVolumePrompt({ ...base, mode: 'auto' })
    expect(prompt).toContain('请生成5卷的卷纲')
    expect(prompt).toContain('各卷allocatedWords之和应等于全书总字数')
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

  it('continue mode clamps to the remaining volume count', () => {
    const r = clampGeneratedVolumes('continue', three, 4, 5)
    expect(r.volumes).toHaveLength(1)
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
