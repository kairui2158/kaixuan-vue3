import type { Agent } from '../../stores/agent'
import type { Skill } from '../../stores/skill'
import type {
  AgentRecord,
  ImportPlanItem,
  ImportStrategy,
  SkillRecord,
} from './types'
import { normalizeAgentItem, normalizeSkillItem } from './validation'

export * from './types'
export * from './json'
export * from './markdown'

export function toAgentRecord(agent: Agent): AgentRecord {
  return {
    id: agent.id,
    name: agent.name,
    model: agent.model,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    systemPrompt: agent.systemPrompt,
    description: agent.description,
    provider: agent.provider,
    tools: agent.tools,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  }
}

export function toSkillRecord(skill: Skill): SkillRecord {
  const normalized = normalizeSkillItem(
    {
      id: skill.id,
      name: skill.name,
      template: skill.template,
      category: skill.category,
      description: skill.description,
      executionMode: skill.executionMode,
      outputFormat: skill.outputFormat,
      validationRules: skill.validationRules,
      splitSize: skill.splitSize,
      injectMode: skill.injectMode,
      bindTarget: skill.bindTarget,
      linkedSkillIds: skill.linkedSkillIds,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
      injectFrequency: skill.injectFrequency,
      injectDepth: skill.injectDepth,
      customVars: skill.customVars,
      inputSchema: skill.inputSchema,
      outputSchema: skill.outputSchema,
      retryPolicy: skill.retryPolicy,
    },
    'skill',
    [],
  )
  if (!normalized) return fromStoreSkill(skill)
  return normalized
}

function fromStoreSkill(skill: Skill): SkillRecord {
  return {
    id: skill.id,
    name: skill.name,
    template: skill.template,
    category: skill.category || 'general',
    description: skill.description || '',
    executionMode: skill.executionMode,
    outputFormat: skill.outputFormat || 'text',
    validationRules: skill.validationRules || [],
    splitSize: skill.splitSize || 1000,
    injectMode: skill.injectMode,
    bindTarget: skill.bindTarget,
    linkedSkillIds: skill.linkedSkillIds || [],
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
    injectFrequency: skill.injectFrequency,
    injectDepth: skill.injectDepth,
    customVars: skill.customVars || {},
    inputSchema: skill.inputSchema,
    outputSchema: skill.outputSchema,
    retryPolicy: skill.retryPolicy,
  }
}

export function fromAgentRecord(record: AgentRecord): Agent {
  return {
    id: record.id,
    name: record.name,
    model: record.model,
    temperature: record.temperature,
    maxTokens: record.maxTokens,
    systemPrompt: record.systemPrompt,
    description: record.description,
    provider: record.provider,
    tools: record.tools,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function fromSkillRecord(record: SkillRecord): Skill {
  return {
    id: record.id,
    name: record.name,
    template: record.template,
    category: record.category,
    description: record.description,
    executionMode: record.executionMode as Skill['executionMode'],
    outputFormat: record.outputFormat,
    validationRules: record.validationRules,
    splitSize: record.splitSize,
    injectMode: record.injectMode,
    bindTarget: record.bindTarget as never,
    linkedSkillIds: record.linkedSkillIds,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    injectFrequency: record.injectFrequency,
    injectDepth: record.injectDepth,
    customVars: record.customVars,
    inputSchema: record.inputSchema as never,
    outputSchema: record.outputSchema as never,
    retryPolicy: record.retryPolicy as never,
  }
}

export function buildImportPlan(
  existingIds: string[],
  incoming: Array<{ id: string; name?: string }>,
  strategy: ImportStrategy = 'skip',
): ImportPlanItem[] {
  const known = new Set(existingIds)
  return incoming.map(item => {
    if (!known.has(item.id)) {
      known.add(item.id)
      return { id: item.id, name: item.name || item.id, action: 'add', reason: '新增' }
    }
    if (strategy === 'overwrite') {
      return { id: item.id, name: item.name || item.id, action: 'update', reason: '覆盖已有配置' }
    }
    return { id: item.id, name: item.name || item.id, action: 'skip', reason: '已存在相同 id' }
  })
}
