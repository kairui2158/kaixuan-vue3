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
    expect(report.issues.some(issue => issue.type === 'heading_count_reduced')).toBe(true)
  })

  it('allows an explicitly confirmed heading deletion without weakening other guards', () => {
    const withSeparateHeading = [
      '第一卷 风暴起点',
      '第一章 夜行',
      '男主在夜路中遇到风暴。',
      '第二章 灯塔',
      '男主在灯塔下发现旧信。',
    ].join('\n')
    const report = validateOutlineIntegrity(
      withSeparateHeading,
      withSeparateHeading.replace('第二章 灯塔\n', ''),
      { allowHeadingDeletion: true }
    )
    expect(report.issues.some(issue => issue.type === 'heading_count_reduced')).toBe(true)
    expect(report.ok).toBe(true)
  })

  it('still blocks content loss when heading deletion is allowed', () => {
    const shrunken = [
      '第一卷 风暴起点',
      '第一章 夜行',
      '男主在夜路中遇到风暴。',
    ].join('\n')
    const report = validateOutlineIntegrity(standardOutline, shrunken, { allowHeadingDeletion: true })
    expect(report.ok).toBe(false)
    expect(report.issues.some(issue => issue.type === 'content_loss')).toBe(true)
    expect(report.issues.some(issue => issue.type === 'heading_count_reduced')).toBe(true)
  })

  it('allows an exact authorized whole-section deletion while still reporting the issue', () => {
    const longSectionBody = '数据板只提供有限的临时通行，不能替代主线资源规则。'.repeat(24)
    const original = [
      '## 第1节 保留内容',
      '这一节必须完整保留。',
      '## 第2节 数据板的局限',
      longSectionBody,
    ].join('\n')
    const next = [
      '## 第1节 保留内容',
      '这一节必须完整保留。',
    ].join('\n')
    const report = validateOutlineIntegrity(original, next, {
      allowAuthorizedDeletion: true,
      authorizedDeletedLength: original.length - next.length,
    })
    expect(report.ok).toBe(true)
    expect(report.issues.some(issue => issue.type === 'content_loss')).toBe(true)
    expect(report.issues.some(issue => issue.type === 'heading_count_reduced')).toBe(true)
  })

  it('blocks authorized-looking content loss when the deleted length exceeds the authorization', () => {
    const longSectionBody = '数据板只提供有限的临时通行，不能替代主线资源规则。'.repeat(24)
    const original = [
      '## 第1节 保留内容',
      '这一节必须完整保留。',
      '## 第2节 数据板的局限',
      longSectionBody,
    ].join('\n')
    const next = '## 第1节 保留内容'
    const report = validateOutlineIntegrity(original, next, {
      allowAuthorizedDeletion: true,
      authorizedDeletedLength: 1,
    })
    expect(report.ok).toBe(false)
    expect(report.issues.some(issue => issue.type === 'content_loss')).toBe(true)
  })

  it('still blocks lost section bodies when heading deletion is allowed', () => {
    const sections = [
      '## 第1节 旧信',
      '旧信压在箱底。',
      '## 第2节 灯塔',
      '灯塔在雨里亮着。',
    ].join('\n')
    const dropped = [
      '## 第1节 旧信',
      '旧信压在箱底。',
    ].join('\n')
    const report = validateOutlineIntegrity(sections, dropped, {
      validateDocumentBody: true,
      allowHeadingDeletion: true,
    })
    expect(report.ok).toBe(false)
    expect(report.issues.some(issue => issue.type === 'body_content_lost')).toBe(true)
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

  it('allows whole-document tidying while headings and body content are reordered', () => {
    const sections = [
      '## 第1节 旧信',
      '旧信压在箱底。',
      '## 第2节 灯塔',
      '灯塔在雨里亮着。',
      '## 第3节 码头',
      '码头空无一人。',
    ].join('\n\n')
    const tidied = [
      '## 第一节 旧信',
      '旧信压在箱底。',
      '## 第二节 灯塔',
      '灯塔在雨里亮着。',
      '## 第三节 码头',
      '码头空无一人。',
    ].join('\n')
    const report = validateOutlineIntegrity(sections, tidied)
    expect(report.ok).toBe(true)
    expect(report.issues.some(issue => issue.type === 'body_content_lost')).toBe(false)
  })

  it('blocks replace_document results that drop section body content', () => {
    const sections = [
      '## 第1节 旧信',
      '旧信压在箱底。',
      '## 第2节 灯塔',
      '灯塔在雨里亮着。',
    ].join('\n')
    const dropped = [
      '## 第1节 旧信',
      '旧信压在箱底。',
      '## 第2节 灯塔',
    ].join('\n')
    const report = validateOutlineIntegrity(sections, dropped, { validateDocumentBody: true })
    expect(report.ok).toBe(false)
    expect(report.issues.some(issue => issue.type === 'body_content_lost' && issue.level === 'critical')).toBe(true)
  })

  it('allows planned merge and cleanup in a single-pass whole-document rewrite', () => {
    const original = [
      '## 第1节 旧信',
      '旧信压在箱底。',
      'paste 到「故事核心」下',
      '## 第2节 故事核心',
      '灯塔在雨里亮着。',
      '灯塔在雨里亮着。',
    ].join('\n')
    const rewritten = [
      '## 第1节 故事核心',
      '旧信压在箱底。灯塔在雨里亮着。',
    ].join('\n')
    const report = validateOutlineIntegrity(original, rewritten, {
      validateDocumentBody: true,
      allowWholeDocumentRewrite: true,
    })

    expect(report.issues.some(issue => issue.type === 'body_content_lost')).toBe(true)
    expect(report.issues.some(issue => issue.type === 'heading_count_reduced')).toBe(true)
    expect(report.issues.every(issue => issue.level === 'warning')).toBe(true)
    expect(report.ok).toBe(true)
  })

  it('still blocks catastrophic loss in a single-pass rewrite', () => {
    const original = [
      '## 第1节 旧信',
      '旧信压在箱底，始终没有寄出去。',
      '## 第2节 灯塔',
      '灯塔在雨里亮着。',
    ].join('\n').repeat(20)
    const report = validateOutlineIntegrity(original, '## 第1节 空稿', {
      validateDocumentBody: true,
      allowWholeDocumentRewrite: true,
    })

    expect(report.ok).toBe(false)
    expect(report.issues.some(issue => issue.type === 'content_loss' && issue.level === 'critical')).toBe(true)
  })

  it('does not falsely flag a reordered body as lost when sections contain duplicate paragraphs', () => {
    const sharedBody = '这一句属于本节，用来证明多轮直写不会误伤其他内容。'
    const sections = [
      '## 第1节 旧信',
      '旧信压在箱底。',
      sharedBody,
      '## 第2节 灯塔',
      '灯塔在雨里亮着。',
      sharedBody,
      '## 第3节 码头',
      '码头空无一人。',
      '账簿翻到第三页。',
      '## 第4节 风暴',
      '风暴逼近。',
    ].join('\n')
    const tidied = [
      '## 第4节 风暴',
      '风暴逼近。',
      '## 第3节 码头',
      '码头空无一人。',
      '账簿翻到第三页。',
      '## 第2节 灯塔',
      '灯塔在雨里亮着。',
      sharedBody,
      '## 第1节 旧信',
      '旧信压在箱底。',
      sharedBody,
    ].join('\n')
    const report = validateOutlineIntegrity(sections, tidied, { validateDocumentBody: true })
    expect(report.ok).toBe(true)
    expect(report.issues.some(issue => issue.type === 'body_content_lost')).toBe(false)
  })

  it('allows whole-document reordering under a root heading with duplicated paragraphs', () => {
    const repeatedBody = '雨停在青石镇，账簿翻到第三页，灯塔仍在雾里亮着。'
    const sections = [
      '# 青石镇的雨季',
      '全镇都相信雨季会带走旧账。',
      '## 第1节 旧信',
      repeatedBody,
      '## 第2节 灯塔',
      repeatedBody,
      '## 第3节 码头',
      '码头空无一人。',
      '## 第4节 风暴',
      '风暴逼近。',
    ].join('\n')
    const reordered = [
      '# 青石镇的雨季',
      '全镇都相信雨季会带走旧账。',
      '## 第4节 风暴',
      '风暴逼近。',
      '## 第3节 码头',
      '码头空无一人。',
      '## 第2节 灯塔',
      repeatedBody,
      '## 第1节 旧信',
      repeatedBody,
    ].join('\n')
    const report = validateOutlineIntegrity(sections, reordered, { validateDocumentBody: true })
    expect(report.ok).toBe(true)
    expect(report.criticalCount).toBe(0)
    expect(report.issues.some(issue => issue.type === 'body_content_lost')).toBe(false)
  })

  it('allows ordinary scoped edits without whole-document body comparison', () => {
    const sections = [
      '## 第1节 旧信',
      '旧信压在箱底，没有寄出去。',
      '## 第2节 灯塔',
      '灯塔在雨里亮着。',
    ].join('\n')
    const edited = sections.replace('旧信压在箱底，没有寄出去。', '旧信压在箱底，始终没有寄出去。')
    const report = validateOutlineIntegrity(sections, edited)
    expect(report.ok).toBe(true)
    expect(report.issues.some(issue => issue.type === 'body_content_lost')).toBe(false)
  })
})
