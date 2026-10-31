import type { Skill } from '../stores/skill'
import { buildFolderSkillId, buildFolderSkillRecord, parseFolderSkillId } from './folderSkillRecordFactory'

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
  version?: string
  valid: boolean
  message: string
  exists: boolean
  action: 'add' | 'overwrite' | 'skip' | 'invalid'
  resourceCount?: number
  warnings?: string[]
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

export interface ExistingFolderRecord {
  id: string
  folderPath: string
}

function bridge(): FolderSkillBatchBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as any).electronAPI as FolderSkillBatchBridge | undefined
}

function normalizeFolderKey(folderPath: string): string {
  return folderPath
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

function appendPathConflictWarning(
  warnings: string[],
  folderPath: string,
  id: string,
  existingFolders: ExistingFolderRecord[] = []
): void {
  const pathKey = normalizeFolderKey(folderPath)
  const conflict = existingFolders.find(item =>
    item.id !== id && normalizeFolderKey(item.folderPath) === pathKey
  )
  if (conflict) {
    warnings.push(`路径已绑定到 ${conflict.id}；继续导入会形成同一路径多条记录`)
  }
}

export async function previewFolderSkill(
  folderPath: string,
  existingIds: string[],
  bridgeApi?: FolderSkillBatchBridge,
  existingFolders: ExistingFolderRecord[] = []
): Promise<FolderSkillImportPreview> {
  const api = bridgeApi || bridge()
  if (!folderPath || !api?.skillLoadFolder) {
    return { ok: false, message: '当前环境不支持文件夹技能导入', item: null }
  }

  const loaded = await api.skillLoadFolder(folderPath)
  if (!loaded?.ok || !loaded.skill?.id) {
    return { ok: false, message: loaded?.message || '缺少 SKILL.md', item: null }
  }

  const sourceId = parseFolderSkillId(String(loaded.skill.id))
  const id = buildFolderSkillId(sourceId)
  const exists = existingIds.includes(id)
  const message = buildImportMessage(loaded.skill)
  const warnings = normalizeLoadWarnings(loaded.skill.warnings)
  const resolvedFolderPath = String(loaded.folderPath || folderPath)
  appendPathConflictWarning(warnings, resolvedFolderPath, id, existingFolders)
  return {
    ok: true,
    message,
    item: {
      folderName: folderPath.split(/[\\/]/).filter(Boolean).pop() || sourceId,
      folderPath: resolvedFolderPath,
      id,
      name: String(loaded.skill.name || sourceId),
      version: typeof loaded.skill.manifest?.version === 'string' ? loaded.skill.manifest.version : '',
      valid: true,
      message,
      exists,
      action: exists ? 'skip' : 'add',
      resourceCount: Array.isArray(loaded.skill.resources) ? loaded.skill.resources.length : 0,
      warnings
    }
  }
}

function normalizeLoadWarnings(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) return []
  return warnings
    .map(item => {
      if (!item || typeof item !== 'object') return ''
      const record = item as Record<string, unknown>
      return String(record.message || '')
    })
    .filter(Boolean)
}

function buildImportMessage(skill: any): string {
  const parts: string[] = []
  parts.push(skill?.template ? '结构有效' : '模板为空，仍可导入')
  const resourceCount = Array.isArray(skill?.resources) ? skill.resources.length : 0
  if (resourceCount > 0) parts.push(`识别 ${resourceCount} 个资源文件`)
  const warnings = normalizeLoadWarnings(skill?.warnings)
  if (warnings.length > 0) parts.push(`警告 ${warnings.length} 项`)
  return parts.join('；')
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
  return buildFolderSkillRecord({ loaded, folderPath })
}

export async function previewFolderSkillBatch(
  rootPath: string,
  existingIds: string[],
  bridgeApi?: FolderSkillBatchBridge,
  existingFolders: ExistingFolderRecord[] = []
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
  const seenIds = new Set<string>()
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
        message: loaded?.message || '缺少 SKILL.md',
        exists: false,
        action: 'invalid'
      })
      continue
    }
    const id = buildFolderSkillId(String(loaded.skill.id))
    const exists = existingFolderIds.has(id) || seenIds.has(id)
    const message = buildImportMessage(loaded.skill)
    const warnings = normalizeLoadWarnings(loaded.skill.warnings)
    const resolvedFolderPath = String(loaded.folderPath || folder.folderPath)
    appendPathConflictWarning(warnings, resolvedFolderPath, id, existingFolders)
    if (seenIds.has(id)) warnings.push('批量扫描中出现重复 ID，将按重复策略处理')
    items.push({
      folderName: folder.folderName,
      folderPath: resolvedFolderPath,
      id,
      name: String(loaded.skill.name || id),
      version: typeof loaded.skill.manifest?.version === 'string' ? loaded.skill.manifest.version : '',
      valid: true,
      message,
      exists,
      action: exists ? 'skip' : 'add',
      resourceCount: Array.isArray(loaded.skill.resources) ? loaded.skill.resources.length : 0,
      warnings
    })
    seenIds.add(id)
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
