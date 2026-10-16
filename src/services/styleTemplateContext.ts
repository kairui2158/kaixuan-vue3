import type { StyleProfileEffectiveLike } from './styleContextCompiler'

function enabledRuleText(rules: StyleProfileEffectiveLike['sentencePatterns']): string {
  return (rules || []).filter(rule => rule.enabled && rule.text.trim()).map(rule => rule.text).join('\n')
}

export function buildStyleTemplateVariables(style: StyleProfileEffectiveLike): {
  styleVoice: string
  styleSentencePatterns: string
  styleProhibitions: string
} {
  if (!style?.locked || !style.injected || style.profileVersion !== 2) {
    return {
      styleVoice: '',
      styleSentencePatterns: '',
      styleProhibitions: '',
    }
  }
  const voice = style.voice
  const styleVoice = [
    voice?.protagonistSpeech ? '主角声口：' + voice.protagonistSpeech : null,
    voice?.dialogueTags ? '对话标签：' + voice.dialogueTags : null,
    voice?.subtextDensity ? '潜台词密度：' + voice.subtextDensity : null,
  ].filter((line): line is string => Boolean(line)).join('\n')
  return {
    styleVoice,
    styleSentencePatterns: enabledRuleText(style.sentencePatterns),
    styleProhibitions: enabledRuleText(style.prohibitions),
  }
}
