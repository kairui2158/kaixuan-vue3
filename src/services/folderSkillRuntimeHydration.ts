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

/**
 * Refresh folder SKILL declarations from disk before execution. Store records
 * remain the UI source; execution reads the same values as the folder package.
 */
export async function hydrateRuntimeFolderTemplates(
  templates: WorkspaceSkillTemplate[],
): Promise<void> {
  for (const template of templates) {
    const skill = (template as MutableTemplate).skill
    if (skill?.format !== 'folder' || !skill.folderPath) continue
    const loaded = await loadRuntimeFolderSkillMetadata(skill.folderPath)
    if (loaded.error) continue
    if (loaded.template) template.template = loaded.template
    if (loaded.meta && typeof loaded.meta === 'object') {
      template.meta = loaded.meta
      skill.meta = loaded.meta
    }
    if (loaded.intents) {
      template.intents = loaded.intents
      skill.intents = loaded.intents
    }
    if (loaded.contextPolicy) {
      template.contextPolicy = loaded.contextPolicy as WorkspaceSkillTemplate['contextPolicy']
      skill.contextPolicy = loaded.contextPolicy
    }
  }
}
