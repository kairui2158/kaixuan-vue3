import { loadRealSkill } from './realSkillLoader'

export interface PreflightFolderSkill {
  id: string
  name?: string
  folderPath?: string
}

export interface PreflightFailure {
  skillId: string
  skillName?: string
  code: string
  message: string
  folderPath: string
  action?: string
}

export interface PreflightResult {
  ok: boolean
  failures: PreflightFailure[]
}

function toFailure(
  skill: PreflightFolderSkill,
  loaded: Awaited<ReturnType<typeof loadRealSkill>>,
): PreflightFailure {
  const code = loaded.error || 'skill-load-failed'
  const failure = loaded.failure || {
    code,
    message: 'SKILL 文件夹加载失败',
    folderPath: skill.folderPath || ''
  }
  return {
    skillId: skill.id,
    skillName: skill.name,
    code: failure.code,
    message: failure.message,
    folderPath: failure.folderPath || skill.folderPath || '',
    action: failure.action
  }
}

export function formatPreflightFailure(failure: PreflightFailure): string {
  return [
    `技能：${failure.skillName || failure.skillId}`,
    `错误：${failure.code} ${failure.message}`,
    `路径：${failure.folderPath}`,
    failure.action || ''
  ].filter(Boolean).join('\n')
}

export async function preflightFolderSkills(
  skills: Array<PreflightFolderSkill | undefined | null>,
): Promise<PreflightResult> {
  const failures: PreflightFailure[] = []
  for (const skill of skills) {
    if (!skill?.folderPath) continue
    const loaded = await loadRealSkill(skill.folderPath)
    if (!loaded.package) failures.push(toFailure(skill, loaded))
  }
  return { ok: failures.length === 0, failures }
}
