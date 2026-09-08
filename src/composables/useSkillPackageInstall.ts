import { ref } from 'vue'
import { useSkillStore } from '../stores/skill'
import {
  compareInstalledSkill,
  validateSkillPackageManifest,
  type SkillPackageManifest,
} from '../services/skillPackageManager'

export interface SkillPackagePreviewFile {
  path: string
  size: number
}

export interface SkillPackagePreview {
  zipPath: string
  root: string
  manifest: unknown
  entries: SkillPackagePreviewFile[]
  totalBytes: number
  compatible: boolean
}

export type SkillPackageInstallAction =
  | 'add'
  | 'upgrade'
  | 'downgrade'
  | 'same'
  | 'unknown'

function getElectronAPI() {
  return window.electronAPI as any
}

function hashPackageMeta(value: unknown): string {
  const text = JSON.stringify(value) || ''
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return 'fnv1a32_' + hash.toString(16).padStart(8, '0')
}

function deriveCompatibleId(zipPath: string): string {
  const fileName = zipPath.split(/[\\/]/).pop() || 'skill'
  const base = fileName.replace(/\.zip$/i, '').replace(/[^A-Za-z0-9_-]/g, '-')
  return (base || 'skill').slice(0, 80)
}

export function useSkillPackageInstall() {
  const packageLoading = ref(false)
  const packageInstalling = ref(false)
  const packagePreview = ref<SkillPackagePreview | null>(null)
  const packageIssues = ref<Array<{ field: string; message: string }>>([])
  const packageMessage = ref('')
  const packageInstallAction = ref<SkillPackageInstallAction>('add')
  const packageInstallApproved = ref(false)

  function refreshInstallAction(skillId: string, version: string) {
    const skillStore = useSkillStore()
    const current = skillStore.getSkill(skillId)
    if (!current) {
      packageInstallAction.value = 'add'
    } else if (!current.version) {
      packageInstallAction.value = 'unknown'
    } else {
      packageInstallAction.value = compareInstalledSkill(version, current.version)
    }
    packageInstallApproved.value = false
  }

  async function openPackagePreview(): Promise<boolean> {
    const api = getElectronAPI()
    if (!api?.skillPackageOpenDialog || !api?.skillPackagePreview) {
      packageMessage.value = '当前运行环境不支持技能包导入'
      return false
    }
    packageLoading.value = true
    packageIssues.value = []
    packageMessage.value = ''
    try {
      const zipPath = await api.skillPackageOpenDialog()
      if (!zipPath) return false
      const preview = await api.skillPackagePreview(zipPath)
      if (!preview?.ok) {
        packageMessage.value = preview?.message || '技能包读取失败'
        return false
      }
      packagePreview.value = {
        zipPath,
        root: preview.root || '',
        manifest: (preview.manifest as SkillPackageManifest | null) || null,
        entries: preview.entries || [],
        totalBytes: preview.totalBytes || 0,
        compatible: !preview.manifest,
      }
      if (preview.manifest) {
        const appVersion = await api.getAppVersion()
        const validation = validateSkillPackageManifest(preview.manifest, appVersion)
        packageIssues.value = validation.issues
        if (!validation.valid) return false
      }
      const manifest = preview.manifest as SkillPackageManifest | null
      refreshInstallAction(manifest?.id || deriveCompatibleId(zipPath), manifest?.version || '0.0.0')
      return true
    } catch (error: any) {
      packageMessage.value = error?.message || '技能包读取异常'
      return false
    } finally {
      packageLoading.value = false
    }
  }

  async function confirmPackageInstall(): Promise<string> {
    const api = getElectronAPI()
    const preview = packagePreview.value
    if (!preview || !api?.skillPackageInstall) return ''
    const appVersion = await api.getAppVersion()
    const manifest = preview.manifest as any
    const validation = validateSkillPackageManifest(manifest, appVersion)
    if (manifest && !validation.valid) {
      packageIssues.value = validation.issues
      return ''
    }

    packageInstalling.value = true
    try {
      const action = packageInstallAction.value
      if (action === 'downgrade' && !packageInstallApproved.value) {
        packageMessage.value = '当前已安装版本更高，如需降级请勾选“我确认降级覆盖”'
        return ''
      }
      if (action === 'same' && !packageInstallApproved.value) {
        packageMessage.value = '技能版本相同，如需重新安装请勾选“我确认覆盖安装”'
        return ''
      }
      const skillId = manifest?.id || deriveCompatibleId(preview.zipPath)
      const version = manifest?.version || '0.0.0'
      const installed = await api.skillPackageInstall(preview.zipPath, skillId, version)
      if (!installed?.ok || !installed.skill) {
        packageMessage.value = installed?.message || '技能包安装失败'
        return ''
      }

      const skillStore = useSkillStore()
      const now = new Date().toISOString()
      const loadedSkill = installed.skill
      const skill = {
        id: loadedSkill.id || skillId,
        name: loadedSkill.name || skillId,
        format: 'folder' as const,
        folderPath: installed.installedPath,
        version,
        source: 'package' as const,
        packageHash: hashPackageMeta(manifest || { zipPath: preview.zipPath, files: preview.entries }),
        template: loadedSkill.template || '',
        category: 'package',
        description: loadedSkill.description || '',
        executionMode: 'chain' as const,
        outputFormat: 'text' as const,
        validationRules: [],
        splitSize: 1000,
        injectMode: 'system_prefix',
        bindTarget: 'project',
        linkedSkillIds: [],
        createdAt: now,
        updatedAt: now,
        customVars: {},
      }
      const strategy = action === 'unknown' || (packageInstallApproved.value && action !== 'add') ? 'overwrite' : 'skip'
      const result = await skillStore.importSkills([skill], { strategy })
      if (result.skipped > 0) return '技能库中已存在相同版本，未覆盖安装'
      return `技能包安装完成：新增 ${result.added} 个，更新 ${result.updated} 个`
    } catch (error: any) {
      packageMessage.value = error?.message || '技能包安装异常'
      return ''
    } finally {
      packageInstalling.value = false
    }
  }

  function closePackagePreview() {
    packagePreview.value = null
    packageIssues.value = []
    packageMessage.value = ''
  }

  return {
    packageLoading,
    packageInstalling,
    packagePreview,
    packageIssues,
    packageMessage,
    packageInstallAction,
    packageInstallApproved,
    openPackagePreview,
    confirmPackageInstall,
    closePackagePreview,
    refreshInstallAction,
  }
}
