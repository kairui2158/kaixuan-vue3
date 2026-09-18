import { describe, expect, it } from 'vitest'
import { analyzeOutlineProposalImpact, parseOutlineProposal } from './outlineProposal'

const proposalJson = [
  '下面是我们讨论后的结构化提案：',
  '```json',
  JSON.stringify({
    type: 'outline_proposal',
    version: 1,
    operation: 'replace_match',
    target: '男主在灯塔下发现旧信。',
    content: '男主在灯塔下发现旧信，并确认寄信人身份。',
    anchor: { chapterTitle: '第2章 灯塔' },
    reason: '把旧信伏笔从发现推进到身份确认。',
    impact: ['第二章', '旧信伏笔']
  }),
  '```'
].join('\n')

describe('parseOutlineProposal', () => {
  it('distills a structured proposal and reuses the editor batch protocol', () => {
    const result = parseOutlineProposal(proposalJson)
    expect(result?.proposal.operation).toBe('replace_match')
    expect(result?.proposal.anchor?.chapterTitle).toBe('第2章 灯塔')
    expect(result?.proposal.reason).toContain('身份确认')
    expect(result?.batch.type).toBe('editor_edit_batch')
    expect(result?.batch.commands).toHaveLength(1)
    expect(result?.batch.commands[0]).toMatchObject({
      operation: 'replace_match',
      target: '男主在灯塔下发现旧信。',
      chapterTitle: '第2章 灯塔'
    })
  })

  it('keeps discussion flowing when distillation fails', () => {
    expect(parseOutlineProposal('我们讨论的方案是增加第二卷的追逐线。')).toBeNull()
    expect(parseOutlineProposal('{"type":"outline_proposal","operation":"append","content":"x","reason":"r"}')).toBeNull()
  })

  it('accepts legacy replace_section as replace_match', () => {
    const result = parseOutlineProposal(JSON.stringify({
      type: 'outline_proposal',
      operation: 'replace_section',
      target: '旧段落',
      content: '新段落',
      reason: '定稿',
      impact: ['旧段落']
    }))
    expect(result?.proposal.operation).toBe('replace_match')
  })
})

describe('analyzeOutlineProposalImpact', () => {
  const content = [
    '第一卷 风暴起点',
    '第一章 夜行。男主在夜路中遇到风暴。',
    '第2章 灯塔。男主在灯塔下发现旧信。',
    '伏笔备忘：灯塔旧信会在第二卷归还。',
    '第二卷 潮汐',
    '男主归还旧信。'
  ].join('\n')

  it('lists affected nodes and lexical references outside the edited node', () => {
    const report = analyzeOutlineProposalImpact(content, [{
      target: '男主在灯塔下发现旧信。'
    }])
    expect(report.affectedNodes.map(node => node.title)).toContain('第2章 灯塔')
    expect(report.references.some(reference => reference.nodeTitle?.includes('伏笔备忘') || reference.context.includes('伏笔备忘'))).toBe(true)
    expect(report.summary).toContain('受影响')
  })

  it('states clearly when no direct impact is found', () => {
    const report = analyzeOutlineProposalImpact(content, [{
      range: { start: 0, end: 1 }
    }])
    expect(report.summary).toBe('未发现直接影响')
  })

  it('does not modify the source outline', () => {
    const before = content
    analyzeOutlineProposalImpact(content, [{ target: '男主归还旧信。' }])
    expect(content).toBe(before)
  })

  it('deduplicates repeated impact contexts and keeps bounded reference noise', () => {
    const report = analyzeOutlineProposalImpact(content, [{
      target: '男主在灯塔下发现旧信。'
    }])
    const contextCounts = new Map<string, number>()
    for (const reference of report.references) {
      contextCounts.set(reference.context, (contextCounts.get(reference.context) || 0) + 1)
    }
    for (const count of contextCounts.values()) {
      expect(count).toBeLessThanOrEqual(8)
    }
    expect(report.references.length).toBeLessThanOrEqual(30)
  })
})
