export const DEFAULT_SETTINGS_CATEGORY = '设定类'

export interface SettingsExistingItem {
  category: string
  name: string
}

export interface SettingsRejectedItem {
  item: any
  reason: string
}

export interface SettingsArtifactValidation {
  valid: boolean
  accepted: any[]
  rejected: SettingsRejectedItem[]
  errors: string[]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value || '').trim()
}

export function normalizeSettingsCategory(value: unknown): string {
  const category = text(value)
  return category || DEFAULT_SETTINGS_CATEGORY
}

function hasContent(item: any): boolean {
  const direct = text(item?.attrsText) || text(item?.content)
  if (direct) return true
  if (item?.attrs && typeof item.attrs === 'object' && !Array.isArray(item.attrs)) {
    return Object.values(item.attrs).some(value => text(value).length > 0)
  }
  return false
}

function hasWordCharacters(value: string): boolean {
  // Reject names made only of punctuation/symbols, including full-width marks.
  return /[\p{L}\p{N}]/u.test(value)
}

export function validateSettingsArtifact(
  items: unknown[],
  existing: SettingsExistingItem[]
): SettingsArtifactValidation {
  const list = Array.isArray(items) ? items : []
  const existingKeys = new Set(existing.map(item => `${text(item.category)}::${text(item.name)}`))
  const accepted: any[] = []
  const rejected: SettingsRejectedItem[] = []
  const errors: string[] = []
  const nameCategories = new Map<string, Set<string>>()

  list.forEach((entry) => {
    const item = entry as any
    const name = text(item?.name)
    if (!name) {
      rejected.push({ item, reason: '名称为空' })
      return
    }
    if (!hasWordCharacters(name)) {
      rejected.push({ item, reason: '名称不能是纯符号' })
      return
    }
    if (!hasContent(item)) {
      rejected.push({ item, reason: '内容为空' })
      return
    }
    const category = normalizeSettingsCategory(item?.category)
    const key = `${category}::${name}`
    if (existingKeys.has(key)) {
      rejected.push({ item, reason: `分类「${category}」内名称重复：「${name}」` })
      return
    }
    existingKeys.add(key)
    accepted.push({ ...item, name, category })
    const categories = nameCategories.get(name) || new Set<string>()
    categories.add(category)
    if (existing.some(existingItem => text(existingItem.name) === name && text(existingItem.category) !== category)) {
      categories.add(text(existing.find(existingItem => text(existingItem.name) === name && text(existingItem.category) !== category)?.category))
    }
    nameCategories.set(name, categories)
  })

  for (const [name, categories] of nameCategories) {
    if (categories.size > 1) {
      errors.push(`跨分类同名：「${name}」出现在${[...categories].join('、')}`)
    }
  }

  const allRejected = accepted.length === 0 && list.length > 0
  const duplicateError = rejected.some(item => item.reason.includes('名称重复'))
  return {
    valid: !allRejected && !duplicateError,
    accepted,
    rejected,
    errors
  }
}
