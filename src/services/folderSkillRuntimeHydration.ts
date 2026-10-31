import type { WorkspaceSkillTemplate } from './workspaceSkillEngine'
import { loadRuntimeFolderSkillMetadata } from './realSkillLoader'

type MutableTemplate = WorkspaceSkillTemplate & {
  skill?: {
    format?: string
    folderPath?: string
    meta?: unknown
    intents?: string[]
    contextPolicy?: unknown
  }
}

export type FolderSkillHydrationDiagnostic =
  | {
      type: 'folder-hydration-load-failed'
      level: 'warn'
      skillId: string
      folderPath: string
      error: string
    }
  | {
      type: 'folder-hydration-field-cleared'
      level: 'warn'
      skillId: string
      folderPath: string
      field: 'meta' | 'intents' | 'contextPolicy'
    }

type HydratableFolderTemplate = WorkspaceSkillTemplate | (PipelineSkillTemplateLike & HomeSkillTemplateLike)

type PipelineSkillTemplateLike = {
  skill?: {
    format?: string
    folderPath?: string
    meta?: unknown
    intents?: string[]
    contextPolicy?: unknown
  }
  meta?: unknown
  intents?: string[]
  contextPolicy?: unknown
  template?: unknown
}

type HomeSkillTemplateLike = {
  id: string
  name: string
  template: string
}

/**
 * Refresh folder SKILL declarations from disk before execution. Store records
 * remain the UI source; execution reads the same values as the folder package.
 */
export async function hydrateRuntimeFolderTemplates(
  templates: Array<WorkspaceSkillTemplate | (PipelineSkillTemplateLike & HomeSkillTemplateLike)>,
): Promise<FolderSkillHydrationDiagnostic[]> {
  const diagnostics: FolderSkillHydrationDiagnostic[] = []
  for (const template of templates) {
    const skill = (template as MutableTemplate).skill
    if (skill?.format !== 'folder' || !skill.folderPath) continue
    const loaded = await loadRuntimeFolderSkillMetadata(skill.folderPath)
    if (loaded.error) {
      diagnostics.push({
        type: 'folder-hydration-load-failed',
        level: 'warn',
        skillId: template.id,
        folderPath: skill.folderPath,
        error: loaded.error,
      })
      continue
    }
    ;(template as MutableTemplate).template = loaded.template
    const loadedMeta = loaded.meta && typeof loaded.meta === 'object' ? loaded.meta : undefined
    ;(template as MutableTemplate).meta = loadedMeta
    skill.meta = loadedMeta
    ;(template as MutableTemplate).intents = loaded.intents
    skill.intents = loaded.intents
    ;(template as MutableTemplate).contextPolicy = loaded.contextPolicy as WorkspaceSkillTemplate['contextPolicy']
    skill.contextPolicy = loaded.contextPolicy
    for (const field of ['meta', 'intents', 'contextPolicy'] as const) {
      if (!loaded[field]) {
        diagnostics.push({
          type: 'folder-hydration-field-cleared',
          level: 'warn',
          skillId: template.id,
          folderPath: skill.folderPath,
          field,
        })
      }
    }
  }
  return diagnostics
}
