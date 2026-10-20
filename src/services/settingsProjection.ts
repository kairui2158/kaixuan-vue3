import type { RunTraceEventLevel } from '../stores/runTrace'
import {
  SETTINGS_PROJECTION_POLICY_VERSION,
  assertSettingsProjectionLayer,
  buildSettingsLayerProjection,
  type SettingsProjectionContext
} from './settingsLayerSemantics'

export type SettingsProjectionLayer = 'volume' | 'chapter' | 'body' | 'home'
export type SettingsProjectionStatus = 'draft' | 'locked'

export interface SettingsProjectionItem {
  id?: string
  name?: string
  category?: string
  content?: unknown
  attrs?: Record<string, unknown>
  keywords?: unknown
  triggerKeywords?: unknown
  status?: unknown
  isBound?: unknown
  boundTo?: unknown
}

export interface SettingsProjection {
  text: string
  items: Array<{ category: string; name: string; text: string; keywords: string[] }>
  blocks: Array<{ semanticCategory: string; label: string; lines: string[] }>
  categoryDistribution: Record<string, number>
  warnings: string[]
  includedReasons: string[]
  excludedReasons: string[]
  trimmedReasons: string[]
  policyVersion: number
  lockedCount: number
  draftCount: number
  characterCount: number
  contentHash: string
}

export function settingsProjectionStatus(item: SettingsProjectionItem): SettingsProjectionStatus {
  if (item.status === 'draft' || item.status === 'locked') return item.status
  return item.isBound === true ? 'locked' : 'draft'
}

function itemText(item: SettingsProjectionItem): string {
  const content = String(item.content || '').trim()
  if (content) return content
  if (item.attrs && typeof item.attrs === 'object' && !Array.isArray(item.attrs)) {
    const attrs = Object.keys(item.attrs)
      .map(key => `${key}: ${String(item.attrs?.[key] ?? '')}`)
      .filter(line => line.length > 2)
      .join('; ')
    if (attrs) return attrs
  }
  return ''
}

export function fnv1a32Hash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getLockedSettingsForLayer(
  layer: SettingsProjectionLayer,
  collection: { categories?: unknown; items?: unknown },
  context: SettingsProjectionContext = {}
): SettingsProjection {
  assertSettingsProjectionLayer(layer)
  const categories = Array.isArray(collection?.categories) ? collection.categories.map(String) : []
  const itemsByCategory = collection?.items && typeof collection.items === 'object'
    ? collection.items as Record<string, unknown>
    : {}
  const projected: SettingsProjection['items'] = []
  let draftCount = 0
  for (const category of categories) {
    const entries = itemsByCategory[category]
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue
      const item = entry as SettingsProjectionItem
      if (!item.name) continue
      if (settingsProjectionStatus(item) !== 'locked') {
        draftCount++
        continue
      }
      const text = itemText(item)
      if (!text) continue
      const keywords = [
        ...(Array.isArray(item.triggerKeywords) ? item.triggerKeywords : []),
        ...(Array.isArray(item.keywords) ? item.keywords : [])
      ].map(keyword => String(keyword || '').trim()).filter(Boolean)
      projected.push({ category, name: String(item.name), text, keywords })
    }
  }
  const semantic = buildSettingsLayerProjection(layer, projected, context)
  return {
    ...semantic,
    policyVersion: SETTINGS_PROJECTION_POLICY_VERSION,
    items: projected,
    lockedCount: projected.length,
    draftCount,
    characterCount: semantic.text.length,
    contentHash: fnv1a32Hash(semantic.text)
  }
}

export function buildSettingsProjectionTraceEvent(
  layer: SettingsProjectionLayer,
  projection: SettingsProjection
): { type: string; level: RunTraceEventLevel; label: string; detail: string } {
  return {
    type: 'settings-projection-composed',
    level: 'info',
    label: '设定锁定投影已组装',
    detail: JSON.stringify({
      layer,
      policyVersion: projection.policyVersion,
      lockedCount: projection.lockedCount,
      draftExcludedCount: projection.draftCount,
      projectionChars: projection.characterCount,
      contentHash: projection.contentHash,
      categoryDistribution: projection.categoryDistribution,
      includedReasons: projection.includedReasons,
      excludedReasons: projection.excludedReasons,
      trimmedReasons: projection.trimmedReasons,
      warnings: projection.warnings
    })
  }
}
