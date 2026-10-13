import type { ProseHardSignalFinding } from './proseHardSignalNet'

export interface HardSignalRepairWindow {
  start: number
  end: number
  text: string
}

export function buildHardSignalRepairWindow(
  text: string,
  finding: ProseHardSignalFinding,
  radius = 600
): HardSignalRepairWindow {
  const source = String(text || '')
  const start = Math.max(0, finding.start - radius)
  const end = Math.min(source.length, finding.end + radius)
  return { start, end, text: source.slice(start, end) }
}

export function buildHardSignalRepairPrompt(
  windowText: string,
  finding: ProseHardSignalFinding
): string {
  return [
    '下面是一段小说正文中的一个局部窗口。窗口中存在硬信号污染，需要定点修复。',
    '',
    '【硬信号】',
    `类型：${finding.type}`,
    `证据：${finding.excerpt || '（供应商报告截断）'}`,
    '',
    '【修复要求】',
    '1. 只移除或改写污染句，不要扩写、续写或重排整段。',
    '2. 保持窗口内其余原文、语气和段落顺序不变。',
    '3. 如果证据来自截断标记，只删除标记并接回自然句；不要补写新情节。',
    '4. 直接输出修复后的完整窗口文本，不要解释。',
    '',
    '【局部窗口】',
    windowText
  ].join('\n')
}

function countParagraphs(text: string): number {
  return text.split(/\n{2,}/).filter(item => item.trim().length > 0).length
}

function countSentenceEndings(text: string): number {
  return (String(text || '').match(/[。！？!?]/g) || []).length
}

/**
 * Hard-signal repair may legitimately delete a contaminated sentence, so this
 * gate permits shrinkage while rejecting expansion or structural drift.
 */
export function passesHardSignalRepairIntegrity(
  originalWindow: string,
  repairedWindow: string
): boolean {
  const original = String(originalWindow || '')
  const repaired = String(repairedWindow || '').trim()
  if (!repaired) return false

  const lengthRatio = repaired.length / Math.max(1, original.length)
  if (lengthRatio < 0.5 || lengthRatio > 1.05) return false

  const originalParagraphs = countParagraphs(original)
  const repairedParagraphs = countParagraphs(repaired)
  if (repairedParagraphs > originalParagraphs) return false
  if (repairedParagraphs === 0) return false

  const repairedSentences = countSentenceEndings(repaired)
  if (repairedSentences > countSentenceEndings(original) + 2) return false

  return true
}

export function applyHardSignalRepairWindow(
  text: string,
  window: HardSignalRepairWindow,
  repairedWindow: string
): string {
  const source = String(text || '')
  return source.slice(0, window.start) + repairedWindow + source.slice(window.end)
}
