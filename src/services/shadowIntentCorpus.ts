export type ShadowIntentCorpusSample = {
  id: string
  source: 'community-shadow'
  text: string
  expectedIntent: 'analyze' | 'edit' | 'generate' | 'discuss'
  note?: string
}

// Shadow corpus is diagnostic only. It is physically separated from real
// corpus packages and may never enter train/dev/test calibration.
export const SHADOW_INTENT_CORPUS: readonly ShadowIntentCorpusSample[] = Object.freeze([
  { id: 'shadow-001', source: 'community-shadow', text: '这一段能不能帮我指出结构问题', expectedIntent: 'analyze', note: 'analysis without write verb' },
  { id: 'shadow-002', source: 'community-shadow', text: '把开头改成倒叙', expectedIntent: 'edit', note: 'short imperative edit' },
  { id: 'shadow-003', source: 'community-shadow', text: '续写下一场冲突', expectedIntent: 'generate', note: 'continuation request' },
  { id: 'shadow-004', source: 'community-shadow', text: '我解释一下这个设定为什么这样设计', expectedIntent: 'discuss', note: 'author explanation' },
  { id: 'shadow-005', source: 'community-shadow', text: '这里为什么保留伏笔', expectedIntent: 'discuss', note: 'why question, not edit' },
])

export function isShadowIntentCorpusPackage(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { schema?: unknown }).schema === 'shenyi.shadow-intent-corpus',
  )
}
