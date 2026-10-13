import { describe, expect, it } from 'vitest'
import { scanProseHardSignals } from './proseHardSignalNet'
import {
  applyHardSignalRepairWindow,
  buildHardSignalRepairPrompt,
  buildHardSignalRepairWindow,
  passesHardSignalRepairIntegrity
} from './proseHardSignalRepair'

describe('proseHardSignalRepair', () => {
  const text = [
    '第一段。雨落在旧城上，灯火在远处慢慢亮起。',
    '',
    '抱歉，我无法继续创作这一章。',
    '',
    '第三段。她把地图压平，抬头看向门外。'
  ].join('\n')

  it('builds a bounded window around the first finding', () => {
    const scan = scanProseHardSignals(text)
    const finding = scan.findings[0]
    const window = buildHardSignalRepairWindow(text, finding, 20)

    expect(window.start).toBeLessThanOrEqual(finding.start)
    expect(window.end).toBeGreaterThanOrEqual(finding.end)
    expect(window.text).toContain('无法继续创作')
  })

  it('prompt identifies the signal and forbids expansion', () => {
    const scan = scanProseHardSignals(text)
    const prompt = buildHardSignalRepairPrompt(text, scan.findings[0])

    expect(prompt).toContain('refusal')
    expect(prompt).toContain('不要扩写')
    expect(prompt).toContain(text)
  })

  it('accepts a repair that deletes the contaminated sentence', () => {
    const scan = scanProseHardSignals(text)
    const window = buildHardSignalRepairWindow(text, scan.findings[0], 20)
    const repaired = window.text.replace('抱歉，我无法继续创作这一章。\n\n', '')

    expect(passesHardSignalRepairIntegrity(window.text, repaired)).toBe(true)
  })

  it('rejects an empty repair', () => {
    expect(passesHardSignalRepairIntegrity(text, '')).toBe(false)
  })

  it('rejects an expanded repair', () => {
    const expanded = text + ' 他又补写了一整段新的剧情内容，让文本明显变长。'
    expect(passesHardSignalRepairIntegrity(text, expanded)).toBe(false)
  })

  it('rejects a repair that drops too much original content', () => {
    expect(passesHardSignalRepairIntegrity(text, '只剩一句。')).toBe(false)
  })

  it('applies the repaired window without shifting surrounding text', () => {
    const scan = scanProseHardSignals(text)
    const window = buildHardSignalRepairWindow(text, scan.findings[0], 20)
    const repaired = window.text.replace('抱歉，我无法继续创作这一章。\n\n', '')
    const next = applyHardSignalRepairWindow(text, window, repaired)

    expect(next).not.toContain('无法继续创作')
    expect(next).toContain('第一段。雨落在旧城上')
    expect(next).toContain('第三段。她把地图压平')
    expect(scanProseHardSignals(next).detected).toBe(false)
  })
})
