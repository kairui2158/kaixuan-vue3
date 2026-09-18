import { classifyChainIntent, type ChainIntentHistoryMessage } from './chainIntentRouter'

export type PlainDialogueIntent = 'analyze' | 'edit' | 'generate' | 'discuss'

export function classifyPlainDialogueIntent(
  requestText: string,
  recentHistory: readonly ChainIntentHistoryMessage[] = [],
): PlainDialogueIntent {
  const result = classifyChainIntent(requestText, recentHistory)
  return result.intent === 'auto' ? 'discuss' : result.intent
}
