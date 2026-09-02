import type { AiService, CallAiResult } from './aiService'
import { mergeContinuationText, type ContinuationSnapshot } from './continuation'

export function buildContinuationMessages(snapshot: ContinuationSnapshot, maxContextChars = 12000) {
  const recent = snapshot.accumulatedText.slice(-maxContextChars)
  return [
    ...snapshot.originalMessages,
    { role: 'assistant', content: recent },
    { role: 'user', content: '请从上次输出中断的位置继续生成。不要重复已经输出的内容，只输出后续内容。' }
  ]
}

export async function continueSnapshot(
  service: Pick<AiService, 'callAi'>,
  snapshot: ContinuationSnapshot,
  options: { signal?: AbortSignal; onChunk?: (text: string) => void } = {}
): Promise<CallAiResult & { text: string }> {
  const result = await service.callAi({
    purpose: snapshot.purpose,
    messages: buildContinuationMessages(snapshot),
    model: snapshot.model,
    stream: true,
    signal: options.signal,
    meta: { source: 'continuation.continueSnapshot', step: snapshot.currentStep, skillId: snapshot.skillIds[0], agentId: snapshot.agentIds[0] },
    onChunk: options.onChunk
  })
  return { ...result, text: mergeContinuationText(snapshot.accumulatedText, result.text) }
}
