import { describe, expect, it } from 'vitest'
import { validateOutlineIntegrity } from './outlineIntegrity'

const longBody = '这一章推进男主的冒险，并把旧信、灯塔、风暴三个伏笔连接起来。'.repeat(6)
const standardOutline = [
  '第一卷 风暴起点',
  '第一章 夜行。男主在夜路中遇到风暴。',
  `第二章 灯塔。男主在灯塔下发现旧信。${longBody}`
].join('\n')

describe('validateOutlineIntegrity', () => {
  it('does not flag ordinary text additions', () => {
    const report = validateOutlineIntegrity(standardOutline, standardOutline + '\n新增第三章：旧信去向。')
    expect(report.ok).toBe(true)
    expect(report.criticalCount).toBe(0)
    expect(report.summary).toContain('通过')
  })

  it('blocks heading deletion by default', () => {
    const report = validateOutlineIntegrity(standardOutline, standardOutline.replace('第二章 灯塔。男主在灯塔下发现旧信。', ''))
    expect(report.ok).toBe(false)
    expect(report.criticalCount).toBeGreaterThan(0)
    expect(report.issues.some(issue => issue.type === 'structure_broken')).toBe(true)
  })

  it('warns before allowing a major content shrink', () => {
    const shrunken = standardOutline.slice(0, standardOutline.lastIndexOf('，', Math.floor(standardOutline.length * 0.8)))
    const report = validateOutlineIntegrity(standardOutline, shrunken)
    expect(report.warningCount).toBeGreaterThan(0)
    expect(report.issues.some(issue => issue.type === 'content_shrink')).toBe(true)
  })

  it('raises critical when content loss crosses the protection threshold', () => {
    const shrunken = standardOutline.slice(0, Math.floor(standardOutline.length * 0.4))
    const report = validateOutlineIntegrity(standardOutline, shrunken)
    expect(report.ok).toBe(false)
    expect(report.criticalCount).toBeGreaterThan(0)
    expect(report.issues.some(issue => issue.type === 'content_loss')).toBe(true)
  })

  it('allows an explicit critical override while still showing the issues', () => {
    const shrunken = standardOutline.slice(0, Math.floor(standardOutline.length * 0.4))
    const report = validateOutlineIntegrity(standardOutline, shrunken, { allowCritical: true })
    expect(report.ok).toBe(true)
    expect(report.criticalCount).toBeGreaterThan(0)
    expect(report.issues.some(issue => issue.level === 'critical')).toBe(true)
  })
})
