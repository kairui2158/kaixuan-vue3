export type PipelineContextLayer =
  | 'settings'
  | 'outline'
  | 'volumes'
  | 'volume'
  | 'chapters'
  | 'chapter'
  | 'body'
  | 'unknown'

export interface RequestContextComposition {
  layer: PipelineContextLayer
  step: number
  providerType: string
  providerId?: string
  model?: string
  cacheFamily: string
  prefixFingerprint: string
  systemLength: number
  userLength: number
  stableSystemPrefixLength: number
  stableUserPrefixLength: number
  stableChars: number
  variableChars: number
  stableRatio: number
}

function normalizeIdentity(value: unknown): string {
  return String(value ?? '').trim().toLowerCase() || 'unknown'
}

function fingerprintPart(text: string): string {
  let hash1 = 0x811c9dc5
  let hash2 = 0x01000193
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    hash1 = (hash1 ^ code) * 0x01000193 >>> 0
    hash2 = (hash2 + (code * (index + 1))) >>> 0
  }
  return `${hash1.toString(16)}-${hash2.toString(16)}-${text.length}`
}

export function stablePrefixFingerprint(
  systemPrefix: string,
  userPrefix: string
): string {
  return `${fingerprintPart(systemPrefix)}:${fingerprintPart(userPrefix)}`
}

export function buildCacheFamily(input: {
  providerType?: string
  providerId?: string
  model?: string
  layer?: string
  step?: number
}): string {
  const providerType = normalizeIdentity(input.providerType)
  const providerId = input.providerId?.trim() || null
  const model = input.model?.trim() || null
  const layer = normalizeIdentity(input.layer)
  const step = Number.isInteger(input.step) && Number(input.step) >= 0
    ? `step-${Number(input.step)}`
    : 'step-unknown'
  if (!providerId && !model) return `${providerType}:${layer}:${step}:isolated-${Math.random()}`
  return [
    providerType,
    providerId || 'provider-unknown',
    model || 'model-unknown',
    layer,
    step,
  ].join(':')
}

export function buildRequestContextComposition(input: {
  layer?: string
  step?: number
  providerType?: string
  providerId?: string
  model?: string
  systemPrompt: string
  userPrompt: string
  stableSystemPrefix?: string
  stableUserPrefix?: string
}): RequestContextComposition {
  const systemPrompt = input.systemPrompt || ''
  const userPrompt = input.userPrompt || ''
  const stableSystemPrefix = (input.stableSystemPrefix || '').slice(0, systemPrompt.length)
  const stableUserPrefix = (input.stableUserPrefix || '').slice(0, userPrompt.length)
  const systemLength = systemPrompt.length
  const userLength = userPrompt.length
  const stableSystemLength = stableSystemPrefix.length
  const stableUserLength = stableUserPrefix.length
  const stableChars = stableSystemLength + stableUserLength
  const totalChars = systemLength + userLength
  return {
    layer: normalizeLayer(input.layer),
    step: Number.isInteger(input.step) && Number(input.step) >= 0 ? Number(input.step) : -1,
    providerType: String(input.providerType || 'unknown'),
    providerId: input.providerId?.trim() || undefined,
    model: input.model?.trim() || undefined,
    cacheFamily: buildCacheFamily(input),
    prefixFingerprint: stablePrefixFingerprint(stableSystemPrefix, stableUserPrefix),
    systemLength,
    userLength,
    stableSystemPrefixLength: stableSystemLength,
    stableUserPrefixLength: stableUserLength,
    stableChars,
    variableChars: Math.max(0, totalChars - stableChars),
    stableRatio: totalChars > 0
      ? Math.min(1, Math.round((stableChars / totalChars) * 1000) / 1000)
      : 0,
  }
}

function normalizeLayer(value: unknown): PipelineContextLayer {
  const layer = normalizeIdentity(value)
  if (layer === 'settings' || layer === 'outline' || layer === 'volumes' || layer === 'volume'
    || layer === 'chapters' || layer === 'chapter' || layer === 'body') {
    return layer
  }
  return 'unknown'
}
