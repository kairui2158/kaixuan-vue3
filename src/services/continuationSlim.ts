import type { CallAiParams } from './aiService'

type Message = CallAiParams['messages'][number]

const KNOWN_SECTION_MARKERS = [
  '[工作区上下文]',
  '[大纲结构地图]',
  '[当前焦点全文]',
  '[事实优先级]',
  '当前大纲:',
  '参考资料-大纲索引:',
]

const MAX_HISTORY_MESSAGES = 20

export function slimContinuationMessages(messages: Message[]): Message[] {
  if (!messages || messages.length === 0) return messages

  const seenSectionHashes = new Set<string>()
  const result: Message[] = []

  for (const message of messages) {
    let content = String(message.content)

    if (message.role === 'system') {
      const sections = splitSystemSections(content)
      const kept: string[] = []
      for (const section of sections) {
        const hash = simpleHash(section.trim())
        if (seenSectionHashes.has(hash)) continue
        seenSectionHashes.add(hash)
        kept.push(section)
      }
      content = kept.join('\n\n')
    }

    result.push({ ...message, content })
  }

  if (result.length > MAX_HISTORY_MESSAGES) {
    const systemMessages = result.filter((m) => m.role === 'system')
    const nonSystem = result.filter((m) => m.role !== 'system')
    const trimmed = nonSystem.slice(-MAX_HISTORY_MESSAGES)
    const rebuilt = [...systemMessages, ...trimmed]
    rebuilt.push({
      role: 'system',
      content: '[系统注] 本快照已瘦身，历史轮数已截断至最近 ' + MAX_HISTORY_MESSAGES + ' 条非 system 消息。',
    })
    return rebuilt
  }

  return result
}

function splitSystemSections(content: string): string[] {
  if (!content) return []
  let sections = content.split(/\n{3,}|\n---\n/)
  if (sections.length === 1) {
    for (const marker of KNOWN_SECTION_MARKERS) {
      if (content.includes(marker)) {
        sections = splitByMarker(content, marker)
        break
      }
    }
  }
  return sections.filter(Boolean)
}

function splitByMarker(content: string, marker: string): string[] {
  const parts: string[] = []
  let remaining = content
  let index = remaining.indexOf(marker)
  while (index >= 0) {
    if (index > 0) {
      const before = remaining.slice(0, index).trim()
      if (before) parts.push(before)
    }
    remaining = remaining.slice(index)
    const nextMarkerIndex = remaining.indexOf(marker, marker.length)
    if (nextMarkerIndex >= 0) {
      parts.push(remaining.slice(0, nextMarkerIndex).trim())
      remaining = remaining.slice(nextMarkerIndex)
      index = remaining.indexOf(marker, marker.length)
    } else {
      parts.push(remaining.trim())
      remaining = ''
      break
    }
  }
  if (remaining.trim()) parts.push(remaining.trim())
  return parts
}

function simpleHash(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16)
}
