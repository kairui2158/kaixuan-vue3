export type SkillAgentBindings = Record<string, string>

export function getSkillAgentKey(step: number, skillId: string): string {
  return `${step}-${skillId}`
}

export function getSkillAgentId(
  bindings: SkillAgentBindings,
  step: number,
  skillId: string,
): string {
  if (!skillId) return ''
  return bindings[getSkillAgentKey(step, skillId)] || ''
}

/** Convert legacy index bindings using the skill list that was saved beside them. */
export function migrateSkillAgentBindings(
  bindings: SkillAgentBindings | undefined,
  savedSkills: Record<number, string[]> | undefined,
): SkillAgentBindings {
  const source = bindings || {}
  const result: SkillAgentBindings = {}

  // Preserve legacy keys for callers that still need to inspect the old shape.
  for (const [key, agentId] of Object.entries(source)) {
    if (agentId) result[key] = agentId
  }

  for (let step = 0; step < 5; step += 1) {
    const skills = savedSkills?.[step] || []
    skills.forEach((skillId, index) => {
      if (!skillId) return
      const legacyKey = `${step}-${index}`
      const stableKey = getSkillAgentKey(step, skillId)
      if (!result[stableKey] && source[legacyKey]) {
        result[stableKey] = source[legacyKey]
      }
    })
  }

  return result
}

/** Return the canonical export shape while accepting old positional keys on input. */
export function normalizeSkillAgentBindings(
  bindings: SkillAgentBindings | undefined,
  savedSkills: Record<number, string[]> | undefined,
): SkillAgentBindings {
  const migrated = migrateSkillAgentBindings(bindings, savedSkills)
  return Object.fromEntries(
    Object.entries(migrated).filter(([key, agentId]) => (
      Boolean(agentId) && /^\d+-.+/.test(key) && !/^\d+-\d+$/.test(key)
    )),
  )
}
