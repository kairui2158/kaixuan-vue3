export function isContinuationSelfCheckText(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  return normalized.includes('【续写检查：') ||
    (normalized.includes('已到达协议终点') && normalized.includes('无待续写内容'))
}
