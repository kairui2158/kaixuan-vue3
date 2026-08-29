import { ref } from 'vue'
import {
  buildImportPlan,
  fromAgentRecord,
  fromSkillRecord,
  parseAgentJson,
  parseAgentMd,
  parseBindingJson,
  parseBundleJson,
  parseSkillJson,
  parseSkillMd,
  serializeAgentJson,
  serializeAgentMd,
  serializeBindingJson,
  serializeSkillJson,
  serializeSkillMd,
  toAgentRecord,
  toSkillRecord,
} from '../services/configExchange'
import type {
  AgentRecord,
  ConfigDiagnostic,
  ConfigFieldTrace,
  ConfigIssue,
  ConfigSourceInfo,
  ImportPlanItem,
  ImportStrategy,
  PipelineBindingRecord,
  SkillRecord,
} from '../services/configExchange'
import { useAgentStore } from '../stores/agent'
import { useSkillStore } from '../stores/skill'

export type ImportSource = 'agent' | 'skill' | 'binding' | 'bundle'
export type ImportFileFormat = 'json' | 'markdown' | 'unknown'

export interface AgentImportResult {
  ok: boolean
  issues: ConfigIssue[]
  diagnostics: ConfigDiagnostic[]
  fieldTrace: ConfigFieldTrace[]
  sourceInfo?: ConfigSourceInfo
  unknownFields: string[]
  plan: ImportPlanItem[]
  records: AgentRecord[]
  source: string
}

export interface SkillImportResult {
  ok: boolean
  issues: ConfigIssue[]
  diagnostics: ConfigDiagnostic[]
  fieldTrace: ConfigFieldTrace[]
  sourceInfo?: ConfigSourceInfo
  unknownFields: string[]
  plan: ImportPlanItem[]
  records: SkillRecord[]
  pipelineSkills: string[]
  deAiSkills: string[]
  source: string
}

export interface BindingImportResult {
  ok: boolean
  issues: ConfigIssue[]
  bindings: PipelineBindingRecord
  source: string
}

function detectFormat(content: string, filePath = ''): ImportFileFormat {
  const extension = filePath.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (extension === 'json') return 'json'
  if (extension === 'md' || extension === 'markdown') return 'markdown'
  const trimmed = content.replace(/^\uFEFF/, '').trim()
  if (!trimmed) return 'unknown'
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
  if (trimmed.startsWith('---') || /^#{1,6}\s+/.test(trimmed)) return 'markdown'
  return 'unknown'
}

function toIssue(code: ConfigIssue['code'], field: string, message: string): ConfigIssue {
  return { code, field, message }
}

export function useConfigExchange() {
  const exchangeLoading = ref(false)
  const exchangeError = ref('')

  async function openAndRead(): Promise<{ path: string; content: string; source: ConfigSourceInfo } | null> {
    const path = await window.electronAPI.dialogOpenFile()
    if (!path) return null
    const read = await window.electronAPI.dialogReadFile(path)
    if (!read || !read.content) {
      throw new Error('读取文件失败')
    }
    const extension = path.toLowerCase().match(/\.[a-z0-9]+$/)?.[0]
    return {
      path,
      content: read.content,
      source: {
        format: extension === '.json' ? 'json' : 'markdown',
        fileName: path.split(/[\\/]/).pop(),
        extension,
      },
    }
  }

  async function importAgentsFromFile(): Promise<AgentImportResult | null> {
    exchangeLoading.value = true
    exchangeError.value = ''
    try {
      const file = await openAndRead()
      if (!file) return null
      const format = detectFormat(file.content, file.path)
      let records: AgentRecord[] = []
      let issues: ConfigIssue[] = []
      let diagnostics: ConfigDiagnostic[] = []
      let fieldTrace: ConfigFieldTrace[] = []
      let sourceInfo: ConfigSourceInfo | undefined
      let unknownFields: string[] = []
      if (format === 'json') {
        const result = parseAgentJson(file.content)
        issues = result.issues
        diagnostics = result.diagnostics || []
        fieldTrace = result.fieldTrace || []
        sourceInfo = result.source
        if (!result.ok) {
          return { ok: false, issues, diagnostics: result.diagnostics || [], fieldTrace: result.fieldTrace || [], sourceInfo: result.source, unknownFields: [], plan: [], records: [], source: file.path }
        }
        records = result.value?.agents || []
      } else if (format === 'markdown') {
        const result = parseAgentMd(file.content, file.source)
        issues = result.issues
        diagnostics = result.diagnostics || []
        fieldTrace = result.fieldTrace || []
        sourceInfo = result.source
        unknownFields = result.value?.unknownFields || []
        if (!result.ok) {
          return { ok: false, issues, diagnostics: result.diagnostics || [], fieldTrace: result.fieldTrace || [], sourceInfo: result.source, unknownFields: result.value?.unknownFields || [], plan: [], records: [], source: file.path }
        }
        if (result.value?.agent) records = [result.value.agent]
      } else {
        issues = [toIssue('warning', '$', '无法识别的文件格式，请选择 JSON 或 Markdown 文件')]
        return { ok: false, issues, diagnostics: [], fieldTrace: [], unknownFields: [], plan: [], records: [], source: file.path }
      }
      const agentStore = useAgentStore()
      const plan = buildImportPlan(agentStore.agents.map(a => a.id), records)
      return { ok: true, issues, diagnostics, fieldTrace, sourceInfo, unknownFields, plan, records, source: file.path }
    } catch (e: any) {
      exchangeError.value = e?.message || '导入异常'
      return {
        ok: false,
        issues: [toIssue('json', '$', e?.message || '导入异常')], diagnostics: [], fieldTrace: [], unknownFields: [],
        plan: [], records: [], source: '',
      }
    } finally {
      exchangeLoading.value = false
    }
  }

  async function applyAgentImport(records: AgentRecord[], strategy: ImportStrategy) {
    const agentStore = useAgentStore()
    return await agentStore.importAgents(records.map(r => fromAgentRecord(r)), strategy)
  }

  async function exportAllAgentsJSON(): Promise<boolean> {
    const agentStore = useAgentStore()
    const records = agentStore.agents.map(a => toAgentRecord(a))
    const json = serializeAgentJson(records)
    const filePath = await window.electronAPI.dialogSaveFile('agents-export.json')
    if (!filePath) return false
    return await window.electronAPI.dialogWriteFile(filePath, json)
  }

  async function exportAgentMarkdown(id: string): Promise<boolean> {
    const agentStore = useAgentStore()
    const agent = agentStore.getAgent(id)
    if (!agent) return false
    const md = serializeAgentMd(toAgentRecord(agent))
    const safeName = (agent.name || 'agent').replace(/[\\/:*?"<>|]/g, '_')
    const filePath = await window.electronAPI.dialogSaveFile(safeName + '.agent.md')
    if (!filePath) return false
    return await window.electronAPI.dialogWriteFile(filePath, md)
  }

  async function exportAllSkillsJSON(): Promise<boolean> {
    const skillStore = useSkillStore()
    const records = skillStore.skills.map(s => toSkillRecord(s))
    const json = serializeSkillJson({
      skills: records,
      pipelineSkills: skillStore.pipelineSkills,
      deAiSkills: skillStore.deAiSkills,
    })
    const filePath = await window.electronAPI.dialogSaveFile('skills-export.json')
    if (!filePath) return false
    return await window.electronAPI.dialogWriteFile(filePath, json)
  }

  async function exportSkillMarkdown(id: string): Promise<boolean> {
    const skillStore = useSkillStore()
    const skill = skillStore.getSkill(id)
    if (!skill) return false
    const md = serializeSkillMd(toSkillRecord(skill))
    const safeName = (skill.name || 'skill').replace(/[\\/:*?"<>|]/g, '_')
    const filePath = await window.electronAPI.dialogSaveFile(safeName + '.skill.md')
    if (!filePath) return false
    return await window.electronAPI.dialogWriteFile(filePath, md)
  }

  async function importSkillsFromFile(): Promise<SkillImportResult | null> {
    exchangeLoading.value = true
    exchangeError.value = ''
    try {
      const file = await openAndRead()
      if (!file) return null
      const format = detectFormat(file.content, file.path)
      let records: SkillRecord[] = []
      let pipelineSkills: string[] = []
      let deAiSkills: string[] = []
      let issues: ConfigIssue[] = []
      let diagnostics: ConfigDiagnostic[] = []
      let fieldTrace: ConfigFieldTrace[] = []
      let sourceInfo: ConfigSourceInfo | undefined
      let unknownFields: string[] = []
      if (format === 'json') {
        const result = parseSkillJson(file.content)
        issues = result.issues
        diagnostics = result.diagnostics || []
        fieldTrace = result.fieldTrace || []
        sourceInfo = result.source
        if (!result.ok) {
          return { ok: false, issues, diagnostics: result.diagnostics || [], fieldTrace: result.fieldTrace || [], sourceInfo: result.source, unknownFields: [], plan: [], records, pipelineSkills, deAiSkills, source: file.path }
        }
        records = result.value?.skills || []
        pipelineSkills = result.value?.pipelineSkills || []
        deAiSkills = result.value?.deAiSkills || []
      } else if (format === 'markdown') {
        const result = parseSkillMd(file.content, file.source)
        issues = result.issues
        diagnostics = result.diagnostics || []
        fieldTrace = result.fieldTrace || []
        sourceInfo = result.source
        unknownFields = result.value?.unknownFields || []
        if (!result.ok) {
          return { ok: false, issues, diagnostics: result.diagnostics || [], fieldTrace: result.fieldTrace || [], sourceInfo: result.source, unknownFields: result.value?.unknownFields || [], plan: [], records, pipelineSkills, deAiSkills, source: file.path }
        }
        if (result.value?.skill) records = [result.value.skill]
      } else {
        issues = [toIssue('warning', '$', '无法识别的文件格式，请选择 JSON 或 Markdown 文件')]
        return { ok: false, issues, diagnostics: [], fieldTrace: [], unknownFields: [], plan: [], records, pipelineSkills, deAiSkills, source: file.path }
      }
      const skillStore = useSkillStore()
      const plan = buildImportPlan(skillStore.skills.map(s => s.id), records)
      return { ok: true, issues, diagnostics, fieldTrace, sourceInfo, unknownFields, plan, records, pipelineSkills, deAiSkills, source: file.path }
    } catch (e: any) {
      exchangeError.value = e?.message || '导入异常'
      return {
        ok: false,
        issues: [toIssue('json', '$', e?.message || '导入异常')], diagnostics: [], fieldTrace: [], unknownFields: [],
        plan: [], records: [], pipelineSkills: [], deAiSkills: [], source: '',
      }
    } finally {
      exchangeLoading.value = false
    }
  }

  async function applySkillImport(
    records: SkillRecord[],
    pipelineSkills: string[],
    deAiSkills: string[],
    strategy: ImportStrategy,
  ) {
    const skillStore = useSkillStore()
    return await skillStore.importSkills(records.map(r => fromSkillRecord(r)), {
      strategy,
      pipelineSkills,
      deAiSkills,
    })
  }

  async function importBindingsFromFile(): Promise<BindingImportResult | null> {
    exchangeLoading.value = true
    exchangeError.value = ''
    try {
      const file = await openAndRead()
      if (!file) return null
      if (detectFormat(file.content, file.path) !== 'json') {
        return {
          ok: false,
          issues: [toIssue('warning', '$', '绑定关系请使用 JSON 文件')],
          bindings: { agents: {}, skills: {}, modes: {}, skillAgents: {} },
          source: file.path,
        }
      }
      const result = parseBindingJson(file.content)
      return {
        ok: result.ok,
        issues: result.issues,
        bindings: result.value?.bindings || { agents: {}, skills: {}, modes: {}, skillAgents: {} },
        source: file.path,
      }
    } catch (e: any) {
      exchangeError.value = e?.message || '导入异常'
      return {
        ok: false,
        issues: [toIssue('json', '$', e?.message || '导入异常')],
        bindings: { agents: {}, skills: {}, modes: {}, skillAgents: {} },
        source: '',
      }
    } finally {
      exchangeLoading.value = false
    }
  }

  async function exportBindingsJSON(bindings: PipelineBindingRecord): Promise<boolean> {
    const json = serializeBindingJson(bindings)
    const filePath = await window.electronAPI.dialogSaveFile('pipeline-bindings.json')
    if (!filePath) return false
    return await window.electronAPI.dialogWriteFile(filePath, json)
  }

  async function importBundleFromFile() {
    exchangeLoading.value = true
    exchangeError.value = ''
    try {
      const file = await openAndRead()
      if (!file) return null
      if (detectFormat(file.content, file.path) !== 'json') {
        return {
          ok: false,
          issues: [toIssue('warning', '$', 'Bundle 请使用 JSON 文件')],
          value: null,
          source: file.path,
        }
      }
      const result = parseBundleJson(file.content)
      return { ok: result.ok, issues: result.issues, value: result.value || null, source: file.path }
    } catch (e: any) {
      exchangeError.value = e?.message || '导入异常'
      return {
        ok: false,
        issues: [toIssue('json', '$', e?.message || '导入异常')],
        value: null,
        source: '',
      }
    } finally {
      exchangeLoading.value = false
    }
  }

  return {
    exchangeLoading,
    exchangeError,
    importAgentsFromFile,
    applyAgentImport,
    exportAllAgentsJSON,
    exportAgentMarkdown,
    exportAllSkillsJSON,
    exportSkillMarkdown,
    importSkillsFromFile,
    applySkillImport,
    importBindingsFromFile,
    exportBindingsJSON,
    importBundleFromFile,
  }
}
