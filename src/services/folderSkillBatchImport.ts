import type { Skill } from '../stores/skill'

export type FolderSkillBatchStrategy = 'skip' | 'overwrite'

export interface FolderSkillBatchBridge {
  skillListFolders: (rootPath: string) => Promise<any>
  skillLoadFolder: (folderPath: string) => Promise<any>
}

export interface FolderSkillBatchItem {
  folderName: string
  folderPath: string
  id: string
  name: string
  valid: boolean
  message: string
  exists: boolean
  action: 'add' | 'overwrite' | 'skip' | 'invalid'
}

export interface FolderSkillBatchSummary {
  added: number
  updated: number
  skipped: number
  failed: number
}

export interface FolderSkillBatchResultItem {
  folderName: string
  folderPath: string
  id: string
  name: string
  status: 'success' | 'skipped' | 'failed'
  message: string
}

export interface FolderSkillImportPreview {
  ok: boolean
  message: string
  item: FolderSkillBatchItem | null
}

function bridge(): FolderSkillBatchBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as any).electronAPI as FolderSkillBatchBridge | undefined
}

export async function previewFolderSkill(
  folderPath: string,
  existingIds: string[],
  bridgeApi?: FolderSkillBatchBridge
): Promise<FolderSkillImportPreview> {
  const api = bridgeApi || bridge()
  if (!folderPath || !api?.skillLoadFolder) {
    return { ok: false, message: '当前环境不支持文件夹技能导入', item: null }
  }

  const loaded = await api.skillLoadFolder(folderPath)
  if (!loaded?.ok || !loaded.skill?.id) {
    return { ok: false, message: loaded?.message || '缺少 SKILL.md 或 template.md', item: null }
  }

  const sourceId = String(loaded.skill.id)
  const id = `folder:${sourceId}`
  const exists = existingIds.includes(id)
  return {
    ok: true,
    message: loaded.skill.template ? '结构有效' : '模板为空，仍可导入',
    item: {
      folderName: folderPath.split(/[\\/]/).filter(Boolean).pop() || sourceId,
      folderPath: String(loaded.folderPath || folderPath),
      id,
      name: String(loaded.skill.name || sourceId),
      valid: true,
      message: loaded.skill.template ? '结构有效' : '模板为空，仍可导入',
      exists,
      action: exists ? 'skip' : 'add'
    }
  }
}

export function refreshFolderSkillPlan(
  item: FolderSkillBatchItem | null,
  strategy: FolderSkillBatchStrategy
): FolderSkillBatchItem | null {
  if (!item || !item.valid) return item
  return {
    ...item,
    action: item.exists ? (strategy === 'overwrite' ? 'overwrite' : 'skip') : 'add'
  }
}

function normalizeFolderEntry(entry: unknown): { folderName: string; folderPath: string } | null {
  if (!entry || typeof entry !== 'object') return null
  const folderPath = String((entry as any).folderPath || '')
  const folderName = String((entry as any).name || (entry as any).folderName || '')
  if (!folderPath || !folderName) return null
  return { folderName, folderPath }
}

function toSkillRecord(loaded: any, folderPath: string): Skill {
  const now = new Date().toISOString()
  const skill = loaded?.skill || {}
  return {
    id: String(skill.id || ''),
    sourceId: String(skill.id || ''),
    name: String(skill.name || skill.id || ''),
    format: 'folder',
    folderPath: String(loaded.folderPath || folderPath),
    template: String(skill.template || ''),
    category: 'folder',
    description: String(skill.description || ''),
    executionMode: 'chain',
    outputFormat: 'text',
    validationRules: [],
    splitSize: 1000,
    injectMode: 'system_prefix',
    bindTarget: 'project',
    linkedSkillIds: [],
    createdAt: now,
    updatedAt: now,
    customVars: {},
    inputSchema: '',
    outputSchema: '',
    retryPolicy: ''
  }
}

export async function previewFolderSkillBatch(
  rootPath: string,
  existingIds: string[],
  bridgeApi?: FolderSkillBatchBridge
): Promise<{ ok: boolean; message: string; items: FolderSkillBatchItem[] }> {
  const api = bridgeApi || bridge()
  if (!rootPath || !api?.skillListFolders || !api?.skillLoadFolder) {
    return { ok: false, message: '当前环境不支持文件夹技能批量导入', items: [] }
  }

  const listed = await api.skillListFolders(rootPath)
  if (!listed?.ok || !Array.isArray(listed.folders)) {
    const self = await api.skillLoadFolder(rootPath)
    if (self?.ok) {
      return {
        ok: false,
        message: '你选择的是技能文件夹本身。请返回上一级，选择包含它的根目录后重试。',
        items: []
      }
    }
    return { ok: false, message: listed?.message || '技能根目录扫描失败', items: [] }
  }
  if (listed.folders.length === 0) {
    const self = await api.skillLoadFolder(rootPath)
    if (self?.ok) {
      return {
        ok: false,
        message: '你选择的是技能文件夹本身。请返回上一级，选择包含它的根目录后重试。',
        items: []
      }
    }
  }

  const existingFolderIds = new Set(existingIds.filter(id => id.startsWith('folder:')))
  const items: FolderSkillBatchItem[] = []
  for (const entry of listed.folders) {
    const folder = normalizeFolderEntry(entry)
    if (!folder) continue
    const loaded = await api.skillLoadFolder(folder.folderPath)
    if (!loaded?.ok || !loaded.skill?.id) {
      items.push({
        folderName: folder.folderName,
        folderPath: folder.folderPath,
        id: '',
        name: folder.folderName,
        valid: false,
        message: loaded?.message || '缺少 SKILL.md 或 template.md',
        exists: false,
        action: 'invalid'
      })
      continue
    }
    const sourceId = String(loaded.skill.id)
    const id = `folder:${sourceId}`
    const exists = existingFolderIds.has(id)
    items.push({
      folderName: folder.folderName,
      folderPath: String(loaded.folderPath || folder.folderPath),
      id,
      name: String(loaded.skill.name || id),
      valid: true,
      message: loaded.skill.template ? '结构有效' : '模板为空，仍可导入',
      exists,
      action: exists ? 'skip' : 'add'
    })
  }
  return { ok: true, message: `扫描到 ${items.length} 个候选文件夹`, items }
}

export function refreshFolderSkillBatchPlan(
  items: FolderSkillBatchItem[],
  strategy: FolderSkillBatchStrategy
): FolderSkillBatchItem[] {
  return items.map(item => {
    if (!item.valid) return item
    return {
      ...item,
      action: item.exists ? (strategy === 'overwrite' ? 'overwrite' : 'skip') : 'add'
    }
  })
}

export function buildFolderSkillBatchRecords(items: FolderSkillBatchItem[]): { id: string; name: string }[] {
  return items.map(item => ({ id: item.id, name: item.name }))
}

export function summarizeFolderSkillBatch(results: FolderSkillBatchResultItem[]): FolderSkillBatchSummary {
  return {
    added: results.filter(item => item.status === 'success' && !item.message.includes('已存在')).length,
    updated: results.filter(item => item.status === 'success' && item.message.includes('已存在')).length,
    skipped: results.filter(item => item.status === 'skipped').length,
    failed: results.filter(item => item.status === 'failed').length
  }
}
