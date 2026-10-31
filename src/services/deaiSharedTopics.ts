export interface DeaiSharedTopic {
  key: string
  topic: string
  terms: string[]
}

export const DEAI_SHARED_TOPICS: readonly DeaiSharedTopic[] = [
  { key: 'sentence-rhythm', topic: '句长节奏与短句使用', terms: ['短句', '句长', '碎片'] },
  { key: 'transition', topic: '连接词与过渡方式', terms: ['连接词', '过渡'] },
  { key: 'dialogue', topic: '对白完整度与轻重', terms: ['对白', '对话', '台词'] },
  { key: 'perspective', topic: '叙事视角', terms: ['视角'] },
  { key: 'integrity', topic: '人物设定与伏笔保护', terms: ['人物', '设定', '伏笔'] },
  { key: 'ai-trace', topic: 'AI痕迹防护', terms: ['AI痕迹'] },
]

export function findDeaiSharedTerms(text: string): string[] {
  if (!text) return []
  return DEAI_SHARED_TOPICS
    .flatMap(topic => topic.terms)
    .filter(term => text.includes(term))
}

export function findDeaiSharedTopicConflicts(text: string): Array<{
  key: string
  topic: string
  terms: string[]
}> {
  if (!text) return []
  return DEAI_SHARED_TOPICS
    .filter(topic => topic.terms.some(term => text.includes(term)))
    .map(topic => ({
      key: topic.key,
      topic: topic.topic,
      terms: topic.terms.filter(term => text.includes(term)),
    }))
}
