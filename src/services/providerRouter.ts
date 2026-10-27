/**
 * Provider Router — resolves which provider handles which purpose.
 * Priority: explicit purpose > global generateProvider > null (with error).
 */

import type { ProviderPurpose } from './aiService'
import type { ProviderLike } from './providerAdapter'

/**
 * Context passed to resolveProvider — a slim view of the provider store.
 * We use an interface instead of importing the store directly to avoid
 * circular dependencies and keep the router testable.
 */
export interface ProviderStoreLike {
  providers: ProviderLike[]
  generateProvider: string | null
  verifyProvider: string | null
  detectProvider: string | null
  getGenerateProvider(): ProviderLike | undefined
  getVerifyProvider(): ProviderLike | undefined
  getDetectProvider(): ProviderLike | undefined
}

/**
 * Maps a ProviderPurpose to the corresponding store getter.
 */
function getterForPurpose(
  store: ProviderStoreLike,
  purpose: ProviderPurpose
): ProviderLike | undefined {
  switch (purpose) {
    case 'generate':
    case 'rewrite':
      return store.getGenerateProvider()
    case 'verify':
      return store.getVerifyProvider()
    case 'detect':
    case 'image':
    case 'video':
      return store.getDetectProvider()
    default:
      return undefined
  }
}

/**
 * Chinese error messages — never silently fall back to generate provider.
 */
const PURPOSE_LABELS: Record<ProviderPurpose, string> = {
  generate: '生成',
  rewrite: '重写',
  verify: '验证',
  detect: '检测',
  image: '图片',
  video: '视频',
}

export interface ResolvedProvider {
  provider: ProviderLike
  providerId: string
}

function findProviderById(store: ProviderStoreLike, providerId?: string): ProviderLike | undefined {
  if (!providerId) return undefined
  return store.providers.find(item => item.id === providerId)
}

/**
 * Resolves a provider for the given purpose.
 * An explicit request-level providerId wins and must exist; an unknown id is an error.
 * Returns { provider, providerId } or throws with a clear Chinese message.
 */
export function resolveProvider(
  store: ProviderStoreLike,
  purpose: ProviderPurpose,
  providerId?: string
): ResolvedProvider {
  const requestedProviderId = (providerId || '').trim()
  if (requestedProviderId) {
    const explicit = findProviderById(store, requestedProviderId)
    if (!explicit) {
      throw new Error(`未找到指定供应商：${requestedProviderId}。请检查供应商配置或重新绑定。`)
    }
    assertUsableProviderCredential(explicit)
    return { provider: explicit, providerId: explicit.id }
  }

  // 1. Try purpose-specific provider
  const p = getterForPurpose(store, purpose)
  if (p) {
    assertUsableProviderCredential(p)
    return { provider: p, providerId: p.id }
  }

  // 2. Fallback: generate purpose can also use generateProvider
  if (purpose === 'rewrite') {
    const gp = store.getGenerateProvider()
    if (gp) {
      assertUsableProviderCredential(gp)
      return { provider: gp, providerId: gp.id }
    }
  }

  // 3. No provider — throw clear error, do NOT silently use generate
  const label = PURPOSE_LABELS[purpose] || purpose
  throw new Error('未配置' + label + '用途供应商，请在设置中添加并启用')
}

function assertUsableProviderCredential(provider: ProviderLike): void {
  if (String(provider?.apiKey || '').startsWith('enc:')) {
    throw new Error(
      'API Key 解密失败：该供应商密钥仍是加密态，可能来自旧设备或旧系统环境。请在设置中重新保存 API Key 后再发起请求。'
    )
  }
}

/**
 * Non-throwing variant for UI display.
 */
export function tryResolveProvider(
  store: ProviderStoreLike,
  purpose: ProviderPurpose
): ResolvedProvider | null {
  try {
    return resolveProvider(store, purpose)
  } catch {
    return null
  }
}
